import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPromptContext } from "../../src/prompt-context.js";
import { MEMORY_POLICY_PROMPT, MEMORY_POLICY_PROMPT_COMPACT } from "../../src/constants.js";

describe("buildPromptContext", () => {
  const store = {
    formatForSystemPrompt: () => "<memory-context>MEMORY</memory-context>",
  } as any;

  const projectStore = {
    formatProjectBlock: (projectName: string) => `<memory-context>PROJECT ${projectName}</memory-context>`,
  } as any;

  const skillStore = {
    formatIndexForSystemPrompt: async () => "<memory-context>SKILLS</memory-context>",
  } as any;

  it("returns policy only in policy-only mode", async () => {
    const result = await buildPromptContext(
      { memoryMode: "policy-only" },
      store,
      projectStore,
      skillStore,
      "demo",
    );

    assert.strictEqual(result, MEMORY_POLICY_PROMPT);
    assert.match(result, /Memory write targets/);
    assert.match(result, /Accepted memory categories/);
    assert.doesNotMatch(result, /<available-memory-tools>/);
    assert.doesNotMatch(result, /MEMORY<\/memory-context>/);
    assert.doesNotMatch(result, /PROJECT demo/);
    assert.doesNotMatch(result, /SKILLS/);
  });

  it("returns the full policy prompt when policy style is full", async () => {
    const result = await buildPromptContext(
      { memoryMode: "policy-only", memoryPolicyStyle: "full" },
      store,
      projectStore,
      skillStore,
      "demo",
    );

    assert.strictEqual(result, MEMORY_POLICY_PROMPT);
  });

  it("returns the compact policy prompt when policy style is compact", async () => {
    const result = await buildPromptContext(
      { memoryMode: "policy-only", memoryPolicyStyle: "compact" },
      store,
      projectStore,
      skillStore,
      "demo",
    );

    assert.strictEqual(result, MEMORY_POLICY_PROMPT_COMPACT);
    assert.match(result, /memory tool/);
    assert.doesNotMatch(result, /MEMORY<\/memory-context>/);
    assert.doesNotMatch(result, /PROJECT demo/);
    assert.doesNotMatch(result, /SKILLS/);
  });

  it("returns custom policy text when policy style is custom", async () => {
    const customText = "<memory-policy>Use local custom policy.</memory-policy>";
    const result = await buildPromptContext(
      { memoryMode: "policy-only", memoryPolicyStyle: "custom", memoryPolicyCustomText: customText },
      store,
      projectStore,
      skillStore,
      "demo",
    );

    assert.strictEqual(result, customText);
  });

  it("falls back to compact policy when custom policy text is blank", async () => {
    const result = await buildPromptContext(
      { memoryMode: "policy-only", memoryPolicyStyle: "custom", memoryPolicyCustomText: "  \n\t  " },
      store,
      projectStore,
      skillStore,
      "demo",
    );

    assert.strictEqual(result, MEMORY_POLICY_PROMPT_COMPACT);
  });

  it("returns empty context when policy style is none", async () => {
    const result = await buildPromptContext(
      { memoryMode: "policy-only", memoryPolicyStyle: "none" },
      store,
      projectStore,
      skillStore,
      "demo",
    );

    assert.strictEqual(result, "");
  });

  it("returns legacy memory blocks in legacy-inject mode", async () => {
    const result = await buildPromptContext(
      { memoryMode: "legacy-inject", memoryPolicyStyle: "compact" },
      store,
      projectStore,
      skillStore,
      "demo",
    );

    assert.match(result, /MEMORY/);
    assert.match(result, /PROJECT demo/);
    assert.match(result, /SKILLS/);
    assert.doesNotMatch(result, /<memory-policy>/);
  });
});
