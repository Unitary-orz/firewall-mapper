import type { ParsedConfig, PolicyRule, ScheduleEntry } from "./parser/types";

export interface PolicyExpiry {
  expired: boolean;
  expiresAt?: Date;
  expiresAtText?: string;
}

interface ScheduleTimes {
  startsAt?: Date;
  expiresAt?: Date;
  expiresAtText?: string;
}

const scheduleTimesCache = new WeakMap<ParsedConfig, Map<string, ScheduleTimes>>();

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Topsec absolute times use YY-MM-DD HH:mm:ss; accept YYYY-MM-DD too. */
function parseDateTime(dateToken: string, timeToken: string): Date | undefined {
  const dateMatch = /^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateToken);
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeToken);
  if (!dateMatch || !timeMatch) return undefined;

  const rawYear = Number(dateMatch[1]);
  const year = dateMatch[1].length === 2 ? 2000 + rawYear : rawYear;
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return undefined;
  }

  // Construct in the browser's local timezone: the appliance exports wall-clock
  // times without an offset. Validate every field to reject rolled-over dates.
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return undefined;
  }
  return date;
}

function parseScheduleTimes(schedule: ScheduleEntry): ScheduleTimes {
  const fields = schedule.absolute?.trim().split(/\s+/) ?? [];
  if (fields.length < 4) return {};
  const startsAt = parseDateTime(fields[0], fields[1]);
  const expiresAt = parseDateTime(fields[2], fields[3]);
  return {
    startsAt,
    expiresAt,
    expiresAtText: expiresAt ? formatDateTime(expiresAt) : undefined,
  };
}

function scheduleTimes(cfg: ParsedConfig): Map<string, ScheduleTimes> {
  const cached = scheduleTimesCache.get(cfg);
  if (cached) return cached;
  const times = new Map(
    cfg.schedules.map((schedule) => [schedule.name, parseScheduleTimes(schedule)]),
  );
  scheduleTimesCache.set(cfg, times);
  return times;
}

export function getPolicyExpiry(
  policy: PolicyRule,
  cfg: ParsedConfig,
  now: Date = new Date(),
): PolicyExpiry {
  const timing = scheduleTimes(cfg).get(policy.schedule);
  if (!timing?.expiresAt) return { expired: false };
  return {
    // The configured end second is inclusive; expiry begins immediately after it.
    expired: now.getTime() > timing.expiresAt.getTime(),
    expiresAt: timing.expiresAt,
    expiresAtText: timing.expiresAtText,
  };
}

export function isPolicyExpired(
  policy: PolicyRule,
  cfg: ParsedConfig,
  now: Date = new Date(),
): boolean {
  return getPolicyExpiry(policy, cfg, now).expired;
}

export function policyStatusText(policy: PolicyRule, cfg: ParsedConfig, now?: Date): string {
  const states = [policy.disabled ? "disabled 已禁用" : "enabled 已启用"];
  if (isPolicyExpired(policy, cfg, now)) states.push("expired 已过期");
  return states.join(" ");
}
