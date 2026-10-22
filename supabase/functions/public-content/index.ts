import { createSnapshotReader } from "../_shared/readPublicSnapshot.ts";
import { createPublicContentHandler } from "./handler.ts";
const read = createSnapshotReader(Deno.env.get("R2_PUBLIC_BASE_URL")!);
Deno.serve(createPublicContentHandler(read));
