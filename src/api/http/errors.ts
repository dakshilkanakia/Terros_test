import type { ErrorRequestHandler } from "express";

import type { ApiErrorBody } from "../../shared/types";
import { DomainError } from "../domain/errors";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const statusByDomainCode: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
};

/** Errors raised by Express middleware carry an HTTP `status`; 4xx ones are the client's fault. */
function isClientError(error: unknown): error is { status: number; expose?: boolean; message: string } {
  const status = (error as { status?: unknown } | null)?.status;
  return error instanceof Error && typeof status === "number" && status >= 400 && status < 500;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = { error: { code: "internal_error", message: "Something went wrong" } };

  if (error instanceof HttpError) {
    status = error.status;
    body = { error: { code: error.code, message: error.message } };
  } else if (error instanceof DomainError) {
    status = statusByDomainCode[error.code] ?? 400;
    body = { error: { code: error.code, message: error.message } };
  } else if (isClientError(error)) {
    // Request-parsing failures from Express middleware, such as malformed JSON (400) or an oversized body (413).
    status = error.status;
    body = { error: { code: "invalid_request", message: error.expose ? error.message : "Invalid request" } };
  } else {
    console.error(error);
  }

  res.status(status).json(body);
};
