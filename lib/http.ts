// Small helpers so every API route returns errors in the same JSON shape: { error, message }.

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.code, message: err.message }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: "internal_error", message: "Something went wrong. Please try again." }, { status: 500 });
}

// Only allow redirects to paths on our own site ("/report"), never to "//evil.com" or "https://...".
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
