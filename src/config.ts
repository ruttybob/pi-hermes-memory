/**
 * Конфигурация — загрузка из ~/.pi/agent/self-memory-config.json.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { MemoryConfig, MemoryOverflowStrategy } from "./types.js";
import { DEFAULT_MEMORY_CHAR_LIMIT, DEFAULT_NUDGE_INTERVAL, DEFAULT_FLUSH_MIN_TURNS, DEFAULT_NUDGE_TOOL_CALLS, DEFAULT_REVIEW_RECENT_MESSAGES, DEFAULT_FLUSH_RECENT_MESSAGES, DEFAULT_FAILURE_INJECTION_MAX_AGE_DAYS, DEFAULT_FAILURE_INJECTION_MAX_ENTRIES } from "./constants.js";

const STRATS: readonly MemoryOverflowStrategy[] = ["auto-consolidate", "reject", "fifo-evict"];
const isStrat = (v: unknown): v is MemoryOverflowStrategy => typeof v === "string" && STRATS.includes(v as MemoryOverflowStrategy);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

const DEF: MemoryConfig = {
  memoryCharLimit: DEFAULT_MEMORY_CHAR_LIMIT, nudgeInterval: DEFAULT_NUDGE_INTERVAL,
  reviewRecentMessages: DEFAULT_REVIEW_RECENT_MESSAGES, reviewEnabled: true,
  flushOnCompact: true, flushOnShutdown: true, flushMinTurns: DEFAULT_FLUSH_MIN_TURNS,
  flushRecentMessages: DEFAULT_FLUSH_RECENT_MESSAGES, memoryOverflowStrategy: "auto-consolidate",
  autoConsolidate: true, correctionDetection: true, failureInjectionEnabled: true,
  failureInjectionMaxAgeDays: DEFAULT_FAILURE_INJECTION_MAX_AGE_DAYS,
  failureInjectionMaxEntries: DEFAULT_FAILURE_INJECTION_MAX_ENTRIES,
  nudgeToolCalls: DEFAULT_NUDGE_TOOL_CALLS,
};

export const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "self-memory-config.json");

export function loadConfig(p = DEFAULT_CONFIG_PATH): MemoryConfig {
  try {
    if (!fs.existsSync(p)) return { ...DEF };
    const o = JSON.parse(fs.readFileSync(p, "utf-8"));
    const c: MemoryConfig = { ...DEF };
    if (typeof o.memoryCharLimit === "number") c.memoryCharLimit = o.memoryCharLimit;
    if (typeof o.nudgeInterval === "number") c.nudgeInterval = o.nudgeInterval;
    if (isNum(o.reviewRecentMessages)) c.reviewRecentMessages = o.reviewRecentMessages;
    if (typeof o.reviewEnabled === "boolean") c.reviewEnabled = o.reviewEnabled;
    if (typeof o.flushOnCompact === "boolean") c.flushOnCompact = o.flushOnCompact;
    if (typeof o.flushOnShutdown === "boolean") c.flushOnShutdown = o.flushOnShutdown;
    if (typeof o.flushMinTurns === "number") c.flushMinTurns = o.flushMinTurns;
    if (isNum(o.flushRecentMessages)) c.flushRecentMessages = o.flushRecentMessages;
    if (isStrat(o.memoryOverflowStrategy)) c.memoryOverflowStrategy = o.memoryOverflowStrategy;
    if (typeof o.correctionDetection === "boolean") c.correctionDetection = o.correctionDetection;
    if (isStrArr(o.correctionStrongPatterns)) c.correctionStrongPatterns = o.correctionStrongPatterns;
    if (isStrArr(o.correctionWeakPatterns)) c.correctionWeakPatterns = o.correctionWeakPatterns;
    if (isStrArr(o.correctionNegativePatterns)) c.correctionNegativePatterns = o.correctionNegativePatterns;
    if (isStrArr(o.correctionDirectiveWords)) c.correctionDirectiveWords = o.correctionDirectiveWords;
    if (typeof o.failureInjectionEnabled === "boolean") c.failureInjectionEnabled = o.failureInjectionEnabled;
    if (typeof o.failureInjectionMaxAgeDays === "number") c.failureInjectionMaxAgeDays = o.failureInjectionMaxAgeDays;
    if (typeof o.failureInjectionMaxEntries === "number") c.failureInjectionMaxEntries = o.failureInjectionMaxEntries;
    if (typeof o.nudgeToolCalls === "number") c.nudgeToolCalls = o.nudgeToolCalls;
    if (typeof o.memoryDir === "string") c.memoryDir = o.memoryDir;
    if (isStrat(o.memoryOverflowStrategy)) { c.autoConsolidate = c.memoryOverflowStrategy === "auto-consolidate"; }
    else if (typeof o.autoConsolidate === "boolean") { c.autoConsolidate = o.autoConsolidate; c.memoryOverflowStrategy = c.autoConsolidate ? "auto-consolidate" : "reject"; }
    return c;
  } catch { return { ...DEF }; }
}
