/**
 * MemoryList — TUI просмотра/редактирования записей памяти.
 * Курсор, Ctrl+D удалить, Enter редактировать через ctx.ui.editor(), Esc закрыть.
 */

import { fuzzyFilter, Input, Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { MemoryStore } from "../store/memory-store.js";
import { decode as decodeEntry, strip as stripMetadata } from "../store/memory-store.js";

interface Opts {
  store: MemoryStore;
  theme: { fg: (c: string, t: string) => string; bold: (t: string) => string; dim: (t: string) => string };
  ui: { editor: (t: string, p: string) => Promise<string | undefined>; notify: (m: string, t?: "error" | "info" | "warning") => void };
  onClose: () => void;
}

export class MemoryList {
  private store: MemoryStore; private t: Opts["theme"]; private ui: Opts["ui"]; private onClose: () => void;
  private entries: string[] = []; private sel = 0; private filtered: number[] = [];
  private search: Input; private maxVis = 15;

  constructor(o: Opts) {
    this.store = o.store; this.t = o.theme; this.ui = o.ui; this.onClose = o.onClose;
    this.search = new Input(); this.entries = this.store.getRawEntries();
    this.filtered = this.entries.map((_, i) => i);
  }

  invalidate(): void { /* */ }

  render(w: number): string[] {
    const t = this.t; const lines: string[] = [];
    lines.push(truncateToWidth(`${t.bold("Memory Entries")}  ${t.dim(`(${this.entries.length})`)}  ${t.dim("enter edit · ctrl+d del · esc close")}`, w, ""));
    lines.push(...this.search.render(w)); lines.push("");
    if (!this.filtered.length) { lines.push(t.dim("  No entries found.")); return lines; }
    const s = Math.max(0, Math.min(this.sel - Math.floor(this.maxVis / 2), this.filtered.length - this.maxVis));
    const e = Math.min(s + this.maxVis, this.filtered.length);
    for (let i = s; i < e; i++) {
      const d = decodeEntry(this.entries[this.filtered[i]]);
      const cur = i === this.sel ? "> " : "  ";
      lines.push(truncateToWidth(`${cur}${t.dim(`[${d.created}]`)} ${i === this.sel ? t.bold(d.text) : d.text}`, w, "…"));
    }
    if (s > 0 || e < this.filtered.length) lines.push(t.dim(`  (${this.sel + 1}/${this.filtered.length})`));
    return lines;
  }

  async handleInput(data: string): Promise<void> {
    if (matchesKey(data, Key.up)) { if (this.sel > 0) this.sel--; return; }
    if (matchesKey(data, Key.down)) { if (this.sel < this.filtered.length - 1) this.sel++; return; }
    if (matchesKey(data, Key.pageUp)) { this.sel = Math.max(0, this.sel - this.maxVis); return; }
    if (matchesKey(data, Key.pageDown)) { this.sel = Math.min(this.filtered.length - 1, this.sel + this.maxVis); return; }
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) { this.onClose(); return; }

    // Delete: Ctrl+D
    if (matchesKey(data, Key.ctrl("d")) && this.filtered.length) {
      const idx = this.filtered[this.sel]; const txt = stripMetadata(this.entries[idx]);
      await (txt.length > 60 ? this.store.removeByIndex(idx) : this.store.remove("memory", txt));
      this.refresh(); this.ui.notify("🗑 Entry deleted", "info"); return;
    }

    // Edit: Enter
    if (matchesKey(data, Key.return) && this.filtered.length) {
      const idx = this.filtered[this.sel]; const d = decodeEntry(this.entries[idx]);
      const edited = await this.ui.editor("Edit Memory Entry", d.text);
      if (edited?.trim()) { await this.store.replaceByIndex(idx, edited.trim()); this.refresh(); this.ui.notify("✏️ Entry updated", "info"); }
      return;
    }

    this.search.handleInput(data); this.filter();
  }

  private refresh(): void {
    this.entries = this.store.getRawEntries(); this.filter();
    if (this.sel >= this.filtered.length) this.sel = Math.max(0, this.filtered.length - 1);
  }

  private filter(): void {
    const prev = this.filtered[this.sel]; const q = this.search.getValue();
    this.filtered = !q.trim()
      ? this.entries.map((_, i) => i)
      : fuzzyFilter(this.entries.map((e, i) => ({ text: stripMetadata(e), index: i })), q, (x) => x.text).map((x) => x.index);
    if (prev !== undefined) { const ni = this.filtered.indexOf(prev); if (ni >= 0) { this.sel = ni; return; } }
    this.sel = 0;
  }
}
