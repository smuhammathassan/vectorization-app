import { EventEmitter } from 'events';
import { Logger } from './logger';
import cluster from 'cluster';
import os from 'os';

// Resource monitoring and optimization utilities
export class ResourceOptimizer extends EventEmitter {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private thresholds = {
    memory: {
      warning: 400,  // MB
      critical: 600, // MB
      emergency: 800 // MB
    },
    cpu: {
      warning: 70,   // %
      critical: 85,  // %
      emergency: 95  // %
    },
    responseTime: {
      warning: 500,  // ms
      critical: 1000, // ms
      emergency: 2000 // ms
    }
  };
  
  private currentMetrics = {
    memory: { used: 0, percentage: 0 },
    cpu: { usage: 0, loadAverage: [0, 0, 0] },
    responseTime: { average: 0, p95: 0 },
    connections: { active: 0, total: 0 }
  };
  
  private optimizations = {
    gcForced: 0,
    connectionsDropped: 0,
    requestsThrottled: 0,
    cacheCleared: 0
  };
  
  constructor() {
    super();
    this.startMonitoring();
  }
  
  // Start resource monitoring
  private startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.checkResources();
    }, 5000); // Check every 5 seconds
    
    Logger.info('Resource optimizer started');
  }
  
  // Stop resource monitoring
  public stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    Logger.info('Resource optimizer stopped');
  }
  
  // Check current resource usage
  private async checkResources() {
    try {
      // Memory metrics
      const memUsage = process.memoryUsage();
      this.currentMetrics.memory.used = Math.round(memUsage.heapUsed / 1024 / 1024);
      this.currentMetrics.memory.percentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      // CPU metrics
      const loadAvg = os.loadavg();
      this.currentMetrics.cpu.loadAverage = loadAvg;
      this.currentMetrics.cpu.usage = (loadAvg[0] / os.cpus().length) * 100;
      
      // Check for resource pressure
      await this.handleResourcePressure();
      
      // Emit metrics for monitoring
      this.emit('metrics', {
        ...this.currentMetrics,
        optimizations: this.optimizations
      });
      
    } catch (error) {
      Logger.error('Error checking resources', error as Error);
    }
  }
  
  // Handle resource pressure
  private async handleResourcePressure() {
    const memoryMB = this.currentMetrics.memory.used;
    const cpuPercent = this.currentMetrics.cpu.usage;
    
    // Memory pressure handling
    if (memoryMB > this.thresholds.memory.emergency) {
      Logger.warn('Emergency memory pressure detected', { memoryMB });
      await this.handleEmergencyMemoryPressure();
    } else if (memoryMB > this.thresholds.memory.critical) {
      Logger.warn('Critical memory pressure detected', { memoryMB });
      await this.handleCriticalMemoryPressure();
    } else if (memoryMB > this.thresholds.memory.warning) {
      Logger.info('Memory pressure warning', { memoryMB });
      await this.handleMemoryPressure();
    }
    
    // CPU pressure handling
    if (cpuPercent > this.thresholds.cpu.emergency) {
      Logger.warn('Emergency CPU pressure detected', { cpuPercent });
      await this.handleEmergencyCpuPressure();
    } else if (cpuPercent > this.thresholds.cpu.critical) {
      Logger.warn('Critical CPU pressure detected', { cpuPercent });
      await this.handleCriticalCpuPressure();
    } else if (cpuPercent > this.thresholds.cpu.warning) {
      Logger.info('CPU pressure warning', { cpuPercent });
      await this.handleCpuPressure();
    }
  }
  
  // Handle memory pressure (warning level)
  private async handleMemoryPressure() {
    // Force garbage collection if available
    if (global.gc) {
      const beforeMem = process.memoryUsage().heapUsed / 1024 / 1024;
      global.gc();
      const afterMem = process.memoryUsage().heapUsed / 1024 / 1024;
      const freed = beforeMem - afterMem;
      
      this.optimizations.gcForced++;
      
      Logger.info('Forced garbage collection', {
        freedMB: Math.round(freed),
        beforeMB: Math.round(beforeMem),
        afterMB: Math.round(afterMem)
      });
      
      this.emit('gc:forced', { freed, before: beforeMem, after: afterMem });
    }
  }
  
  // Handle critical memory pressure
  private async handleCriticalMemoryPressure() {
    await this.handleMemoryPressure();
    
    // Clear application caches if available
    try {
      const { CacheInvalidation } = await import('../middleware/caching');
      await CacheInvalidation.invalidateAll();
      this.optimizations.cacheCleared++;
      Logger.info('Cleared application cache due to memory pressure');
      this.emit('cache:cleared', { reason: 'memory_pressure' });
    } catch (error) {
      // Cache module might not be available
    }
  }
  
  // Handle emergency memory pressure
  private async handleEmergencyMemoryPressure() {
    await this.handleCriticalMemoryPressure();
    
    // More aggressive measures
    Logger.error('Emergency memory pressure - implementing aggressive measures');
    
    // If running in cluster mode, consider restarting worker
    if (cluster.isWorker) {
      Logger.warn('Worker will restart due to emergency memory pressure');
      process.exit(1); // Let cluster master restart this worker
    }
    
    this.emit('emergency:memory', { memoryMB: this.currentMetrics.memory.used });
  }
  
  // Handle CPU pressure (warning level)
  private async handleCpuPressure() {
    // Implement CPU throttling by adding delays
    this.emit('cpu:pressure', { level: 'warning', usage: this.currentMetrics.cpu.usage });
  }
  
  // Handle critical CPU pressure
  private async handleCriticalCpuPressure() {
    await this.handleCpuPressure();
    
    Logger.warn('Critical CPU pressure - implementing throttling');
    this.emit('cpu:pressure', { level: 'critical', usage: this.currentMetrics.cpu.usage });
  }
  
  // Handle emergency CPU pressure
  private async handleEmergencyCpuPressure() {
    await this.handleCriticalCpuPressure();
    
    Logger.error('Emergency CPU pressure detected');
    this.emit('cpu:pressure', { level: 'emergency', usage: this.currentMetrics.cpu.usage });
  }
  
  // Get current resource metrics
  public getMetrics() {
    return {
      ...this.currentMetrics,
      optimizations: this.optimizations,
      thresholds: this.thresholds
    };
  }
  
  // Update thresholds
  public updateThresholds(newThresholds: Partial<typeof this.thresholds>) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    Logger.info('Resource thresholds updated', this.thresholds);
  }
  
  // Manual optimization trigger
  public async optimizeNow() {
    Logger.info('Manual resource optimization triggered');
    await this.handleResourcePressure();
  }
  
  // Get optimization recommendations
  public getRecommendations(): string[] {
    const recommendations: string[] = [];
    const metrics = this.currentMetrics;
    
    if (metrics.memory.used > this.thresholds.memory.warning) {
      recommendations.push('Consider increasing available memory or optimizing memory usage');
      recommendations.push('Enable garbage collection if not already enabled (--expose-gc)');
      recommendations.push('Implement more aggressive caching policies');
    }
    
    if (metrics.cpu.usage > this.thresholds.cpu.warning) {
      recommendations.push('Consider horizontal scaling with more worker processes');
      recommendations.push('Implement request queuing to smooth CPU spikes');
      recommendations.push('Profile application to identify CPU bottlenecks');
    }
    
    if (this.optimizations.gcForced > 10) {
      recommendations.push('Frequent garbage collection suggests memory leaks - investigate');
    }
    
    if (this.optimizations.connectionsDropped > 0) {
      recommendations.push('Connection drops detected - check network configuration');
    }
    
    return recommendations;
  }
}

// Request throttling utility
export class RequestThrottler {
  private requestQueue: Array<{
    request: any;
    response: any;
    next: any;
    timestamp: number;
  }> = [];
  
  private processing = false;
  private maxQueueSize = 100;
  private processingDelay = 0;
  
  constructor(private resourceOptimizer: ResourceOptimizer) {
    // Listen to CPU pressure events
    resourceOptimizer.on('cpu:pressure', (data) => {
      this.adjustThrottling(data.level, data.usage);
    });
  }
  
  // Adjust throttling based on CPU pressure
  private adjustThrottling(level: string, usage: number) {
    switch (level) {
      case 'warning':
        this.processingDelay = 10; // 10ms delay
        break;
      case 'critical':
        this.processingDelay = 50; // 50ms delay
        break;
      case 'emergency':
        this.processingDelay = 100; // 100ms delay
        this.maxQueueSize = 50; // Reduce queue size
        break;
      default:
        this.processingDelay = 0;
        this.maxQueueSize = 100;
    }
    
    Logger.info('Request throttling adjusted', {
      level,
      usage,
      processingDelay: this.processingDelay,
      maxQueueSize: this.maxQueueSize
    });
  }
  
  // Middleware for request throttling
  public middleware() {
    return (req: any, res: any, next: any) => {
      // Check if queue is full
      if (this.requestQueue.length >= this.maxQueueSize) {
        Logger.warn('Request queue full, rejecting request', {
          queueSize: this.requestQueue.length,
          maxQueueSize: this.maxQueueSize
        });
        
        return res.status(503).json({
          type: 'https://tools.ietf.org/html/rfc7231#section-6.6.4',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Server is temporarily overloaded. Please try again later.',
          instance: req.path,
          requestId: req.requestId,
          retryAfter: 30
        });
      }
      
      // Add to queue
      this.requestQueue.push({
        request: req,
        response: res,
        next,
        timestamp: Date.now()
      });
      
      // Start processing if not already processing
      if (!this.processing) {
        this.processQueue();
      }
    };
  }
  
  // Process the request queue
  private async processQueue() {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.requestQueue.length > 0) {
      const item = this.requestQueue.shift();
      if (!item) break;
      
      // Check for request timeout (30 seconds)
      const age = Date.now() - item.timestamp;
      if (age > 30000) {
        Logger.warn('Request timed out in throttling queue', {
          age,
          path: item.request.path
        });
        
        if (!item.response.headersSent) {
          item.response.status(408).json({
            type: 'https://tools.ietf.org/html/rfc7231#section-6.5.7',
            title: 'Request Timeout',
            status: 408,
            detail: 'Request processing timed out while waiting in queue',
            instance: item.request.path,
            requestId: item.request.requestId
          });
        }
        continue;
      }
      
      // Process the request
      try {
        item.next();
        
        // Apply processing delay if needed
        if (this.processingDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.processingDelay));
        }
      } catch (error) {
        Logger.error('Error processing throttled request', error as Error);
        
        if (!item.response.headersSent) {
          item.response.status(500).json({
            type: 'https://tools.ietf.org/html/rfc7231#section-6.6.1',
            title: 'Internal Server Error',
            status: 500,
            detail: 'An error occurred while processing the request',
            instance: item.request.path,
            requestId: item.request.requestId
          });
        }
      }
    }
    
    this.processing = false;
    
    // If more requests came in while processing, continue
    if (this.requestQueue.length > 0) {
      setImmediate(() => this.processQueue());
    }
  }
  
  // Get throttling statistics
  public getStats() {
    return {
      queueSize: this.requestQueue.length,
      maxQueueSize: this.maxQueueSize,
      processingDelay: this.processingDelay,
      processing: this.processing
    };
  }
}

// I/O optimization utilities
export const IOOptimizer = {
  // Batch file operations
  async batchFileOperations<T>(
    operations: Array<() => Promise<T>>,
    batchSize: number = 5
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(op => op()));
      results.push(...batchResults);
      
      // Small delay between batches to prevent I/O saturation
      if (i + batchSize < operations.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    return results;
  },
  
  // Optimized file streaming
  createOptimizedReadStream(filePath: string, options: any = {}) {
    const fs = require('fs');
    return fs.createReadStream(filePath, {
      highWaterMark: 64 * 1024, // 64KB chunks
      ...options
    });
  },
  
  // Memory-efficient JSON parsing for large files
  async parseJSONStream(stream: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
      });
      
      stream.on('end', () => {
        try {
          const result = JSON.parse(buffer);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      stream.on('error', reject);
    });
  }
};

// Global resource optimizer instance
export const globalResourceOptimizer = new ResourceOptimizer();
export const globalRequestThrottler = new RequestThrottler(globalResourceOptimizer);

// Graceful shutdown handler
export function setupGracefulShutdown(server: any) {
  const shutdown = async (signal: string) => {
    Logger.info(`Received ${signal}, starting graceful shutdown`);
    
    // Stop accepting new connections
    server.close(() => {
      Logger.info('HTTP server closed');
    });
    
    // Stop resource monitoring
    globalResourceOptimizer.stopMonitoring();
    
    // Clean up connection pools
    try {
      const { globalPools } = await import('./connectionPool');
      await globalPools.http.destroy();
      Logger.info('Connection pools destroyed');
    } catch (error) {
      Logger.error('Error destroying connection pools', error as Error);
    }
    
    // Exit process
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}