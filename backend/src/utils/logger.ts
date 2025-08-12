import { Request } from 'express';

export interface LogContext {
  requestId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  statusCode?: number;
  code?: string;
  [key: string]: any;
}

export class Logger {
  static info(message: string, context?: LogContext) {
    const logData = {
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...context
    };
    console.log(JSON.stringify(logData));
  }

  static error(message: string, error?: Error, context?: LogContext) {
    const logData = {
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      error: error ? {
        message: error.message,
        stack: error.stack
      } : undefined,
      ...context
    };
    console.error(JSON.stringify(logData));
  }

  static warn(message: string, context?: LogContext) {
    const logData = {
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      ...context
    };
    console.warn(JSON.stringify(logData));
  }

  static debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV === 'development') {
      const logData = {
        level: 'debug',
        message,
        timestamp: new Date().toISOString(),
        ...context
      };
      console.debug(JSON.stringify(logData));
    }
  }

  static fromRequest(req: Request): LogContext {
    return {
      requestId: req.requestId,
      userId: (req as any).userId,
    };
  }
}