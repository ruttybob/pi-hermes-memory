/**
 * Тесты системного промпта — frozen snapshot, формат блоков.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../../src/store/memory-store.js";
import type { MemoryConfig } from "../../src/types.js";

const TMP = path.join(os.tmpdir(), `self-memory-sysprompt-${process.pid}`);

const cfg = (): MemoryConfig => ({
  memoryCharLimit: 500, nudgeInterval: 10, reviewEnabled: true,
  flushOnCompact: true, flushOnShutdown: true, flushMinTurns: 6,
  autoConsolidate: true, correctionDetection: true, failureInjectionEnabled: true,
  failureInjectionMaxAgeDays: 7, failureInjectionMaxEntries: 5, nudgeToolCalls: 15,
  memoryDir: TMP,
});

before(async () => { await fs.mkdir(TMP, { recursive: true }); });
after(async () => { await fs.rm(TMP, { recursive: true, force: true }); });

describe("system prompt", () => {
  beforeEach(async () => {
    try { await fs.rm(TMP, { recursive: true, force: true }); } catch { /* */ }
    await fs.mkdir(TMP, { recursive: true });
  });

  it("frozen snapshot — not affected by later writes", async () => {
    const s = new MemoryStore(cfg());
    await s.loadFromDisk();
    const before = s.formatForSystemPrompt();
    await s.add("memory", "new fact after snapshot");
    const after = s.formatForSystemPrompt();
    assert.strictEqual(before, after);
    assert.ok(!before.includes("new fact after snapshot"));
  });

  it("includes usage percentage", async () => {
    const s = new MemoryStore(cfg());
    await s.loadFromDisk();
    await s.add("memory", "fact");
    // Reload to capture new snapshot
    await s.loadFromDisk();
    const p = s.formatForSystemPrompt();
    assert.match(p, /\d+% — \d+\/500 chars/);
  });
});
