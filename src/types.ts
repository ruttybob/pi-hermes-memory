/**
 * Типы для pi-self-memory.
 */

import type { TextContent } from "@earendil-works/pi-ai";

export type MemoryOverflowStrategy = "auto-consolidate" | "reject" | "fifo-evict";

export interface MemoryConfig {
  memoryCharLimit: number;
  nudgeInterval: number;
  reviewRecentMessages?: number;
  reviewEnabled: boolean;
  flushOnCompact: boolean;
  flushOnShutdown: boolean;
  flushMinTurns: number;
  flushRecentMessages?: number;
  memoryDir?: string;
  memoryOverflowStrategy?: MemoryOverflowStrategy;
  autoConsolidate: boolean;
  correctionDetection: boolean;
  correctionStrongPatterns?: string[];
  correctionWeakPatterns?: string[];
  correctionNegativePatterns?: string[];
  correctionDirectiveWords?: string[];
  failureInjectionEnabled: boolean;
  failureInjectionMaxAgeDays: number;
  failureInjectionMaxEntries: number;
  nudgeToolCalls: number;
  projectsMemoryDir: string;
  projectCharLimit: number;
}

export type MemoryCategory = "failure" | "correction" | "insight" | "preference" | "convention" | "tool-quirk";

export interface MemoryResult {
  success: boolean; error?: string; message?: string; target?: "memory" | "failure";
  entries?: string[]; usage?: string; entry_count?: number;
  evicted_entries?: string[]; evicted_count?: number; matches?: string[];
}

export interface MemorySnapshot { memory: string; }
export interface ConsolidationResult { consolidated: boolean; error?: string; }
export interface DecodedEntry { text: string; created: string; lastReferenced: string; }

export function getMessageText(msg: unknown, max = 500): string | null {
  if (typeof msg !== "object" || msg === null) return null;
  const { role, content } = msg as Record<string, unknown>;
  if (typeof role !== "string") return null;
  if (typeof content === "string") return content.slice(0, max);
  if (Array.isArray(content)) {
    const t = (content as TextContent[]).filter((b): b is TextContent => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
    return t.length > 0 ? t.slice(0, max) : null;
  }
  return null;
}
