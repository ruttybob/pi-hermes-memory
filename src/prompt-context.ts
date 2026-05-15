/**
 * Prompt context — инъекция политики + memory + project block в системный промпт.
 */

import { MEMORY_POLICY_PROMPT } from "./constants.js";
import type { MemoryStore } from "./store/memory-store.js";

export function buildPromptContext(store: MemoryStore, projectStore: MemoryStore | null, projectName: string): string {
  const parts: string[] = [MEMORY_POLICY_PROMPT];
  const memBlock = store.formatForSystemPrompt();
  if (memBlock) parts.push(memBlock);
  if (projectStore) {
    const pBlock = projectStore.formatProjectBlock(projectName);
    if (pBlock) parts.push(pBlock);
  }
  return parts.join("\n\n");
}
