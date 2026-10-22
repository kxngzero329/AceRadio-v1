/** Keep a verified, immutable Supabase counterpart for installed older builds.
 * Modern readers use R2; no end-user download passes through this helper. */
export async function preserveLegacyImage(
  deps: {
    upload(): Promise<unknown>;
    read(): Promise<Response>;
    hash(bytes: Uint8Array): Promise<string>;
  },
  expectedHash: string,
) {
  // A timeout/duplicate may follow a committed upload. Verify the actual public
  // bytes instead of overwriting or deleting a file on an uncertain response.
  try {
    await deps.upload();
  } catch {
    /* Read-back below is authoritative. */
  }
  const response = await deps.read();
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length")) > 10485760
  )
    throw Error("Legacy artwork verification failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 10485760) throw Error("Legacy artwork too large");
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if ((await deps.hash(bytes)) !== expectedHash)
    throw Error("Existing legacy artwork differs; it was not overwritten");
}
