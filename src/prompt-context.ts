import { MEMORY_POLICY_PROMPT, MEMORY_POLICY_PROMPT_COMPACT } from "./constants.js";
import type { MemoryConfig } from "./types.js";
import type { MemoryStore } from "./store/memory-store.js";
import type { SkillStore } from "./store/skill-store.js";

type MemoryPolicyConfig = Pick<MemoryConfig, "memoryPolicyStyle" | "memoryPolicyCustomText">;

export function resolveMemoryPolicyPrompt(config: MemoryPolicyConfig, skillsEnabled = true): string {
  const style = config.memoryPolicyStyle ?? "full";

  let prompt: string;
  switch (style) {
    case "compact":
      prompt = MEMORY_POLICY_PROMPT_COMPACT;
      break;
    case "custom":
      prompt = config.memoryPolicyCustomText && config.memoryPolicyCustomText.trim().length > 0
        ? config.memoryPolicyCustomText
        : MEMORY_POLICY_PROMPT_COMPACT;
      break;
    case "none":
      return "";
    case "full":
    default:
      prompt = MEMORY_POLICY_PROMPT;
  }

  if (!skillsEnabled) {
    prompt = prompt.replace(/- skill:.*\n?/, "");
  }

  return prompt;
}

export async function buildPromptContext(
  config: Pick<MemoryConfig, "memoryMode" | "memoryPolicyStyle" | "memoryPolicyCustomText" | "skillsEnabled">,
  store: MemoryStore,
  projectStore: MemoryStore | null,
  skillStore: SkillStore,
  projectName: string,
): Promise<string> {
  const skillsEnabled = config.skillsEnabled !== false;

  if (config.memoryMode === "policy-only") {
    return resolveMemoryPolicyPrompt(config, skillsEnabled);
  }

  const memoryBlock = store.formatForSystemPrompt();
  const skillIndex = skillsEnabled ? await skillStore.formatIndexForSystemPrompt() : "";
  const projectBlock = projectStore ? projectStore.formatProjectBlock(projectName) : "";

  const parts: string[] = [];
  if (memoryBlock) parts.push(memoryBlock);
  if (projectBlock) parts.push(projectBlock);
  if (skillIndex) parts.push(skillIndex);

  return parts.join("\n\n");
}
