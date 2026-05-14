/**
 * Skill extraction — manual /memory-skill-extract command
 * and background subprocess triggered on session shutdown.
 *
 * Design:
 * - Manual command: /memory-skill-extract — runs immediately, shows result
 * - Auto-trigger: session_shutdown fires a detached subprocess
 *   that does NOT block Pi exit (child_process.spawn + unref)
 */

import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { MemoryStore } from "../store/memory-store.js";
import { SkillStore } from "../store/skill-store.js";
import { ENTRY_DELIMITER } from "../constants.js";
import type { MemoryConfig } from "../types.js";
import { getMessageText } from "../types.js";
import { collectMessageParts } from "./message-parts.js";

/**
 * Build the skill extraction prompt from session context.
 * Returns null if there's nothing to review.
 */
async function buildExtractionPrompt(
  store: MemoryStore,
  skillStore: SkillStore,
  parts: string[],
): Promise<string> {
  const currentMemory = store.getMemoryEntries().join(ENTRY_DELIMITER);
  const skillIndex = await skillStore.loadIndex();
  const skillSummary = skillIndex.map((s) => `${s.fileName}: ${s.name} - ${s.description}`).join("\n");

  return [
    "This was a complex session. Extract any reusable procedures as skills.",
    "",
    "--- Existing Skills ---",
    skillSummary || "(none)",
    "",
    "--- Current Memory ---",
    currentMemory || "(empty)",
    "",
    "--- Session Context ---",
    parts.join("\n\n"),
    "",
    "If a skill should be created, use the skill tool with action 'create'.",
    "If a related skill already exists, use 'patch' to update it.",
    "If nothing reusable happened, say 'Nothing to extract.' and stop.",
  ].join("\n");
}

/**
 * Spawn a detached subprocess that runs skill extraction.
 * Does NOT block the parent process — uses child.unref().
 */
export function spawnSkillExtraction(prompt: string): void {
  const child = spawn("pi", ["-p", "--no-session", prompt], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

/**
 * Register /memory-skill-extract command for manual skill extraction.
 */
export function registerSkillExtractCommand(
  pi: ExtensionAPI,
  store: MemoryStore,
  skillStore: SkillStore,
  config: MemoryConfig,
): void {
  pi.registerCommand("memory-skill-extract", {
    description: "Manually extract reusable skills from the current session",
    handler: async (_args, ctx) => {
      try {
        const branch = ctx.sessionManager.getBranch();
        const parts = collectMessageParts(branch, 20);

        if (parts.length < 4) {
          ctx.ui.notify("⚠️ Not enough conversation to extract skills.", "info");
          return;
        }

        const prompt = await buildExtractionPrompt(store, skillStore, parts);

        ctx.ui.notify("🧠 Extracting skills from session...", "info");

        const result = await pi.exec("pi", ["-p", "--no-session", prompt], {
          signal: ctx.signal,
          timeout: 120000,
        });

        if (result.code === 0 && result.stdout) {
          const output = result.stdout.trim();
          if (output && !output.toLowerCase().includes("nothing to extract")) {
            ctx.ui.notify("✅ Skill extraction complete — check /memory-skills", "info");
          } else {
            ctx.ui.notify("ℹ️ No reusable skills found in this session.", "info");
          }
        } else {
          ctx.ui.notify(
            `❌ Skill extraction failed: ${result.stderr?.slice(0, 200) || "unknown error"}`,
            "info",
          );
        }
      } catch (err) {
        ctx.ui.notify(
          `❌ Skill extraction error: ${err instanceof Error ? err.message : String(err)}`,
          "info",
        );
      }
    },
  });
}
