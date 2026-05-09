/**
 * Read a fetch Response body as a stream of newline-delimited JSON objects.
 *
 *     for await (const obj of readNdjson<MyEvent>(res.body)) { ... }
 */
export async function* readNdjson<T = unknown>(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<T, void, void> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.length > 0) {
          try {
            yield JSON.parse(line) as T;
          } catch {
            // Skip malformed line — keep stream alive
          }
        }
        nl = buffer.indexOf("\n");
      }
    }
    const tail = buffer.trim();
    if (tail.length > 0) {
      try {
        yield JSON.parse(tail) as T;
      } catch {
        /* swallow */
      }
    }
  } finally {
    reader.releaseLock();
  }
}
