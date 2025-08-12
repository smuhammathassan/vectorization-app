import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Problems } from '../utils/problemDetails';

// API Key structure
export interface ApiKey {
  id: string;
  key: string;
  name: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  userId: string;
  permissions: string[];
  rateLimit: {
    requests: number;
    uploads: number;
    conversions: number;
  };
  isActive: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

// JWT payload structure
export interface JWTPayload {
  userId: string;
  email: string;
  tier: string;
  permissions: string[];
  iat: number;
  exp: number;
}

// In-memory API key store (use database in production)
const apiKeyStore = new Map<string, ApiKey>();

// Initialize demo API keys
function initializeDemoApiKeys() {
  const demoKeys: ApiKey[] = [
    {
      id: 'key_demo_enterprise',
      key: 'ent_demo_12345678901234567890',
      name: 'Demo Enterprise Key',
      tier: 'enterprise',
      userId: 'user_demo_1',
      permissions: ['files:read', 'files:write', 'convert:all', 'admin:read'],
      rateLimit: { requests: 5000, uploads: 1000, conversions: 500 },
      isActive: true,
      createdAt: new Date(),
    },
    {
      id: 'key_demo_pro',
      key: 'pro_demo_12345678901234567890',
      name: 'Demo Pro Key',
      tier: 'pro',
      userId: 'user_demo_2',
      permissions: ['files:read', 'files:write', 'convert:standard'],
      rateLimit: { requests: 1000, uploads: 200, conversions: 100 },
      isActive: true,
      createdAt: new Date(),
    }
  ];

  demoKeys.forEach(key => apiKeyStore.set(key.key, key));
}

initializeDemoApiKeys();

// Validate API key format
export function validateApiKeyFormat(key: string): boolean {
  const patterns = [
    /^ent_[a-zA-Z0-9]{20,}$/, // Enterprise
    /^pro_[a-zA-Z0-9]{20,}$/, // Pro
    /^basic_[a-zA-Z0-9]{20,}$/, // Basic
    /^free_[a-zA-Z0-9]{20,}$/, // Free
  ];
  
  return patterns.some(pattern => pattern.test(key));
}

// API Key authentication middleware
export function apiKeyAuthMiddleware(required: boolean = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      if (required) {
        const problemDetails = Problems.unauthorized(
          'API key required. Include X-API-Key header.',
          req
        );
        res.set('Content-Type', 'application/problem+json');
        res.status(401).json(problemDetails);
        return;
      }
      return next(); // Optional auth, continue without authentication
    }

    if (!validateApiKeyFormat(apiKey)) {
      const problemDetails = Problems.unauthorized(
        'Invalid API key format',
        req
      );
      res.set('Content-Type', 'application/problem+json');
      res.status(401).json(problemDetails);
      return;
    }

    const keyData = apiKeyStore.get(apiKey);
    if (!keyData || !keyData.isActive) {
      const problemDetails = Problems.unauthorized(
        'Invalid or inactive API key',
        req
      );
      res.set('Content-Type', 'application/problem+json');
      res.status(401).json(problemDetails);
      return;
    }

    // Check expiration
    if (keyData.expiresAt && keyData.expiresAt < new Date()) {
      const problemDetails = Problems.unauthorized(
        'API key has expired',
        req
      );
      res.set('Content-Type', 'application/problem+json');
      res.status(401).json(problemDetails);
      return;
    }

    // Update last used
    keyData.lastUsedAt = new Date();

    // Attach auth info to request
    (req as any).auth = {
      type: 'api_key',
      apiKey: keyData,
      userId: keyData.userId,
      tier: keyData.tier,
      permissions: keyData.permissions
    };

    next();
  };
}

// JWT authentication middleware
export function jwtAuthMiddleware(required: boolean = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (required) {
        const problemDetails = Problems.unauthorized(
          'Bearer token required. Include Authorization: Bearer <token> header.',
          req
        );
        res.set('Content-Type', 'application/problem+json');
        res.status(401).json(problemDetails);
        return;
      }
      return next(); // Optional auth, continue without authentication
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const secret = process.env.JWT_SECRET || 'demo-secret-key';
      const payload = jwt.verify(token, secret) as JWTPayload;
      
      // Attach auth info to request
      (req as any).auth = {
        type: 'jwt',
        userId: payload.userId,
        email: payload.email,
        tier: payload.tier,
        permissions: payload.permissions,
        jwt: payload
      };

      next();
    } catch (error) {
      const problemDetails = Problems.unauthorized(
        'Invalid or expired token',
        req
      );
      res.set('Content-Type', 'application/problem+json');
      res.status(401).json(problemDetails);
    }
  };
}

// Combined authentication middleware (API key or JWT)
export function authMiddleware(required: boolean = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const hasApiKey = req.headers['x-api-key'];
    const hasJWT = req.headers.authorization?.startsWith('Bearer ');
    
    if (hasApiKey) {
      return apiKeyAuthMiddleware(required)(req, res, next);
    } else if (hasJWT) {
      return jwtAuthMiddleware(required)(req, res, next);
    } else if (required) {
      const problemDetails = Problems.unauthorized(
        'Authentication required. Provide either X-API-Key header or Authorization: Bearer token.',
        req
      );
      res.set('Content-Type', 'application/problem+json');
      res.status(401).json(problemDetails);
      return;
    } else {
      next(); // No auth provided but not required
    }
  };
}

// Permission check middleware
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth;
    
    if (!auth) {
      const problemDetails = Problems.unauthorized(
        'Authentication required',
        req
      );
      res.set('Content-Type', 'application/problem+json');
      res.status(401).json(problemDetails);
      return;
    }

    if (!auth.permissions || !auth.permissions.includes(permission)) {
      const problemDetails = Problems.forbidden(
        `Insufficient permissions. Required: ${permission}`,
        req
      );
      res.set('Content-Type', 'application/problem+json');
      res.status(403).json(problemDetails);
      return;
    }

    next();
  };
}

// Scope-based permission check
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth;
    
    if (!auth) {
      const problemDetails = Problems.unauthorized(
        'Authentication required',
        req
      );
      res.set('Content-Type', 'application/problem+json');
      res.status(401).json(problemDetails);
      return;
    }

    // Check if user has the required scope
    const [resource, action] = scope.split(':');
    const hasScope = auth.permissions?.some((perm: string) => {
      const [permResource, permAction] = perm.split(':');
      return (permResource === resource && (permAction === action || permAction === 'all')) ||
             (permResource === 'admin' && permAction === 'all');
    });

    if (!hasScope) {
      const problemDetails = Problems.forbidden(
        `Insufficient scope. Required: ${scope}`,
        req
      );
      res.set('Content-Type', 'application/problem+json');
      res.status(403).json(problemDetails);
      return;
    }

    next();
  };
}

// Rate limiting based on user tier
export function tierBasedRateLimit() {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth;
    
    if (auth?.tier) {
      // Set tier-specific rate limits
      res.set('X-User-Tier', auth.tier);
      if (auth.apiKey?.rateLimit) {
        res.set('X-Rate-Limit-Tier-Requests', auth.apiKey.rateLimit.requests.toString());
        res.set('X-Rate-Limit-Tier-Uploads', auth.apiKey.rateLimit.uploads.toString());
        res.set('X-Rate-Limit-Tier-Conversions', auth.apiKey.rateLimit.conversions.toString());
      }
    }
    
    next();
  };
}

// Declare module augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      auth?: {
        type: 'api_key' | 'jwt';
        userId: string;
        tier: string;
        permissions: string[];
        email?: string;
        apiKey?: ApiKey;
        jwt?: JWTPayload;
      };
    }
  }
}