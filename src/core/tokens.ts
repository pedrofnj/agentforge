/**
 * Token accounting. AgentForge never presents an estimate as a measurement:
 * every count carries its source. Real counts only come from platform data
 * (e.g. Claude Code statusline/OTel, `codex exec --json` usage events).
 */
export type MeasurementSource = 'measured' | 'estimated';

export interface TokenCount {
  tokens: number;
  source: MeasurementSource;
  method: string;
}

const CHARS_PER_TOKEN = 4;

/** Rough heuristic (~4 chars/token for English text). Useful for relative comparisons only. */
export function estimateTokens(text: string): TokenCount {
  return {
    tokens: Math.ceil(text.length / CHARS_PER_TOKEN),
    source: 'estimated',
    method: `chars/${CHARS_PER_TOKEN} heuristic`,
  };
}
