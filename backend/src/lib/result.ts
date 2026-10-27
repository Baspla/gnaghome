/**
 * Result pattern for the never-throw approach.
 *
 * Service functions return a `Result` instead of throwing, so route
 * handlers can map errors to HTTP responses via `status()` while Eden
 * Treaty keeps full type safety for both success and error responses.
 */

export type Result<TValue, TError = never> = [TError] extends [never]
    ? { ok: true; value: TValue }
    : { ok: true; value: TValue } | { ok: false; error: TError };

export function ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
    return { ok: false, error };
}

/**
 * Plain-object domain errors. Each carries a literal HTTP status so
 * handlers can pass it directly to `status()`.
 */
export interface BadRequestError {
    readonly status: 400;
    readonly code: 'BAD_REQUEST';
    readonly message: string;
}

export interface UnauthorizedError {
    readonly status: 401;
    readonly code: 'UNAUTHORIZED';
    readonly message: string;
}

export interface ForbiddenError {
    readonly status: 403;
    readonly code: 'FORBIDDEN';
    readonly message: string;
}

export interface NotFoundError {
    readonly status: 404;
    readonly code: 'NOT_FOUND';
    readonly message: string;
}

export interface ConflictError {
    readonly status: 409;
    readonly code: 'CONFLICT';
    readonly message: string;
}

export interface InternalError {
    readonly status: 500;
    readonly code: 'INTERNAL_ERROR';
    readonly message: string;
}

/**
 * Shared error response body sent to the client.
 */
export interface ApiErrorResponse {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}