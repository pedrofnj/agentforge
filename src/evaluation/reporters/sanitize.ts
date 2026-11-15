/**
 * Redaction applied to everything imported or reported: findings text,
 * evidence and notes. Raw transcripts, commands and tool inputs are never
 * stored, so this only has to cover short free-text fields.
 */
const PATTERNS: Array<[RegExp, string]> = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED_PRIVATE_KEY]',
  ],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]'],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_KEY]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_KEY]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED_TOKEN]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED_TOKEN]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 [REDACTED]'],
  [
    /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)(["']?\s*[:=]\s*["']?)([^\s"',;]{6,})/gi,
    '$1$2[REDACTED]',
  ],
  [/\b[A-Fa-f0-9]{40,}\b/g, '[REDACTED_HEX]'],
  [/\b[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/=])/g, '[REDACTED_BASE64]'],
];

export function sanitizeText(input: string, homeDir?: string): string {
  let s = input;
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  if (homeDir) {
    for (const h of new Set([homeDir, homeDir.replace(/\\/g, '/')])) {
      if (h.length > 3) s = s.split(h).join('~');
    }
  }
  return s;
}

/** Deep-sanitizes every string in a JSON-compatible value. */
export function sanitizeDeep<T>(value: T, homeDir?: string): T {
  if (typeof value === 'string') return sanitizeText(value, homeDir) as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v, homeDir)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeDeep(v, homeDir)]),
    ) as T;
  }
  return value;
}
