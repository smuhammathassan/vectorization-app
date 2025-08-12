import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger';
import { Problems, ProblemDetails } from '../utils/problemDetails';

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
  // Default error response
  let statusCode = error.statusCode || 500;
  let problemDetails: ProblemDetails;
  
  Logger.error('Request error occurred', error, {
    ...Logger.fromRequest(req),
    statusCode,
    code: error.code
  });

  // Map errors to RFC 7807 Problem Details
  if (error.message?.includes('LIMIT_FILE_SIZE')) {
    problemDetails = Problems.fileTooLarge(undefined, req);
  } else if (error.message?.includes('LIMIT_UNEXPECTED_FILE')) {
    problemDetails = Problems.invalidFileFormat(undefined, req);
  } else if (error.message?.includes('ENOENT')) {
    problemDetails = Problems.resourceNotFound('file', req);
  } else if (error.code === 'VALIDATION_ERROR' || error.code === 'INVALID_PARAMETERS') {
    problemDetails = Problems.validationError(error.message, req);
  } else if (error.code === 'MISSING_PARAMS') {
    problemDetails = Problems.validationError(error.message, req);
  } else if (error.code === 'FILE_NOT_FOUND') {
    problemDetails = Problems.resourceNotFound('file', req);
  } else if (error.code === 'JOB_NOT_FOUND') {
    problemDetails = Problems.resourceNotFound('job', req);
  } else if (error.code === 'METHOD_NOT_FOUND') {
    problemDetails = Problems.resourceNotFound('method', req);
  } else if (error.code === 'CONVERSION_ERROR') {
    problemDetails = Problems.conversionFailed(error.message, req);
  } else if (statusCode >= 500) {
    problemDetails = Problems.internalError(error.message, req);
  } else {
    // Generic problem details for other errors
    problemDetails = {
      type: 'https://api.yourservice.com/problems/generic-error',
      title: 'Request Error',
      status: statusCode,
      detail: error.message,
      instance: req.originalUrl,
      requestId: req.requestId
    };
  }

  // Add debug information in development
  if (process.env.NODE_ENV === 'development') {
    problemDetails.stack = error.stack;
    problemDetails.code = error.code;
  }

  // Set proper content type for RFC 7807
  res.set('Content-Type', 'application/problem+json');
  res.status(problemDetails.status).json(problemDetails);
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