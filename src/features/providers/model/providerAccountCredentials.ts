import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_PROVIDER_ACCOUNT_ID,
  type ProviderAccountProvider,
} from "./providerAccounts";

/** Remove a named profile's native credentials before its UI metadata. */
export async function removeProviderAccountCredentials(
  provider: ProviderAccountProvider,
  accountId: string,
): Promise<void> {
  await invoke("provider_account_remove", { provider, accountId });
}

/**
 * Whether a conversation can move between two accounts: true when both read
 * the same transcript store. Only Claude profiles share it today.
 */
export async function providerAccountsShareHistory(
  provider: ProviderAccountProvider,
  fromAccountId: string | undefined,
  toAccountId: string | undefined,
): Promise<boolean> {
  if (provider !== "claude") return false;
  try {
    for (const accountId of [fromAccountId, toAccountId]) {
      if (!accountId || accountId === DEFAULT_PROVIDER_ACCOUNT_ID) continue;
      const shared = await invoke<boolean>("provider_account_shares_history", {
        provider,
        accountId,
      });
      if (!shared) return false;
    }
    return true;
  } catch {
    return false;
  }
}
