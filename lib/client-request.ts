export async function requestJson<T>(url: string, init: RequestInit = {}, timeoutMs = 40_000): Promise<{ response: Response; payload: T }> {
  const controller = new AbortController();
  const cancelled = new Error("请求已取消");
  cancelled.name = "AbortError";
  if (init.signal?.aborted) throw cancelled;

  const abort = () => controller.abort(cancelled);
  const expired = new Error("请求超时，请检查网络后重试。");
  expired.name = "TimeoutError";
  let rejectInterrupted: (reason: unknown) => void = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
  const onAbort = () => rejectInterrupted(controller.signal.reason ?? cancelled);
  controller.signal.addEventListener("abort", onAbort, { once: true });
  init.signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(expired), timeoutMs);

  try {
    // Keep the deadline through body parsing, including a stalled response stream.
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const payload = await response.json() as T;
        return { response, payload };
      })(),
      interrupted
    ]);
  } finally {
    window.clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
