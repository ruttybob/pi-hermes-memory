import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPromptContext } from "../../src/prompt-context.js";
import { MEMORY_POLICY_PROMPT } from "../../src/constants.js";

describe("buildPromptContext", () => {
  const store = {
    formatForSystemPrompt: () => "<memory-context>MEMORY</memory-context>",
  } as any;

  it("returns policy + memory block", () => {
    const result = buildPromptContext(store);
    assert.ok(result.startsWith(MEMORY_POLICY_PROMPT));
    assert.match(result, /MEMORY/);
  });

  it("returns policy only when no memory", () => {
    const emptyStore = { formatForSystemPrompt: () => "" } as any;
    const result = buildPromptContext(emptyStore);
    assert.strictEqual(result, MEMORY_POLICY_PROMPT);
  });
});
