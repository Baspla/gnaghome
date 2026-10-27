/**
 * Lightweight error helper for the frontend.
 *
 * Provides a type guard and a formatter for the backend's unified error
 * response shape:  { error: { code, message, details? } }
 */

export interface ApiErrorBody {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
}

/**
 * Check if a value is the standard API error response body.
 */
export function isApiErrorBody(val: unknown): val is ApiErrorBody {
    if (!val || typeof val !== "object") return false;
    const obj = val as Record<string, unknown>;
    const err = obj.error;
    if (!err || typeof err !== "object") return false;
    const e = err as Record<string, unknown>;
    return typeof e.code === "string" && typeof e.message === "string";
}

/**
 * Extract a human-readable message from an unknown error value.
 * Handles the backend's ApiErrorResponse, standard Error, and plain strings.
 */
export function getErrorMessage(err: unknown): string {
    if (isApiErrorBody(err)) {
        return `${err.error.code}: ${err.error.message}`;
    }
    if (err instanceof Error) {
        return err.message;
    }
    if (typeof err === "string") {
        return err;
    }
    return "An unexpected error occurred";
}