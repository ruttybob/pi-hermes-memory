/**
 * Background review — авто-сохранение памяти каждые N ходов через pi.exec().
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MemoryStore } from "../store/memory-store.js";
import { REVIEW_PROMPT } from "../constants.js";
import type { MemoryConfig } from "../types.js";
import { applyRecentMessageLimit, collectMessageParts } from "./message-parts.js";
import { memNotify } from "../mem-notify.js";

export function setupBackgroundReview(pi: ExtensionAPI, store: MemoryStore, config: MemoryConfig): void {
  let turns = 0, toolCalls = 0, userTurns = 0, busy = false;

  pi.on("message_end", async (e) => { if (e.message.role === "user") userTurns++; });
  pi.on("turn_end", async (event, ctx) => {
    turns++;
    if (!config.reviewEnabled || busy) return;
    try {
      const c = (event.message as any)?.content;
      if (Array.isArray(c)) for (const b of c) if (b?.type === "toolCall") toolCalls++;
    } catch { /* */ }
    if (!(turns >= config.nudgeInterval) && !(toolCalls >= config.nudgeToolCalls)) return;
    if (userTurns < 3) return;
    turns = 0; toolCalls = 0; busy = true;

    let parts: string[];
    try { parts = collectMessageParts(ctx.sessionManager.getBranch()); } catch { busy = false; return; }
    if (parts.length < 4) { busy = false; return; }

    const prompt = [REVIEW_PROMPT, "", "--- Current Memory ---", store.getMemoryEntries().join("\n§\n") || "(empty)", "",
      "--- Conversation to Review ---", applyRecentMessageLimit(parts, config.reviewRecentMessages).join("\n\n")].join("\n");

    pi.exec("pi", ["-p", "--no-session", prompt], { signal: undefined, timeout: 120000 })
      .then((r) => { busy = false; if (r.code === 0 && r.stdout?.trim() && !r.stdout.toLowerCase().includes("nothing to save")) memNotify(ctx, "Memory auto-reviewed"); })
      .catch(() => { busy = false; });
  });
}
