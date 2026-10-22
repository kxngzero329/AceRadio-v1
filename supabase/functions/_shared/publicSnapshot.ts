export const POINTER_KEY = "public-content/v1/current.json";
export const MAX_SNAPSHOT_BYTES = 1048576;
export type Snapshot = {
  version: 1;
  app: Record<string, unknown>;
  events: Record<string, unknown>[];
  website: Record<string, unknown>;
};
export type Pointer = {
  version: 1;
  sha256: string;
  path: string;
  revision: number;
  checked_at: string;
  next_transition: string | null;
};

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid public content");
  return value as Record<string, unknown>;
};
const pick = (value: unknown, fields: string[]) => {
  const row = record(value);
  return Object.fromEntries(
    fields
      .filter((key) => Object.hasOwn(row, key))
      .map((key) => [key, row[key]]),
  );
};
const rows = (value: unknown, fields: string[]) => {
  if (!Array.isArray(value) || value.length > 10000)
    throw Error("Invalid public rows");
  return value.map((row) => pick(row, fields));
};
const eventFields =
  "id title description starts_at ends_at location image_url booking_url status created_at updated_at".split(
    " ",
  );
const stationFields: Record<string, string[]> = {
  shows:
    "id title subtitle description artwork_id poster_id accent display_order status".split(
      " ",
    ),
  presenters: "id name bio photo_id status".split(" "),
  show_presenters: "show_id presenter_id position".split(" "),
  show_schedules:
    "id show_id day_of_week starts_at ends_at timezone valid_from valid_until".split(
      " ",
    ),
  media_assets: "id bucket_id object_path width height public_url status".split(
    " ",
  ),
  banners:
    "id show_id title subtitle image_id placement link_url priority display_order starts_at ends_at status".split(
      " ",
    ),
  announcements:
    "id title body link_url priority starts_at ends_at created_at updated_at status image_url".split(
      " ",
    ),
};
function station(value: unknown) {
  const input = record(value);
  return {
    version: 3,
    ...Object.fromEntries(
      Object.entries(stationFields).map(([key, fields]) => [
        key,
        rows(input[key], fields),
      ]),
    ),
  };
}

/** Only explicitly public fields may reach a public bucket. Extra source keys,
 * including account/booking payloads, never cross this boundary. */
export function compileSnapshot(value: unknown): Snapshot {
  const input = record(value),
    web = record(input["website"]);
  return {
    version: 1,
    app: station(input["app"]),
    events: rows(input["events"], eventFields),
    website: {
      station: station(web["station"]),
      events: rows(web["events"], eventFields),
      tickets: rows(
        web["tickets"],
        "id event_id name description price_cents currency capacity guests_per_unit display_order status created_at updated_at".split(
          " ",
        ),
      ),
    },
  };
}
export function parsePointer(value: unknown): Pointer {
  const p = record(value);
  if (
    p["version"] !== 1 ||
    typeof p["sha256"] !== "string" ||
    !/^[a-f0-9]{64}$/.test(p["sha256"]) ||
    p["path"] !== `public-content/v1/${p["sha256"]}.json` ||
    !Number.isSafeInteger(p["revision"]) ||
    Number(p["revision"]) < 1 ||
    typeof p["checked_at"] !== "string" ||
    !Number.isFinite(Date.parse(p["checked_at"])) ||
    (p["next_transition"] !== null &&
      (typeof p["next_transition"] !== "string" ||
        !Number.isFinite(Date.parse(p["next_transition"]))))
  ) {
    throw Error("Invalid public snapshot pointer");
  }
  return p as Pointer;
}
export async function readBounded(response: Response): Promise<Uint8Array> {
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length")) > MAX_SNAPSHOT_BYTES
  )
    throw Error("Public content unavailable");
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SNAPSHOT_BYTES) throw Error("Public content too large");
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
