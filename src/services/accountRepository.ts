import { getAuthClient } from "@/services/authClient";
import {
  accountSchema,
  syncResponseSchema,
  type AccountChange,
} from "@/types/account";

export class AccountRequestError extends Error {
  constructor(public readonly code: string) {
    super("Account request failed.");
  }
}
export const accountApi = {
  async read(signal: AbortSignal) {
    const { data, error } = await getAuthClient()
      .rpc("get_account_data")
      .abortSignal(signal);
    if (error) throw new AccountRequestError(error.code);
    return accountSchema.parse(data);
  },
  async write(changes: AccountChange[], signal: AbortSignal) {
    const { data, error } = await getAuthClient()
      .rpc("apply_account_changes", {
        changes: changes.map(({ created_at, sent, ...change }) => change),
      })
      .abortSignal(signal);
    if (error) throw new AccountRequestError(error.code);
    return syncResponseSchema.parse(data);
  },
};
