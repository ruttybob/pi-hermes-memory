/**
 * Тесты auto-consolidation.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { triggerConsolidation } from "../../src/handlers/auto-consolidate.js";

let execCalls: any[];

function mockPi(ret = { code: 0, stdout: "Consolidated", stderr: "" }) {
  return {
    exec: async (...a: any[]) => { execCalls.push(a); return ret; },
  } as any;
}

const mockStore = {
  getMemoryEntries: () => ["entry 1", "entry 2"],
} as any;

beforeEach(() => { execCalls = []; });

describe("triggerConsolidation", () => {
  it("returns consolidated on success", async () => {
    const r = await triggerConsolidation(mockPi(), mockStore);
    assert.strictEqual(r.consolidated, true);
    assert.strictEqual(execCalls.length, 1);
  });

  it("returns error on non-zero exit", async () => {
    const pi = mockPi({ code: 1, stdout: "", stderr: "error" });
    const r = await triggerConsolidation(pi, mockStore);
    assert.strictEqual(r.consolidated, false);
    assert.ok(r.error);
  });

  it("returns error on exception", async () => {
    const pi = { exec: async () => { throw new Error("timeout"); } } as any;
    const r = await triggerConsolidation(pi, mockStore);
    assert.strictEqual(r.consolidated, false);
    assert.ok(r.error?.includes("timeout"));
  });
});
