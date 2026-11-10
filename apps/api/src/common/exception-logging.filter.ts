import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";

/**
 * Logs every 5xx with its stack before Nest builds the response. Non-HTTP errors are
 * logged by the base filter already; HttpExceptions with a 5xx status are not.
 */
@Catch()
export class ExceptionLoggingFilter extends BaseExceptionFilter {
  private readonly log = new Logger("HttpException");

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException && exception.getStatus() >= 500) {
      const req = host.switchToHttp().getRequest<{
        method?: string;
        path?: string;
        user?: { id?: string };
      }>();
      // Path only: query strings can carry tokens.
      this.log.error(
        `${exception.getStatus()} ${req?.method} ${req?.path} user=${req?.user?.id ?? "-"}: ${exception.message}`,
        exception.cause instanceof Error
          ? exception.cause.stack
          : exception.stack,
      );
    }
    super.catch(exception, host);
  }
}
