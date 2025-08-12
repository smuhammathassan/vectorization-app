import { EventEmitter } from 'events';
import { Logger } from './logger';

// Generic connection pool interface
interface PoolConnection {
  id: string;
  connection: any;
  createdAt: Date;
  lastUsed: Date;
  isInUse: boolean;
  useCount: number;
}

interface PoolConfig {
  min: number;          // Minimum connections to maintain
  max: number;          // Maximum connections allowed
  idleTimeout: number;  // Time before idle connection is closed (ms)
  acquireTimeout: number; // Max time to wait for a connection (ms)
  createTimeout: number;  // Max time to create a new connection (ms)
  maxUses: number;      // Max uses before connection is recycled
}

interface PoolStats {
  totalConnections: number;
  availableConnections: number;
  busyConnections: number;
  pendingAcquires: number;
  totalCreated: number;
  totalDestroyed: number;
  totalAcquired: number;
  totalReleased: number;
  totalErrors: number;
}

export class ConnectionPool<T = any> extends EventEmitter {
  private connections: Map<string, PoolConnection> = new Map();
  private availableConnections: string[] = [];
  private pendingAcquires: Array<{
    resolve: (connection: T) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  
  private stats: PoolStats = {
    totalConnections: 0,
    availableConnections: 0,
    busyConnections: 0,
    pendingAcquires: 0,
    totalCreated: 0,
    totalDestroyed: 0,
    totalAcquired: 0,
    totalReleased: 0,
    totalErrors: 0
  };
  
  private cleanupInterval: NodeJS.Timeout;
  private isDestroyed = false;
  
  constructor(
    private config: PoolConfig,
    private factory: {
      create: () => Promise<T>;
      destroy: (connection: T) => Promise<void>;
      validate: (connection: T) => Promise<boolean>;
    }
  ) {
    super();
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000); // Every 30 seconds
    
    // Initialize minimum connections
    this.initialize();
  }
  
  // Initialize pool with minimum connections
  private async initialize() {
    try {
      const promises = Array(this.config.min).fill(null).map(() => this.createConnection());
      await Promise.all(promises);
      Logger.info(`Connection pool initialized with ${this.config.min} connections`);
    } catch (error) {
      Logger.error('Failed to initialize connection pool', error as Error);
      this.emit('error', error);
    }
  }
  
  // Create a new connection
  private async createConnection(): Promise<string> {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const startTime = Date.now();
      const connection = await Promise.race([
        this.factory.create(),
        new Promise<T>((_, reject) => 
          setTimeout(() => reject(new Error('Connection creation timeout')), this.config.createTimeout)
        )
      ]);
      
      const poolConnection: PoolConnection = {
        id: connectionId,
        connection,
        createdAt: new Date(),
        lastUsed: new Date(),
        isInUse: false,
        useCount: 0
      };
      
      this.connections.set(connectionId, poolConnection);
      this.availableConnections.push(connectionId);
      this.stats.totalCreated++;
      this.stats.totalConnections++;
      this.stats.availableConnections++;
      
      Logger.debug('Created new connection', {
        connectionId,
        creationTime: Date.now() - startTime,
        totalConnections: this.stats.totalConnections
      });
      
      this.emit('connection:created', { connectionId, connection });
      
      return connectionId;
      
    } catch (error) {
      this.stats.totalErrors++;
      Logger.error('Failed to create connection', error as Error, { connectionId });
      throw error;
    }
  }
  
  // Acquire a connection from the pool
  public async acquire(): Promise<T> {
    if (this.isDestroyed) {
      throw new Error('Connection pool has been destroyed');
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from pending queue
        const index = this.pendingAcquires.findIndex(p => p.resolve === resolve);
        if (index !== -1) {
          this.pendingAcquires.splice(index, 1);
          this.stats.pendingAcquires--;
        }
        
        this.stats.totalErrors++;
        reject(new Error(`Connection acquire timeout after ${this.config.acquireTimeout}ms`));
      }, this.config.acquireTimeout);
      
      const pendingAcquire = { resolve, reject, timeout };
      this.pendingAcquires.push(pendingAcquire);
      this.stats.pendingAcquires++;
      
      this.processAcquireQueue();
    });
  }
  
  // Process the acquire queue
  private async processAcquireQueue() {
    while (this.pendingAcquires.length > 0 && (this.availableConnections.length > 0 || this.canCreateNewConnection())) {
      const pending = this.pendingAcquires.shift();
      if (!pending) break;
      
      this.stats.pendingAcquires--;
      
      try {
        let connectionId: string;
        
        // Try to use existing available connection
        if (this.availableConnections.length > 0) {
          connectionId = this.availableConnections.shift()!;
        } else {
          // Create new connection
          connectionId = await this.createConnection();
          // Remove from available since we're about to use it
          const index = this.availableConnections.indexOf(connectionId);
          if (index !== -1) {
            this.availableConnections.splice(index, 1);
          }
        }
        
        const poolConnection = this.connections.get(connectionId);
        if (!poolConnection) {
          throw new Error('Connection not found in pool');
        }
        
        // Validate connection before giving it out
        const isValid = await this.factory.validate(poolConnection.connection);
        if (!isValid) {
          Logger.warn('Invalid connection detected, creating new one', { connectionId });
          await this.destroyConnection(connectionId);
          
          // Try again with a new connection
          this.pendingAcquires.unshift(pending);
          this.stats.pendingAcquires++;
          continue;
        }
        
        // Mark connection as in use
        poolConnection.isInUse = true;
        poolConnection.lastUsed = new Date();
        poolConnection.useCount++;
        
        this.stats.availableConnections--;
        this.stats.busyConnections++;
        this.stats.totalAcquired++;
        
        clearTimeout(pending.timeout);
        pending.resolve(poolConnection.connection);
        
        Logger.debug('Connection acquired', {
          connectionId,
          useCount: poolConnection.useCount,
          busyConnections: this.stats.busyConnections
        });
        
      } catch (error) {
        clearTimeout(pending.timeout);
        this.stats.totalErrors++;
        pending.reject(error as Error);
      }
    }
  }
  
  // Release a connection back to the pool
  public async release(connection: T): Promise<void> {
    const poolConnection = Array.from(this.connections.values()).find(pc => pc.connection === connection);
    
    if (!poolConnection) {
      Logger.warn('Attempted to release connection not in pool');
      return;
    }
    
    if (!poolConnection.isInUse) {
      Logger.warn('Attempted to release connection that was not in use', { connectionId: poolConnection.id });
      return;
    }
    
    // Check if connection should be recycled due to max uses
    if (poolConnection.useCount >= this.config.maxUses) {
      Logger.info('Recycling connection due to max uses', {
        connectionId: poolConnection.id,
        useCount: poolConnection.useCount
      });
      await this.destroyConnection(poolConnection.id);
      
      // Create a new connection to maintain pool size
      if (this.stats.totalConnections < this.config.min) {
        this.createConnection().catch(error => {
          Logger.error('Failed to create replacement connection', error as Error);
        });
      }
      
      return;
    }
    
    // Mark as available
    poolConnection.isInUse = false;
    poolConnection.lastUsed = new Date();
    
    this.availableConnections.push(poolConnection.id);
    this.stats.busyConnections--;
    this.stats.availableConnections++;
    this.stats.totalReleased++;
    
    Logger.debug('Connection released', {
      connectionId: poolConnection.id,
      availableConnections: this.stats.availableConnections
    });
    
    // Process any pending acquires
    this.processAcquireQueue();
    
    this.emit('connection:released', { connectionId: poolConnection.id, connection });
  }
  
  // Check if we can create a new connection
  private canCreateNewConnection(): boolean {
    return this.stats.totalConnections < this.config.max;
  }
  
  // Destroy a specific connection
  private async destroyConnection(connectionId: string): Promise<void> {
    const poolConnection = this.connections.get(connectionId);
    if (!poolConnection) return;
    
    try {
      await this.factory.destroy(poolConnection.connection);
      
      this.connections.delete(connectionId);
      
      // Remove from available connections if present
      const availableIndex = this.availableConnections.indexOf(connectionId);
      if (availableIndex !== -1) {
        this.availableConnections.splice(availableIndex, 1);
        this.stats.availableConnections--;
      } else if (poolConnection.isInUse) {
        this.stats.busyConnections--;
      }
      
      this.stats.totalConnections--;
      this.stats.totalDestroyed++;
      
      Logger.debug('Connection destroyed', {
        connectionId,
        totalConnections: this.stats.totalConnections
      });
      
      this.emit('connection:destroyed', { connectionId });
      
    } catch (error) {
      Logger.error('Failed to destroy connection', error as Error, { connectionId });
      this.stats.totalErrors++;
    }
  }
  
  // Cleanup idle connections
  private async cleanup(): Promise<void> {
    if (this.isDestroyed) return;
    
    const now = Date.now();
    const idleConnections: string[] = [];
    
    // Find idle connections
    for (const [connectionId, poolConnection] of this.connections) {
      if (!poolConnection.isInUse && 
          (now - poolConnection.lastUsed.getTime()) > this.config.idleTimeout &&
          this.stats.totalConnections > this.config.min) {
        idleConnections.push(connectionId);
      }
    }
    
    // Destroy idle connections
    for (const connectionId of idleConnections) {
      await this.destroyConnection(connectionId);
    }
    
    if (idleConnections.length > 0) {
      Logger.info('Cleaned up idle connections', {
        destroyedCount: idleConnections.length,
        remainingConnections: this.stats.totalConnections
      });
    }
  }
  
  // Get pool statistics
  public getStats(): PoolStats {
    return { ...this.stats };
  }
  
  // Drain the pool (close all connections)
  public async drain(): Promise<void> {
    Logger.info('Draining connection pool');
    
    // Reject all pending acquires
    while (this.pendingAcquires.length > 0) {
      const pending = this.pendingAcquires.shift();
      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Pool is being drained'));
      }
    }
    
    // Close all connections
    const connectionIds = Array.from(this.connections.keys());
    const promises = connectionIds.map(id => this.destroyConnection(id));
    await Promise.all(promises);
    
    this.stats.pendingAcquires = 0;
  }
  
  // Destroy the pool
  public async destroy(): Promise<void> {
    if (this.isDestroyed) return;
    
    this.isDestroyed = true;
    clearInterval(this.cleanupInterval);
    
    await this.drain();
    
    Logger.info('Connection pool destroyed', {
      totalCreated: this.stats.totalCreated,
      totalDestroyed: this.stats.totalDestroyed,
      totalAcquired: this.stats.totalAcquired,
      totalReleased: this.stats.totalReleased,
      totalErrors: this.stats.totalErrors
    });
  }
}

// HTTP client connection pool
export class HttpConnectionPool extends ConnectionPool<any> {
  constructor(config: Partial<PoolConfig> = {}) {
    const defaultConfig: PoolConfig = {
      min: 2,
      max: 10,
      idleTimeout: 60000,    // 1 minute
      acquireTimeout: 5000,  // 5 seconds
      createTimeout: 3000,   // 3 seconds
      maxUses: 100
    };
    
    super({ ...defaultConfig, ...config }, {
      create: async () => {
        // Create HTTP agent or connection
        const http = await import('http');
        return new http.Agent({
          keepAlive: true,
          maxSockets: 10,
          timeout: 30000
        });
      },
      
      destroy: async (agent: any) => {
        if (agent && typeof agent.destroy === 'function') {
          agent.destroy();
        }
      },
      
      validate: async (agent: any) => {
        return agent && !agent.destroyed;
      }
    });
  }
}

// Database connection pool factory
export function createDatabasePool(config: {
  connectionString: string;
  poolConfig?: Partial<PoolConfig>;
}) {
  const defaultPoolConfig: PoolConfig = {
    min: 2,
    max: 20,
    idleTimeout: 300000,   // 5 minutes
    acquireTimeout: 10000, // 10 seconds
    createTimeout: 5000,   // 5 seconds
    maxUses: 1000
  };
  
  return new ConnectionPool({ ...defaultPoolConfig, ...config.poolConfig }, {
    create: async () => {
      // This would be replaced with actual database connection logic
      // For now, return a mock connection
      return {
        id: Math.random().toString(),
        query: async (sql: string, params?: any[]) => {
          // Mock query implementation
          return { rows: [] };
        }
      };
    },
    
    destroy: async (connection: any) => {
      if (connection && typeof connection.end === 'function') {
        await connection.end();
      }
    },
    
    validate: async (connection: any) => {
      try {
        // Validate connection with a simple query
        await connection.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    }
  });
}

// Global connection pools
export const globalPools = {
  http: new HttpConnectionPool(),
  
  // Add database pool when needed
  // database: createDatabasePool({ connectionString: process.env.DATABASE_URL })
};