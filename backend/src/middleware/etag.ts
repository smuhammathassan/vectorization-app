import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Problems } from '../utils/problemDetails';

// ETag generation strategies
export enum ETagStrategy {
  CONTENT_HASH = 'content-hash',
  WEAK_TIMESTAMP = 'weak-timestamp',
  STRONG_VERSION = 'strong-version'
}

// Generate ETag based on content
export function generateContentETag(content: string | Buffer): string {
  const hash = crypto.createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 16); // Use first 16 chars for brevity
  return `"${hash}"`;
}

// Generate weak ETag based on timestamp and size
export function generateWeakETag(lastModified: Date, size?: number): string {
  const timestamp = lastModified.getTime().toString(36);
  const sizeStr = size ? size.toString(36) : '';
  const combined = `${timestamp}-${sizeStr}`;
  const hash = crypto.createHash('sha256')
    .update(combined)
    .digest('hex')
    .substring(0, 12);
  return `W/"${hash}"`;
}

// Generate strong ETag based on version or content version
export function generateStrongETag(identifier: string, version?: string | number): string {
  const combined = version ? `${identifier}-${version}` : identifier;
  const hash = crypto.createHash('sha256')
    .update(combined)
    .digest('hex')
    .substring(0, 16);
  return `"${hash}"`;
}

// Parse If-None-Match header
export function parseIfNoneMatch(header: string | undefined): string[] {
  if (!header) return [];
  
  // Handle "*" (any ETag)
  if (header.trim() === '*') return ['*'];
  
  // Parse comma-separated ETags
  return header
    .split(',')
    .map(etag => etag.trim())
    .filter(etag => etag.length > 0);
}

// Parse If-Match header
export function parseIfMatch(header: string | undefined): string[] {
  if (!header) return [];
  
  // Handle "*" (any ETag)
  if (header.trim() === '*') return ['*'];
  
  // Parse comma-separated ETags
  return header
    .split(',')
    .map(etag => etag.trim())
    .filter(etag => etag.length > 0);
}

// Check if ETag matches (considering weak/strong comparison)
export function etagMatches(etag1: string, etag2: string, weakComparison: boolean = true): boolean {
  if (!etag1 || !etag2) return false;
  
  // Exact match
  if (etag1 === etag2) return true;
  
  // For weak comparison, compare the actual values ignoring W/ prefix
  if (weakComparison) {
    const value1 = etag1.replace(/^W\//, '');
    const value2 = etag2.replace(/^W\//, '');
    return value1 === value2;
  }
  
  return false;
}

// Middleware for automatic ETag generation
export function etagMiddleware(strategy: ETagStrategy = ETagStrategy.CONTENT_HASH) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original json and send methods
    const originalJson = res.json;
    const originalSend = res.send;
    
    // Override json method to generate ETag
    res.json = function(obj: any) {
      const content = JSON.stringify(obj);
      
      let etag: string;
      switch (strategy) {
        case ETagStrategy.CONTENT_HASH:
          etag = generateContentETag(content);
          break;
        case ETagStrategy.WEAK_TIMESTAMP:
          etag = generateWeakETag(new Date(), content.length);
          break;
        case ETagStrategy.STRONG_VERSION:
          // Use request ID as version identifier
          etag = generateStrongETag('response', req.requestId);
          break;
      }
      
      this.set('ETag', etag);
      return originalJson.call(this, obj);
    };
    
    // Override send method for non-JSON responses
    res.send = function(body: any) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        let etag: string;
        switch (strategy) {
          case ETagStrategy.CONTENT_HASH:
            etag = generateContentETag(body);
            break;
          case ETagStrategy.WEAK_TIMESTAMP:
            etag = generateWeakETag(new Date(), body.length);
            break;
          case ETagStrategy.STRONG_VERSION:
            etag = generateStrongETag('response', req.requestId);
            break;
        }
        this.set('ETag', etag);
      }
      return originalSend.call(this, body);
    };
    
    next();
  };
}

// Middleware for conditional request handling
export function conditionalRequestMiddleware(req: Request, res: Response, next: NextFunction) {
  const ifNoneMatch = req.headers['if-none-match'] as string;
  const ifMatch = req.headers['if-match'] as string;
  const ifModifiedSince = req.headers['if-modified-since'] as string;
  const ifUnmodifiedSince = req.headers['if-unmodified-since'] as string;
  
  // Store methods for conditional response
  (req as any).conditional = {
    checkETag: (etag: string) => {
      res.set('ETag', etag);
      
      // Handle If-None-Match (for GET/HEAD requests)
      if (ifNoneMatch && ['GET', 'HEAD'].includes(req.method)) {
        const clientETags = parseIfNoneMatch(ifNoneMatch);
        
        // If client has "*" or matching ETag, return 304
        if (clientETags.includes('*') || clientETags.some(clientETag => etagMatches(etag, clientETag))) {
          res.status(304).end();
          return true; // Request handled
        }
      }
      
      // Handle If-None-Match (for PUT/PATCH requests - prevent overwrites)
      if (ifNoneMatch && ['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const clientETags = parseIfNoneMatch(ifNoneMatch);
        
        // If client has "*" or matching ETag, return 412 (precondition failed)
        if (clientETags.includes('*') || clientETags.some(clientETag => etagMatches(etag, clientETag))) {
          const problemDetails = Problems.validationError(
            'Precondition failed: Resource has been modified',
            req
          );
          res.set('Content-Type', 'application/problem+json');
          res.status(412).json(problemDetails);
          return true; // Request handled
        }
      }
      
      // Handle If-Match (for PUT/PATCH/DELETE requests)
      if (ifMatch && ['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const clientETags = parseIfMatch(ifMatch);
        
        // If client doesn't have "*" and no matching ETag, return 412
        if (!clientETags.includes('*') && !clientETags.some(clientETag => etagMatches(etag, clientETag))) {
          const problemDetails = Problems.validationError(
            'Precondition failed: Resource ETag does not match',
            req
          );
          res.set('Content-Type', 'application/problem+json');
          res.status(412).json(problemDetails);
          return true; // Request handled
        }
      }
      
      return false; // Continue processing
    },
    
    checkLastModified: (lastModified: Date) => {
      res.set('Last-Modified', lastModified.toUTCString());
      
      // Handle If-Modified-Since (for GET/HEAD requests)
      if (ifModifiedSince && ['GET', 'HEAD'].includes(req.method)) {
        const clientDate = new Date(ifModifiedSince);
        if (!isNaN(clientDate.getTime()) && lastModified <= clientDate) {
          res.status(304).end();
          return true; // Request handled
        }
      }
      
      // Handle If-Unmodified-Since (for PUT/PATCH/DELETE requests)
      if (ifUnmodifiedSince && ['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const clientDate = new Date(ifUnmodifiedSince);
        if (!isNaN(clientDate.getTime()) && lastModified > clientDate) {
          const problemDetails = Problems.validationError(
            'Precondition failed: Resource has been modified since specified date',
            req
          );
          res.set('Content-Type', 'application/problem+json');
          res.status(412).json(problemDetails);
          return true; // Request handled
        }
      }
      
      return false; // Continue processing
    }
  };
  
  next();
}

// Resource-specific ETag middleware
export function resourceETagMiddleware(getResourceInfo: (req: Request) => Promise<{ etag?: string; lastModified?: Date } | null>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resourceInfo = await getResourceInfo(req);
      
      if (resourceInfo) {
        const conditional = (req as any).conditional;
        
        // Check ETag if available
        if (resourceInfo.etag && conditional?.checkETag) {
          const handled = conditional.checkETag(resourceInfo.etag);
          if (handled) return;
        }
        
        // Check Last-Modified if available
        if (resourceInfo.lastModified && conditional?.checkLastModified) {
          const handled = conditional.checkLastModified(resourceInfo.lastModified);
          if (handled) return;
        }
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Declare module augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      conditional?: {
        checkETag: (etag: string) => boolean;
        checkLastModified: (lastModified: Date) => boolean;
      };
    }
  }
}