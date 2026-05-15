import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig } from "../src/config.js";

const TMP = path.join(os.tmpdir(), `self-memory-cfg-${process.pid}.json`);
afterEach(() => fs.rmSync(TMP, { force: true }));

describe("loadConfig", () => {
  it("returns defaults when no config file", () => {
    const c = loadConfig(TMP);
    assert.strictEqual(c.memoryCharLimit, 5000);
    assert.strictEqual(c.nudgeInterval, 10);
    assert.strictEqual(c.reviewEnabled, true);
    assert.strictEqual(c.flushOnCompact, true);
    assert.strictEqual(c.flushOnShutdown, true);
    assert.strictEqual(c.flushMinTurns, 6);
    assert.strictEqual(c.memoryOverflowStrategy, "auto-consolidate");
    assert.strictEqual(c.autoConsolidate, true);
    assert.strictEqual(c.correctionDetection, true);
    assert.strictEqual(c.failureInjectionEnabled, true);
    assert.strictEqual(c.failureInjectionMaxAgeDays, 7);
    assert.strictEqual(c.failureInjectionMaxEntries, 5);
    assert.strictEqual(c.nudgeToolCalls, 15);
  });

  it("overrides from config file", () => {
    fs.writeFileSync(TMP, JSON.stringify({
      memoryCharLimit: 3000, nudgeInterval: 15, reviewRecentMessages: 25,
      failureInjectionEnabled: false, failureInjectionMaxAgeDays: 30,
      failureInjectionMaxEntries: 2, nudgeToolCalls: 20,
    }));
    const c = loadConfig(TMP);
    assert.strictEqual(c.memoryCharLimit, 3000);
    assert.strictEqual(c.nudgeInterval, 15);
    assert.strictEqual(c.reviewRecentMessages, 25);
    assert.strictEqual(c.failureInjectionEnabled, false);
    assert.strictEqual(c.failureInjectionMaxAgeDays, 30);
    assert.strictEqual(c.failureInjectionMaxEntries, 2);
    assert.strictEqual(c.nudgeToolCalls, 20);
  });

  it("syncs autoConsolidate with overflow strategy", () => {
    fs.writeFileSync(TMP, JSON.stringify({ memoryOverflowStrategy: "reject" }));
    const c = loadConfig(TMP);
    assert.strictEqual(c.memoryOverflowStrategy, "reject");
    assert.strictEqual(c.autoConsolidate, false);
  });

  it("falls back on invalid JSON", () => {
    fs.writeFileSync(TMP, "not json");
    const c = loadConfig(TMP);
    assert.strictEqual(c.memoryCharLimit, 5000);
  });
});
