import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPromptContext } from "../../src/prompt-context.js";
import { MEMORY_POLICY_PROMPT } from "../../src/constants.js";

describe("buildPromptContext", () => {
  const store = {
    formatMemoryBlock: () => "<memory-context>MEMORY</memory-context>",
    formatFailuresBlock: () => "",
  } as any;

  it("returns policy + memory block", () => {
    const result = buildPromptContext(store, null, "");
    assert.ok(result.startsWith(MEMORY_POLICY_PROMPT));
    assert.match(result, /MEMORY/);
  });

  it("returns policy only when no memory", () => {
    const emptyStore = { formatMemoryBlock: () => "", formatFailuresBlock: () => "" } as any;
    const result = buildPromptContext(emptyStore, null, "");
    assert.strictEqual(result, MEMORY_POLICY_PROMPT);
  });

  it("includes project memory + failures when projectStore present", () => {
    const pStore = {
      formatProjectBlock: () => "<memory-context>PROJECT</memory-context>",
      formatProjectFailuresBlock: () => "<memory-context>FAILURES</memory-context>",
    } as any;
    const result = buildPromptContext(store, pStore, "demo");
    assert.match(result, /PROJECT/);
    assert.match(result, /FAILURES/);
  });

  it("includes global failures when no projectStore", () => {
    const s = { formatMemoryBlock: () => "", formatFailuresBlock: () => "<memory-context>FAILURES</memory-context>" } as any;
    const result = buildPromptContext(s, null, "");
    assert.match(result, /FAILURES/);
  });
});
