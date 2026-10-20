import { z } from "zod";
import {
  accountSchema,
  changeSchema,
  type Account,
  type AccountChange,
  type ChangeInput,
  type SyncResponse,
} from "@/types/account";

export const ACCOUNT_CACHE_AGE = 7 * 86400_000;
const cacheSchema = z.object({
  version: z.literal(1),
  saved_at: z.number().finite(),
  account: accountSchema.nullable(),
  pending: z.array(changeSchema).max(200),
});
type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?: () => Promise<readonly string[]>;
};
type Api = {
  read(signal: AbortSignal): Promise<Account>;
  write(changes: AccountChange[], signal: AbortSignal): Promise<SyncResponse>;
};
export type SyncState = {
  account: Account | null;
  ready: boolean;
  syncing: boolean;
  pending: number;
  error: string | null;
  notice: string | null;
  lastSynced: number | null;
};
const keyOf = (change: ChangeInput) =>
  change.kind === "favorite" ? `favorite:${change.show_id}` : change.kind;
const revisionOf = (account: Account | null, change: ChangeInput) =>
  change.kind === "favorite"
    ? (account?.favorites.find((row) => row.show_id === change.show_id)
        ?.revision ?? 0)
    : change.kind === "profile"
      ? (account?.profile.revision ?? 0)
      : (account?.settings.revision ?? 0);

/** Durable owner-scoped outbox. At most one request runs; old sessions cannot publish results. */
export class AccountSync {
  private state: SyncState = {
    account: null,
    ready: false,
    syncing: false,
    pending: 0,
    error: null,
    notice: null,
    lastSynced: null,
  };
  private account: Account | null = null;
  private pending: AccountChange[] = [];
  private listeners = new Set<() => void>();
  private stopped = false;
  private online = true;
  private active: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private lifecycle = 0;
  private retryAt = 0;
  private savedAt = 0;
  private persistChain: Promise<void> = Promise.resolve();
  constructor(
    readonly userId: string,
    readonly cacheKey: string,
    private storage: Storage,
    private api: Api,
    private uuid: () => string,
    private now: () => number = Date.now,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(update: Partial<SyncState> = {}) {
    if (this.stopped) return;
    let visible = this.account
      ? {
          ...this.account,
          profile: { ...this.account.profile },
          settings: { ...this.account.settings },
          favorites: this.account.favorites.map((row) => ({ ...row })),
        }
      : null;
    if (visible)
      for (const change of this.pending) {
        if (change.kind === "favorite") {
          const row = visible.favorites.find(
            (item) => item.show_id === change.show_id,
          );
          if (row) {
            row.is_favorite = change.value;
            row.revision = change.base_revision + 1;
          } else
            visible.favorites.push({
              show_id: change.show_id,
              is_favorite: change.value,
              revision: change.base_revision + 1,
            });
        } else if (change.kind === "settings")
          visible.settings = {
            ...visible.settings,
            notifications_enabled: change.value,
            ...(change.scope !== undefined
              ? { reminder_scope: change.scope }
              : {}),
            ...(change.leadMinutes !== undefined
              ? { reminder_lead_minutes: change.leadMinutes }
              : {}),
            revision: change.base_revision + 1,
          };
        else
          visible.profile = {
            display_name: change.value,
            revision: change.base_revision + 1,
          };
      }
    this.state = {
      ...this.state,
      ...update,
      account: visible,
      pending: this.pending.length,
    };
    this.listeners.forEach((listener) => listener());
  }
  private persist() {
    const value = JSON.stringify({
      version: 1,
      saved_at: this.savedAt,
      account: this.account,
      pending: this.pending,
    });
    const operations = this.pending.map((change) => ({
      id: change.id,
      value: JSON.stringify(change),
    }));
    this.persistChain = this.persistChain
      .catch(() => {})
      .then(async () => {
        // Separate immutable operation records keep two browser tabs from replacing
        // each other's durable outbox when they update the shared snapshot cache.
        if (this.storage.getAllKeys)
          for (const op of operations)
            await this.storage.setItem(
              `${this.cacheKey}:op:${op.id}`,
              op.value,
            );
        await this.storage.setItem(this.cacheKey, value);
      });
    return this.persistChain;
  }
  private async removeOperations(ids: string[]) {
    if (!this.storage.getAllKeys) return;
    await this.persistChain.catch(() => {});
    await Promise.all(
      ids.map((id) => this.storage.removeItem(`${this.cacheKey}:op:${id}`)),
    );
  }
  async start() {
    this.stopped = false;
    const lifecycle = ++this.lifecycle;
    try {
      const raw = await this.storage.getItem(this.cacheKey);
      if (this.stopped || lifecycle !== this.lifecycle) return;
      if (raw) {
        const data = cacheSchema.parse(JSON.parse(raw));
        if (data.account && data.account.user_id !== this.userId)
          throw Error("Wrong account cache.");
        const age = this.now() - data.saved_at;
        this.account =
          age >= 0 && age < ACCOUNT_CACHE_AGE ? data.account : null;
        this.savedAt = data.saved_at;
        this.pending = data.pending.filter(
          (change) =>
            this.now() >= change.created_at &&
            this.now() - change.created_at < ACCOUNT_CACHE_AGE,
        );
        if (this.pending.length !== data.pending.length)
          this.state.notice =
            "Older unsynced changes expired. Please review your saved shows and settings.";
      }
      if (this.storage.getAllKeys) {
        const keys = (await this.storage.getAllKeys()).filter((key) =>
          key.startsWith(`${this.cacheKey}:op:`),
        );
        const recovered: AccountChange[] = [];
        for (const key of keys) {
          const rawChange = await this.storage.getItem(key);
          if (!rawChange) continue;
          const change = changeSchema.parse(JSON.parse(rawChange));
          if (key !== `${this.cacheKey}:op:${change.id}`) continue;
          if (
            this.now() < change.created_at ||
            this.now() - change.created_at >= ACCOUNT_CACHE_AGE
          ) {
            await this.storage.removeItem(key);
            this.state.notice =
              "Older unsynced changes expired. Please review your saved shows and settings.";
          } else recovered.push(change);
        }
        if (recovered.length > 200) throw Error("Too many pending changes.");
        this.pending = recovered.sort(
          (a, b) =>
            keyOf(a).localeCompare(keyOf(b)) ||
            a.base_revision - b.base_revision ||
            a.created_at - b.created_at ||
            a.id.localeCompare(b.id),
        );
      }
    } catch {
      this.state.notice =
        "The saved account cache could not be restored. Reconnecting to your account.";
    }
    if (this.stopped || lifecycle !== this.lifecycle) return;
    this.publish({ ready: true });
    void this.refresh();
  }
  setOnline(online: boolean) {
    this.online = online;
    if (!online) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    } else void this.refresh();
  }
  async enqueue(input: ChangeInput) {
    return this.enqueueMany([input]);
  }
  async enqueueMany(inputs: readonly ChangeInput[]) {
    if (this.stopped || !this.state.ready || !this.account)
      throw Error("Wait for your account to load before making changes.");
    const queued = this.pending.map((change) => ({ ...change }));
    for (const input of inputs) {
      const same = [...queued]
        .reverse()
        .find((change) => keyOf(change) === keyOf(input));
      if (same && !same.sent && !this.storage.getAllKeys)
        Object.assign(same, changeSchema.parse({ ...same, ...input }));
      else {
        if (queued.length >= 200)
          throw Error("Please sync your pending changes before adding more.");
        queued.push(
          changeSchema.parse({
            ...input,
            id: this.uuid(),
            created_at: this.now(),
            base_revision: same
              ? same.base_revision + 1
              : revisionOf(this.account, input),
            sent: false,
          }),
        );
      }
    }
    this.pending = queued;
    this.publish({ error: null, notice: null });
    try {
      await this.persist();
    } catch {
      this.publish({
        error:
          "Device storage is full or unavailable. Keep the app open and retry syncing.",
      });
      throw Error("Unable to save changes on this device.");
    }
    if (!this.stopped) this.schedule(500);
  }
  private schedule(delay: number) {
    if (this.stopped || !this.online) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, delay);
  }
  async refresh() {
    if (this.stopped || !this.online || !this.state.ready || this.active)
      return;
    if (this.now() < this.retryAt) {
      this.schedule(this.retryAt - this.now());
      return;
    }
    const expired = this.pending.filter(
      (change) =>
        this.now() < change.created_at ||
        this.now() - change.created_at >= ACCOUNT_CACHE_AGE,
    );
    if (expired.length) {
      this.pending = this.pending.filter((change) => !expired.includes(change));
      void this.removeOperations(expired.map((change) => change.id)).catch(
        () => {},
      );
      this.publish({
        notice:
          "Older unsynced changes expired. Please review your saved shows and settings.",
      });
    }
    const controller = new AbortController();
    const lifecycle = this.lifecycle;
    const stale = () => this.stopped || lifecycle !== this.lifecycle;
    this.active = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    this.publish({ syncing: true });
    try {
      // Hydrate first when no valid cache exists; preserve pending revisions for conflict checks.
      let hydrated = false;
      if (!this.account) {
        const account = await this.api.read(controller.signal);
        if (stale()) return;
        if (account.user_id !== this.userId)
          throw Error("Unexpected account response.");
        this.account = account;
        hydrated = true;
      }
      if (this.pending.length) {
        const batch = this.pending
          .slice(0, 50)
          .map((change) => ({ ...change, sent: true }));
        const ids = new Set(batch.map((change) => change.id));
        this.pending.forEach((change) => {
          if (ids.has(change.id)) change.sent = true;
        });
        await this.persist(); // A killed app retries the same immutable operation IDs.
        if (stale()) return;
        const response = await this.api.write(batch, controller.signal);
        if (stale()) return;
        if (
          response.account.user_id !== this.userId ||
          response.results.length !== batch.length ||
          response.results.some((row) => !ids.has(row.id)) ||
          new Set(response.results.map((row) => row.id)).size !== batch.length
        )
          throw Error("Invalid account response.");
        const rejectedKeys = new Set(
          response.results
            .filter((result) => result.status !== "saved")
            .map((result) =>
              keyOf(batch.find((change) => change.id === result.id)!),
            ),
        );
        const removed = this.pending.filter(
          (change) => ids.has(change.id) || rejectedKeys.has(keyOf(change)),
        );
        this.pending = this.pending.filter(
          (change) => !removed.includes(change),
        );
        if (rejectedKeys.size)
          this.state.notice =
            "Some items changed on another device or are unavailable. The latest saved values are shown; review them before trying again.";
        this.account = response.account;
        await this.removeOperations(removed.map((change) => change.id));
        if (stale()) return;
      } else if (!hydrated) {
        const account = await this.api.read(controller.signal);
        if (stale()) return;
        if (account.user_id !== this.userId)
          throw Error("Unexpected account response.");
        this.account = account;
      }
      this.savedAt = this.now();
      await this.persist();
      this.retries = 0;
      this.retryAt = 0;
      this.publish({ error: null, lastSynced: this.savedAt });
    } catch (error) {
      if (stale()) return;
      const code = (error as { code?: string }).code;
      const wait =
        code === "P0429"
          ? 60_000
          : Math.min(60_000, 2000 * 2 ** Math.min(this.retries++, 5));
      this.retryAt = this.now() + wait;
      this.publish({
        error:
          code === "P0429"
            ? "Changes are saved on this device. Sync will resume shortly after the rate limit resets."
            : code === "42501" || code === "PGRST301"
              ? "Please sign in again to reconnect your account. Pending changes are saved on this device."
              : !this.account
                ? "Unable to load your account data. Check your connection and retry. You can still listen to the radio."
                : "Unable to sync right now. Your changes are saved on this device and will retry automatically.",
      });
      this.schedule(wait);
    } finally {
      clearTimeout(timeout);
      if (stale()) return;
      this.active = null;
      this.publish({ syncing: false });
      if (!this.stopped && !this.state.error && this.pending.length)
        this.schedule(500);
    }
  }
  stop() {
    this.stopped = true;
    this.lifecycle++;
    this.active?.abort();
    this.active = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  async clear() {
    this.stop();
    await this.persistChain.catch(() => {});
    const keys = this.storage.getAllKeys
      ? (await this.storage.getAllKeys()).filter(
          (key) =>
            key === this.cacheKey || key.startsWith(`${this.cacheKey}:op:`),
        )
      : [this.cacheKey];
    await Promise.all(keys.map((key) => this.storage.removeItem(key)));
  }
}
