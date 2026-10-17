/** Use AbortController on every platform, including native runtimes without AbortSignal.any. */
export function boundedFetch(
  fetcher: typeof fetch,
  timeoutMs = 15_000,
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const source =
      init?.signal ??
      (typeof Request !== "undefined" && input instanceof Request
        ? input.signal
        : undefined);
    const abort = () => controller.abort();
    if (source?.aborted) abort();
    else source?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetcher(input, {
        ...init,
        signal: controller.signal,
      });
      // Auth/account responses are small JSON payloads. Keep the deadline alive
      // through body consumption, rather than stopping it at the response headers.
      const body = await response.arrayBuffer();
      return new Response(
        [204, 205, 304].includes(response.status) ? null : body,
        {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        },
      );
    } finally {
      clearTimeout(timer);
      source?.removeEventListener("abort", abort);
    }
  };
}
