/**
 * Session flush — сохранение памяти перед компакцией/завершением.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MemoryStore } from "../store/memory-store.js";
import { FLUSH_PROMPT } from "../constants.js";
import type { MemoryConfig } from "../types.js";
import { collectMessageParts } from "./message-parts.js";

export function setupSessionFlush(pi: ExtensionAPI, store: MemoryStore, config: MemoryConfig): void {
  let userTurnCount = 0;

  pi.on("message_end", async (event) => {
    if (event.message.role === "user") userTurnCount++;
  });

  async function flush(ctx: any, signal?: AbortSignal, timeoutMs = 30000): Promise<void> {
    if (userTurnCount < config.flushMinTurns) return;

    let entries;
    try { entries = ctx.sessionManager.getBranch(); } catch { return; }

    const parts = collectMessageParts(entries, config.flushRecentMessages);
    const message = [FLUSH_PROMPT, "", "--- Conversation ---", parts.join("\n\n")].join("\n");

    try {
      await pi.exec("pi", ["-p", "--no-session", message], { signal, timeout: timeoutMs });
    } catch { /* best-effort */ }
  }

  pi.on("session_before_compact", async (event, ctx) => {
    if (!config.flushOnCompact) return;
    await flush(ctx, event.signal, 30000);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!config.flushOnShutdown) return;
    flush(ctx, undefined, 10000).catch(() => {});
  });
}
