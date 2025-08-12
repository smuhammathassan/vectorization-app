import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Problems } from '../utils/problemDetails';

// Idempotency storage interface (can be Redis in production)
interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  set(key: string, record: IdempotencyRecord, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface IdempotencyRecord {
  requestId: string;
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  createdAt: Date;
  fingerprint: string;
}

// In-memory store for development (use Redis in production)
class MemoryIdempotencyStore implements IdempotencyStore {
  private store = new Map<string, IdempotencyRecord>();
  private timers = new Map<string, NodeJS.Timeout>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, record: IdempotencyRecord, ttlSeconds: number = 3600): Promise<void> {
    this.store.set(key, record);
    
    // Set TTL
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
}

// Global idempotency store
const idempotencyStore: IdempotencyStore = new MemoryIdempotencyStore();

// Generate request fingerprint for consistency checking
function generateRequestFingerprint(req: Request): string {
  const data = {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    // Include relevant headers that affect processing
    contentType: req.headers['content-type'],
    userAgent: req.headers['user-agent']
  };
  
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');
}

// Validate idempotency key format
function validateIdempotencyKey(key: string): boolean {
  // Must be UUID v4 format or similar strong identifier
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const strongKeyRegex = /^[a-zA-Z0-9_-]{16,}$/; // At least 16 chars, alphanumeric + _ -
  
  return uuidRegex.test(key) || strongKeyRegex.test(key);
}

// Idempotency middleware
export function idempotencyMiddleware(options: {
  required?: boolean;
  ttlSeconds?: number;
  methods?: string[];
} = {}) {
  const {
    required = false,
    ttlSeconds = 3600, // 1 hour default
    methods = ['POST', 'PUT', 'PATCH']
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only apply to specified HTTP methods
    if (!methods.includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'] as string;

    // Check if idempotency key is required
    if (required && !idempotencyKey) {
      const problemDetails = Problems.validationError(
        'Idempotency-Key header is required for this operation',
        req
      );
      problemDetails.missingHeader = 'Idempotency-Key';
      problemDetails.headerFormat = 'UUID v4 or strong identifier (min 16 chars)';
      
      res.set('Content-Type', 'application/problem+json');
      res.status(400).json(problemDetails);
      return;
    }

    // If no idempotency key provided and not required, proceed normally
    if (!idempotencyKey) {
      return next();
    }

    // Validate idempotency key format
    if (!validateIdempotencyKey(idempotencyKey)) {
      const problemDetails = Problems.validationError(
        'Invalid Idempotency-Key format. Must be UUID v4 or strong identifier (min 16 chars)',
        req
      );
      problemDetails.invalidHeader = 'Idempotency-Key';
      problemDetails.headerFormat = 'UUID v4 or strong identifier (min 16 chars)';
      
      res.set('Content-Type', 'application/problem+json');
      res.status(400).json(problemDetails);
      return;
    }

    try {
      // Generate request fingerprint
      const fingerprint = generateRequestFingerprint(req);
      
      // Check if we've seen this idempotency key before
      const existingRecord = await idempotencyStore.get(idempotencyKey);

      if (existingRecord) {
        // Verify request consistency
        if (existingRecord.fingerprint !== fingerprint) {
          const problemDetails = Problems.validationError(
            'Idempotency key reused with different request parameters',
            req
          );
          problemDetails.conflictingKey = idempotencyKey;
          problemDetails.originalRequestId = existingRecord.requestId;
          
          res.set('Content-Type', 'application/problem+json');
          res.status(409).json(problemDetails);
          return;
        }

        // Return cached response
        res.set('Idempotency-Replayed', 'true');
        res.set('Original-Request-Id', existingRecord.requestId);
        
        // Set cached headers
        Object.entries(existingRecord.headers).forEach(([key, value]) => {
          res.set(key, value);
        });

        res.status(existingRecord.statusCode).json(existingRecord.body);
        return;
      }

      // Store original response methods
      const originalJson = res.json;
      const originalStatus = res.status;
      const originalSend = res.send;
      
      let statusCode = 200;
      let responseBody: any;
      let responseHeaders: Record<string, string> = {};

      // Override status method to capture status code
      res.status = function(code: number) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      // Override json method to capture response
      res.json = function(obj: any) {
        responseBody = obj;
        
        // Capture relevant headers
        const headerNames = ['content-type', 'cache-control', 'etag', 'location', 'x-request-id'];
        headerNames.forEach(name => {
          const value = this.get(name);
          if (value) {
            responseHeaders[name] = value;
          }
        });

        // Store idempotency record for successful responses
        if (statusCode >= 200 && statusCode < 300) {
          const record: IdempotencyRecord = {
            requestId: req.requestId,
            statusCode,
            headers: responseHeaders,
            body: obj,
            createdAt: new Date(),
            fingerprint
          };

          // Store asynchronously to not block response
          idempotencyStore.set(idempotencyKey, record, ttlSeconds).catch(err => {
            console.error('Failed to store idempotency record:', err);
          });
        }

        // Set idempotency headers
        this.set('Idempotency-Key', idempotencyKey);
        
        return originalJson.call(this, obj);
      };

      // Override send method for non-JSON responses
      res.send = function(body: any) {
        responseBody = body;
        
        // Capture relevant headers
        const headerNames = ['content-type', 'cache-control', 'etag', 'location', 'x-request-id'];
        headerNames.forEach(name => {
          const value = this.get(name);
          if (value) {
            responseHeaders[name] = value;
          }
        });

        // Store idempotency record for successful responses
        if (statusCode >= 200 && statusCode < 300) {
          const record: IdempotencyRecord = {
            requestId: req.requestId,
            statusCode,
            headers: responseHeaders,
            body,
            createdAt: new Date(),
            fingerprint
          };

          idempotencyStore.set(idempotencyKey, record, ttlSeconds).catch(err => {
            console.error('Failed to store idempotency record:', err);
          });
        }

        this.set('Idempotency-Key', idempotencyKey);
        
        return originalSend.call(this, body);
      };

      next();
    } catch (error) {
      console.error('Idempotency middleware error:', error);
      next(error);
    }
  };
}

// Utility to clear idempotency record (for manual cleanup)
export async function clearIdempotencyKey(key: string): Promise<void> {
  await idempotencyStore.delete(key);
}

// Middleware specifically for conversion jobs (which should be idempotent)
export const conversionIdempotencyMiddleware = idempotencyMiddleware({
  required: false, // Optional for now, can be made required later
  ttlSeconds: 3600, // 1 hour
  methods: ['POST']
});

// Middleware for file uploads (which should be idempotent)
export const uploadIdempotencyMiddleware = idempotencyMiddleware({
  required: false, // Optional for now
  ttlSeconds: 1800, // 30 minutes (shorter for uploads)
  methods: ['POST']
});

// Middleware for critical operations (required idempotency)
export const criticalOperationIdempotencyMiddleware = idempotencyMiddleware({
  required: true,
  ttlSeconds: 3600,
  methods: ['POST', 'PUT', 'PATCH', 'DELETE']
});

// Declare module augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      idempotencyKey?: string;
    }
  }
}