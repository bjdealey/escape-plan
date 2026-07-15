import type { ZodType } from 'zod';

/**
 * Fetch JSON from an external service and validate it against a schema BEFORE
 * it is used anywhere. External data is untrusted: anything that does not match
 * the expected shape is rejected (the caller falls back to the mock). We never
 * eval, template into SQL, or otherwise execute values received here.
 */
export async function fetchJson<T>(
  url: string,
  schema: ZodType<T>,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    const json: unknown = await res.json();
    return schema.parse(json);
  } finally {
    clearTimeout(timeout);
  }
}
