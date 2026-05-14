/**
 * Unit tests for skill-extract — /memory-skill-extract command
 * and spawnSkillExtraction().
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerSkillExtractCommand, spawnSkillExtraction } from "../../src/handlers/skill-extract.js";

// ─── Mock infrastructure ───

let commands: { name: string; handler: Function }[];
let execCalls: any[];
let notifyCalls: { message: string; severity: string }[];

function createMockPi(execReturn?: { code: number; stdout: string; stderr: string }) {
  const ret = execReturn ?? { code: 0, stdout: "Skill created", stderr: "" };
  return {
    registerCommand: (name: string, def: any) => {
      commands.push({ name, handler: def.handler });
    },
    registerTool: () => {},
    exec: async (...args: any[]) => {
      execCalls.push(args);
      return ret;
    },
  } as any;
}

function createMockCtx(branch: any[]) {
  return {
    sessionManager: {
      getBranch: () => branch,
    },
    signal: undefined as any,
    ui: {
      notify: (message: string, severity: string) => {
        notifyCalls.push({ message, severity });
      },
      select: async () => "",
    },
  };
}

const mockStore = {
  getMemoryEntries: () => ["existing entry"],
} as any;

const mockSkillStore = {
  loadIndex: async () => [
    { fileName: "debug-ts.md", name: "Debug TypeScript", description: "How to debug TS" },
  ],
} as any;

const config = {
  nudgeInterval: 10,
  reviewEnabled: false,
  memoryCharLimit: 5000,
  projectCharLimit: 5000,
  flushOnCompact: false,
  flushOnShutdown: false,
} as any;

function makeBranch(messageCount: number): any[] {
  const messages: any[] = [];
  for (let i = 0; i < messageCount; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    messages.push({
      type: "message",
      message: { role, content: [{ type: "text", text: `Message ${i}: some content` }] },
    });
  }
  return messages;
}

// ─── Tests ───

describe("registerSkillExtractCommand", () => {
  beforeEach(() => {
    commands = [];
    execCalls = [];
    notifyCalls = [];
  });

  it("registers command with name 'memory-skill-extract'", () => {
    const pi = createMockPi();
    registerSkillExtractCommand(pi, mockStore, mockSkillStore, config);
    assert.strictEqual(commands.length, 1);
    assert.strictEqual(commands[0].name, "memory-skill-extract");
  });

  it("warns when not enough conversation (< 4 messages)", async () => {
    const pi = createMockPi();
    registerSkillExtractCommand(pi, mockStore, mockSkillStore, config);

    const ctx = createMockCtx(makeBranch(2));
    await commands[0].handler([], ctx);

    assert.strictEqual(notifyCalls.length, 1);
    assert.ok(notifyCalls[0].message.includes("Not enough conversation"));
    assert.strictEqual(execCalls.length, 0, "should NOT call pi.exec with < 4 messages");
  });

  it("calls pi.exec when enough conversation exists", async () => {
    const pi = createMockPi();
    registerSkillExtractCommand(pi, mockStore, mockSkillStore, config);

    const ctx = createMockCtx(makeBranch(6));
    await commands[0].handler([], ctx);

    assert.strictEqual(execCalls.length, 1, "should call pi.exec once");
    assert.strictEqual(notifyCalls.length, 2, "should notify: extracting + result");

    // First notification: "Extracting..."
    assert.ok(notifyCalls[0].message.includes("Extracting skills"));

    // Second notification: success
    assert.ok(notifyCalls[1].message.includes("Skill extraction complete"));
  });

  it("shows 'no skills found' when pi returns 'Nothing to extract'", async () => {
    const pi = createMockPi({ code: 0, stdout: "Nothing to extract.", stderr: "" });
    registerSkillExtractCommand(pi, mockStore, mockSkillStore, config);

    const ctx = createMockCtx(makeBranch(6));
    await commands[0].handler([], ctx);

    assert.ok(
      notifyCalls[1].message.includes("No reusable skills found"),
      `Expected 'No reusable skills found', got: ${notifyCalls[1].message}`,
    );
  });

  it("shows error when pi.exec fails", async () => {
    const pi = createMockPi({ code: 1, stdout: "", stderr: "timeout" });
    registerSkillExtractCommand(pi, mockStore, mockSkillStore, config);

    const ctx = createMockCtx(makeBranch(6));
    await commands[0].handler([], ctx);

    assert.ok(
      notifyCalls[1].message.includes("Skill extraction failed"),
      `Expected failure message, got: ${notifyCalls[1].message}`,
    );
    assert.ok(notifyCalls[1].message.includes("timeout"));
  });

  it("handles exception in handler gracefully", async () => {
    const pi = createMockPi();
    registerSkillExtractCommand(pi, mockStore, mockSkillStore, config);

    // ctx with a broken sessionManager
    const ctx = {
      sessionManager: { getBranch: () => { throw new Error("session gone"); } },
      signal: undefined,
      ui: {
        notify: (message: string, severity: string) => notifyCalls.push({ message, severity }),
      },
    };

    await commands[0].handler([], ctx);

    assert.strictEqual(notifyCalls.length, 1);
    assert.ok(notifyCalls[0].message.includes("Skill extraction error"));
  });

  it("includes existing skills and memory in the prompt", async () => {
    const pi = createMockPi();
    registerSkillExtractCommand(pi, mockStore, mockSkillStore, config);

    const ctx = createMockCtx(makeBranch(6));
    await commands[0].handler([], ctx);

    const execArgs = execCalls[0];
    // execCalls[0] = ["pi", ["-p", "--no-session", prompt], {timeout: ...}]
    const prompt = execArgs[1][2] as string;

    assert.ok(prompt.includes("Debug TypeScript"), "prompt should include skill summary");
    assert.ok(prompt.includes("existing entry"), "prompt should include memory entries");
    assert.ok(prompt.includes("Session Context"), "prompt should include session context");
    assert.ok(prompt.includes("Nothing to extract"), "prompt should include fallback instruction");
  });
});
