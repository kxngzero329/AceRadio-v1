type Result = { data: unknown; error: unknown };
type Job = {
  id: string;
  lease: string;
  token: string;
  showId: string;
  title: string;
  time: string;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
  phase?: "reminder" | "live";
};
type ReceiptJob = { id: string; ticket: string };
type DeliveryResult = {
  id: string;
  lease: string;
  state: string;
  error: string | null;
  ticket: string | null;
};
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
  for (let i = 0; i < a.length; i++)
    different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}
export function createPushDispatchHandler(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const pause =
    deps.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  return async (request: Request) => {
    const reply = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    if (request.method !== "POST")
      return reply(405, { error: "Method not allowed" });
    if (
      !equals(
        request.headers.get("authorization") ?? "",
        `Bearer ${deps.workerSecret}`,
      ) ||
      deps.workerSecret.length < 32
    )
      return reply(401, { error: "Unauthorized" });
    if (!deps.enabled || !deps.accessToken)
      return reply(200, { enabled: false, sent: 0 });
    const started = now();
    const rpc = async (name: string, args?: Record<string, unknown>) => {
      const result = await deps.rpc(name, args);
      if (result.error) throw Error("Push persistence failed");
      return result.data;
    };
    const post = (path: string, body: unknown) =>
      deps.fetch(`https://exp.host/--/api/v2/push/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deps.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    let accepted = 0,
      uncertain = 0;
    const run = crypto.randomUUID();
    let locked = false;
    const identity = { p_environment: deps.environment, p_lease: run };
    try {
      // The database locks, prepares work and releases a completely idle run in
      // one transaction. No individual acknowledgement calls per recipient.
      const initial = (await rpc("push_worker_begin", {
        ...identity,
        p_allowed: deps.allowed,
      })) as {
        acquired: boolean;
        idle: boolean;
        jobs: Job[];
        receipts: ReceiptJob[];
      };
      locked = initial.acquired;
      if (!locked)
        return reply(
          200,
          initial.idle
            ? { enabled: true, accepted: 0, uncertain: 0, idle: true }
            : { busy: true, accepted: 0 },
        );
      let jobs = initial.jobs;
      const receipts = initial.receipts;
      // Process the prepared batch before optional receipt work. A slow receipt
      // provider must not consume the send budget after jobs have been leased.
      for (let batch = 0; batch < 25 && jobs.length; batch++) {
        if (jobs.length > 100) throw Error("Oversized push batch");
        if (batch) await pause(250); // Maximum 400 messages/sec from this leased worker.
        const result = (
          job: Job,
          state: string,
          error: string | null = null,
          ticket: string | null = null,
        ): DeliveryResult => ({
          id: job.id,
          lease: job.lease,
          state,
          error,
          ticket,
        });
        let results: DeliveryResult[],
          stop = false;
        let response: Response | undefined;
        try {
          response = await post(
            "send",
            jobs.map((job) => ({
              to: job.token,
              title:
                job.phase === "live" ? `${job.title} is on now` : job.title,
              body:
                job.phase === "live"
                  ? "Your favourite show is on air. Tap to listen live."
                  : `${job.time} SAST · Tap to open the show and listen live.`,
              data: {
                version: 1,
                kind: "show-reminder",
                showId: job.showId,
                startsAt: job.startsAt,
                endsAt: job.endsAt,
              },
              expiration: Math.floor(Date.parse(job.expiresAt) / 1000),
              sound: "default",
              priority: "high",
              channelId: "ace-radio-updates",
              collapseId: job.id,
              tag: job.id,
            })),
          );
        } catch {
          /* The provider may have accepted an ambiguous send. */
        }
        if (!response) {
          results = jobs.map((job) => result(job, "uncertain", "send_timeout"));
          uncertain += jobs.length;
        } else if (!response.ok) {
          stop = response.status === 429 || response.status >= 500;
          results = jobs.map((job) =>
            result(job, stop ? "retry" : "failed", `http_${response.status}`),
          );
        } else {
          let tickets;
          try {
            tickets = (await response.json()).data;
          } catch {
            /* Ambiguous body below. */
          }
          if (!Array.isArray(tickets) || tickets.length !== jobs.length) {
            results = jobs.map((job) =>
              result(job, "uncertain", "invalid_ticket_response"),
            );
            uncertain += jobs.length;
          } else {
            results = jobs.map((job, i) => {
              const ticket = tickets[i];
              if (ticket?.status === "ok" && typeof ticket.id === "string") {
                accepted++;
                return result(job, "sent", null, ticket.id);
              }
              if (ticket?.status === "error")
                return result(
                  job,
                  ticket.details?.error === "MessageRateExceeded"
                    ? "retry"
                    : "failed",
                  ticket.details?.error ?? "ticket_error",
                );
              uncertain++;
              return result(job, "uncertain", "invalid_ticket");
            });
          }
        }
        const claim = !stop && batch < 24 && now() - started < 40_000;
        // Ack and next claim commit atomically. If the acknowledgement response
        // is lost, durable job leases prevent a blind resend in the next run.
        jobs = (await rpc("push_worker_flush", {
          ...identity,
          p_results: results,
          p_claim: claim,
          p_allowed: deps.allowed,
        })) as Job[];
        if (!claim) break;
      }
      if (receipts.length && now() - started < 40_000) {
        // Provider/network receipt failures remain durable for the next minute.
        let outcomes:
          | { id: string; result: string; error: string | null }[]
          | undefined;
        try {
          const response = await post("getReceipts", {
            ids: receipts.map((item) => item.ticket),
          });
          if (response.ok) {
            const body = await response.json();
            outcomes = receipts.map((job) => {
              const receipt = body.data?.[job.ticket];
              return {
                id: job.id,
                result:
                  receipt?.status === "ok"
                    ? "ok"
                    : receipt?.status === "error"
                      ? "error"
                      : "pending",
                error: receipt?.details?.error ?? null,
              };
            });
          }
        } catch {
          /* Never log notification payloads or tokens. */
        }
        if (outcomes)
          await rpc("push_worker_flush", {
            ...identity,
            p_receipts: outcomes,
            p_claim: false,
            p_allowed: deps.allowed,
          });
      }
      return reply(200, { enabled: true, accepted, uncertain });
    } catch {
      return reply(503, {
        error: "Push worker interrupted",
        accepted,
        uncertain,
      });
    } finally {
      if (locked) {
        try {
          await rpc("push_worker_unlock", identity);
        } catch {
          /* The lease also expires. */
        }
      }
    }
  };
}
