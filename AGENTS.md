# Pi Self Memory

Pi extension — persistent memory with background collection, auto-consolidation, correction detection, and a TUI editor.

## Architecture

- **Language**: TypeScript (loaded via jiti, no build step at runtime)
- **Runtime**: Pi extension API (`@earendil-works/pi-coding-agent`)
- **Config**: `~/.pi/agent/self-memory-config.json` — all fields optional with defaults

### Storage layout

| Path | Scope |
|---|---|
| `~/.pi/agent/memory/MEMORY.md` | Global declarative memory |
| `~/.pi/agent/memory/failures.md` | Global categorized failure memories |
| `~/.pi/agent/projects-memory/<name>/MEMORY.md` | Project-scoped memory (per cwd basename) |
| `~/.pi/agent/projects-memory/<name>/failures.md` | Project-scoped failures |

## Entry point & wiring

`src/index.ts` — event handlers + 3 commands (`/memory`, `/memory-consolidate`, `/memory-review`).

## Key modules

| If touching | Read first |
|---|---|
| Memory CRUD, persistence, overflow | `src/store/memory-store.ts` |
| Content security scanning | `src/store/content-scanner.ts` |
| Project detection | `src/project.ts` |
| Config loading, defaults | `src/config.ts` |
| System prompt construction | `src/prompt-context.ts` |
| Prompts, constants, correction patterns | `src/constants.ts` |
| TUI MemoryList component | `src/components/memory-list.ts` |
| Background review | `src/handlers/background-review.ts` |
| Correction detection | `src/handlers/correction-detector.ts` |
| Auto-consolidation | `src/handlers/auto-consolidate.ts` |
| Session flush | `src/handlers/session-flush.ts` |

## Design invariants

- **Frozen snapshot** — memory injected once at session start, never mutated mid-session (Pi prompt caching)
- **Atomic writes** — temp file + `fs.rename()`
- **`§` delimiter** — separates entries in MEMORY.md
- **No SQLite** — all storage is Markdown files
- **`pi.exec()` for subprocess work** — background review and consolidation run in isolated subprocesses
- **No manual CRUD tool** — all writes through background review, corrections, and consolidation

## Commands

- `/memory` — TUI: табовый просмотр (Memory / Project / Failures), рамка, edit (Enter), delete (Ctrl+D), search, Tab/←→ для переключения
- `/memory-consolidate` — trigger consolidation to free space
- `/memory-review` — manually review current conversation

## Development

```bash
npm run check    # tsc --noEmit — run before saying "done"
pi -e ./src/index.ts  # test locally
```

## Installation

```bash
pi install github:ruttybob/pi-self-memory
```
