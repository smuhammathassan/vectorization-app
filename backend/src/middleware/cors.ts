import { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Enhanced CORS configuration for enterprise API
export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Development and localhost URLs
    const developmentOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:8080'
    ];

    // Production origins from environment
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
      process.env.DOCS_URL,
      ...developmentOrigins,
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    }
  },

  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],

  // Allowed headers
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-Id',
    'X-API-Key',
    'Cache-Control',
    'Pragma',
    'If-Modified-Since',
    'If-None-Match'
  ],

  // Headers exposed to client
  exposedHeaders: [
    'X-Request-Id',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Location',
    'Content-Range',
    'ETag',
    'Last-Modified'
  ],

  // Allow credentials (cookies, authorization headers)
  credentials: true,

  // Preflight cache duration (24 hours)
  maxAge: 86400,

  // Handle preflight requests
  preflightContinue: false,
  optionsSuccessStatus: 200
};

// Custom CORS middleware that adds additional headers
export const enhancedCorsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Apply standard CORS
  cors(corsConfig)(req, res, (err) => {
    if (err) {
      return next(err);
    }

    // Add enterprise-standard CORS headers
    const origin = req.headers.origin || req.headers.referer;
    if (origin && corsConfig.origin) {
      // Validate origin explicitly
      corsConfig.origin(origin as string, (error, allowed) => {
        if (allowed) {
          res.header('Access-Control-Allow-Origin', origin);
        }
      });
    }

    // Ensure Vary header is set for caching proxies
    res.header('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');

    // Additional security headers for CORS
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');

    next();
  });
};

// Preflight handler for complex requests
export const preflightHandler = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') {
    // Add request ID to preflight responses
    if (req.requestId) {
      res.header('X-Request-Id', req.requestId);
    }

    // Respond to preflight
    res.status(200).end();
    return;
  }
  next();
};