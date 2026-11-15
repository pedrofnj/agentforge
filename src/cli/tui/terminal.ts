/** Raw terminal output used for live redraws (prompts, spinner). Absent when not a TTY. */
export interface Terminal {
  write(chunk: string): void;
  /** Columns, when known. */
  columns?: number | undefined;
  unicode: boolean;
}

export const ESC = {
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  clearLine: '\r\x1b[2K',
  clearDown: '\x1b[0J',
  up: (n: number) => (n > 0 ? `\x1b[${n}A` : ''),
};

/** Truncates plain text to the width, so a redraw never wraps lines. */
export function fit(text: string, width: number, ellipsis = '...'): string {
  if (width <= 0 || text.length <= width) return text;
  return `${text.slice(0, Math.max(0, width - ellipsis.length))}${ellipsis}`;
}

/** Word-wraps plain text to the width (for hints and summaries). */
export function wrapText(text: string, width: number): string[] {
  if (width <= 10) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
