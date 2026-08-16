// Error-message helpers for supabase.functions.invoke() calls.
//
// Edge functions here normally return `{ error: string }`, but a zod
// .safeParse() failure returns `{ error: flatten().fieldErrors }` instead —
// an object like `{ username: ["Indique um username ou um email"] }`. Handing
// that object straight to toast.error() crashes React ("Objects are not
// valid as a React child"), so any body coming back from these functions has
// to be flattened to a string first.

export function errorBodyMessage(body: unknown): string | undefined {
  const err = (body as { error?: unknown } | null)?.error;
  if (!err) return undefined;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const first = Object.values(err as Record<string, unknown>)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0] as string;
  }
  return undefined;
}

/**
 * A non-2xx response from supabase-js's FunctionsHttpError always has the
 * generic message "Edge Function returned a non-2xx status code" — the
 * function's actual JSON error body only lives in error.context (the raw
 * Response), so it has to be parsed out explicitly to show the real reason.
 */
export async function extractFunctionErrorMessage(error: unknown): Promise<string | undefined> {
  // Duck-typed on purpose: `instanceof Response` can fail across realms
  // (e.g. a fetch intercepted by test tooling), even when `.context` is a
  // perfectly usable Response-shaped object.
  const res = (error as { context?: { clone?: () => { json: () => Promise<unknown> }; json?: () => Promise<unknown> } } | undefined)?.context;
  if (!res || typeof res.json !== 'function') return undefined;
  try {
    // clone() can throw *synchronously* (not just reject) when the body was
    // already consumed upstream — a plain .catch() on the chain won't see
    // that, so the whole read needs a real try/catch.
    const body = await (typeof res.clone === 'function' ? res.clone().json() : res.json());
    return errorBodyMessage(body);
  } catch {
    try {
      const body = await res.json!();
      return errorBodyMessage(body);
    } catch { return undefined; }
  }
}
