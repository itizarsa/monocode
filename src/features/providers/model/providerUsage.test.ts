import { describe, expect, it } from "vitest";
import type { ProviderAccount } from "./providerAccounts";
import {
  rowCost,
  summarizeUsage,
  usageBreakdown,
  usageRate,
  type AccountUsage,
  type UsageRow,
} from "./providerUsage";

const personal: ProviderAccount = {
  id: "default",
  provider: "claude",
  label: "Personal",
  isDefault: true,
};
const work: ProviderAccount = {
  id: "account-work",
  provider: "claude",
  label: "Work",
};
const codex: ProviderAccount = {
  id: "default",
  provider: "codex",
  label: "Codex",
  isDefault: true,
};

const now = new Date(2026, 8, 29, 15, 0);

function row(at: Date, overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    slot: Math.floor(at.getTime() / 1000),
    model: "claude-opus-5-5",
    project: "/work/monocode",
    input: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    output: 0,
    ...overrides,
  };
}

describe("usage rates", () => {
  it("matches dated and suffixed model ids by prefix", () => {
    expect(usageRate("claude-sonnet-4-5-20250929")?.input).toBe(3);
    expect(usageRate("claude-opus-5-5")?.input).toBe(4);
    expect(usageRate("claude-opus-5")?.input).toBe(5);
    expect(usageRate("claude-opus-4-1-20250805")?.input).toBe(15);
    expect(usageRate("gpt-5.5-codex")?.input).toBe(5);
    expect(usageRate("gpt-5-codex")?.input).toBe(1.25);
  });

  it("does not guess a price for an unknown model", () => {
    expect(usageRate("gpt-5.9")).toBeNull();
    expect(usageRate("some-local-model")).toBeNull();
    expect(
      rowCost(row(now, { model: "mystery", output: 1_000_000 })),
    ).toBeNull();
  });

  it("prices each kind of token at its own rate", () => {
    const cost = rowCost(
      row(now, {
        input: 1_000_000,
        cacheRead: 1_000_000,
        cacheWrite5m: 1_000_000,
        cacheWrite1h: 1_000_000,
        output: 1_000_000,
      }),
    );
    // Opus 5.5: $4 in, $0.20 cache read, $5 and $8 cache writes, $20 out.
    expect(cost).toBeCloseTo(4 + 0.2 + 5 + 8 + 20);
  });
});

describe("usage summary", () => {
  const usage: AccountUsage[] = [
    {
      account: personal,
      rows: [
        row(new Date(2026, 8, 29, 9), {
          input: 100_000,
          cacheRead: 900_000,
          output: 10_000,
        }),
        row(new Date(2026, 8, 27, 23, 45), { input: 50_000, output: 5_000 }),
        // Before the 7-day window.
        row(new Date(2026, 8, 20, 12), { input: 1_000_000 }),
      ],
    },
    {
      account: work,
      rows: [
        row(new Date(2026, 8, 29, 1), {
          model: "claude-sonnet-5",
          project: "/work/site",
          output: 20_000,
        }),
      ],
    },
    {
      account: codex,
      rows: [
        row(new Date(2026, 8, 28, 12), {
          model: "home-brew",
          input: 1_000,
          output: 1_000,
        }),
      ],
    },
  ];

  it("totals tokens and cost into local days", () => {
    const summary = summarizeUsage(usage, 7, now);
    expect(summary.days).toHaveLength(7);
    expect(summary.days[6].date).toEqual(new Date(2026, 8, 29));
    expect(summary.days.map((day) => day.tokens)).toEqual([
      0, 0, 0, 0, 55_000, 2_000, 1_030_000,
    ]);
    expect(summary.activeDays).toBe(3);
    expect(summary.tokens).toBe(1_087_000);
    expect(summary.cacheHitRate).toBeCloseTo(900_000 / 1_051_000);
    // 900K cache reads at $4 - $0.20.
    expect(summary.cacheSavings).toBeCloseTo(3.42);
    expect(summary.unpricedModels).toEqual(["home-brew"]);
  });

  it("breaks usage down by model, project and account", () => {
    const label = (account: ProviderAccount) => account.label;
    expect(
      usageBreakdown(usage, 7, now, "model", label).map((entry) => entry.key),
    ).toEqual(["claude-opus-5-5", "claude-sonnet-5", "home-brew"]);
    expect(
      usageBreakdown(usage, 7, now, "project", label).map((entry) => [
        entry.label,
        entry.title,
      ]),
    ).toEqual([
      ["monocode", "/work/monocode"],
      ["site", "/work/site"],
    ]);
    const accounts = usageBreakdown(usage, 7, now, "account", label);
    expect(accounts.map((entry) => entry.label)).toEqual([
      "Personal",
      "Work",
      "Codex",
    ]);
    expect(accounts[0].share).toBe(1);
  });
});
