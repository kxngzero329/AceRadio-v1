import { createListenerStatsHandler } from "./handler.ts";

Deno.serve(createListenerStatsHandler());
