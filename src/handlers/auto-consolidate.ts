/**
 * Auto-consolidation — сжатие памяти при переполнении через pi.exec().
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MemoryStore } from "../store/memory-store.js";
import { CONSOLIDATION_PROMPT, ENTRY_DELIMITER } from "../constants.js";
import type { ConsolidationResult } from "../types.js";

export async function triggerConsolidation(pi: ExtensionAPI, store: MemoryStore, signal?: AbortSignal): Promise<ConsolidationResult> {
  const prompt = [CONSOLIDATION_PROMPT, "", "--- Current Memory Entries ---",
    store.getMemoryEntries().join(ENTRY_DELIMITER) || "(empty)", "", "Use the memory tool to consolidate. Target: 'memory'"].join("\n");
  try {
    const r = await pi.exec("pi", ["-p", "--no-session", prompt], { signal, timeout: 60000 });
    return r.code === 0 ? { consolidated: true } : { consolidated: false, error: `Exit ${r.code}: ${r.stderr?.slice(0, 200)}` };
  } catch (e) { return { consolidated: false, error: String(e).slice(0, 200) }; }
}

export function registerConsolidateCommand(pi: ExtensionAPI, store: MemoryStore): void {
  pi.registerCommand("memory-pack", {
    description: "Manually trigger memory consolidation to free up space",
    handler: async (_args: any, ctx: any) => {
      if (!store.getMemoryEntries().length) { ctx.ui.notify("Memory is empty — nothing to pack.", "info"); return; }
      ctx.ui.notify("Packing memory...", "info");
      const r = await triggerConsolidation(pi, store, ctx.signal);
      if (r.consolidated) { await store.loadFromDisk(); ctx.ui.notify("Memory packed.", "info"); }
      else ctx.ui.notify(`Pack failed: ${r.error}`, "warning");
    },
  });
}
