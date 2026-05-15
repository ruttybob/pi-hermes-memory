/**
 * Prompt context — инъекция политики памяти + failure entries в системный промпт.
 */

import { MEMORY_POLICY_PROMPT } from "./constants.js";
import type { MemoryStore } from "./store/memory-store.js";

export function buildPromptContext(store: MemoryStore): string {
  const policy = MEMORY_POLICY_PROMPT;
  const memoryBlock = store.formatForSystemPrompt();
  return memoryBlock ? `${policy}\n\n${memoryBlock}` : policy;
}
