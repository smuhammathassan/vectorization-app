import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../../src/middleware/errorHandler';

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
  });

  test('should handle standard Error', () => {
    const error = new Error('Test error message');
    
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Test error message',
      timestamp: expect.any(String),
    });
  });

  test('should handle errors with status codes', () => {
    const error: any = new Error('Bad request');
    error.status = 400;
    
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Bad request',
      timestamp: expect.any(String),
    });
  });

  test('should handle validation errors', () => {
    const error: any = new Error('Validation failed');
    error.name = 'ValidationError';
    error.details = [{ message: 'Field is required' }];
    
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'Validation failed',
      details: expect.any(Array),
      timestamp: expect.any(String),
    });
  });

  test('should handle unknown errors safely', () => {
    const error = 'String error';
    
    errorHandler(
      error as any,
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: 'An unexpected error occurred',
      timestamp: expect.any(String),
    });
  });

  test('should include timestamp in all responses', () => {
    const error = new Error('Test error');
    
    errorHandler(
      error,
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
    expect(responseCall.timestamp).toBeDefined();
    expect(typeof responseCall.timestamp).toBe('string');
    
    // Verify timestamp is a valid ISO string
    const timestamp = new Date(responseCall.timestamp);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).not.toBeNaN();
  });
});