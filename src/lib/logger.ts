type ErrorLike = Error | unknown;

/**
 * Emits structured, privacy-conscious client errors.
 * Raw messages, stack traces, tokens, and user data are intentionally omitted.
 * A remote sink can be added later without changing call sites.
 */
export function logError(event: string, error: ErrorLike): void {
  const errorName = error instanceof Error ? error.name : "UnknownError";

  console.error(
    JSON.stringify({
      level: "error",
      event,
      errorName,
      timestamp: new Date().toISOString(),
    }),
  );
}