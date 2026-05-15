/**
 * Тесты background review — trigger on turn count / tool calls.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { setupBackgroundReview } from "../../src/handlers/background-review.js";

let handlers: Record<string, Function[]>;
let execCalls: any[];

function mockPi(ret = { code: 0, stdout: "Saved", stderr: "" }) {
  return {
    on: (ev: string, fn: Function) => { (handlers[ev] ??= []).push(fn); },
    exec: async (...a: any[]) => { execCalls.push(a); return ret; },
  } as any;
}

function makeBranch(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    type: "message",
    message: { role: i % 2 === 0 ? "user" : "assistant", content: [{ type: "text", text: `Msg ${i}` }] },
  }));
}

const store = { getMemoryEntries: () => ["fact"] } as any;
const config = {
  reviewEnabled: true, nudgeInterval: 3, nudgeToolCalls: 100,
  reviewRecentMessages: 0, memoryCharLimit: 5000,
};

beforeEach(() => { handlers = {}; execCalls = []; });

function fire(ev: string, ...args: any[]) { for (const fn of handlers[ev] ?? []) fn(...args); }

describe("setupBackgroundReview", () => {
  it("does not trigger before nudge interval", async () => {
    const pi = mockPi();
    setupBackgroundReview(pi, store, config as any);
    // 3 user messages for userTurnCount >= 3
    fire("message_end", { message: { role: "user" } }, {});
    fire("message_end", { message: { role: "user" } }, {});
    fire("message_end", { message: { role: "user" } }, {});
    // Only 2 turns — interval is 3
    fire("turn_end", { message: { role: "assistant" } }, { sessionManager: { getBranch: () => makeBranch(6) } });
    fire("turn_end", { message: { role: "assistant" } }, { sessionManager: { getBranch: () => makeBranch(6) } });
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(execCalls.length, 0);
  });

  it("triggers at nudge interval", async () => {
    const pi = mockPi();
    setupBackgroundReview(pi, store, config as any);
    fire("message_end", { message: { role: "user" } }, {});
    fire("message_end", { message: { role: "user" } }, {});
    fire("message_end", { message: { role: "user" } }, {});
    for (let i = 0; i < 3; i++) fire("turn_end", { message: { role: "assistant" } }, { sessionManager: { getBranch: () => makeBranch(6) } });
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(execCalls.length >= 1);
  });

  it("does not trigger when review disabled", async () => {
    const pi = mockPi();
    setupBackgroundReview(pi, store, { ...config, reviewEnabled: false } as any);
    fire("message_end", { message: { role: "user" } }, {});
    fire("message_end", { message: { role: "user" } }, {});
    fire("message_end", { message: { role: "user" } }, {});
    for (let i = 0; i < 5; i++) fire("turn_end", { message: { role: "assistant" } }, { sessionManager: { getBranch: () => makeBranch(6) } });
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(execCalls.length, 0);
  });
});
