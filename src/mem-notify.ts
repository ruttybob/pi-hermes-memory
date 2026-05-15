/**
 * memNotify — стилизованное уведомление через widget над редактором.
 * Показывает текст в рамке, автоматически убирает через 3 сек.
 */

const WIDGET_ID = "mem-notify";
const MS = 3000;
let timer: ReturnType<typeof setTimeout> | null = null;

export function memNotify(ctx: any, text: string, _type: "info" | "warning" | "error" = "info"): void {
  const t = ctx.ui.theme;
  const bc = "\x1b[31m";
  const rst = "\x1b[0m";
  const w = 50; // inner width
  const frame = [
    bc + "┌" + "─".repeat(w) + "┐" + rst,
    bc + "│" + rst + pad(t.fg("text", ` ${text}`), w) + bc + "│" + rst,
    bc + "└" + "─".repeat(w) + "┘" + rst,
  ];

  ctx.ui.setWidget(WIDGET_ID, frame);

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    ctx.ui.setWidget(WIDGET_ID, undefined);
    timer = null;
  }, MS);
}

function pad(line: string, width: number): string {
  const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
  return line + " ".repeat(Math.max(0, width - visible.length));
}
