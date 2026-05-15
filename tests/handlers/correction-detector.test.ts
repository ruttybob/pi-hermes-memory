/**
 * Тесты correction detection — isCorrection() + handler.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isCorrection, setupCorrectionDetector } from "../../src/handlers/correction-detector.js";

// ─── Pattern matching tests ───

describe("isCorrection", () => {
  // Strong
  describe("strong patterns", () => {
    it("matches 'don't do that'", () => assert.strictEqual(isCorrection("don't do that"), true));
    it("matches 'not like that'", () => assert.strictEqual(isCorrection("not like that"), true));
    it("matches 'I said use yarn'", () => assert.strictEqual(isCorrection("I said use yarn"), true));
    it("matches 'please don't commit yet'", () => assert.strictEqual(isCorrection("please don't commit yet"), true));
    it("matches 'я же говорил тебе'", () => assert.strictEqual(isCorrection("я же говорил тебе"), true));
    it("matches 'мы уже обсуждали'", () => assert.strictEqual(isCorrection("мы уже обсуждали это"), true));
  });

  // Weak + directive
  describe("weak patterns with directive", () => {
    it("matches 'no, use yarn'", () => assert.strictEqual(isCorrection("no, use yarn instead"), true));
    it("matches 'wrong, the file is in src/'", () => assert.strictEqual(isCorrection("wrong, the file is in src/"), true));
    it("matches 'нет, используй pnpm'", () => assert.strictEqual(isCorrection("нет, используй pnpm"), true));
    it("matches 'стоп, исправь это'", () => assert.strictEqual(isCorrection("стоп, исправь это"), true));
  });

  // Negative
  describe("negative patterns", () => {
    it("does not match 'no worries'", () => assert.strictEqual(isCorrection("no worries"), false));
    it("does not match 'no problem'", () => assert.strictEqual(isCorrection("no problem"), false));
    it("does not match 'actually looks great'", () => assert.strictEqual(isCorrection("actually looks great"), false));
    it("does not match 'нет, проблем нет'", () => assert.strictEqual(isCorrection("нет, проблем нет"), false));
  });

  // Normal messages
  describe("normal messages", () => {
    it("does not match 'looks good'", () => assert.strictEqual(isCorrection("looks good"), false));
    it("does not match 'thanks'", () => assert.strictEqual(isCorrection("thanks"), false));
    it("does not match 'отлично'", () => assert.strictEqual(isCorrection("отлично"), false));
  });
});

// ─── Handler tests ───

describe("setupCorrectionDetector handler", () => {
  let handlers: Record<string, Function[]>;
  let execCalls: any[];

  function mockPi(execReturn = { code: 0, stdout: "Saved", stderr: "" }) {
    return {
      on: (ev: string, fn: Function) => { (handlers[ev] ??= []).push(fn); },
      exec: async (...a: any[]) => { execCalls.push(a); return execReturn; },
    } as any;
  }

  const mockStore = {
    getMemoryEntries: () => ["existing"],
    addFailure: async () => ({ success: true }),
  } as any;

  const config = {
    correctionDetection: true, nudgeInterval: 10, reviewEnabled: false,
    memoryCharLimit: 5000, flushOnCompact: false, flushOnShutdown: false,
    flushMinTurns: 6, autoConsolidate: false, nudgeToolCalls: 15,
  };

  function makeCtx(branch: any[] = []) {
    return {
      sessionManager: { getBranch: () => branch },
      signal: undefined, ui: { notify: () => {} },
    };
  }

  function fire(ev: string, ...args: any[]) {
    for (const fn of handlers[ev] ?? []) fn(...args);
  }

  beforeEach(() => { handlers = {}; execCalls = []; });

  it("triggers pi.exec on correction", async () => {
    const pi = mockPi();
    setupCorrectionDetector(pi, mockStore, config);
    const branch = [{ type: "message", message: { role: "user", content: [{ type: "text", text: "don't do that" }] } }];
    fire("message_end", { message: { role: "user", content: [{ type: "text", text: "don't do that" }] } }, makeCtx());
    fire("turn_end", {}, makeCtx(branch));
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(execCalls.length >= 1);
  });

  it("does NOT trigger on normal messages", async () => {
    const pi = mockPi();
    setupCorrectionDetector(pi, mockStore, config);
    fire("message_end", { message: { role: "user", content: [{ type: "text", text: "looks good" }] } }, makeCtx());
    fire("turn_end", {}, makeCtx([]));
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(execCalls.length, 0);
  });

  it("no handlers when disabled", () => {
    const pi = mockPi();
    setupCorrectionDetector(pi, mockStore, { ...config, correctionDetection: false });
    assert.strictEqual(Object.keys(handlers).length, 0);
  });
});
