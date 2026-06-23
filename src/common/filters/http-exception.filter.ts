import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = "Internal server error";
    let error = "Internal Server Error";

    if (exception instanceof HttpException) {
      const res = exception.getResponse();

      if (typeof res === "string") {
        message = res;
        error = res;
      } else if (typeof res === "object" && res !== null) {
        const body = res as Record<string, unknown>;
        message = Array.isArray(body.message)
          ? (body.message as string[]).join(", ")
          : (body.message as string) ?? exception.message;
        error = (body.error as string) ?? exception.name;
      }
    }

    response.status(status).json({ statusCode: status, message, error });
  }
}
