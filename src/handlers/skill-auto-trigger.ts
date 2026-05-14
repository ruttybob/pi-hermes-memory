/**
 * Skill auto-trigger — after complex sessions (8+ tool calls, 2+ distinct tool types),
 * triggers automatic skill extraction via a detached background subprocess on session shutdown.
 *
 * The subprocess does NOT block Pi exit — it uses child_process.spawn with detached + unref.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { MemoryStore } from "../store/memory-store.js";
import { SkillStore } from "../store/skill-store.js";
import { DEFAULT_SKILL_TRIGGER_TOOL_CALLS, ENTRY_DELIMITER } from "../constants.js";
import type { MemoryConfig } from "../types.js";
import { getMessageText } from "../types.js";
import { collectMessageParts } from "./message-parts.js";
import { spawnSkillExtraction } from "./skill-extract.js";

export function setupSkillAutoTrigger(
  pi: ExtensionAPI,
  store: MemoryStore,
  skillStore: SkillStore,
  config: MemoryConfig,
): void {
  // Accumulate tool calls across the entire session
  let toolCallCount = 0;
  const toolTypes = new Set<string>();
  let sessionHadComplexTask = false;

  // Cache conversation context for shutdown (sessionManager may be stale at that point)
  let cachedParts: string[] = [];

  // Phase 1: turn_end — count tool calls, cache conversation, set flag
  pi.on("turn_end", async (event, ctx) => {
    if (sessionHadComplexTask) return;

    // Count tool calls from this turn's message only
    try {
      const msg = event.message;
      if (msg?.role === "assistant") {
        const content = msg?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === "object" && block.type === "toolCall") {
              toolCallCount++;
              if ((block as { name?: string }).name) toolTypes.add((block as { name: string }).name);
            }
          }
        }
      }
    } catch {
      return;
    }

    // Cache recent conversation parts for shutdown use
    try {
      const branch = ctx.sessionManager.getBranch();
      cachedParts = collectMessageParts(branch, 10);
    } catch {
      // Session may be stale — ignore
    }

    // Require 8+ tool calls AND 2+ distinct tool types
    if (toolCallCount >= DEFAULT_SKILL_TRIGGER_TOOL_CALLS && toolTypes.size >= 2) {
      sessionHadComplexTask = true;
    }
  });

  // Phase 2: session_shutdown — launch detached subprocess for skill extraction
  pi.on("session_shutdown", async (_event, _ctx) => {
    if (!sessionHadComplexTask) return;

    if (cachedParts.length < 4) return;

    try {
      const currentMemory = store.getMemoryEntries().join(ENTRY_DELIMITER);
      const skillIndex = await skillStore.loadIndex();
      const skillSummary = skillIndex.map((s) => `${s.fileName}: ${s.name} - ${s.description}`).join("\n");

      const prompt = [
        "This was a complex session that required multiple tool calls. Extract any reusable procedures as skills.",
        "",
        "--- Existing Skills ---",
        skillSummary || "(none)",
        "",
        "--- Current Memory ---",
        currentMemory || "(empty)",
        "",
        "--- Session Context ---",
        cachedParts.join("\n\n"),
        "",
        "If a skill should be created, use the skill tool with action 'create'.",
        "If a related skill already exists, use 'patch' to update it.",
        "If nothing reusable happened, say 'Nothing to extract.' and stop.",
      ].join("\n");

      // Fire-and-forget: detached subprocess does NOT block Pi exit
      spawnSkillExtraction(prompt);
    } catch {
      // Best-effort — never block shutdown
    }
  });
}
