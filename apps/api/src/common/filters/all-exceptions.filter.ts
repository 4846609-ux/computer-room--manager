import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { ApiErrorBody } from '@crm/shared';

/**
 * Uniform error envelope for all responses:
 * { error: { code, message, details?, traceId } }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL';
    let message = 'אירעה שגיאה בשרת';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        code = (r.code as string) ?? httpStatusToCode(status);
        message = (r.message as string) ?? message;
        details = r.details ?? r.errors;
      }
      if (code === 'INTERNAL') code = httpStatusToCode(status);
    }

    if (status >= 500) {
      this.logger.error(`[${traceId}] ${request.method} ${request.url}`, exception as Error);
    }

    const body: ApiErrorBody = { error: { code, message, details, traceId } };
    response.status(status).json(body);
  }
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_FAILED';
    case 401:
      return 'AUTH_INVALID_CREDENTIALS';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'IDEMPOTENCY_CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL';
  }
}
