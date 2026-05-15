/**
 * Определение проекта — имя и путь к проектной памяти из cwd.
 */

import * as path from "node:path";
import * as os from "node:os";

export interface ProjectInfo {
  name: string | null;
  memoryDir: string | null;
}

/**
 * Проект = любая директория, не являющаяся home или root.
 * Проектная память: ~/.pi/agent/<projectsMemoryDir>/<projectName>/
 */
export function detectProject(projectsMemoryDir = "projects-memory", cwd?: string): ProjectInfo {
  const resolved = path.resolve(cwd ?? process.cwd());
  const home = path.resolve(os.homedir());

  if (!resolved || resolved === "/" || resolved === home || resolved === home + "/") {
    return { name: null, memoryDir: null };
  }

  const name = path.basename(resolved);
  if (!name || name === "." || name === "..") {
    return { name: null, memoryDir: null };
  }

  return { name, memoryDir: path.join(home, ".pi", "agent", projectsMemoryDir, name) };
}
