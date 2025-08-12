import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';

// Metrics collection
interface Metrics {
  requests: {
    total: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
    byEndpoint: Record<string, number>;
  };
  responseTime: {
    total: number;
    count: number;
    average: number;
    p95: number;
    p99: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
  authentication: {
    apiKey: number;
    jwt: number;
    anonymous: number;
    failed: number;
  };
}

const metrics: Metrics = {
  requests: { total: 0, byMethod: {}, byStatus: {}, byEndpoint: {} },
  responseTime: { total: 0, count: 0, average: 0, p95: 0, p99: 0 },
  errors: { total: 0, byType: {} },
  authentication: { apiKey: 0, jwt: 0, anonymous: 0, failed: 0 }
};

// Store response times for percentile calculation
const responseTimes: number[] = [];

// Monitoring middleware
export function monitoringMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Increment request counter
  metrics.requests.total++;
  metrics.requests.byMethod[req.method] = (metrics.requests.byMethod[req.method] || 0) + 1;
  metrics.requests.byEndpoint[req.path] = (metrics.requests.byEndpoint[req.path] || 0) + 1;

  // Track authentication method
  const auth = (req as any).auth;
  if (auth) {
    if (auth.type === 'api_key') {
      metrics.authentication.apiKey++;
    } else if (auth.type === 'jwt') {
      metrics.authentication.jwt++;
    }
  } else {
    metrics.authentication.anonymous++;
  }

  // Override response methods to capture metrics
  const originalSend = res.send;
  const originalJson = res.json;
  
  function captureMetrics() {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    // Track response time
    responseTimes.push(responseTime);
    metrics.responseTime.total += responseTime;
    metrics.responseTime.count++;
    metrics.responseTime.average = metrics.responseTime.total / metrics.responseTime.count;
    
    // Calculate percentiles (keep last 1000 entries)
    if (responseTimes.length > 1000) {
      responseTimes.splice(0, responseTimes.length - 1000);
    }
    const sorted = [...responseTimes].sort((a, b) => a - b);
    metrics.responseTime.p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    metrics.responseTime.p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    
    // Track status codes
    const statusCode = res.statusCode.toString();
    metrics.requests.byStatus[statusCode] = (metrics.requests.byStatus[statusCode] || 0) + 1;
    
    // Track errors
    if (res.statusCode >= 400) {
      metrics.errors.total++;
      const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
      metrics.errors.byType[errorType] = (metrics.errors.byType[errorType] || 0) + 1;
    }
    
    // Log request with metrics
    Logger.info('Request completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      authType: auth?.type || 'anonymous',
      userId: auth?.userId
    });
  }
  
  res.send = function(body: any) {
    captureMetrics();
    return originalSend.call(this, body);
  };
  
  res.json = function(obj: any) {
    captureMetrics();
    return originalJson.call(this, obj);
  };
  
  next();
}

// Health check with detailed metrics
export function getHealthMetrics() {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    metrics: {
      ...metrics,
      responseTime: {
        ...metrics.responseTime,
        unit: 'milliseconds'
      }
    }
  };
}

// Reset metrics (for testing)
export function resetMetrics() {
  metrics.requests = { total: 0, byMethod: {}, byStatus: {}, byEndpoint: {} };
  metrics.responseTime = { total: 0, count: 0, average: 0, p95: 0, p99: 0 };
  metrics.errors = { total: 0, byType: {} };
  metrics.authentication = { apiKey: 0, jwt: 0, anonymous: 0, failed: 0 };
  responseTimes.length = 0;
}