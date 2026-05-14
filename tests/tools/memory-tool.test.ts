/**
 * Unit tests for memory tool registration and execute function.
 * Markdown-only fork — no SQLite sync.
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { registerMemoryTool } from "../../src/tools/memory-tool.js";
import { MemoryStore } from "../../src/store/memory-store.js";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

describe("registerMemoryTool", () => {
  it("registers tool with name 'memory' and correct parameters", () => {
    const registeredTools: any[] = [];

    const mockPi = {
      registerTool: (def: any) => {
        registeredTools.push(def);
      },
    } as unknown as ExtensionAPI;

    const mockStore = {
      add: () => ({ success: true, target: "memory", entries: ["test"], usage: "10% — 10/100 chars", entry_count: 1 }),
      replace: () => ({ success: true, target: "memory", entries: [], usage: "0% — 0/100 chars", entry_count: 0 }),
      remove: () => ({ success: true, target: "memory", entries: [], usage: "0% — 0/100 chars", entry_count: 0 }),
    } as unknown as MemoryStore;

    registerMemoryTool(mockPi, mockStore, null);

    assert.strictEqual(registeredTools.length, 1, "should register exactly one tool");
    const tool = registeredTools[0];
    assert.strictEqual(tool.name, "memory", "tool name should be 'memory'");
    assert.strictEqual(tool.label, "Memory", "tool label should be 'Memory'");
    assert.ok(tool.description.length > 0, "description should not be empty");
    assert.ok(tool.promptSnippet.length > 0, "promptSnippet should not be empty");
    assert.ok(Array.isArray(tool.promptGuidelines), "promptGuidelines should be an array");
    assert.ok(tool.parameters, "parameters schema should be defined");
  });

  it("execute add returns JSON with usage field", async () => {
    let capturedResult: any;

    const mockPi = {
      registerTool: (def: any) => {
        capturedResult = def;
      },
    } as unknown as ExtensionAPI;

    const mockStore = {
      add: () => ({
        success: true,
        target: "memory",
        entries: ["Entry one"],
        usage: "5% — 110/5000 chars",
        entry_count: 1,
        message: "Entry added.",
      }),
    } as unknown as MemoryStore;

    registerMemoryTool(mockPi, mockStore, null);
    const result = await capturedResult.execute("tc-1", { action: "add", target: "memory", content: "Entry one" }, undefined as any, undefined as any, undefined as any);

    assert.strictEqual(result.content[0].type, "text", "content should be text type");
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.success, true, "result should be success");
    assert.ok(parsed.usage.includes("chars"), "usage should contain 'chars'");
    assert.ok(parsed.usage.includes("5000"), "usage should show total limit");
    assert.strictEqual(parsed.entry_count, 1, "entry_count should be 1");
    assert.strictEqual(result.details.success, true, "details should mirror result");
  });

  it("execute add with FIFO evictions returns normal text with full rotated entries", async () => {
    let capturedResult: any;

    const mockPi = {
      registerTool: (def: any) => {
        capturedResult = def;
      },
    } as unknown as ExtensionAPI;

    const evictedOne = "First rotated entry with full detail.";
    const evictedTwo = "Second rotated entry with\nmultiple lines preserved.";
    const mockStore = {
      add: () => ({
        success: true,
        target: "memory",
        entries: ["New entry"],
        usage: "90% — 4500/5000 chars",
        entry_count: 1,
        message: "Memory updated. Rotated 2 older entries to stay within the limit.",
        evicted_entries: [evictedOne, evictedTwo],
        evicted_count: 2,
      }),
    } as unknown as MemoryStore;

    registerMemoryTool(mockPi, mockStore, null);
    const result = await capturedResult.execute("tc-1", { action: "add", target: "memory", content: "New entry" }, undefined as any, undefined as any, undefined as any);

    const text = result.content[0].text;
    assert.throws(() => JSON.parse(text));
    assert.match(text, /Memory updated\. Rotated 2 older entries/);
    assert.match(text, /Rotated active memory entries:/);
    assert.ok(text.includes(`1. ${evictedOne}`));
    assert.ok(text.includes(`2. ${evictedTwo}`));
    assert.match(text, /If one of these entries should stay active, add it again\./);
    assert.match(text, /Usage: 90%/);
    assert.deepStrictEqual(result.details.evicted_entries, [evictedOne, evictedTwo]);
  });

  it("maps project target to project scope", async () => {
    let capturedResult: any;
    const mockPi = {
      registerTool: (def: any) => {
        capturedResult = def;
      },
    } as unknown as ExtensionAPI;

    const addTargets: string[] = [];
    const mockProjectStore = {
      add: (target: string) => {
        addTargets.push(target);
        return {
          success: true,
          target,
          entries: ["Project entry"],
          usage: "2% — 20/5000 chars",
          entry_count: 1,
          message: "Entry added.",
        };
      },
    } as unknown as MemoryStore;

    registerMemoryTool(mockPi, {} as MemoryStore, mockProjectStore);
    const result = await capturedResult.execute("tc-1", { action: "add", target: "project", content: "Project entry" }, undefined as any, undefined as any, undefined as any);

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.target, 'project');
    assert.strictEqual(result.details.target, 'project');
    assert.deepStrictEqual(addTargets, ['memory']);
  });

  it("execute add without content returns error", async () => {
    let capturedResult: any;

    const mockPi = {
      registerTool: (def: any) => {
        capturedResult = def;
      },
    } as unknown as ExtensionAPI;

    const mockStore = {} as unknown as MemoryStore;

    registerMemoryTool(mockPi, mockStore, null);
    const result = await capturedResult.execute("tc-1", { action: "add", target: "memory" }, undefined as any, undefined as any, undefined as any);

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.success, false, "should fail without content");
    assert.ok(parsed.error.includes("required"), "error should mention required content");
  });

  it("execute replace without old_text returns error", async () => {
    let capturedResult: any;

    const mockPi = {
      registerTool: (def: any) => {
        capturedResult = def;
      },
    } as unknown as ExtensionAPI;

    const mockStore = {} as unknown as MemoryStore;

    registerMemoryTool(mockPi, mockStore, null);
    const result = await capturedResult.execute("tc-1", { action: "replace", target: "memory", content: "new" }, undefined as any, undefined as any, undefined as any);

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.success, false, "should fail without old_text");
    assert.ok(parsed.error.includes("old_text"), "error should mention old_text");
  });

  it("execute remove without old_text returns error", async () => {
    let capturedResult: any;

    const mockPi = {
      registerTool: (def: any) => {
        capturedResult = def;
      },
    } as unknown as ExtensionAPI;

    const mockStore = {} as unknown as MemoryStore;

    registerMemoryTool(mockPi, mockStore, null);
    const result = await capturedResult.execute("tc-1", { action: "remove", target: "memory" }, undefined as any, undefined as any, undefined as any);

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.success, false, "should fail without old_text");
    assert.ok(parsed.error.includes("old_text"), "error should mention old_text");
  });

  it("execute delegates replace to store.replace", async () => {
    let capturedResult: any;
    let replaceArgs: any;

    const mockPi = {
      registerTool: (def: any) => {
        capturedResult = def;
      },
    } as unknown as ExtensionAPI;

    const mockStore = {
      replace: (...args: any[]) => {
        replaceArgs = args;
        return { success: true, target: "memory", entries: ["new"], usage: "5% — 110/5000 chars", entry_count: 1 };
      },
    } as unknown as MemoryStore;

    registerMemoryTool(mockPi, mockStore, null);
    await capturedResult.execute("tc-1", { action: "replace", target: "memory", content: "new", old_text: "old" }, undefined as any, undefined as any, undefined as any);

    assert.deepStrictEqual(replaceArgs, ["memory", "old", "new"], "should pass target, old_text, content to store.replace");
  });

  it("execute delegates remove to store.remove", async () => {
    let capturedResult: any;
    let removeArgs: any;

    const mockPi = {
      registerTool: (def: any) => {
        capturedResult = def;
      },
    } as unknown as ExtensionAPI;

    const mockStore = {
      remove: (...args: any[]) => {
        removeArgs = args;
        return { success: true, target: "memory", entries: [], usage: "0% — 0/5000 chars", entry_count: 0 };
      },
    } as unknown as MemoryStore;

    registerMemoryTool(mockPi, mockStore, null);
    await capturedResult.execute("tc-1", { action: "remove", target: "memory", old_text: "old entry" }, undefined as any, undefined as any, undefined as any);

    assert.deepStrictEqual(removeArgs, ["memory", "old entry"], "should pass target, old_text to store.remove");
  });
});
