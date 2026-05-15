/**
 * Pi Self Memory Extension
 *
 * Персистентная память для Pi — Markdown-based, auto-consolidation, correction detection, TUI editor.
 * Команды: /memory, /memory-consolidate, /memory-review.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MemoryStore } from "./store/memory-store.js";
import { setupBackgroundReview } from "./handlers/background-review.js";
import { setupSessionFlush } from "./handlers/session-flush.js";
import { triggerConsolidation, registerConsolidateCommand } from "./handlers/auto-consolidate.js";
import { setupCorrectionDetector } from "./handlers/correction-detector.js";
import { loadConfig } from "./config.js";
import { buildPromptContext } from "./prompt-context.js";
import { REVIEW_PROMPT } from "./constants.js";
import { MemoryList } from "./components/memory-list.js";

export default function (pi: ExtensionAPI) {
  const config = loadConfig();
  const store = new MemoryStore(config);

  // 1. Загрузка при старте
  pi.on("session_start", async () => { await store.loadFromDisk(); });

  // 2. Инъекция в системный промпт
  pi.on("before_agent_start", async (event: any, _ctx: any) => {
    const ctx = buildPromptContext(store);
    pi.events?.emit("system-prompt:injection", { source: "pi-self-memory", label: "Memory Policy + Entries", charCount: ctx.length, preview: ctx.slice(0, 300), fullContent: ctx });
    return { systemPrompt: event.systemPrompt + "\n\n" + ctx };
  });

  // 3-6. Handlers
  setupBackgroundReview(pi, store, config);
  setupSessionFlush(pi, store, config);
  store.setConsolidator(async (t, s) => triggerConsolidation(pi, store, s));
  registerConsolidateCommand(pi, store);
  setupCorrectionDetector(pi, store, config);

  // 7. /memory — TUI просмотр/редактирование
  pi.registerCommand("memory", {
    description: "Browse and edit memory entries with TUI",
    handler: async (_args: any, ctx: any) => {
      await store.loadFromDisk();
      await ctx.ui.custom((tui: any, theme: any, keybindings: any, done: () => void) => {
        const list = new MemoryList({ store, theme, ui: ctx.ui, onClose: () => done() });
        return { render: (w: number) => list.render(w), invalidate: () => list.invalidate(), handleInput: (d: string) => { list.handleInput(d).catch(() => {}); } };
      });
    },
  });

  // 8. /memory-review — ручной ревью
  pi.registerCommand("memory-review", {
    description: "Manually trigger a memory review of the current conversation",
    handler: async (_args: any, ctx: any) => {
      let entries: any[];
      try { entries = ctx.sessionManager.getBranch(); } catch { ctx.ui.notify("No active session.", "info"); return; }
      const { collectMessageParts } = await import("./handlers/message-parts.js");
      const parts = collectMessageParts(entries);
      if (parts.length < 2) { ctx.ui.notify("Not enough conversation.", "info"); return; }
      const prompt = [REVIEW_PROMPT, "", "--- Current Memory ---", store.getMemoryEntries().join("\n§\n") || "(empty)", "",
        "--- Conversation to Review ---", parts.join("\n\n")].join("\n");
      try {
        const r = await pi.exec("pi", ["-p", "--no-session", prompt], { signal: ctx.signal, timeout: 120000 });
        if (r.code === 0 && r.stdout?.trim() && !r.stdout.toLowerCase().includes("nothing to save")) { await store.loadFromDisk(); ctx.ui.notify("✅ Memory reviewed.", "info"); }
        else ctx.ui.notify("ℹ️ Nothing worth saving.", "info");
      } catch { ctx.ui.notify("❌ Review failed.", "info"); }
    },
  });
}
