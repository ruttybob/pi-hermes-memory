# Pi Self Memory

Pi extension — persistent memory, procedural skills, and a background learning loop.

## Architecture

- **Language**: TypeScript (loaded via jiti, no build step at runtime)
- **Runtime**: Pi extension API (`@mariozechner/pi-coding-agent`)
- **Config**: `~/.pi/agent/self-memory-config.json` — all fields optional with defaults

### Storage layout

| Path | Scope |
|---|---|
| `~/.pi/agent/memory/MEMORY.md` | Global declarative memory |
| `~/.pi/agent/memory/FAILURES.md` | Global categorized failure memories |
| `~/.pi/agent/<projectsMemoryDir>/<name>/MEMORY.md` | Project-scoped memory |
| `<cwd>/.pi/skills/<slug>.md` | Procedural skills (project-scoped) |

## Entry point & wiring

`src/index.ts` — registers tools, event handlers, commands. All skill registrations are gated by `config.skillsEnabled`.

## Key modules

| If touching | Read first |
|---|---|
| Memory CRUD, persistence, overflow | `src/store/memory-store.ts` |
| Skill CRUD, frontmatter, progressive disclosure | `src/store/skill-store.ts` |
| Config loading, defaults, validation | `src/config.ts` |
| System prompt construction (policy/legacy) | `src/prompt-context.ts` |
| Background review prompt assembly | `src/constants.ts` → `buildReviewPrompt()` |
| Content security scanning | `src/store/content-scanner.ts` |

## Design invariants

- **Frozen snapshot** — memory injected once at session start, never mutated mid-session (Pi prompt caching)
- **Atomic writes** — temp file + `fs.rename()` in both stores
- **`§` delimiter** — separates entries in MEMORY.md
- **No SQLite** — all storage is Markdown files
- **`pi.exec()` for subprocess work** — background review and skill extraction run in isolated subprocesses

## Development

```bash
npm run check    # tsc --noEmit — run before saying "done"
pi -e ./src/index.ts  # test locally
```

## Installation

```bash
pi install github:chandra447/pi-self-memory
```

## Docs

- `docs/ROADMAP.md` — full roadmap and competitive analysis
- `docs/0.2/TASKS.md` — current task tracking
- `PLAN.md` — v0.1 implementation plan with Hermes source reference map
