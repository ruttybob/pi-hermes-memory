/**
 * Correction detection — detects user corrections in real-time and triggers
 * an immediate memory save instead of waiting for the next nudge interval.
 *
 * Uses a two-pass filter:
 * - Strong patterns: always trigger (high confidence)
 * - Weak patterns: only trigger if followed by a directive clause
 * - Negative patterns: suppress even if a positive pattern matched
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { MemoryStore } from "../store/memory-store.js";
import {
  CORRECTION_SAVE_PROMPT,
  CORRECTION_STRONG_PATTERNS,
  CORRECTION_WEAK_PATTERNS,
  CORRECTION_NEGATIVE_PATTERNS,
  CORRECTION_DIRECTIVE_WORDS,
  ENTRY_DELIMITER,
} from "../constants.js";
import type { MemoryConfig } from "../types.js";
import { getMessageText } from "../types.js";

/**
 * Extract the directive part from a correction message.
 * E.g., "no, use pnpm instead" -> "use pnpm instead"
 */
function extractCorrectionDirective(text: string): string {
  const cleaned = text
    .replace(/^(no|wrong|actually|stop|don'?t|that'?s not|I said|I told you)[,\.\s!]+/i, '')
    .replace(/^(please\s+)?/i, '')
    .trim();
  return cleaned || text;
}

function compileCorrectionPatterns(
  configured: string[] | undefined,
  defaults: RegExp[],
): RegExp[] {
  if (configured === undefined) return defaults;

  const patterns: RegExp[] = [];
  for (const source of configured) {
    try {
      patterns.push(new RegExp(source, "i"));
    } catch {
      // Ignore invalid configured regex entries; valid entries still apply.
    }
  }
  return patterns;
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasDirectiveWord(remainder: string, words: string[]): boolean {
  if (words.length === 0) return false;
  const source = words.map(escapeRegexLiteral).join("|");
  // Use (?:^|\s)/(?:$|\s) instead of \b for Unicode (Cyrillic) compatibility.
  // JavaScript's \b is ASCII-only and doesn't recognise Cyrillic as word chars.
  return new RegExp(`(?:^|\\s)(${source})(?:$|\\s)`, "i").test(remainder);
}

/**
 * Check if a user message is a correction using the two-pass filter.
 */
type CorrectionPatternConfig = Pick<MemoryConfig,
  "correctionStrongPatterns" |
  "correctionWeakPatterns" |
  "correctionNegativePatterns" |
  "correctionDirectiveWords"
>;

export function isCorrection(text: string, config?: CorrectionPatternConfig): boolean {
  const negativePatterns = compileCorrectionPatterns(
    config?.correctionNegativePatterns,
    CORRECTION_NEGATIVE_PATTERNS,
  );
  const strongPatterns = compileCorrectionPatterns(
    config?.correctionStrongPatterns,
    CORRECTION_STRONG_PATTERNS,
  );
  const weakPatterns = compileCorrectionPatterns(
    config?.correctionWeakPatterns,
    CORRECTION_WEAK_PATTERNS,
  );
  const directiveWords = config?.correctionDirectiveWords ?? CORRECTION_DIRECTIVE_WORDS;

  for (const pattern of negativePatterns) {
    if (pattern.test(text)) return false;
  }

  for (const pattern of strongPatterns) {
    if (pattern.test(text)) return true;
  }

  for (const pattern of weakPatterns) {
    if (pattern.test(text)) {
      const match = pattern.exec(text);
      if (match && match.index === 0) {
        const remainder = text.slice(match[0].length).trim();
        if (hasDirectiveWord(remainder, directiveWords)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function setupCorrectionDetector(
  pi: ExtensionAPI,
  store: MemoryStore,
  projectStore: MemoryStore | null,
  config: MemoryConfig,
): void {
  if (!config.correctionDetection) return;

  let pendingCorrection = false;
  let turnsSinceLastCorrection = 3;
  let correctionInProgress = false;

  pi.on("message_end", async (event, _ctx) => {
    if (event.message.role !== "user") return;
    const text = getMessageText(event.message);
    if (!text) return;
    if (isCorrection(text, config)) {
      pendingCorrection = true;
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!pendingCorrection) {
      turnsSinceLastCorrection++;
      return;
    }
    pendingCorrection = false;

    if (turnsSinceLastCorrection < 3) return;
    if (correctionInProgress) return;

    turnsSinceLastCorrection = 0;
    correctionInProgress = true;

    try {
      const entries = ctx.sessionManager.getBranch();
      const parts: string[] = [];

      for (const entry of entries) {
        if (entry.type !== "message") continue;
        const msg = entry.message;
        const text = getMessageText(msg);
        if (!text) continue;
        const prefix = msg.role === "user" ? "[USER]" : "[ASSISTANT]";
        parts.push(`${prefix}: ${text}`);
      }

      const recentParts = parts.slice(-6);

      const currentMemory = store.getMemoryEntries().join(ENTRY_DELIMITER);
      const currentProject = projectStore ? projectStore.getMemoryEntries().join(ENTRY_DELIMITER) : null;

      const prompt = [
        CORRECTION_SAVE_PROMPT,
        "",
        "--- Current Memory ---",
        currentMemory || "(empty)",
      ];

      if (currentProject !== null) {
        prompt.push(
          "",
          "--- Current Project Memory ---",
          currentProject || "(empty)",
        );
      }

      prompt.push(
        "",
        "--- Recent Conversation ---",
        recentParts.join("\n\n"),
      );

      const result = await pi.exec("pi", ["-p", "--no-session", prompt.join("\n")], {
        signal: ctx.signal,
        timeout: 30000,
      });

      if (result.code === 0 && result.stdout) {
        const output = result.stdout.trim();
        if (output && !output.toLowerCase().includes("nothing to save")) {
          ctx.ui.notify("🔧 Correction detected — memory updated", "info");
        }
      }

      // Also save as a failure memory for learning
      try {
        const lastUserMsg = recentParts.find(p => p.startsWith("[USER]"));
        const correctionText = lastUserMsg ? lastUserMsg.replace(/^\[USER\]:\s*/, "") : "";
        if (correctionText) {
          const directive = extractCorrectionDirective(correctionText);
          await store.addFailure(directive, {
            category: "correction",
            failureReason: "User corrected the agent",
          });
        }
      } catch {
        // Best-effort — don't block the session
      }
    } catch {
      // Best-effort — don't block the session
    } finally {
      correctionInProgress = false;
    }
  });
}
