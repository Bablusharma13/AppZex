/**
 * Centralised operational error type. Every service/repository throws one of
 * these; the global error middleware turns it into a safe JSON response.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(statusCode: number, message: string, code = 'APP_ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, new.target);
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new AppError(400, message, 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(401, message, 'UNAUTHENTICATED');
  }
  static forbidden(message = 'Access denied') {
    return new AppError(403, message, 'FORBIDDEN');
  }
  static notFound(message = 'Resource not found') {
    return new AppError(404, message, 'NOT_FOUND');
  }
  static conflict(message = 'Resource already exists') {
    return new AppError(409, message, 'CONFLICT');
  }
  static unprocessable(message = 'Validation failed', details?: unknown) {
    return new AppError(422, message, 'VALIDATION_ERROR', details);
  }
  static tooManyRequests(message = 'Too many requests') {
    return new AppError(429, message, 'TOO_MANY_REQUESTS');
  }
  static internal(message = 'Internal server error') {
    return new AppError(500, message, 'INTERNAL_ERROR');
  }
  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new AppError(503, message, 'SERVICE_UNAVAILABLE');
  }
}