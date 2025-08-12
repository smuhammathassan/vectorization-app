import { Request, Response, NextFunction } from 'express';
import { rateLimit, RateLimitRequestHandler } from 'express-rate-limit';
import { Problems } from '../utils/problemDetails';

// Rate limiting store interface (can be Redis in production)
interface RateLimitStore {
  increment(key: string): Promise<{ totalHits: number; timeToExpire?: number }>;
  decrement(key: string): Promise<void>;
  resetKey(key: string): Promise<void>;
}

// User tier definitions
export enum UserTier {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro',
  ENTERPRISE = 'enterprise'
}

// Rate limit configurations per tier
export const rateLimitConfigs = {
  [UserTier.FREE]: {
    requests: { windowMs: 15 * 60 * 1000, max: 50 }, // 50 requests per 15 minutes
    uploads: { windowMs: 60 * 60 * 1000, max: 10 },  // 10 uploads per hour
    conversions: { windowMs: 60 * 60 * 1000, max: 5 }, // 5 conversions per hour
    concurrent: 1 // 1 concurrent conversion
  },
  [UserTier.BASIC]: {
    requests: { windowMs: 15 * 60 * 1000, max: 200 }, // 200 requests per 15 minutes
    uploads: { windowMs: 60 * 60 * 1000, max: 50 },   // 50 uploads per hour
    conversions: { windowMs: 60 * 60 * 1000, max: 25 }, // 25 conversions per hour
    concurrent: 3 // 3 concurrent conversions
  },
  [UserTier.PRO]: {
    requests: { windowMs: 15 * 60 * 1000, max: 1000 }, // 1000 requests per 15 minutes
    uploads: { windowMs: 60 * 60 * 1000, max: 200 },   // 200 uploads per hour
    conversions: { windowMs: 60 * 60 * 1000, max: 100 }, // 100 conversions per hour
    concurrent: 10 // 10 concurrent conversions
  },
  [UserTier.ENTERPRISE]: {
    requests: { windowMs: 15 * 60 * 1000, max: 5000 }, // 5000 requests per 15 minutes
    uploads: { windowMs: 60 * 60 * 1000, max: 1000 },  // 1000 uploads per hour
    conversions: { windowMs: 60 * 60 * 1000, max: 500 }, // 500 conversions per hour
    concurrent: 50 // 50 concurrent conversions
  }
};

// Get user tier from request (in real implementation, this would check API key or JWT)
export function getUserTier(req: Request): UserTier {
  const apiKey = req.headers['x-api-key'] as string;
  const authHeader = req.headers.authorization;

  // In development, default to FREE tier
  if (process.env.NODE_ENV === 'development') {
    return UserTier.PRO; // Give more generous limits in development
  }

  // Check for enterprise API key pattern
  if (apiKey?.startsWith('ent_')) {
    return UserTier.ENTERPRISE;
  }

  // Check for pro API key pattern
  if (apiKey?.startsWith('pro_')) {
    return UserTier.PRO;
  }

  // Check for basic API key pattern
  if (apiKey?.startsWith('basic_')) {
    return UserTier.BASIC;
  }

  // Check JWT for user tier (simplified)
  if (authHeader?.startsWith('Bearer ')) {
    // In a real implementation, decode JWT and extract user tier
    // For now, default to BASIC for authenticated users
    return UserTier.BASIC;
  }

  return UserTier.FREE;
}

// Enhanced rate limiter with custom error responses
function createRateLimiter(
  type: 'requests' | 'uploads' | 'conversions',
  getMessage: (tier: UserTier, limit: number) => string
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes - use static value
    max: (req: Request): number => {
      const tier = getUserTier(req);
      return rateLimitConfigs[tier][type].max;
    },
    message: (req: Request): any => {
      const tier = getUserTier(req);
      const limit = rateLimitConfigs[tier][type].max;
      return getMessage(tier, limit);
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      const tier = getUserTier(req);
      const limit = rateLimitConfigs[tier][type].max;
      const windowMs = rateLimitConfigs[tier][type].windowMs;
      
      const problemDetails = Problems.rateLimited(
        `Rate limit exceeded. ${getMessage(tier, limit)}. Current tier: ${tier}. Upgrade for higher limits.`,
        req
      );
      
      // Add rate limiting specific properties
      problemDetails.rateLimit = {
        tier,
        limit,
        windowMs,
        retryAfter: Math.ceil(windowMs / 1000),
        upgradeUrl: 'https://yourservice.com/upgrade'
      };

      res.set('Content-Type', 'application/problem+json');
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      res.status(429).json(problemDetails);
    },
    // Use default keyGenerator to avoid IPv6 issues
    skip: (req: Request): boolean => {
      // Allow admin endpoints to skip rate limiting
      return req.path.startsWith('/api/v1/admin/');
    }
  });
}

// Specific rate limiters
export const generalRateLimiter = createRateLimiter(
  'requests',
  (tier, limit) => `Maximum ${limit} requests per 15 minutes for ${tier} tier`
);

export const uploadRateLimiter = createRateLimiter(
  'uploads',
  (tier, limit) => `Maximum ${limit} file uploads per hour for ${tier} tier`
);

export const conversionRateLimiter = createRateLimiter(
  'conversions',
  (tier, limit) => `Maximum ${limit} conversions per hour for ${tier} tier`
);

// Concurrent conversion limiter (in-memory store for simplicity)
const activeConcurrentJobs = new Map<string, number>();

export const concurrentConversionLimiter = (req: Request, res: Response, next: NextFunction) => {
  const tier = getUserTier(req);
  const maxConcurrent = rateLimitConfigs[tier].concurrent;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const key = `${tier}:${ip}`;
  
  const current = activeConcurrentJobs.get(key) || 0;
  
  if (current >= maxConcurrent) {
    const problemDetails = Problems.rateLimited(
      `Maximum ${maxConcurrent} concurrent conversions exceeded for ${tier} tier. Please wait for current conversions to complete.`,
      req
    );
    
    problemDetails.concurrencyLimit = {
      tier,
      limit: maxConcurrent,
      current,
      upgradeUrl: 'https://yourservice.com/upgrade'
    };

    res.set('Content-Type', 'application/problem+json');
    res.status(429).json(problemDetails);
    return;
  }

  // Increment counter
  activeConcurrentJobs.set(key, current + 1);
  
  // Decrement when request completes
  const originalEnd = res.end;
  res.end = function(...args: any[]): Response {
    const newCount = (activeConcurrentJobs.get(key) || 1) - 1;
    if (newCount <= 0) {
      activeConcurrentJobs.delete(key);
    } else {
      activeConcurrentJobs.set(key, newCount);
    }
    originalEnd.apply(this, args as any);
    return this;
  };

  next();
};

// Middleware to add rate limit information to responses
export const rateLimitInfoMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const tier = getUserTier(req);
  const config = rateLimitConfigs[tier];
  
  // Add tier information to response headers
  res.set('X-Rate-Limit-Tier', tier);
  res.set('X-Rate-Limit-Requests-Max', String(config.requests.max));
  res.set('X-Rate-Limit-Uploads-Max', String(config.uploads.max));
  res.set('X-Rate-Limit-Conversions-Max', String(config.conversions.max));
  res.set('X-Rate-Limit-Concurrent-Max', String(config.concurrent));
  
  next();
};