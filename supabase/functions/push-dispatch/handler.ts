type Result = { data: unknown; error: unknown };
type Job = { id: string; lease: string; token: string; showId: string; title: string; time: string; startsAt: string; endsAt: string; expiresAt: string };
type ReceiptJob = { id: string; ticket: string };
type Dependencies = {
  rpc(name: string, args?: Record<string, unknown>): Promise<Result>;
  fetch: typeof fetch;
  workerSecret: string;
  accessToken: string;
  enabled: boolean;
  environment: "preview" | "production";
  allowed: string[] | null;
  now?: () => number;
  pause?: (milliseconds: number) => Promise<void>;
};
function equals(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}
async function bounded<T>(items: T[], action: (item: T, index: number) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += 10) {
    await Promise.all(items.slice(i, i + 10).map((item, index) => action(item, i + index)));
  }
}
export function createPushDispatchHandler(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const pause = deps.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  return async (request: Request) => {
    const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
    if (!equals(request.headers.get("authorization") ?? "", `Bearer ${deps.workerSecret}`) || deps.workerSecret.length < 32) return reply(401, { error: "Unauthorized" });
    if (!deps.enabled || !deps.accessToken) return reply(200, { enabled: false, sent: 0 });
    // An empty internal allowlist is deliberate: nobody receives test messages.
    const started = now();
    const rpc = async (name: string, args?: Record<string, unknown>) => {
      const result = await deps.rpc(name, args);
      if (result.error) throw Error("Push persistence failed");
      return result.data;
    };
    const post = (path: string, body: unknown) => deps.fetch(`https://exp.host/--/api/v2/push/${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${deps.accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    let accepted = 0, uncertain = 0;
    const run = crypto.randomUUID();
    let locked = false;
    try {
      locked = await rpc("push_worker_lock", { p_environment: deps.environment, p_lease: run }) === true;
      if (!locked) return reply(200, { busy: true, accepted: 0 });
      const receipts = await rpc("push_pending_receipts") as ReceiptJob[];
      if (receipts.length) {
        // Receipt failures do not block new reminders; all remain durable for retry.
        try {
          const response = await post("getReceipts", { ids: receipts.map(item => item.ticket) });
          if (response.ok) {
            const body = await response.json();
            await bounded(receipts, async job => {
              const receipt = body.data?.[job.ticket];
              await rpc("push_finish_receipt", { p_id: job.id, p_result: receipt?.status === "ok" ? "ok" : receipt?.status === "error" ? "error" : "pending", p_error: receipt?.details?.error ?? null });
            });
          }
        } catch { /* Next cron run checks again. Never log payloads/tokens. */ }
      }
      for (let batch = 0; batch < 25 && now() - started < 40_000; batch++) {
        if (batch) await pause(250); // At most 400 messages/sec across a single leased worker.
        const jobs = await rpc("push_claim_jobs", { p_environment: deps.environment, p_allowed: deps.allowed }) as Job[];
        if (!jobs.length) break;
        const finish = (job: Job, state: string, error: string | null = null, ticket: string | null = null) => rpc("push_finish_job", { p_id: job.id, p_lease: job.lease, p_state: state, p_ticket: ticket, p_error: error });
        let response;
        try {
          response = await post("send", jobs.map(job => ({
            to: job.token, title: job.title,
            body: `${job.time} SAST · Tap to open the show and listen live.`,
            data: { version: 1, kind: "show-reminder", showId: job.showId, startsAt: job.startsAt, endsAt: job.endsAt },
            expiration: Math.floor(Date.parse(job.expiresAt) / 1000),
            sound: "default", priority: "high", channelId: "ace-radio-updates",
            collapseId: job.id, tag: job.id,
          })));
        } catch {
          // The provider may have accepted the request before the connection failed.
          // Retrying an ambiguous send can duplicate a listener's notification.
          await bounded(jobs, job => finish(job, "uncertain", "send_timeout"));
          uncertain += jobs.length;
          continue;
        }
        if (!response.ok) {
          const retry = response.status === 429 || response.status >= 500;
          await bounded(jobs, job => finish(job, retry ? "retry" : "failed", `http_${response.status}`));
          if (retry) break;
          continue;
        }
        let tickets;
        try { tickets = (await response.json()).data; } catch { /* Ambiguous body below. */ }
        if (!Array.isArray(tickets) || tickets.length !== jobs.length) {
          await bounded(jobs, job => finish(job, "uncertain", "invalid_ticket_response"));
          uncertain += jobs.length;
          continue;
        }
        await bounded(jobs, async (job, i) => {
          const ticket = tickets[i];
          if (ticket?.status === "ok" && typeof ticket.id === "string") {
            await finish(job, "sent", null, ticket.id); accepted++;
          } else if (ticket?.status === "error") {
            await finish(job, ticket.details?.error === "MessageRateExceeded" ? "retry" : "failed", ticket.details?.error ?? "ticket_error");
          } else { await finish(job, "uncertain", "invalid_ticket"); uncertain++; }
        });
      }
      await rpc("push_cleanup");
      return reply(200, { enabled: true, accepted, uncertain });
    } catch {
      // A lease whose acknowledgement was lost becomes 'uncertain', never a
      // blind resend. Operators can inspect counts without exposing tokens.
      return reply(503, { error: "Push worker interrupted", accepted, uncertain });
    } finally {
      if (locked) { try { await rpc("push_worker_unlock", { p_environment: deps.environment, p_lease: run }); } catch { /* The lease also expires after 60s. */ } }
    }
  };
}
