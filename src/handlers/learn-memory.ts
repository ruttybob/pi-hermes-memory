/**
 * Learn memory tool command — /learn-memory-tool teaches users about the memory system.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

export function registerLearnMemoryCommand(pi: ExtensionAPI): void {
  pi.registerCommand("learn-memory-tool", {
    description: "Learn how to use the pi-hermes-memory extension effectively",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const section = await ctx.ui.select("Pi Hermes Memory Guide", [
        "📦 What Gets Saved",
        "🔧 Tools Available",
        "📋 Commands",
        "✅ Best Practices",
        "🔄 How Memory Flows",
        "🏗️ Architecture",
        "❓ Troubleshooting",
      ], {});

      if (!section) return;

      const lines: string[] = [];

      if (section.startsWith("📦")) {
        lines.push("");
        lines.push("  ╔══════════════════════════════════════════════╗");
        lines.push("  ║           📦 What Gets Saved                 ║");
        lines.push("  ╚══════════════════════════════════════════════╝");
        lines.push("");
        lines.push("  Type            │ File          │ Limit");
        lines.push("  ────────────────┼───────────────┼────────────");
        lines.push("  🧠 Memory       │ MEMORY.md     │ 5,000 chars");
        lines.push("  ⚠️  Failures     │ failures.md   │ 10,000 chars");
        lines.push("  📚 Skills       │ skills/*.md   │ Unlimited");
        lines.push("");
        lines.push("  Memory:   Facts — env details, project conventions, tool quirks");
        lines.push("  Failures: What didn't work — corrections, failures, insights");
        lines.push("  Skills:   Procedures — how to debug, deploy, test");
        lines.push("");
        lines.push("  Memory Categories:");
        lines.push("  ─────────────────");
        lines.push("  [failure]      What was tried but didn't work");
        lines.push("  [correction]   User corrected the agent");
        lines.push("  [insight]      Learning from experience");
        lines.push("  [preference]   User preference");
        lines.push("  [convention]   Project convention");
        lines.push("  [tool-quirk]   Tool-specific knowledge");
      }

      if (section.startsWith("🔧")) {
        lines.push("");
        lines.push("  ╔══════════════════════════════════════════════╗");
        lines.push("  ║           🔧 Tools Available                 ║");
        lines.push("  ╚══════════════════════════════════════════════╝");
        lines.push("");
        lines.push("  memory (add/replace/remove)");
        lines.push("    Save, update, or delete memories");
        lines.push("    Targets: memory, project, failure");
        lines.push("");
        lines.push("  skill (create/view/patch/edit/delete)");
        lines.push("    Save reusable procedures");
      }

      if (section.startsWith("📋")) {
        lines.push("");
        lines.push("  ╔══════════════════════════════════════════════╗");
        lines.push("  ║             📋 Commands                      ║");
        lines.push("  ╚══════════════════════════════════════════════╝");
        lines.push("");
        lines.push("  /memory-insights      Show everything stored in memory");
        lines.push("  /memory-skills        List all saved skills");
        lines.push("  /memory-consolidate   Manually trigger memory cleanup");
        lines.push("  /memory-skill-extract Manually extract skills from session");
        lines.push("  /memory-preview-context Show memory policy or legacy prompt blocks");
      }

      if (section.startsWith("✅")) {
        lines.push("");
        lines.push("  ╔══════════════════════════════════════════════╗");
        lines.push("  ║           ✅ Best Practices                  ║");
        lines.push("  ╚══════════════════════════════════════════════╝");
        lines.push("");
        lines.push("  ✅ DO save:");
        lines.push("     • User preferences (\"prefers pnpm\", \"uses vim\")");
        lines.push("     • Environment facts (\"macOS M1\", \"Node 20\")");
        lines.push("     • Corrections (\"don't use npm — use pnpm\")");
        lines.push("     • Project conventions (\"monorepo with turborepo\")");
        lines.push("     • Failures (\"tried localStorage — XSS vulnerability\")");
        lines.push("");
        lines.push("  ❌ DON'T save:");
        lines.push("     • Task progress (\"finished implementing auth\")");
        lines.push("     • Session outcomes (\"PR #42 was merged\")");
        lines.push("     • Temporary state (\"currently debugging X\")");
      }

      if (section.startsWith("🔄")) {
        lines.push("");
        lines.push("  ╔══════════════════════════════════════════════╗");
        lines.push("  ║          🔄 How Memory Flows                 ║");
        lines.push("  ╚══════════════════════════════════════════════╝");
        lines.push("");
        lines.push("  1. Session starts     → Compact memory policy is injected");
        lines.push("  2. During conversation → Agent uses memory when useful");
        lines.push("  3. Agent saves        → Markdown memory (MEMORY.md)");
        lines.push("  4. Every 10 turns     → Background review saves items");
        lines.push("  5. On correction      → Immediate save as [correction] category");
        lines.push("  6. On failure         → Saves what failed + why");
        lines.push("  7. When full          → Auto-consolidation merges");
        lines.push("  8. Session ends       → Final flush + optional skill extraction");
        lines.push("");
        lines.push("  Legacy mode: set memoryMode=\"legacy-inject\" to restore full");
        lines.push("  MEMORY.md and project memory prompt blocks.");
      }

      if (section.startsWith("🏗️")) {
        lines.push("");
        lines.push("  ╔══════════════════════════════════════════════╗");
        lines.push("  ║          🏗️ Architecture                      ║");
        lines.push("  ╚══════════════════════════════════════════════╝");
        lines.push("");
        lines.push("  Default Prompt Context");
        lines.push("  ┌─────────────────────────────────────┐");
        lines.push("  │ <memory-policy> only                │");
        lines.push("  │ Explains when to use memory tools   │");
        lines.push("  │ Memory is context, not instruction  │");
        lines.push("  │ Repo/tool evidence wins             │");
        lines.push("  └─────────────────────────────────────┘");
        lines.push("");
        lines.push("  Markdown Storage");
        lines.push("  ┌─────────────────────────────────────┐");
        lines.push("  │ MEMORY.md / failures.md             │");
        lines.push("  │ projects-memory/<project>/MEMORY.md │");
        lines.push("  │ skills/*.md                         │");
        lines.push("  └─────────────────────────────────────┘");
        lines.push("");
        lines.push("  Legacy mode can still inject full memory/skill blocks for users");
        lines.push("  who explicitly opt into memoryMode=\"legacy-inject\".");
      }

      if (section.startsWith("❓")) {
        lines.push("");
        lines.push("  ╔══════════════════════════════════════════════╗");
        lines.push("  ║          ❓ Troubleshooting                  ║");
        lines.push("  ╚══════════════════════════════════════════════╝");
        lines.push("");
        lines.push("  \"Memory is full\"");
        lines.push("    → /memory-consolidate to merge entries");
        lines.push("");
        lines.push("  \"Agent forgot something\"");
        lines.push("    → Check /memory-insights, tell agent \"remember X\"");
        lines.push("");
        lines.push("  \"Want to edit manually\"");
        lines.push("    → Files at ~/.pi/agent/memory/ (plain markdown)");
      }

      if (lines.length > 0) {
        ctx.ui.notify(lines.join("\n"), "info");
      }
    },
  });
}
