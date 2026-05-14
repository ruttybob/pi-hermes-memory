/**
 * Memory tool — registers the LLM-callable `memory` tool.
 * Markdown-only, no SQLite sync.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { MemoryStore } from "../store/memory-store.js";
import { MEMORY_TOOL_DESCRIPTION } from "../constants.js";
import type { MemoryCategory, MemoryResult } from "../types.js";

function formatMemoryToolText(result: MemoryResult): string {
  const evictedEntries = result.evicted_entries ?? [];
  if (result.success && evictedEntries.length > 0) {
    const lines = [
      result.message ?? `Memory updated. Rotated ${evictedEntries.length} older ${evictedEntries.length === 1 ? "entry" : "entries"} to stay within the limit.`,
      "",
      "Rotated active memory entries:",
      "",
    ];

    evictedEntries.forEach((entry, index) => {
      lines.push(`${index + 1}. ${entry}`);
      lines.push("");
    });

    lines.push("If one of these entries should stay active, add it again.");
    if (result.usage) lines.push(`Usage: ${result.usage}`);
    return lines.join("\n").trim();
  }

  return JSON.stringify(result);
}

export function registerMemoryTool(
  pi: ExtensionAPI,
  store: MemoryStore,
  projectStore: MemoryStore | null,
): void {
  pi.registerTool({
    name: "memory",
    label: "Memory",
    description: MEMORY_TOOL_DESCRIPTION,
    promptSnippet:
      "Save or manage persistent memory that survives across sessions",
    promptGuidelines: [
      "Save proactively when the user corrects you, shares a preference, or reveals durable facts.",
      "Use target='project' for project-scoped facts, target='memory' for global, target='failure' + category for what went wrong.",
      "Do NOT save task progress, session logs, or TODO state — only facts that survive beyond this session.",
    ],
    parameters: Type.Object({
      action: StringEnum(["add", "replace", "remove"] as const),
      target: StringEnum(["memory", "project", "failure"] as const),
      content: Type.Optional(
        Type.String({ description: "Entry content for add/replace" })
      ),
      old_text: Type.Optional(
        Type.String({
          description:
            "Substring identifying entry for replace/remove",
        })
      ),
      category: Type.Optional(
        StringEnum(["failure", "correction", "insight", "preference", "convention", "tool-quirk"] as const, {
          description: "Category for failure memories",
        })
      ),
      failure_reason: Type.Optional(
        Type.String({ description: "Why it failed (for failure category)" })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { action, target: rawTarget, content, old_text, category, failure_reason } = params;

      // Route 'project' to projectStore using the normal MEMORY.md target.
      const target = rawTarget === "project" ? "memory" : rawTarget as "memory" | "failure";
      const activeStore = rawTarget === "project" ? projectStore : store;

      if (rawTarget === "project" && !projectStore) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "Project memory is not available (no project detected)." }) }],
          details: {},
        };
      }

      const store_ = activeStore!;
      let result: MemoryResult;

      switch (action) {
        case "add":
          if (!content) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: "Content is required for 'add' action.",
                  }),
                },
              ],
              details: {},
            };
          }
          // Handle failure target with category
          if (rawTarget === "failure") {
            const memoryCategory = (category || "failure") as MemoryCategory;
            result = await store_.addFailure(content, {
              category: memoryCategory,
              failureReason: failure_reason,
            });
          } else {
            result = await store_.add(target, content);
          }
          break;

        case "replace":
          if (!old_text) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: "old_text is required for 'replace' action.",
                  }),
                },
              ],
              details: {},
            };
          }
          if (!content) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: "content is required for 'replace' action.",
                  }),
                },
              ],
              details: {},
            };
          }
          result = await store_.replace(target, old_text, content);
          break;

        case "remove":
          if (!old_text) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: "old_text is required for 'remove' action.",
                  }),
                },
              ],
              details: {},
            };
          }
          result = await store_.remove(target, old_text);
          break;

        default:
          result = {
            success: false,
            error: `Unknown action '${action}'. Use: add, replace, remove`,
          };
      }

      // Tag project results so the caller knows the scope
      if (rawTarget === "project" && result.success) {
        result = {
          ...result,
          target: "project",
        };
      }

      return {
        content: [{ type: "text", text: formatMemoryToolText(result) }],
        details: result,
      };
    },
  });
}
