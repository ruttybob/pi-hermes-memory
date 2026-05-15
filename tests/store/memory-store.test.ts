/**
 * Тесты MemoryStore — CRUD, overflow, metadata, persistence.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as assert from "node:assert/strict";
import { describe, before, after, beforeEach, it } from "node:test";
import { MemoryStore, strip, decode, encode } from "../../src/store/memory-store.js";
import { ENTRY_DELIMITER, MEMORY_FILE } from "../../src/constants.js";
import type { MemoryConfig } from "../../src/types.js";

const TMP = path.join(os.tmpdir(), `self-memory-test-${process.pid}`);
const CFG: MemoryConfig = {
  memoryCharLimit: 500, nudgeInterval: 10, reviewEnabled: true,
  flushOnCompact: true, flushOnShutdown: true, flushMinTurns: 6,
  autoConsolidate: true, correctionDetection: true, failureInjectionEnabled: true,
  failureInjectionMaxAgeDays: 7, failureInjectionMaxEntries: 5, nudgeToolCalls: 15,
  memoryDir: TMP,
};

before(async () => { await fs.mkdir(TMP, { recursive: true }); });
after(async () => { await fs.rm(TMP, { recursive: true, force: true }); });

async function freshStore(): Promise<MemoryStore> {
  const s = new MemoryStore(CFG);
  await s.loadFromDisk();
  return s;
}

describe("MemoryStore", () => {
  beforeEach(async () => {
    try { await fs.rm(TMP, { recursive: true, force: true }); } catch { /* */ }
    await fs.mkdir(TMP, { recursive: true });
  });

  it("loads empty store", async () => {
    const s = await freshStore();
    assert.deepStrictEqual(s.getMemoryEntries(), []);
  });

  it("adds entry", async () => {
    const s = await freshStore();
    const r = await s.add("memory", "test fact");
    assert.ok(r.success);
    assert.deepStrictEqual(s.getMemoryEntries(), ["test fact"]);
  });

  it("rejects duplicate", async () => {
    const s = await freshStore();
    await s.add("memory", "test fact");
    const r = await s.add("memory", "test fact");
    assert.ok(r.success);
    assert.strictEqual(r.message, "Entry already exists (no duplicate added).");
  });

  it("rejects empty", async () => {
    const s = await freshStore();
    const r = await s.add("memory", "  ");
    assert.ok(!r.success);
  });

  it("persists to disk", async () => {
    const s = await freshStore();
    await s.add("memory", "persisted fact");
    const raw = await fs.readFile(path.join(TMP, MEMORY_FILE), "utf-8");
    assert.ok(raw.includes("persisted fact"));
    assert.ok(raw.includes("<!-- created="));
  });

  it("reloads from disk", async () => {
    const s1 = await freshStore();
    await s1.add("memory", "fact A");
    const s2 = await freshStore();
    assert.deepStrictEqual(s2.getMemoryEntries(), ["fact A"]);
  });

  it("removes entry", async () => {
    const s = await freshStore();
    await s.add("memory", "to remove");
    const r = await s.remove("memory", "to remove");
    assert.ok(r.success);
    assert.deepStrictEqual(s.getMemoryEntries(), []);
  });

  it("replaces entry preserving created date", async () => {
    const s = await freshStore();
    await s.add("memory", "old text");
    const rawBefore = s.getRawEntries()[0];
    const created = decode(rawBefore).created;
    await s.replace("memory", "old text", "new text");
    assert.deepStrictEqual(s.getMemoryEntries(), ["new text"]);
    const rawAfter = s.getRawEntries()[0];
    assert.strictEqual(decode(rawAfter).created, created);
  });

  it("addFailure saves to failures.md", async () => {
    const s = await freshStore();
    await s.addFailure("tried X — failed", { category: "failure", failureReason: "X crashed" });
    const f = s.getFailureEntries(7);
    assert.strictEqual(f.length, 1);
    assert.ok(f[0].includes("[failure]"));
  });

  it("formatForSystemPrompt includes memory block", async () => {
    const s = await freshStore();
    await s.add("memory", "test fact");
    await s.loadFromDisk(); // reload to capture snapshot
    const p = s.formatForSystemPrompt();
    assert.ok(p.includes("<memory-context>"));
    assert.ok(p.includes("test fact"));
  });

  it("formatForSystemPrompt includes failures", async () => {
    const s = await freshStore();
    await s.addFailure("lesson learned", { category: "insight" });
    await s.loadFromDisk(); // reload to capture snapshot
    const p = s.formatForSystemPrompt();
    assert.ok(p.includes("lesson learned"));
  });

  it("removeByIndex", async () => {
    const s = await freshStore();
    await s.add("memory", "A");
    await s.add("memory", "B");
    assert.ok(await s.removeByIndex(0));
    assert.deepStrictEqual(s.getMemoryEntries(), ["B"]);
  });

  it("replaceByIndex", async () => {
    const s = await freshStore();
    await s.add("memory", "old");
    assert.ok(await s.replaceByIndex(0, "new"));
    assert.deepStrictEqual(s.getMemoryEntries(), ["new"]);
  });

  it("fifo eviction when overflow", async () => {
    const cfg = { ...CFG, memoryCharLimit: 100, memoryOverflowStrategy: "fifo-evict" as const };
    const s = new MemoryStore(cfg);
    await s.loadFromDisk();
    await s.add("memory", "A".repeat(40));
    await s.add("memory", "B".repeat(40));
    const r = await s.add("memory", "C".repeat(40));
    assert.ok(r.success);
    assert.ok((r as any).evicted_count >= 1);
  });

  it("auto-consolidate triggers on overflow", async () => {
    let called = false;
    const cfg = { ...CFG, memoryCharLimit: 100, memoryOverflowStrategy: "auto-consolidate" as const };
    const s = new MemoryStore(cfg);
    await s.loadFromDisk();
    s.setConsolidator(async () => { called = true; return { consolidated: true }; });
    await s.add("memory", "A".repeat(80));
    const r = await s.add("memory", "B".repeat(80));
    assert.ok(called);
  });

  it("rejects when memory full and no consolidation", async () => {
    const cfg = { ...CFG, memoryCharLimit: 50, memoryOverflowStrategy: "reject" as const };
    const s = new MemoryStore(cfg);
    await s.loadFromDisk();
    await s.add("memory", "A".repeat(40));
    const r = await s.add("memory", "B".repeat(40));
    assert.ok(!r.success);
  });
});

describe("encode/decode/strip", () => {
  it("roundtrip", () => {
    const e = encode("hello", "2025-01-01", "2025-01-02");
    const d = decode(e);
    assert.strictEqual(d.text, "hello");
    assert.strictEqual(d.created, "2025-01-01");
    assert.strictEqual(d.lastReferenced, "2025-01-02");
    assert.strictEqual(strip(e), "hello");
  });

  it("decode without metadata", () => {
    const d = decode("plain text");
    assert.strictEqual(d.text, "plain text");
  });
});
