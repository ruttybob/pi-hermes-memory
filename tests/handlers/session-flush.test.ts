/**
 * Тесты session flush.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupSessionFlush } from "../../src/handlers/session-flush.js";

let handlers: Record<string, Function[]>;
let execCalls: any[];

function mockPi() {
  return {
    on: (ev: string, fn: Function) => { (handlers[ev] ??= []).push(fn); },
    exec: async (...a: any[]) => { execCalls.push(a); return { code: 0, stdout: "", stderr: "" }; },
  } as any;
}

function makeBranch(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    type: "message", message: { role: i % 2 === 0 ? "user" : "assistant", content: [{ type: "text", text: `msg ${i}` }] },
  }));
}

const store = {} as any;
const config = {
  flushOnCompact: true, flushOnShutdown: true, flushMinTurns: 3,
  flushRecentMessages: 0, memoryCharLimit: 5000,
};

beforeEach(() => { handlers = {}; execCalls = []; });

function fire(ev: string, ...args: any[]) { for (const fn of handlers[ev] ?? []) fn(...args); }

describe("setupSessionFlush", () => {
  it("flushes on session_before_compact", async () => {
    const pi = mockPi();
    setupSessionFlush(pi, store, config as any);
    // 4 user messages → exceeds flushMinTurns=3
    for (let i = 0; i < 4; i++) fire("message_end", { message: { role: "user" } }, {});
    fire("session_before_compact", { signal: undefined }, { sessionManager: { getBranch: () => makeBranch(8) } });
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(execCalls.length >= 1);
  });

  it("does NOT flush when too few turns", async () => {
    const pi = mockPi();
    setupSessionFlush(pi, store, config as any);
    fire("message_end", { message: { role: "user" } }, {});
    fire("session_before_compact", { signal: undefined }, { sessionManager: { getBranch: () => makeBranch(4) } });
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(execCalls.length, 0);
  });
});
