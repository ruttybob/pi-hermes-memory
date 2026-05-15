/**
 * Correction detection — двухпроходный фильтр: strong → weak+directive → negative suppression.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MemoryStore } from "../store/memory-store.js";
import { CORRECTION_SAVE_PROMPT, CORRECTION_STRONG_PATTERNS, CORRECTION_WEAK_PATTERNS, CORRECTION_NEGATIVE_PATTERNS, CORRECTION_DIRECTIVE_WORDS, ENTRY_DELIMITER } from "../constants.js";
import type { MemoryConfig } from "../types.js";
import { getMessageText } from "../types.js";

function extractDirective(t: string): string { return t.replace(/^(no|wrong|actually|stop|don'?t|that'?s not|I said|I told you)[,\.\s!]+/i, "").replace(/^(please\s+)?/i, "").trim() || t; }
function compile(cfg: string[] | undefined, def: RegExp[]): RegExp[] {
  if (cfg === undefined) return def;
  const r: RegExp[] = []; for (const s of cfg) { try { r.push(new RegExp(s, "i")); } catch { /* */ } } return r;
}
function esc(v: string): string { return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function hasDirective(rem: string, words: string[]): boolean {
  if (!words.length) return false;
  return new RegExp(`(?:^|\\s)(${words.map(esc).join("|")})(?:$|\\s)`, "i").test(rem);
}

type PCfg = Pick<MemoryConfig, "correctionStrongPatterns" | "correctionWeakPatterns" | "correctionNegativePatterns" | "correctionDirectiveWords">;
export function isCorrection(text: string, cfg?: PCfg): boolean {
  const neg = compile(cfg?.correctionNegativePatterns, CORRECTION_NEGATIVE_PATTERNS);
  const strong = compile(cfg?.correctionStrongPatterns, CORRECTION_STRONG_PATTERNS);
  const weak = compile(cfg?.correctionWeakPatterns, CORRECTION_WEAK_PATTERNS);
  const dirs = cfg?.correctionDirectiveWords ?? CORRECTION_DIRECTIVE_WORDS;
  for (const p of neg) if (p.test(text)) return false;
  for (const p of strong) if (p.test(text)) return true;
  for (const p of weak) { if (p.test(text)) { const m = p.exec(text); if (m?.index === 0 && hasDirective(text.slice(m[0].length).trim(), dirs)) return true; } }
  return false;
}

export function setupCorrectionDetector(pi: ExtensionAPI, store: MemoryStore, config: MemoryConfig, projectStore: MemoryStore | null = null): void {
  if (!config.correctionDetection) return;
  let pending = false, turnsSince = 3, busy = false;

  pi.on("message_end", async (event) => {
    if (event.message.role === "user") { const t = getMessageText(event.message); if (t && isCorrection(t, config)) pending = true; }
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!pending) { turnsSince++; return; }
    pending = false;
    if (turnsSince < 3 || busy) return;
    turnsSince = 0; busy = true;
    try {
      const entries = ctx.sessionManager.getBranch();
      const parts: string[] = [];
      for (const e of entries) { if ((e as any).type !== "message") continue; const msg = (e as any).message; const t = getMessageText(msg); if (t) parts.push(`${(msg as any).role === "user" ? "[USER]" : "[ASSISTANT]"}: ${t}`); }
      const recent = parts.slice(-6);
      const prompt = [CORRECTION_SAVE_PROMPT, "", "--- Current Memory ---", store.getMemoryEntries().join(ENTRY_DELIMITER) || "(empty)", "", "--- Recent Conversation ---", recent.join("\n\n")].join("\n");
      const result = await pi.exec("pi", ["-p", "--no-session", prompt], { signal: ctx.signal, timeout: 30000 });
      if (result.code === 0 && result.stdout?.trim() && !result.stdout.toLowerCase().includes("nothing to save"))
        ctx.ui.notify("🔧 Correction detected — memory updated", "info");
      try { const u = recent.find((p) => p.startsWith("[USER]")); if (u) await (projectStore ?? store).addFailure(extractDirective(u.replace(/^\[USER\]:\s*/, "")), { category: "correction", failureReason: "User corrected the agent" }); } catch { /* */ }
    } catch { /* */ } finally { busy = false; }
  });
}
