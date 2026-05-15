/**
 * MemoryList — табовый TUI для просмотра/редактирования памяти.
 * Табы: Memory User | Memory Project | Failures User | Failures Project
 * Tab/Shift+Tab — переключение. Enter — edit, Ctrl+D — delete, Esc — close.
 */

import { fuzzyFilter, Input, Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { MemoryStore } from "../store/memory-store.js";
import { decode as decodeEntry, strip as stripMetadata } from "../store/memory-store.js";

type Target = "memory" | "failure";

interface Opts {
  store: MemoryStore;
  projectStore: MemoryStore | null;
  projectName: string;
  theme: { fg: (c: string, t: string) => string; bold: (t: string) => string; italic: (t: string) => string };
  ui: { editor: (t: string, p: string) => Promise<string | undefined>; notify: (m: string, t?: "error" | "info" | "warning") => void };
  onClose: () => void;
}

interface TabDef {
  label: string;
  shortLabel: string;
  store: MemoryStore;
  target: Target;
}

export class MemoryList {
  private t: Opts["theme"]; private ui: Opts["ui"]; private onClose: () => void;
  private tabs: TabDef[] = [];
  private activeTab = 0;
  private tabEntries: string[][] = [];
  private filtered: number[] = [];
  private sel = 0;
  private search: Input;
  private maxVis = 15;

  constructor(o: Opts) {
    this.t = o.theme; this.ui = o.ui; this.onClose = o.onClose;
    this.search = new Input();

    // Build tabs — project tabs only if projectStore exists
    this.tabs.push({ label: "Memory", shortLabel: "Mem", store: o.store, target: "memory" });
    if (o.projectStore) this.tabs.push({ label: `Project: ${o.projectName}`, shortLabel: "Proj", store: o.projectStore, target: "memory" });
    this.tabs.push({ label: "Failures", shortLabel: "Fail", store: o.store, target: "failure" });
    if (o.projectStore) this.tabs.push({ label: `Proj. Failures`, shortLabel: "P.Fail", store: o.projectStore, target: "failure" });

    this.buildEntries();
  }

  invalidate(): void { /* */ }

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
    lines.push(truncateToWidth(
      `${t.bold("Memory")}  ${t.fg("dim", `(${total})`)}  ${t.fg("dim", "tab switch · enter edit · ctrl+d del · esc close")}`,
      w, "",
    ));
    lines.push(this.renderTabBar(w));
    lines.push(...this.search.render(w));
    lines.push("");

    const entries = this.tabEntries[this.activeTab];
    if (!this.filtered.length) {
      lines.push(t.fg("dim", `  No entries in ${this.tabs[this.activeTab].label}.`));
      return lines;
    }

    const maxR = this.maxVis;
    const start = Math.max(0, Math.min(this.sel - Math.floor(maxR / 2), this.filtered.length - maxR));
    const end = Math.min(start + maxR, this.filtered.length);

    for (let fi = start; fi < end; fi++) {
      const ei = this.filtered[fi];
      const d = decodeEntry(entries[ei]);
      const cur = fi === this.sel ? "> " : "  ";
      lines.push(truncateToWidth(`${cur}${t.fg("dim", `[${d.created}]`)} ${fi === this.sel ? t.bold(d.text) : d.text}`, w, "…"));
    }

    if (start > 0 || end < this.filtered.length) lines.push(t.fg("dim", `  (${this.sel + 1}/${this.filtered.length})`));
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
    return truncateToWidth(parts.join(t.fg("dim", " │ ")), w, "");
  }

  // ─── Input ───

  async handleInput(data: string): Promise<void> {
    // Tab navigation
    if (matchesKey(data, Key.tab)) {
      this.activeTab = (this.activeTab + 1) % this.tabs.length;
      this.sel = 0; this.refreshActiveTab(); return;
    }
    if (matchesKey(data, Key.shift("tab"))) {
      this.activeTab = (this.activeTab - 1 + this.tabs.length) % this.tabs.length;
      this.sel = 0; this.refreshActiveTab(); return;
    }

    // Cursor
    if (matchesKey(data, Key.up)) { if (this.sel > 0) this.sel--; return; }
    if (matchesKey(data, Key.down)) { if (this.sel < this.filtered.length - 1) this.sel++; return; }
    if (matchesKey(data, Key.pageUp)) { this.sel = Math.max(0, this.sel - this.maxVis); return; }
    if (matchesKey(data, Key.pageDown)) { this.sel = Math.min(this.filtered.length - 1, this.sel + this.maxVis); return; }

    // Close
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) { this.onClose(); return; }

    // Delete
    if (matchesKey(data, Key.ctrl("d")) && this.filtered.length) {
      const tab = this.tabs[this.activeTab];
      const ei = this.filtered[this.sel];
      await (tab.target === "failure" ? tab.store.removeFailureByIndex(ei) : tab.store.removeByIndex(ei));
      this.refreshActiveTab(); this.ui.notify("🗑 Entry deleted", "info"); return;
    }

    // Edit
    if (matchesKey(data, Key.return) && this.filtered.length) {
      const tab = this.tabs[this.activeTab];
      const ei = this.filtered[this.sel];
      const d = decodeEntry(this.tabEntries[this.activeTab][ei]);
      const edited = await this.ui.editor("Edit Memory Entry", d.text);
      if (edited?.trim()) {
        await (tab.target === "failure" ? tab.store.replaceFailureByIndex(ei, edited.trim()) : tab.store.replaceByIndex(ei, edited.trim()));
        this.refreshActiveTab(); this.ui.notify("✏️ Entry updated", "info");
      }
      return;
    }

    // Search
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
    // Try to keep cursor near previous position
    if (prevIdx >= 0) { const ni = this.filtered.indexOf(prevIdx); if (ni >= 0) { this.sel = ni; return; } }
    this.sel = 0;
  }
}
