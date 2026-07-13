import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { QueryFailedError } from "typeorm";

interface PostgresDriverError {
  code?: string;
  detail?: string;
}

const UNIQUE_VIOLATION = "23505";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof QueryFailedError) {
      const driverError = exception.driverError as PostgresDriverError;

      if (driverError?.code === UNIQUE_VIOLATION) {
        const match = /Key \(([^)]+)\)=\(([^)]+)\)/.exec(driverError.detail ?? "");
        const field = match?.[1].replace(/"/g, "");
        const message = match
          ? `${field} "${match[2]}" is already in use`
          : "Duplicate value violates a unique constraint";

        return response
          .status(HttpStatus.CONFLICT)
          .json({ statusCode: HttpStatus.CONFLICT, message, error: "Conflict" });
      }
    }

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

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
          : ((body.message as string) ?? exception.message);
        error = (body.error as string) ?? exception.name;
      }
    }

    response.status(status).json({ statusCode: status, message, error });
  }
}
