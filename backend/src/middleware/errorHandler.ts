import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', error);

  // Default error response
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal server error';
  let code = error.code || 'INTERNAL_ERROR';

  // Handle specific error types
  if (error.message?.includes('LIMIT_FILE_SIZE')) {
    statusCode = 400;
    message = 'File too large';
    code = 'FILE_TOO_LARGE';
  } else if (error.message?.includes('LIMIT_UNEXPECTED_FILE')) {
    statusCode = 400;
    message = 'Invalid file format';
    code = 'INVALID_FORMAT';
  } else if (error.message?.includes('ENOENT')) {
    statusCode = 404;
    message = 'File not found';
    code = 'FILE_NOT_FOUND';
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    code,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
}

export function createError(
  message: string,
  statusCode: number = 500,
  code?: string
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}