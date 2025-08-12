import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import uploadRoutes from './routes/upload';
import conversionRoutes from './routes/conversion';
import methodRoutes from './routes/methods';
import { errorHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './middleware/requestId';
import { enhancedCorsMiddleware, preflightHandler } from './middleware/cors';
import { versioningMiddleware, legacyRouteHandler } from './middleware/versioning';
import { etagMiddleware, conditionalRequestMiddleware, ETagStrategy } from './middleware/etag';
import { contentNegotiationMiddleware, responseFormatterMiddleware } from './middleware/contentNegotiation';
import { authMiddleware, requireScope, tierBasedRateLimit } from './middleware/authentication';
import { monitoringMiddleware, getHealthMetrics } from './middleware/monitoring';
import { 
  generalRateLimiter, 
  uploadRateLimiter, 
  conversionRateLimiter, 
  concurrentConversionLimiter,
  rateLimitInfoMiddleware 
} from './middleware/rateLimiting';
import { initializeDatabase } from './config/database';
import { getConversionService } from './services/ConversionServiceSingleton';
import { compressionMiddleware, cachingMiddleware, warmCache, CacheInvalidation, getCacheStats } from './middleware/caching';
import { 
  performanceMiddleware, 
  timeoutMiddleware, 
  memoryGuardMiddleware, 
  responseSizeLimitMiddleware,
  getPerformanceMetrics,
  PerformanceUtils
} from './middleware/performance';
import { globalResourceOptimizer, globalRequestThrottler, setupGracefulShutdown } from './utils/resourceOptimization';
import { globalPools } from './utils/connectionPool';
import { Logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3002;

// Request ID middleware (early in the chain)
app.use(requestIdMiddleware);

// Performance monitoring middleware (early for accurate timing)
app.use(performanceMiddleware);

// Request timeout middleware
app.use(timeoutMiddleware(30000)); // 30 second timeout

// Memory guard middleware
app.use(memoryGuardMiddleware(512)); // 512MB memory limit

// Response size limiting middleware
app.use(responseSizeLimitMiddleware(50)); // 50MB response limit

// Enhanced CORS middleware
app.use(enhancedCorsMiddleware);
app.use(preflightHandler);

// Security middleware
app.use(helmet());

// API versioning middleware
app.use(versioningMiddleware);

// Authentication middleware (optional by default)
app.use(authMiddleware(false));

// Monitoring middleware
app.use(monitoringMiddleware);

// Content negotiation middleware
app.use(contentNegotiationMiddleware);
app.use(responseFormatterMiddleware);

// Compression middleware (must be before caching)
app.use(compressionMiddleware({
  compressResponse: true,
  minCompressionSize: 1024 // 1KB minimum
}));

// Advanced caching middleware  
app.use(cachingMiddleware({
  ttl: 300, // 5 minutes default
  cacheableStatusCodes: [200, 203, 300, 301, 302, 404, 410],
  compressResponse: true,
  minCompressionSize: 1024
}));

// ETag and conditional request middleware
app.use(conditionalRequestMiddleware);
app.use(etagMiddleware(ETagStrategy.CONTENT_HASH));

// Request throttling middleware (for CPU pressure management)
app.use(globalRequestThrottler.middleware());

// Rate limiting middleware
app.use(rateLimitInfoMiddleware);
app.use(tierBasedRateLimit);
app.use(generalRateLimiter);

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/outputs', express.static(path.join(__dirname, '../outputs')));

// Versioned API routes (v1)
app.use('/api/v1/upload', uploadRateLimiter, uploadRoutes);
app.use('/api/v1/files', uploadRateLimiter, uploadRoutes);
app.use('/api/v1/convert', conversionRateLimiter, concurrentConversionLimiter, conversionRoutes);
app.use('/api/v1/methods', methodRoutes);

// Legacy routes (for backwards compatibility) - will be deprecated
app.use('/api/upload', legacyRouteHandler, uploadRateLimiter, uploadRoutes);
app.use('/api/files', legacyRouteHandler, uploadRateLimiter, uploadRoutes);
app.use('/api/convert', legacyRouteHandler, conversionRateLimiter, concurrentConversionLimiter, conversionRoutes);
app.use('/api/methods', legacyRouteHandler, methodRoutes);

// API discovery endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Raster-to-Vector API',
    description: 'Enterprise-grade raster-to-vector conversion API',
    version: '1.0.0',
    supportedVersions: ['1.0.0'],
    currentVersion: '1.0.0',
    endpoints: {
      health: '/api/health',
      v1: {
        files: '/api/v1/files',
        upload: '/api/v1/upload',
        convert: '/api/v1/convert',
        methods: '/api/v1/methods'
      }
    },
    documentation: '/api/docs',
    openapi: '/api/openapi.yaml',
    requestId: req.requestId
  });
});

// Versioned health check with detailed metrics
app.get('/api/v1/health', (req, res) => {
  const healthData = getHealthMetrics();
  res.json({ 
    ...healthData,
    version: '1.0.0',
    requestId: req.requestId
  });
});

// Legacy health check (backwards compatibility)
app.get('/api/health', legacyRouteHandler, (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

// Admin endpoints (require authentication)
app.get('/api/v1/admin/metrics', authMiddleware(true), requireScope('admin:read'), (req, res) => {
  res.json({
    success: true,
    data: getHealthMetrics(),
    requestId: req.requestId
  });
});

// Cache management endpoints
app.get('/api/v1/admin/cache/stats', authMiddleware(true), requireScope('admin:read'), (req, res) => {
  res.json({
    success: true,
    data: getCacheStats(),
    requestId: req.requestId
  });
});

app.delete('/api/v1/admin/cache', authMiddleware(true), requireScope('admin:write'), async (req, res) => {
  try {
    await CacheInvalidation.invalidateAll();
    res.json({
      success: true,
      message: 'Cache cleared successfully',
      requestId: req.requestId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      requestId: req.requestId
    });
  }
});

app.post('/api/v1/admin/cache/warm', authMiddleware(true), requireScope('admin:write'), async (req, res) => {
  try {
    const routes = req.body.routes || [
      { path: '/api/v1/methods' },
      { path: '/api/v1/health' },
      { path: '/api' }
    ];
    
    // Run cache warming in background
    warmCache(routes).catch(error => {
      console.error('Cache warming failed:', error);
    });
    
    res.status(202).json({
      success: true,
      message: 'Cache warming started',
      routes: routes.length,
      requestId: req.requestId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to start cache warming',
      requestId: req.requestId
    });
  }
});

// Performance monitoring endpoints
app.get('/api/v1/admin/performance', authMiddleware(true), requireScope('admin:read'), (req, res) => {
  const performanceMetrics = getPerformanceMetrics();
  const resourceMetrics = globalResourceOptimizer.getMetrics();
  const throttlerStats = globalRequestThrottler.getStats();
  
  res.json({
    success: true,
    data: {
      performance: performanceMetrics,
      resources: resourceMetrics,
      throttler: throttlerStats,
      recommendations: globalResourceOptimizer.getRecommendations()
    },
    requestId: req.requestId
  });
});

// Resource optimization endpoint
app.post('/api/v1/admin/performance/optimize', authMiddleware(true), requireScope('admin:write'), async (req, res) => {
  try {
    await globalResourceOptimizer.optimizeNow();
    
    res.json({
      success: true,
      message: 'Resource optimization completed',
      data: {
        memoryPressure: PerformanceUtils.getMemoryPressure(),
        responseTimeHealth: PerformanceUtils.getResponseTimeHealth(),
        underStress: PerformanceUtils.isUnderStress()
      },
      requestId: req.requestId
    });
  } catch (error) {
    Logger.error('Manual optimization failed', error as Error, { requestId: req.requestId });
    res.status(500).json({
      success: false,
      error: 'Failed to perform optimization',
      requestId: req.requestId
    });
  }
});

// Force garbage collection endpoint
app.post('/api/v1/admin/performance/gc', authMiddleware(true), requireScope('admin:write'), (req, res) => {
  const success = PerformanceUtils.forceGC();
  
  if (success) {
    res.json({
      success: true,
      message: 'Garbage collection forced',
      data: {
        memoryAfterGC: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        memoryPressure: PerformanceUtils.getMemoryPressure()
      },
      requestId: req.requestId
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'Garbage collection not available (start with --expose-gc)',
      requestId: req.requestId
    });
  }
});

// Connection pool statistics
app.get('/api/v1/admin/performance/pools', authMiddleware(true), requireScope('admin:read'), (req, res) => {
  res.json({
    success: true,
    data: {
      http: globalPools.http.getStats()
    },
    requestId: req.requestId
  });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('Database initialized successfully');

    // Initialize conversion service singleton with all converters
    const conversionService = getConversionService();

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log('Performance monitoring: http://localhost:' + PORT + '/api/v1/admin/performance');
      
      // Cache warming disabled for now - can be enabled via admin endpoint
      console.log('Cache warming available via /api/v1/admin/cache/warm endpoint');
      
      // Setup graceful shutdown
      setupGracefulShutdown(server);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();