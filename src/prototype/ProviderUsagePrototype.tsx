import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Pencil, Plus } from "../shared/ui/icons";
import { HarnessIcon } from "../features/sessions/ui/HarnessIcon";
import type { HarnessId } from "../features/sessions/model/session";
import { Bar } from "./dither-kit/bar";
import { BarChart } from "./dither-kit/bar-chart";
import { Grid } from "./dither-kit/grid";
import { Tooltip } from "./dither-kit/tooltip";
import { XAxis } from "./dither-kit/x-axis";
import { YAxis } from "./dither-kit/y-axis";

/*
 * Design prototype for a per-account Usage section on Settings › Providers.
 * Everything here is mock data; the chrome copies SettingsView's Group, Row
 * and Segmented styling so the section can be lifted in as-is.
 */

type Range = "7d" | "30d";
type Metric = "cost" | "tokens";
type Breakdown = "model" | "project" | "account";

const ALL_ACCOUNTS = "all";
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30 };

type MockAccount = {
  id: string;
  provider: Extract<HarnessId, "claude" | "codex">;
  label: string;
  subtitle: string;
  isDefault: boolean;
  seed: number;
  models: { id: string; weight: number; rate: number }[];
};

const ACCOUNTS: MockAccount[] = [
  {
    id: "claude-default",
    provider: "claude",
    label: "Personal",
    subtitle: "arsad@example.com · Max plan",
    isDefault: true,
    seed: 3,
    models: [
      { id: "claude-opus-5-5", weight: 0.5, rate: 0.52 },
      { id: "claude-sonnet-5", weight: 0.25, rate: 0.36 },
      { id: "claude-opus-5", weight: 0.246, rate: 1.02 },
      { id: "claude-haiku-4-5", weight: 0.004, rate: 0.39 },
    ],
  },
  {
    id: "claude-work",
    provider: "claude",
    label: "Work",
    subtitle: "arsad@acme.dev · Team plan",
    isDefault: false,
    seed: 11,
    models: [
      { id: "claude-sonnet-5", weight: 0.7, rate: 0.36 },
      { id: "claude-opus-5-5", weight: 0.3, rate: 0.52 },
    ],
  },
  {
    id: "codex-default",
    provider: "codex",
    label: "Personal",
    subtitle: "arsad@example.com · Plus plan",
    isDefault: true,
    seed: 7,
    models: [
      { id: "gpt-5.5-codex", weight: 0.82, rate: 0.41 },
      { id: "gpt-5.5-mini", weight: 0.18, rate: 0.09 },
    ],
  },
];

const PROJECTS = ["monocode", "harness-bridge", "website", "dotfiles"];
const PROJECT_WEIGHTS = [0.62, 0.21, 0.12, 0.05];

const PROVIDER_TITLE = { claude: "Claude Code", codex: "Codex" } as const;

type Day = {
  date: Date;
  tokens: number;
  cost: number;
  cachedInput: number;
  input: number;
};

function random(seed: number) {
  let state = seed * 9301 + 49297;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

function mockDays(account: MockAccount, range: Range): Day[] {
  const count = RANGE_DAYS[range];
  const next = random(account.seed);
  const today = new Date(2026, 8, 28);
  const blendedRate =
    account.models.reduce((sum, model) => sum + model.weight * model.rate, 0) /
    1_000_000;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - 1 - index));
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const idle = next() < (weekend ? 0.45 : 0.08);
    const tokens = idle
      ? 0
      : Math.round((25 + next() * 150) * 1_000_000 * (weekend ? 0.4 : 1));
    const input = Math.round(tokens * 0.994);
    return {
      date,
      tokens,
      cost: tokens * blendedRate,
      input,
      cachedInput: Math.round(input * (0.9 + next() * 0.08)),
    };
  });
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatCost(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProviderUsagePrototype() {
  const [light, setLight] = useState(false);

  const toggleTheme = () => {
    const next = !light;
    document.documentElement.classList.toggle("theme-light", next);
    setLight(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col text-content">
      <div className="flex h-10 shrink-0 items-center border-b border-stroke">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[13px]">
          <span className="shrink-0 text-content/45">Settings</span>
          <span aria-hidden className="shrink-0 text-content/25">
            /
          </span>
          <span className="min-w-0 truncate text-content">Providers</span>
          <span className="ml-2 rounded bg-accent/15 px-1.5 text-[10px] font-medium uppercase leading-4 tracking-wide text-accent">
            Prototype
          </span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="mr-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-content/50 hover:bg-content/10 hover:text-content"
        >
          {light ? "Dark theme" : "Light theme"}
        </button>
      </div>
      <div className="@container/settings min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-5 py-6 pb-16 @min-[560px]/settings:px-8 @min-[560px]/settings:py-8">
          <header className="pb-4">
            <h1 className="text-[20px] font-semibold leading-tight text-content">
              Providers
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-content/45">
              Agent CLIs, accounts, and the models new conversations start with.
            </p>
          </header>
          <AccountsMock />
          <UsageSection />
        </div>
      </div>
    </div>
  );
}

/** Static stand-in for the existing Accounts card, for context only. */
function AccountsMock() {
  return (
    <Group
      title="Accounts"
      description="Create isolated sign-ins for providers that support account profiles. Account switching stays available from the usage control in the footer."
    >
      {(["claude", "codex"] as const).map((provider) => {
        const accounts = ACCOUNTS.filter(
          (account) => account.provider === provider,
        );
        return (
          <div
            key={provider}
            className="border-b border-content/5 last:border-b-0"
          >
            <div className="flex items-center gap-4 px-4 py-3.5">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-content/[0.05] ring-1 ring-inset ring-content/[0.06]">
                  <HarnessIcon harness={provider} className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-content">
                    {PROVIDER_TITLE[provider]}
                  </div>
                  <div className="mt-0.5 text-[11px] text-content/40">
                    {accounts.length}{" "}
                    {accounts.length === 1 ? "account" : "accounts"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-content/10 px-2.5 py-1 text-[12px] text-content/70 hover:bg-content/10 hover:text-content"
              >
                <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
                Add account
              </button>
            </div>
            <div className="border-t border-content/5 bg-content/[0.015] pl-10">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex h-12 items-center gap-3 border-b border-content/5 px-4 py-2 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-content/85">
                      {account.label}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-content/35">
                      {account.subtitle}
                    </div>
                  </div>
                  {account.isDefault ? (
                    <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-content/30">
                      Default
                    </span>
                  ) : null}
                  <span className="grid size-7 place-items-center rounded-md text-content/40">
                    <Pencil className="size-3.5" strokeWidth={1.75} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Group>
  );
}

function UsageSection() {
  const [accountId, setAccountId] = useState<string>(ALL_ACCOUNTS);
  const [range, setRange] = useState<Range>("7d");
  const [metric, setMetric] = useState<Metric>("tokens");
  const [breakdown, setBreakdown] = useState<Breakdown>("model");

  const all = accountId === ALL_ACCOUNTS;
  const selected = useMemo(
    () =>
      all
        ? ACCOUNTS
        : ACCOUNTS.filter((candidate) => candidate.id === accountId),
    [accountId, all],
  );
  // The Account breakdown only means something across several accounts.
  const shownBreakdown = !all && breakdown === "account" ? "model" : breakdown;

  const perAccount = useMemo(
    () =>
      selected.map((account) => {
        const accountDays = mockDays(account, range);
        return {
          account,
          days: accountDays,
          tokens: accountDays.reduce((sum, day) => sum + day.tokens, 0),
          cost: accountDays.reduce((sum, day) => sum + day.cost, 0),
        };
      }),
    [selected, range],
  );

  const days = useMemo(
    () =>
      perAccount[0].days.map((day, index) =>
        perAccount.slice(1).reduce(
          (sum, entry) => ({
            date: sum.date,
            tokens: sum.tokens + entry.days[index].tokens,
            cost: sum.cost + entry.days[index].cost,
            input: sum.input + entry.days[index].input,
            cachedInput: sum.cachedInput + entry.days[index].cachedInput,
          }),
          day,
        ),
      ),
    [perAccount],
  );

  const totals = useMemo(() => {
    const tokens = days.reduce((sum, day) => sum + day.tokens, 0);
    const cost = days.reduce((sum, day) => sum + day.cost, 0);
    const input = days.reduce((sum, day) => sum + day.input, 0);
    const cached = days.reduce((sum, day) => sum + day.cachedInput, 0);
    const activeDays = days.filter((day) => day.tokens > 0).length;
    // Mock: the real figure prices each cached read at the model's full input
    // rate minus its cache-read rate.
    const saved = cost * 5.4;
    return {
      tokens,
      cost,
      activeDays,
      cacheRate: input > 0 ? cached / input : 0,
      saved,
    };
  }, [days]);

  const rows = useMemo(() => {
    let entries: {
      key: string;
      label: string;
      provider: MockAccount["provider"] | null;
      tokens: number;
      cost: number;
    }[];
    if (shownBreakdown === "model") {
      // The same model used from two accounts is one row.
      const byModel = new Map<string, (typeof entries)[number]>();
      for (const { account, tokens } of perAccount) {
        for (const model of account.models) {
          const row = byModel.get(model.id) ?? {
            key: model.id,
            label: model.id,
            provider: account.provider,
            tokens: 0,
            cost: 0,
          };
          row.tokens += tokens * model.weight;
          row.cost += tokens * model.weight * (model.rate / 1_000_000);
          byModel.set(model.id, row);
        }
      }
      entries = [...byModel.values()];
    } else if (shownBreakdown === "account") {
      entries = perAccount.map(({ account, tokens, cost }) => ({
        key: account.id,
        label: `${PROVIDER_TITLE[account.provider]} · ${account.label}`,
        provider: account.provider,
        tokens,
        cost,
      }));
    } else {
      entries = PROJECTS.map((project, index) => ({
        key: project,
        label: project,
        provider: null,
        tokens: totals.tokens * PROJECT_WEIGHTS[index],
        cost: totals.cost * PROJECT_WEIGHTS[index],
      }));
    }
    const costTotal = entries.reduce((sum, entry) => sum + entry.cost, 0);
    return entries
      .map((entry) => ({
        ...entry,
        share: costTotal > 0 ? entry.cost / costTotal : 0,
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [perAccount, shownBreakdown, totals]);

  return (
    <Group
      title="Usage"
      description="Estimated from local session logs at standard API rates. Subscription plans are billed differently."
      action={
        <div className="flex items-center gap-2">
          <AccountPicker value={accountId} onChange={setAccountId} />
          <Segmented
            label="Usage range"
            value={range}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
            ]}
            onChange={setRange}
          />
        </div>
      }
    >
      <div className="grid grid-cols-1 divide-y divide-content/5 border-b border-content/5 @min-[560px]/settings:grid-cols-3 @min-[560px]/settings:divide-x @min-[560px]/settings:divide-y-0">
        <Stat
          label="Estimated cost"
          value={formatCost(totals.cost)}
          detail={`${formatCost(totals.cost / Math.max(1, totals.activeDays))} per active day`}
        />
        <Stat
          label="Tokens"
          value={formatTokens(totals.tokens)}
          detail={`${totals.activeDays} of ${days.length} days active`}
        />
        <Stat
          label="Cache hit rate"
          value={`${(totals.cacheRate * 100).toFixed(1)}%`}
          detail={`Saved about ${formatCost(totals.saved)}`}
        />
      </div>

      <div className="border-b border-content/5 px-4 py-3.5">
        <div className="flex items-center gap-4 pb-3">
          <div className="min-w-0 flex-1 text-[13px] font-medium text-content">
            Daily {metric === "cost" ? "cost" : "tokens"}
          </div>
          <Segmented
            label="Chart metric"
            value={metric}
            options={[
              { value: "tokens", label: "Tokens" },
              { value: "cost", label: "Cost" },
            ]}
            onChange={setMetric}
          />
        </div>
        <DailyBars days={days} metric={metric} />
      </div>

      <div>
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1 text-[13px] font-medium text-content">
            Breakdown
          </div>
          <Segmented
            label="Breakdown"
            value={shownBreakdown}
            options={[
              { value: "model", label: "Model" },
              { value: "project", label: "Project" },
              ...(all ? [{ value: "account" as const, label: "Account" }] : []),
            ]}
            onChange={setBreakdown}
          />
        </div>
        <div className="border-t border-content/5 bg-content/[0.015]">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex h-11 items-center gap-4 border-b border-content/5 px-4 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {row.provider ? (
                  <HarnessIcon
                    harness={row.provider}
                    className="size-3.5 shrink-0"
                  />
                ) : null}
                <span
                  className={`truncate text-[12px] text-content/85 ${shownBreakdown === "model" ? "font-mono" : ""}`}
                >
                  {row.label}
                </span>
              </div>
              <div
                className="hidden h-1 w-28 shrink-0 overflow-hidden rounded-full bg-content/[0.07] @min-[560px]/settings:block"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-accent/70"
                  style={{ width: `${Math.max(2, row.share * 100)}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-content/50">
                {formatTokens(row.tokens)}
              </span>
              <span className="w-20 shrink-0 text-right text-[12px] tabular-nums text-content/85">
                {formatCost(row.cost)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Group>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <div className="text-[12px] text-content/45">{label}</div>
      <div className="mt-1 text-[20px] font-semibold leading-tight tabular-nums text-content">
        {value}
      </div>
      <div className="mt-1 truncate text-[11px] text-content/40">{detail}</div>
    </div>
  );
}

function DailyBars({ days, metric }: { days: Day[]; metric: Metric }) {
  const format = metric === "cost" ? formatCost : formatTokens;
  const data = useMemo(
    () =>
      days.map((day) => ({
        day: formatDay(day.date),
        value: metric === "cost" ? day.cost : day.tokens,
      })),
    [days, metric],
  );
  const config = useMemo(
    () => ({
      value: {
        label: metric === "cost" ? "Cost" : "Tokens",
        color: "blue" as const,
      },
    }),
    [metric],
  );

  return (
    <BarChart
      key={metric}
      data={data}
      config={config}
      bloom="low"
      margins={{ left: 48 }}
      className="h-40"
    >
      <Grid />
      <XAxis dataKey="day" maxTicks={days.length > 7 ? 6 : 7} />
      <YAxis tickFormatter={format} />
      <Tooltip labelKey="day" valueFormatter={(value) => format(value)} />
      <Bar dataKey="value" />
    </BarChart>
  );
}

/** Native select dressed as SettingsView's Select trigger. */
function AccountPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const account = ACCOUNTS.find((candidate) => candidate.id === value);
  return (
    <label className="relative flex h-[26px] items-center gap-1.5 rounded-md border border-content/10 pl-2 pr-6 text-[12px] text-content/80 hover:bg-content/10">
      {account ? (
        <HarnessIcon harness={account.provider} className="size-3.5" />
      ) : null}
      <span className="max-w-[10rem] truncate">
        {account?.label ?? "All accounts"}
      </span>
      <ChevronDown
        className="pointer-events-none absolute right-1.5 size-3 text-content/40"
        strokeWidth={1.75}
        aria-hidden
      />
      <select
        aria-label="Usage account"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value={ALL_ACCOUNTS}>All accounts</option>
        {(["claude", "codex"] as const).map((provider) => (
          <optgroup key={provider} label={PROVIDER_TITLE[provider]}>
            {ACCOUNTS.filter((account) => account.provider === provider).map(
              (account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ),
            )}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function Group({
  title,
  description,
  action,
  children,
}: {
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="pt-8 first:pt-0">
      <div className="flex items-end gap-4 pb-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-content">{title}</h2>
          {description ? (
            <p className="mt-1 text-[12px] leading-relaxed text-content/45">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 pb-0.5">{action}</div> : null}
      </div>
      <div className="overflow-hidden rounded-xl border border-content/10 bg-content/3">
        {children}
      </div>
    </section>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-grid max-w-full shrink-0 gap-0.5 rounded-md border border-content/10 p-0.5 text-[12px]"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-w-0 rounded-[5px] px-2.5 py-1 ${
            value === option.value
              ? "bg-selection text-content"
              : "text-content/50 hover:text-content"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
