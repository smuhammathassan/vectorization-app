import { Request, Response, NextFunction } from 'express';
import { createGzip, createBrotliCompress, createDeflate } from 'zlib';
import { promisify } from 'util';
import { Logger } from '../utils/logger';

// Performance metrics collection
interface PerformanceMetrics {
  responseTime: {
    current: number;
    average: number;
    p50: number;
    p95: number;
    p99: number;
    samples: number[];
  };
  throughput: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    totalRequests: number;
    startTime: Date;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  errors: {
    rate: number;
    total: number;
    recent: number[];
  };
}

// Global performance state
const performanceState = {
  metrics: {
    responseTime: {
      current: 0,
      average: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      samples: [] as number[]
    },
    throughput: {
      requestsPerSecond: 0,
      requestsPerMinute: 0,
      totalRequests: 0,
      startTime: new Date()
    },
    memory: {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0
    },
    cpu: {
      usage: 0,
      loadAverage: []
    },
    errors: {
      rate: 0,
      total: 0,
      recent: [] as number[]
    }
  } as PerformanceMetrics,
  requestTimestamps: [] as number[],
  errorTimestamps: [] as number[]
};

// Update memory and CPU metrics periodically
function updateSystemMetrics() {
  const memUsage = process.memoryUsage();
  performanceState.metrics.memory = {
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    external: memUsage.external,
    rss: memUsage.rss
  };

  // Get CPU load average (use os module)
  const os = require('os');
  performanceState.metrics.cpu = {
    usage: process.cpuUsage().user / 1000000, // Convert to seconds
    loadAverage: os.loadavg()
  };
}

// Update metrics every 10 seconds
setInterval(updateSystemMetrics, 10000);
updateSystemMetrics(); // Initial update

// Calculate response time percentiles
function calculatePercentiles(samples: number[]) {
  if (samples.length === 0) return { p50: 0, p95: 0, p99: 0 };
  
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
    p99: sorted[Math.floor(sorted.length * 0.99)] || 0
  };
}

// Update throughput metrics
function updateThroughput() {
  const now = Date.now();
  const oneSecondAgo = now - 1000;
  const oneMinuteAgo = now - 60000;
  
  // Filter recent requests
  const recentSecond = performanceState.requestTimestamps.filter(t => t > oneSecondAgo);
  const recentMinute = performanceState.requestTimestamps.filter(t => t > oneMinuteAgo);
  
  performanceState.metrics.throughput.requestsPerSecond = recentSecond.length;
  performanceState.metrics.throughput.requestsPerMinute = recentMinute.length;
  
  // Clean old timestamps (keep last hour)
  const oneHourAgo = now - 3600000;
  performanceState.requestTimestamps = performanceState.requestTimestamps.filter(t => t > oneHourAgo);
}

// Performance monitoring middleware
export function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const startHrTime = process.hrtime.bigint();
  
  // Track request
  performanceState.requestTimestamps.push(startTime);
  performanceState.metrics.throughput.totalRequests++;
  
  // Override response methods to capture completion time
  const originalSend = res.send;
  const originalJson = res.json;
  const originalEnd = res.end;
  
  function capturePerformanceMetrics() {
    const endTime = Date.now();
    const endHrTime = process.hrtime.bigint();
    const responseTime = Number(endHrTime - startHrTime) / 1000000; // Convert to milliseconds
    
    // Update response time metrics
    performanceState.metrics.responseTime.current = responseTime;
    performanceState.metrics.responseTime.samples.push(responseTime);
    
    // Keep only last 1000 samples for percentile calculation
    if (performanceState.metrics.responseTime.samples.length > 1000) {
      performanceState.metrics.responseTime.samples.splice(0, 500); // Remove oldest 500
    }
    
    // Calculate average
    const samples = performanceState.metrics.responseTime.samples;
    performanceState.metrics.responseTime.average = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    // Calculate percentiles
    const percentiles = calculatePercentiles(samples);
    performanceState.metrics.responseTime.p50 = percentiles.p50;
    performanceState.metrics.responseTime.p95 = percentiles.p95;
    performanceState.metrics.responseTime.p99 = percentiles.p99;
    
    // Track errors
    if (res.statusCode >= 400) {
      performanceState.errorTimestamps.push(endTime);
      performanceState.metrics.errors.total++;
      
      // Calculate error rate (errors per minute)
      const oneMinuteAgo = endTime - 60000;
      const recentErrors = performanceState.errorTimestamps.filter(t => t > oneMinuteAgo);
      performanceState.metrics.errors.rate = recentErrors.length;
      
      // Clean old error timestamps
      const oneHourAgo = endTime - 3600000;
      performanceState.errorTimestamps = performanceState.errorTimestamps.filter(t => t > oneHourAgo);
    }
    
    // Update throughput
    updateThroughput();
    
    // Add performance headers
    res.set('X-Response-Time', `${responseTime.toFixed(2)}ms`);
    res.set('X-Server-Timing', `total;dur=${responseTime.toFixed(2)}`);
    
    // Log slow requests
    if (responseTime > 1000) { // Slower than 1 second
      Logger.warn('Slow request detected', {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        responseTime: Math.round(responseTime),
        statusCode: res.statusCode,
        userAgent: req.headers['user-agent']
      });
    }
  }
  
  // Override response methods
  res.send = function(body: any): Response {
    capturePerformanceMetrics();
    return originalSend.call(this, body);
  };
  
  res.json = function(obj: any): Response {
    capturePerformanceMetrics();
    return originalJson.call(this, obj);
  };
  
  res.end = function(...args: any[]): Response {
    capturePerformanceMetrics();
    originalEnd.apply(this, args as any);
    return this;
  };
  
  next();
}

// Request timeout middleware
export function timeoutMiddleware(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        Logger.error('Request timeout', new Error('Request timeout'), {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          timeout: timeoutMs
        });
        
        res.status(504).json({
          type: 'https://tools.ietf.org/html/rfc7231#section-6.6.5',
          title: 'Gateway Timeout',
          status: 504,
          detail: 'Request processing exceeded the maximum allowed time',
          instance: req.path,
          requestId: req.requestId,
          timeout: timeoutMs
        });
      }
    }, timeoutMs);
    
    // Clear timeout when response is sent
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;
    
    function clearRequestTimeout() {
      clearTimeout(timeout);
    }
    
    res.send = function(body: any): Response {
      clearRequestTimeout();
      return originalSend.call(this, body);
    };
    
    res.json = function(obj: any): Response {
      clearRequestTimeout();
      return originalJson.call(this, obj);
    };
    
    res.end = function(...args: any[]): Response {
      clearRequestTimeout();
      originalEnd.apply(this, args as any);
      return this;
    };
    
    next();
  };
}

// Memory usage monitoring middleware
export function memoryGuardMiddleware(maxMemoryMB: number = 512) {
  return (req: Request, res: Response, next: NextFunction) => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > maxMemoryMB) {
      Logger.warn('High memory usage detected', {
        requestId: req.requestId,
        heapUsedMB: Math.round(heapUsedMB),
        maxMemoryMB,
        rss: Math.round(memUsage.rss / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      });
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        Logger.info('Forced garbage collection', {
          requestId: req.requestId,
          beforeHeap: Math.round(heapUsedMB),
          afterHeap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        });
      }
      
      // Return 503 if memory usage is critically high
      if (heapUsedMB > maxMemoryMB * 1.5) {
        return res.status(503).json({
          type: 'https://tools.ietf.org/html/rfc7231#section-6.6.4',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Server temporarily overloaded due to high memory usage',
          instance: req.path,
          requestId: req.requestId,
          retryAfter: 60
        });
      }
    }
    
    next();
  };
}

// Response size limiting middleware
export function responseSizeLimitMiddleware(maxSizeMB: number = 50) {
  return (req: Request, res: Response, next: NextFunction) => {
    const maxBytes = maxSizeMB * 1024 * 1024;
    let responseSize = 0;
    
    const originalSend = res.send;
    const originalJson = res.json;
    
    res.send = function(body: any): Response {
      if (body) {
        const size = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(String(body));
        if (size > maxBytes) {
          Logger.warn('Large response detected', {
            requestId: req.requestId,
            responseSizeMB: Math.round(size / 1024 / 1024),
            maxSizeMB,
            path: req.path
          });
          
          return res.status(413).json({
            type: 'https://tools.ietf.org/html/rfc7231#section-6.5.11',
            title: 'Payload Too Large',
            status: 413,
            detail: 'Response payload exceeds maximum allowed size',
            instance: req.path,
            requestId: req.requestId,
            maxSizeMB
          });
        }
        responseSize = size;
      }
      
      res.set('X-Response-Size', responseSize.toString());
      return originalSend.call(this, body);
    };
    
    res.json = function(obj: any): Response {
      const body = JSON.stringify(obj);
      const size = Buffer.byteLength(body);
      
      if (size > maxBytes) {
        Logger.warn('Large JSON response detected', {
          requestId: req.requestId,
          responseSizeMB: Math.round(size / 1024 / 1024),
          maxSizeMB,
          path: req.path
        });
        
        return originalJson.call(this, {
          type: 'https://tools.ietf.org/html/rfc7231#section-6.5.11',
          title: 'Payload Too Large',
          status: 413,
          detail: 'Response payload exceeds maximum allowed size',
          instance: req.path,
          requestId: req.requestId,
          maxSizeMB
        });
      }
      
      responseSize = size;
      res.set('X-Response-Size', responseSize.toString());
      return originalJson.call(this, obj);
    };
    
    next();
  };
}

// Get current performance metrics
export function getPerformanceMetrics(): PerformanceMetrics {
  return { ...performanceState.metrics };
}

// Reset performance metrics
export function resetPerformanceMetrics() {
  performanceState.metrics = {
    responseTime: {
      current: 0,
      average: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      samples: []
    },
    throughput: {
      requestsPerSecond: 0,
      requestsPerMinute: 0,
      totalRequests: 0,
      startTime: new Date()
    },
    memory: {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0
    },
    cpu: {
      usage: 0,
      loadAverage: []
    },
    errors: {
      rate: 0,
      total: 0,
      recent: []
    }
  };
  
  performanceState.requestTimestamps = [];
  performanceState.errorTimestamps = [];
}

// Performance optimization utilities
export const PerformanceUtils = {
  // Force garbage collection
  forceGC(): boolean {
    if (global.gc) {
      const before = process.memoryUsage();
      global.gc();
      const after = process.memoryUsage();
      
      Logger.info('Manual garbage collection performed', {
        beforeHeapMB: Math.round(before.heapUsed / 1024 / 1024),
        afterHeapMB: Math.round(after.heapUsed / 1024 / 1024),
        freedMB: Math.round((before.heapUsed - after.heapUsed) / 1024 / 1024)
      });
      
      return true;
    }
    return false;
  },
  
  // Get memory pressure level
  getMemoryPressure(): 'low' | 'medium' | 'high' | 'critical' {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const rssMB = memUsage.rss / 1024 / 1024;
    
    if (heapUsedMB > 800 || rssMB > 1000) return 'critical';
    if (heapUsedMB > 400 || rssMB > 500) return 'high';
    if (heapUsedMB > 200 || rssMB > 250) return 'medium';
    return 'low';
  },
  
  // Get response time health
  getResponseTimeHealth(): 'excellent' | 'good' | 'fair' | 'poor' {
    const p95 = performanceState.metrics.responseTime.p95;
    
    if (p95 < 100) return 'excellent';
    if (p95 < 500) return 'good';
    if (p95 < 1000) return 'fair';
    return 'poor';
  },
  
  // Check if server is under stress
  isUnderStress(): boolean {
    const memoryPressure = this.getMemoryPressure();
    const responseTimeHealth = this.getResponseTimeHealth();
    const errorRate = performanceState.metrics.errors.rate;
    
    return memoryPressure === 'high' || 
           memoryPressure === 'critical' ||
           responseTimeHealth === 'poor' ||
           errorRate > 10; // More than 10 errors per minute
  }
};