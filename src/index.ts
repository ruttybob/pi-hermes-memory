/**
 * Pi Self Memory Extension
 *
 * Persistent memory for Pi — Markdown-based, token-aware.
 * Removed: SQLite, session search, USER.md, interview, project migration.
 *
 * Features:
 *
 * 1. Persistent Memory — MEMORY.md survives across sessions
 * 2. Background Learning Loop — auto-saves notable facts every N turns
 * 3. Session-End Flush — saves memories before compaction/shutdown
 * 4. Auto-Consolidation — merges memory when full instead of erroring
 * 5. Correction Detection — immediate save on user corrections
 * 6. Procedural Skills — SKILL.md files for reusable procedures
 * 7. Tool-Call-Aware Nudge — review triggers on tool call count too
 * 8. /memory-insights — shows what's stored
 * 9. /memory-skills — lists procedural skills
 * 10. /memory-consolidate — manual consolidation trigger
 * 11. /memory-skill-extract — manual skill extraction
 * 12. Context Fencing — <memory-context> tags prevent injection through stored memory
 * 13. Memory Aging — entry timestamps guide consolidation
 *
 * See docs/ROADMAP.md for full roadmap.
 */

import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { MemoryStore } from "./store/memory-store.js";
import { SkillStore } from "./store/skill-store.js";
import { registerMemoryTool } from "./tools/memory-tool.js";
import { registerSkillTool } from "./tools/skill-tool.js";
import { setupBackgroundReview } from "./handlers/background-review.js";
import { setupSessionFlush } from "./handlers/session-flush.js";
import { registerInsightsCommand } from "./handlers/insights.js";
import { triggerConsolidation, registerConsolidateCommand } from "./handlers/auto-consolidate.js";
import { setupCorrectionDetector } from "./handlers/correction-detector.js";
import { setupSkillAutoTrigger } from "./handlers/skill-auto-trigger.js";
import { registerSkillsCommand } from "./handlers/skills-command.js";
import { registerLearnMemoryCommand } from "./handlers/learn-memory.js";
import { registerSkillExtractCommand } from "./handlers/skill-extract.js";
import { registerPreviewContextCommand } from "./handlers/preview-context.js";
import { loadConfig } from "./config.js";
import { detectProject } from "./project.js";
import { buildPromptContext } from "./prompt-context.js";

export default function (pi: ExtensionAPI) {
  const config = loadConfig();

  const globalDir = config.memoryDir ?? path.join(os.homedir(), ".pi", "agent", "memory");
  const store = new MemoryStore(config);
  const skillStore = new SkillStore(path.join(process.cwd(), ".pi", "skills"));

  // Detect project from cwd using shared helper
  const project = detectProject(config.projectsMemoryDir);

  // Project-scoped store: ~/.pi/agent/<projectsMemoryDir>/<project_name>/
  const projectConfig = project.memoryDir
    ? { ...config, memoryCharLimit: config.projectCharLimit, memoryDir: project.memoryDir }
    : { ...config, memoryDir: undefined };
  const projectStore = project.memoryDir ? new MemoryStore(projectConfig) : null;
  const projectName = project.name ?? "";

  // ── 1. Load memory from disk on session start ──
  pi.on("session_start", async (_event, _ctx) => {
    await store.loadFromDisk();
    if (projectStore) await projectStore.loadFromDisk();
  });

  // ── 2. Inject memory policy by default; legacy mode keeps full frozen memory blocks ──
  pi.on("before_agent_start", async (event, _ctx) => {
    const promptContext = await buildPromptContext(config, store, projectStore, skillStore, projectName);

    if (promptContext) {
      // Report injection for look-system-prompt and similar viewers
      pi.events?.emit("system-prompt:injection", {
        source: "pi-self-memory",
        label: "Memory Policy + Entries",
        charCount: promptContext.length,
        preview: promptContext.slice(0, 300),
        fullContent: promptContext,
      });

      return {
        systemPrompt: event.systemPrompt + "\n\n" + promptContext,
      };
    }
  });

  // ── 3. Register the memory tool (Markdown-only, no SQLite sync) ──
  registerMemoryTool(pi, store, projectStore);

  // ── 4. Register the skill tool ──
  if (config.skillsEnabled) {
    registerSkillTool(pi, skillStore);
  }

  // ── 5. Setup background learning loop (with tool-call-aware nudge) ──
  setupBackgroundReview(pi, store, projectStore, config);

  // ── 6. Setup session-end flush ──
  setupSessionFlush(pi, store, projectStore, config);

  // ── 7. Setup auto-consolidation (inject consolidator into store) ──
  store.setConsolidator(async (target, signal) => {
    return triggerConsolidation(pi, store, target, signal);
  });
  registerConsolidateCommand(pi, store);

  // ── 8. Setup correction detection ──
  setupCorrectionDetector(pi, store, projectStore, config);

  // ── 9. Setup skill auto-trigger ──
  if (config.skillsEnabled) {
    setupSkillAutoTrigger(pi, store, skillStore, config);
  }

  // ── 10. Register commands ──
  registerInsightsCommand(pi, store, projectStore, projectName);
  registerLearnMemoryCommand(pi);
  if (config.skillsEnabled) {
    registerSkillsCommand(pi, skillStore);
    registerSkillExtractCommand(pi, store, skillStore, config);
  }
  registerPreviewContextCommand(pi, store, projectStore, skillStore, projectName, config);
}
