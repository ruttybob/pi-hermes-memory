/**
 * Prompt context — инъекция политики + memory + failures + project block в системный промпт.
 */

import { MEMORY_POLICY_PROMPT } from "./constants.js";
import type { MemoryStore } from "./store/memory-store.js";

export function buildPromptContext(store: MemoryStore, projectStore: MemoryStore | null, projectName: string): string {
  const parts: string[] = [MEMORY_POLICY_PROMPT];

  // Global memory block (no failures — they go to project if available)
  const memOnly = store.formatMemoryBlock();
  if (memOnly) parts.push(memOnly);

  // Project memory + failures (preferred), or global failures if no project
  if (projectStore) {
    const pBlock = projectStore.formatProjectBlock(projectName);
    if (pBlock) parts.push(pBlock);
    const pfBlock = projectStore.formatProjectFailuresBlock(projectName);
    if (pfBlock) parts.push(pfBlock);
  } else {
    // No project — inject global failures
    const failBlock = store.formatFailuresBlock();
    if (failBlock) parts.push(failBlock);
  }

  return parts.join("\n\n");
}
