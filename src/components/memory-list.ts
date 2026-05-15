/**
 * MemoryList — TUI просмотра/редактирования записей памяти.
 * Две секции: Global Memory + Project Memory (если есть).
 * Курсор, Ctrl+D удалить, Enter редактировать через ctx.ui.editor(), Esc закрыть.
 */

import { fuzzyFilter, Input, Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { MemoryStore } from "../store/memory-store.js";
import { decode as decodeEntry, strip as stripMetadata } from "../store/memory-store.js";

interface Opts {
  store: MemoryStore;
  projectStore: MemoryStore | null;
  projectName: string;
  theme: { fg: (c: string, t: string) => string; bold: (t: string) => string; italic: (t: string) => string };
  ui: { editor: (t: string, p: string) => Promise<string | undefined>; notify: (m: string, t?: "error" | "info" | "warning") => void };
  onClose: () => void;
}

interface Section {
  label: string;
  entries: string[];
  store: MemoryStore;
  offset: number;
}

export class MemoryList {
  private t: Opts["theme"]; private ui: Opts["ui"]; private onClose: () => void;
  private sections: Section[] = [];
  private sel = 0; private totalCount = 0;
  private search: Input; private maxVis = 15;
  private filtered: { section: number; index: number }[] = [];

  constructor(o: Opts) {
    this.t = o.theme; this.ui = o.ui; this.onClose = o.onClose;
    this.search = new Input();
    this.buildSections(o);
  }

  invalidate(): void { /* */ }

  private buildSections(o: Opts): void {
    let offset = 0;
    this.sections = [];
    const memEntries = o.store.getRawEntries();
    if (memEntries.length) {
      this.sections.push({ label: "Memory Entries", entries: memEntries, store: o.store, offset });
      offset += memEntries.length;
    }
    if (o.projectStore) {
      const pEntries = o.projectStore.getRawEntries();
      if (pEntries.length) {
        this.sections.push({ label: `📁 Project: ${o.projectName}`, entries: pEntries, store: o.projectStore, offset });
        offset += pEntries.length;
      }
    }
    this.totalCount = offset;
    this.filtered = this.sections.flatMap((s, si) => s.entries.map((_, ei) => ({ section: si, index: ei })));
  }

  render(w: number): string[] {
    const t = this.t; const lines: string[] = [];
    lines.push(truncateToWidth(`${t.bold("Memory")}  ${t.fg("dim", `(${this.totalCount})`)}  ${t.fg("dim", "enter edit · ctrl+d del · esc close")}`, w, ""));
    lines.push(...this.search.render(w)); lines.push("");

    if (!this.filtered.length) { lines.push(t.fg("dim", "  No entries found.")); return lines; }

    let rendered = 0; const maxR = this.maxVis;
    let startIdx = Math.max(0, Math.min(this.sel - Math.floor(maxR / 2), this.filtered.length - maxR));
    const endIdx = Math.min(startIdx + maxR, this.filtered.length);

    // Render section headers + entries
    let curSection = -1;
    for (let fi = startIdx; fi < endIdx; fi++) {
      const { section: si, index: ei } = this.filtered[fi];
      const sec = this.sections[si];
      if (si !== curSection) {
        if (curSection >= 0) lines.push("");
        lines.push(t.fg("accent", t.bold(sec.label)));
        curSection = si;
      }
      const d = decodeEntry(sec.entries[ei]);
      const cur = fi === this.sel ? "> " : "  ";
      lines.push(truncateToWidth(`${cur}${t.fg("dim", `[${d.created}]`)} ${fi === this.sel ? t.bold(d.text) : d.text}`, w, "…"));
    }

    if (startIdx > 0 || endIdx < this.filtered.length) lines.push(t.fg("dim", `  (${this.sel + 1}/${this.filtered.length})`));
    return lines;
  }

  async handleInput(data: string): Promise<void> {
    if (matchesKey(data, Key.up)) { if (this.sel > 0) this.sel--; return; }
    if (matchesKey(data, Key.down)) { if (this.sel < this.filtered.length - 1) this.sel++; return; }
    if (matchesKey(data, Key.pageUp)) { this.sel = Math.max(0, this.sel - this.maxVis); return; }
    if (matchesKey(data, Key.pageDown)) { this.sel = Math.min(this.filtered.length - 1, this.sel + this.maxVis); return; }
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) { this.onClose(); return; }

    if (matchesKey(data, Key.ctrl("d")) && this.filtered.length) {
      const { section: si, index: ei } = this.filtered[this.sel];
      const sec = this.sections[si];
      const txt = stripMetadata(sec.entries[ei]);
      await (txt.length > 60 ? sec.store.removeByIndex(ei) : sec.store.remove("memory", txt));
      this.rebuild(sec); this.ui.notify("🗑 Entry deleted", "info"); return;
    }

    if (matchesKey(data, Key.return) && this.filtered.length) {
      const { section: si, index: ei } = this.filtered[this.sel];
      const sec = this.sections[si];
      const d = decodeEntry(sec.entries[ei]);
      const edited = await this.ui.editor("Edit Memory Entry", d.text);
      if (edited?.trim()) { await sec.store.replaceByIndex(ei, edited.trim()); this.rebuild(sec); this.ui.notify("✏️ Entry updated", "info"); }
      return;
    }

    this.search.handleInput(data); this.doFilter();
  }

  private rebuild(sec: Section): void {
    const entries = sec.store.getRawEntries();
    sec.entries = entries;
    // Rebuild all sections + filtered
    this.totalCount = this.sections.reduce((s, sec) => s + sec.entries.length, 0);
    this.doFilter();
    if (this.sel >= this.filtered.length) this.sel = Math.max(0, this.filtered.length - 1);
  }

  private doFilter(): void {
    const q = this.search.getValue();
    const prev = this.filtered[this.sel];
    if (!q.trim()) {
      this.filtered = this.sections.flatMap((s, si) => s.entries.map((_, ei) => ({ section: si, index: ei })));
    } else {
      this.filtered = [];
      for (let si = 0; si < this.sections.length; si++) {
        const sec = this.sections[si];
        const hits = fuzzyFilter(sec.entries.map((e, i) => ({ text: stripMetadata(e), index: i })), q, (x) => x.text);
        for (const h of hits) this.filtered.push({ section: si, index: h.index });
      }
    }
    if (prev) { const ni = this.filtered.findIndex((f) => f.section === prev.section && f.index === prev.index); if (ni >= 0) { this.sel = ni; return; } }
    this.sel = 0;
  }
}
