type Store = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
type Manifest = { generation: string; count: number };
function manifest(raw: string | null): Manifest | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as Manifest;
  if (
    !/^[a-zA-Z0-9-]{1,80}$/.test(value.generation) ||
    !Number.isInteger(value.count) ||
    value.count < 1 ||
    value.count > 256
  )
    throw Error("Invalid secure session storage.");
  return value;
}
/** Every token chunk is encrypted by the backing store; publish the pointer last. */
export function createChunkedStorage(store: Store, uuid: () => string): Store {
  const tails = new Map<string, Promise<unknown>>();
  const part = (key: string, data: Manifest, index: number) =>
    `${key}.${data.generation}.${index}`;
  const serial = <T>(key: string, action: () => Promise<T>): Promise<T> => {
    const next = (tails.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(action);
    tails.set(key, next);
    return next.finally(() => {
      if (tails.get(key) === next) tails.delete(key);
    });
  };
  const clean = async (key: string, data: Manifest | null) => {
    if (data)
      await Promise.all(
        Array.from({ length: data.count }, (_, index) =>
          store.removeItem(part(key, data, index)),
        ),
      );
  };
  return {
    getItem: (key) =>
      serial(key, async () => {
        const data = manifest(await store.getItem(key));
        if (!data) return null;
        const chunks = await Promise.all(
          Array.from({ length: data.count }, (_, index) =>
            store.getItem(part(key, data, index)),
          ),
        );
        if (chunks.some((chunk) => chunk === null))
          throw Error("Secure session is incomplete.");
        return chunks.join("");
      }),
    setItem: (key, value) =>
      serial(key, async () => {
        const chars = Array.from(value),
          chunks: string[] = [];
        for (let index = 0; index < chars.length; index += 400)
          chunks.push(chars.slice(index, index + 400).join(""));
        if (!chunks.length) chunks.push("");
        if (chunks.length > 256)
          throw Error("Session is too large to store securely.");
        const old = manifest(await store.getItem(key));
        const data = { generation: uuid(), count: chunks.length };
        try {
          await Promise.all(
            chunks.map((chunk, index) =>
              store.setItem(part(key, data, index), chunk),
            ),
          );
          await store.setItem(key, JSON.stringify(data));
        } catch (error) {
          await clean(key, data).catch(() => {});
          throw error;
        }
        await clean(key, old).catch(() => {});
      }),
    removeItem: (key) =>
      serial(key, async () => {
        const old = manifest(await store.getItem(key));
        await store.removeItem(key);
        await clean(key, old);
      }),
  };
}
