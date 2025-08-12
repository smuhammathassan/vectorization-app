import { Request } from 'express';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  [key: string]: any;
}

export class ProblemDetailsBuilder {
  private problem: ProblemDetails;

  constructor(type: string, title: string, status: number) {
    this.problem = {
      type,
      title,
      status
    };
  }

  static create(type: string, title: string, status: number): ProblemDetailsBuilder {
    return new ProblemDetailsBuilder(type, title, status);
  }

  detail(detail: string): ProblemDetailsBuilder {
    this.problem.detail = detail;
    return this;
  }

  instance(instance: string): ProblemDetailsBuilder {
    this.problem.instance = instance;
    return this;
  }

  requestId(requestId: string): ProblemDetailsBuilder {
    this.problem.requestId = requestId;
    return this;
  }

  property(key: string, value: any): ProblemDetailsBuilder {
    this.problem[key] = value;
    return this;
  }

  build(): ProblemDetails {
    return this.problem;
  }
}

// Standard problem types
export const ProblemTypes = {
  VALIDATION_ERROR: 'https://api.yourservice.com/problems/validation-error',
  RESOURCE_NOT_FOUND: 'https://api.yourservice.com/problems/resource-not-found',
  UNAUTHORIZED: 'https://api.yourservice.com/problems/unauthorized',
  FORBIDDEN: 'https://api.yourservice.com/problems/forbidden',
  RATE_LIMITED: 'https://api.yourservice.com/problems/rate-limited',
  INTERNAL_ERROR: 'https://api.yourservice.com/problems/internal-error',
  FILE_TOO_LARGE: 'https://api.yourservice.com/problems/file-too-large',
  INVALID_FILE_FORMAT: 'https://api.yourservice.com/problems/invalid-file-format',
  CONVERSION_FAILED: 'https://api.yourservice.com/problems/conversion-failed',
  SERVICE_UNAVAILABLE: 'https://api.yourservice.com/problems/service-unavailable'
};

export function createProblemDetails(
  type: string,
  title: string,
  status: number,
  detail?: string,
  req?: Request
): ProblemDetails {
  const builder = ProblemDetailsBuilder.create(type, title, status);
  
  if (detail) {
    builder.detail(detail);
  }
  
  if (req) {
    builder.instance(req.originalUrl);
    if (req.requestId) {
      builder.requestId(req.requestId);
    }
  }
  
  return builder.build();
}

// Common problem detail creators
export const Problems = {
  validationError: (detail: string, req?: Request) =>
    createProblemDetails(
      ProblemTypes.VALIDATION_ERROR,
      'Validation Error',
      400,
      detail,
      req
    ),

  resourceNotFound: (resource: string, req?: Request) =>
    createProblemDetails(
      ProblemTypes.RESOURCE_NOT_FOUND,
      'Resource Not Found',
      404,
      `The requested ${resource} was not found`,
      req
    ),

  unauthorized: (detail?: string, req?: Request) =>
    createProblemDetails(
      ProblemTypes.UNAUTHORIZED,
      'Unauthorized',
      401,
      detail || 'Authentication required',
      req
    ),

  forbidden: (detail?: string, req?: Request) =>
    createProblemDetails(
      ProblemTypes.FORBIDDEN,
      'Forbidden',
      403,
      detail || 'Access denied',
      req
    ),

  rateLimited: (detail?: string, req?: Request) =>
    createProblemDetails(
      ProblemTypes.RATE_LIMITED,
      'Rate Limited',
      429,
      detail || 'Too many requests',
      req
    ),

  fileTooLarge: (maxSize?: number, req?: Request) =>
    createProblemDetails(
      ProblemTypes.FILE_TOO_LARGE,
      'File Too Large',
      413,
      maxSize ? `File size exceeds maximum allowed size of ${maxSize} bytes` : 'File size too large',
      req
    ),

  invalidFileFormat: (allowedFormats?: string[], req?: Request) =>
    createProblemDetails(
      ProblemTypes.INVALID_FILE_FORMAT,
      'Invalid File Format',
      400,
      allowedFormats 
        ? `Invalid file format. Allowed formats: ${allowedFormats.join(', ')}`
        : 'Invalid file format',
      req
    ),

  conversionFailed: (detail: string, req?: Request) =>
    createProblemDetails(
      ProblemTypes.CONVERSION_FAILED,
      'Conversion Failed',
      500,
      detail,
      req
    ),

  internalError: (detail?: string, req?: Request) =>
    createProblemDetails(
      ProblemTypes.INTERNAL_ERROR,
      'Internal Server Error',
      500,
      detail || 'An unexpected error occurred',
      req
    ),

  serviceUnavailable: (detail?: string, req?: Request) =>
    createProblemDetails(
      ProblemTypes.SERVICE_UNAVAILABLE,
      'Service Unavailable',
      503,
      detail || 'Service temporarily unavailable',
      req
    )
};