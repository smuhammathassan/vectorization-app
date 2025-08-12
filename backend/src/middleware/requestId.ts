import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Check if X-Request-Id header is provided, otherwise generate one
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  
  // Set the request ID on the request object for use in handlers
  req.requestId = requestId;
  
  // Always include X-Request-Id in the response header
  res.setHeader('X-Request-Id', requestId);
  
  next();
};