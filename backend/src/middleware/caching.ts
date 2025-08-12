import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const deflate = promisify(zlib.deflate);
const brotliCompress = promisify(zlib.brotliCompress);

// Cache storage interface
interface CacheStore {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface CacheEntry {
  data: any;
  headers: Record<string, string>;
  statusCode: number;
  createdAt: Date;
  etag: string;
  compressed?: {
    gzip?: Buffer;
    deflate?: Buffer;
    brotli?: Buffer;
  };
}

// In-memory cache store (use Redis in production)
class MemoryCacheStore implements CacheStore {
  private store = new Map<string, CacheEntry>();
  private timers = new Map<string, NodeJS.Timeout>();

  async get(key: string): Promise<CacheEntry | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, entry: CacheEntry, ttlSeconds: number = 300): Promise<void> {
    this.store.set(key, entry);
    
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
    }
    
    const timer = setTimeout(() => {
      this.store.delete(key);
      this.timers.delete(key);
    }, ttlSeconds * 1000);
    
    this.timers.set(key, timer);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
      this.timers.delete(key);
    }
  }

  async clear(): Promise<void> {
    this.store.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }
}

const cacheStore: CacheStore = new MemoryCacheStore();

// Cache configuration
interface CacheConfig {
  ttl: number; // Time to live in seconds
  varyBy: string[]; // Headers to vary cache by
  cacheableStatusCodes: number[];
  excludeHeaders: string[];
  compressResponse: boolean;
  minCompressionSize: number;
}

const defaultCacheConfig: CacheConfig = {
  ttl: 300, // 5 minutes
  varyBy: ['accept', 'accept-encoding', 'authorization'],
  cacheableStatusCodes: [200, 203, 300, 301, 302, 404, 410],
  excludeHeaders: ['date', 'server', 'x-request-id'],
  compressResponse: true,
  minCompressionSize: 1024 // Only compress responses larger than 1KB
};

// Generate cache key
function generateCacheKey(req: Request, config: CacheConfig): string {
  const keyData = {
    method: req.method,
    path: req.path,
    query: req.query,
    vary: config.varyBy.reduce((acc, header) => {
      acc[header] = req.headers[header];
      return acc;
    }, {} as Record<string, any>)
  };
  
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(keyData))
    .digest('hex');
}

// Determine best compression algorithm
function getBestCompression(acceptEncoding: string): 'brotli' | 'gzip' | 'deflate' | null {
  if (!acceptEncoding) return null;
  
  const encodings = acceptEncoding.toLowerCase();
  
  if (encodings.includes('br')) return 'brotli';
  if (encodings.includes('gzip')) return 'gzip';
  if (encodings.includes('deflate')) return 'deflate';
  
  return null;
}

// Compression middleware
export function compressionMiddleware(options: Partial<CacheConfig> = {}) {
  const config = { ...defaultCacheConfig, ...options };
  
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    const originalJson = res.json;
    
    // Override response methods to add compression
    async function compressAndSend(body: any, isJson: boolean = false) {
      if (typeof body !== 'string' && !Buffer.isBuffer(body)) {
        body = isJson ? JSON.stringify(body) : String(body);
      }
      
      const bodySize = Buffer.byteLength(body);
      
      if (config.compressResponse && bodySize >= config.minCompressionSize) {
        const acceptEncoding = req.headers['accept-encoding'] as string;
        const compression = getBestCompression(acceptEncoding);
        
        if (compression) {
          try {
            let compressedBody: Buffer;
            
            switch (compression) {
              case 'brotli':
                compressedBody = await brotliCompress(body);
                res.set('Content-Encoding', 'br');
                break;
              case 'gzip':
                compressedBody = await gzip(body);
                res.set('Content-Encoding', 'gzip');
                break;
              case 'deflate':
                compressedBody = await deflate(body);
                res.set('Content-Encoding', 'deflate');
                break;
            }
            
            res.set('Content-Length', compressedBody!.length.toString());
            res.set('Vary', 'Accept-Encoding');
            
            return originalSend.call(res, compressedBody!);
          } catch (error) {
            // Fall back to uncompressed response
            console.warn('Compression failed:', error);
          }
        }
      }
      
      return originalSend.call(res, body);
    }
    
    res.send = function(body: any): Response {
      compressAndSend.call(this, body, false);
      return this;
    };
    
    res.json = function(obj: any): Response {
      this.set('Content-Type', 'application/json; charset=utf-8');
      compressAndSend.call(this, obj, true);
      return this;
    };
    
    next();
  };
}

// Advanced caching middleware
export function cachingMiddleware(options: Partial<CacheConfig> = {}) {
  const config = { ...defaultCacheConfig, ...options };
  
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET and HEAD requests
    if (!['GET', 'HEAD'].includes(req.method)) {
      return next();
    }
    
    const cacheKey = generateCacheKey(req, config);
    
    try {
      // Check cache
      const cached = await cacheStore.get(cacheKey);
      
      if (cached) {
        // Set cached headers
        Object.entries(cached.headers).forEach(([key, value]) => {
          if (!config.excludeHeaders.includes(key.toLowerCase())) {
            res.set(key, value);
          }
        });
        
        // Set cache headers
        res.set('X-Cache', 'HIT');
        res.set('Age', Math.floor((Date.now() - cached.createdAt.getTime()) / 1000).toString());
        
        // Handle compression for cached responses
        const acceptEncoding = req.headers['accept-encoding'] as string;
        const compression = getBestCompression(acceptEncoding);
        
        if (compression && cached.compressed?.[compression]) {
          res.set('Content-Encoding', compression === 'brotli' ? 'br' : compression);
          res.set('Content-Length', cached.compressed[compression]!.length.toString());
          res.set('Vary', 'Accept-Encoding');
          
          return res.status(cached.statusCode).send(cached.compressed[compression]);
        }
        
        return res.status(cached.statusCode).send(cached.data);
      }
      
      // Cache miss - intercept response
      const originalSend = res.send;
      const originalJson = res.json;
      
      let responseBody: any;
      let isJson = false;
      
      res.send = function(body: any): Response {
        responseBody = body;
        originalSend.call(this, body);
        return this;
      };
      
      res.json = function(obj: any): Response {
        responseBody = obj;
        isJson = true;
        originalJson.call(this, obj);
        return this;
      };
      
      // Continue with request
      res.on('finish', async () => {
        // Only cache successful responses
        if (config.cacheableStatusCodes.includes(res.statusCode)) {
          try {
            const headers: Record<string, string> = {};
            
            // Capture response headers
            res.getHeaderNames().forEach(name => {
              if (!config.excludeHeaders.includes(name.toLowerCase())) {
                const value = res.getHeader(name);
                if (typeof value === 'string') {
                  headers[name] = value;
                }
              }
            });
            
            // Prepare cache entry
            const cacheEntry: CacheEntry = {
              data: isJson ? JSON.stringify(responseBody) : responseBody,
              headers,
              statusCode: res.statusCode,
              createdAt: new Date(),
              etag: res.getHeader('etag') as string || `"${Date.now()}"`,
              compressed: {}
            };
            
            // Pre-compress for different algorithms if response is large enough
            if (config.compressResponse && 
                responseBody && 
                Buffer.byteLength(cacheEntry.data) >= config.minCompressionSize) {
              
              try {
                const [gzipData, deflateData, brotliData] = await Promise.all([
                  gzip(cacheEntry.data),
                  deflate(cacheEntry.data),
                  brotliCompress(cacheEntry.data)
                ]);
                
                cacheEntry.compressed = {
                  gzip: gzipData,
                  deflate: deflateData,
                  brotli: brotliData
                };
              } catch (compressionError) {
                console.warn('Failed to pre-compress cache entry:', compressionError);
              }
            }
            
            // Store in cache
            await cacheStore.set(cacheKey, cacheEntry, config.ttl);
            
            // Set cache miss header
            res.set('X-Cache', 'MISS');
            
          } catch (error) {
            console.error('Failed to cache response:', error);
          }
        }
      });
      
      next();
      
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

// Cache warming utility
export async function warmCache(routes: Array<{path: string, query?: any}>) {
  console.log('Starting cache warming...');
  
  for (const route of routes) {
    try {
      const url = new URL(`http://localhost:3002${route.path}`);
      if (route.query) {
        Object.entries(route.query).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
      }
      
      const response = await fetch(url.toString());
      if (response.ok) {
        console.log(`Cache warmed: ${route.path}`);
      }
    } catch (error) {
      console.warn(`Failed to warm cache for ${route.path}:`, error);
    }
  }
  
  console.log('Cache warming completed');
}

// Cache invalidation patterns
export const CacheInvalidation = {
  // Invalidate all caches
  async invalidateAll(): Promise<void> {
    await cacheStore.clear();
  },
  
  // Invalidate by pattern (simple prefix matching)
  async invalidateByPattern(pattern: string): Promise<void> {
    // In a real implementation with Redis, you'd use SCAN with pattern matching
    console.log(`Cache invalidation by pattern not implemented for memory store: ${pattern}`);
  },
  
  // Invalidate specific cache entry
  async invalidateKey(key: string): Promise<void> {
    await cacheStore.delete(key);
  }
};

// Cache statistics
export function getCacheStats() {
  return {
    // In production with Redis, you'd get real stats
    size: 0,
    hits: 0,
    misses: 0,
    hitRate: 0,
    memoryUsage: process.memoryUsage()
  };
}