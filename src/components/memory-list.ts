/**
 * MemoryList — табовый TUI для просмотра/редактирования памяти.
 * Табы: Memory | Project | Failures | Proj. Failures
 * Tab/Shift+Tab — переключение. Enter — edit, Ctrl+D — delete, Esc — close.
 *
 * Edit/delete закрывают overlay через done(action), операция выполняется
 * на уровне command handler, затем overlay переоткрывается.
 */

import { fuzzyFilter, Input, Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { MemoryStore } from "../store/memory-store.js";
import { decode as decodeEntry, strip as stripMetadata } from "../store/memory-store.js";

export type Target = "memory" | "failure";

/** Действие, возвращаемое при закрытии overlay для edit/delete. */
export type MemoryAction =
  | { type: "edit"; store: MemoryStore; target: Target; index: number; text: string }
  | { type: "delete"; store: MemoryStore; target: Target; index: number; text: string }
  | null; // null = пользователь нажал Esc (закрыть навсегда)

interface Opts {
  store: MemoryStore;
  projectStore: MemoryStore | null;
  projectName: string;
  theme: { fg: (c: string, t: string) => string; bold: (t: string) => string; italic: (t: string) => string };
}

interface TabDef {
  label: string;
  shortLabel: string;
  store: MemoryStore;
  target: Target;
}

export class MemoryList {
  private t: Opts["theme"];
  private tabs: TabDef[] = [];
  private activeTab = 0;
  private tabEntries: string[][] = [];
  private filtered: number[] = [];
  private sel = 0;
  private search: Input;
  private maxVis = 15;

  constructor(o: Opts) {
    this.t = o.theme;
    this.search = new Input();

    this.tabs.push({ label: "Memory", shortLabel: "Mem", store: o.store, target: "memory" });
    if (o.projectStore) this.tabs.push({ label: `Project: ${o.projectName}`, shortLabel: "Proj", store: o.projectStore, target: "memory" });
    this.tabs.push({ label: "Failures", shortLabel: "Fail", store: o.projectStore ?? o.store, target: "failure" });

    this.buildEntries();
  }

  invalidate(): void { /* */ }

  /** Вызвать после store-операции (edit/delete) для обновления данных. */
  refresh(): void { this.refreshActiveTab(); }

  // ─── Entry loading ───

  private buildEntries(): void {
    this.tabEntries = this.tabs.map((tab) =>
      tab.target === "failure" ? tab.store.getRawFailureEntries() : tab.store.getRawEntries()
    );
    this.doFilter();
  }

  private refreshActiveTab(): void {
    const tab = this.tabs[this.activeTab];
    this.tabEntries[this.activeTab] =
      tab.target === "failure" ? tab.store.getRawFailureEntries() : tab.store.getRawEntries();
    this.doFilter();
    if (this.sel >= this.filtered.length) this.sel = Math.max(0, this.filtered.length - 1);
  }

  private totalCount(): number {
    return this.tabEntries.reduce((s, e) => s + e.length, 0);
  }

  // ─── Render ───

  render(w: number): string[] {
    const t = this.t; const lines: string[] = [];
    const total = this.totalCount();
    const bc = "\x1b[31m";
    const rst = "\x1b[0m";
    const innerW = w - 2;

    lines.push(bc + "┌" + "─".repeat(w - 2) + "┐" + rst);
    lines.push(bc + "│ " + rst + this.renderTabBar(innerW - 2) + bc + " │" + rst);
    lines.push(bc + "├" + "─".repeat(w - 2) + "┤" + rst);

    for (const sl of this.search.render(innerW)) {
      lines.push(bc + "│" + rst + this.pad(sl, innerW) + bc + "│" + rst);
    }

    lines.push(bc + "├" + "─".repeat(w - 2) + "┤" + rst);

    const entries = this.tabEntries[this.activeTab];
    if (!this.filtered.length) {
      lines.push(bc + "│" + rst + this.pad(t.fg("dim", `  No entries in ${this.tabs[this.activeTab].label}.`), innerW) + bc + "│" + rst);
    } else {
      const maxR = this.maxVis;
      const start = Math.max(0, Math.min(this.sel - Math.floor(maxR / 2), this.filtered.length - maxR));
      const end = Math.min(start + maxR, this.filtered.length);
      for (let fi = start; fi < end; fi++) {
        const ei = this.filtered[fi];
        const d = decodeEntry(entries[ei]);
        const cur = fi === this.sel ? "> " : "  ";
        const raw = `${cur}${t.fg("dim", `[${d.created}]`)} ${fi === this.sel ? t.bold(d.text) : d.text}`;
        lines.push(bc + "│ " + rst + truncateToWidth(raw, innerW - 2, "…") + bc + " │" + rst);
      }
      if (start > 0 || end < this.filtered.length) {
        lines.push(bc + "│" + rst + this.pad(t.fg("dim", `  (${this.sel + 1}/${this.filtered.length})`), innerW) + bc + "│" + rst);
      }
    }

    lines.push(bc + "└" + "─".repeat(w - 2) + "┘" + rst);
    return lines;
  }

  private renderTabBar(w: number): string {
    const t = this.t;
    const parts: string[] = [];
    for (let i = 0; i < this.tabs.length; i++) {
      const label = w < 70 ? this.tabs[i].shortLabel : this.tabs[i].label;
      const count = this.tabEntries[i].length;
      const text = `${label} (${count})`;
      parts.push(i === this.activeTab ? t.bold(t.fg("accent", text)) : t.fg("dim", text));
    }
    const tabs = parts.join(t.fg("dim", "  "));
    const hint = t.fg("dim", "enter edit · ctrl+d del · esc close");
    return truncateToWidth(`${tabs}  ${hint}`, w, "");
  }

  private pad(line: string, width: number): string {
    const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
    return line + " ".repeat(Math.max(0, width - visible.length));
  }

  // ─── Input (синхронный — возвращает action или undefined) ───

  handleInput(data: string): MemoryAction | undefined {
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
      this.activeTab = (this.activeTab + 1) % this.tabs.length;
      this.sel = 0; this.refreshActiveTab(); return;
    }
    if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
      this.activeTab = (this.activeTab - 1 + this.tabs.length) % this.tabs.length;
      this.sel = 0; this.refreshActiveTab(); return;
    }

    if (matchesKey(data, Key.up)) { if (this.sel > 0) this.sel--; return; }
    if (matchesKey(data, Key.down)) { if (this.sel < this.filtered.length - 1) this.sel++; return; }
    if (matchesKey(data, Key.pageUp)) { this.sel = Math.max(0, this.sel - this.maxVis); return; }
    if (matchesKey(data, Key.pageDown)) { this.sel = Math.min(this.filtered.length - 1, this.sel + this.maxVis); return; }

    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) return null;

    if (matchesKey(data, Key.ctrl("d")) && this.filtered.length) {
      const tab = this.tabs[this.activeTab];
      const ei = this.filtered[this.sel];
      const text = stripMetadata(this.tabEntries[this.activeTab][ei]);
      return { type: "delete", store: tab.store, target: tab.target, index: ei, text };
    }

    if (matchesKey(data, Key.return) && this.filtered.length) {
      const tab = this.tabs[this.activeTab];
      const ei = this.filtered[this.sel];
      const d = decodeEntry(this.tabEntries[this.activeTab][ei]);
      return { type: "edit", store: tab.store, target: tab.target, index: ei, text: d.text };
    }

    this.search.handleInput(data); this.doFilter();
  }

  // ─── Filter ───

  private doFilter(): void {
    const entries = this.tabEntries[this.activeTab];
    const q = this.search.getValue();
    const prevIdx = this.filtered[this.sel] ?? -1;
    if (!q.trim()) {
      this.filtered = entries.map((_, i) => i);
    } else {
      const hits = fuzzyFilter(entries.map((e, i) => ({ text: stripMetadata(e), index: i })), q, (x) => x.text);
      this.filtered = hits.map((h) => h.index);
    }
    if (prevIdx >= 0) { const ni = this.filtered.indexOf(prevIdx); if (ni >= 0) { this.sel = ni; return; } }
    this.sel = 0;
  }
}
