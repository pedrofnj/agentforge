import {
  FINDING_STATUSES,
  SEVERITIES,
  type FindingStatus,
  type ReportedFinding,
  type Severity,
} from '../core/types.js';

/**
 * Parses the evidence-reporting format (docs/agents.md) from an agent's final
 * message. Tolerant of formatting noise, strict about what it extracts: a
 * finding without a parsable location keeps `location` undefined and can never
 * count as a detection.
 */
const HEADING =
  /^#{2,4}\s+(?:([A-Z]{1,6}-\d+)\s+)?\[(critical|high|medium|low|info)\]\s+(.+?)\s*$/i;
const FIELD =
  /^\s*[-*]\s*\**(category|location|evidence|status|severity|confidence|cwe)\**\s*:\s*(.+?)\s*$/i;
const LOCATION =
  /([A-Za-z0-9_.\-/\\]+\.[A-Za-z0-9]+|[A-Za-z0-9_.\-/\\]*Dockerfile[A-Za-z0-9_.-]*):(\d+)(?:\s*[-–]\s*(\d+))?/;
const INVESTIGATION_HEADING = /^#{2,4}\s+needs investigation/i;
const ANY_HEADING = /^#{1,4}\s+/;

export function parseLocation(text: string): ReportedFinding['location'] {
  const m = LOCATION.exec(text.replace(/`/g, ''));
  if (!m) return undefined;
  const loc: NonNullable<ReportedFinding['location']> = { file: m[1]!, startLine: Number(m[2]) };
  if (m[3]) loc.endLine = Number(m[3]);
  return loc;
}

function normalizeStatus(s: string): FindingStatus | undefined {
  const v = s.toLowerCase().replace(/[`*]/g, '').trim().replace(/\s+/g, '-');
  const hit = FINDING_STATUSES.find((x) => v.startsWith(x));
  return hit;
}

export function parseReportMarkdown(markdown: string): ReportedFinding[] {
  const findings: ReportedFinding[] = [];
  let current: ReportedFinding | undefined;
  let inInvestigation = false;

  for (const line of markdown.split(/\r?\n/)) {
    const h = HEADING.exec(line);
    if (h) {
      inInvestigation = false;
      current = { title: h[3]!.trim(), severity: h[2]!.toLowerCase() as Severity };
      if (h[1]) current.id = h[1];
      findings.push(current);
      continue;
    }
    if (INVESTIGATION_HEADING.test(line)) {
      inInvestigation = true;
      current = undefined;
      continue;
    }
    if (ANY_HEADING.test(line)) {
      inInvestigation = false;
      current = undefined;
      continue;
    }
    if (inInvestigation) {
      const item = /^\s*[-*]\s+(?:([A-Z]{1,6}-\d+)\s+)?(.+)$/.exec(line);
      if (item) {
        const f: ReportedFinding = { title: item[2]!.trim(), status: 'needs-investigation' };
        if (item[1]) f.id = item[1];
        const loc = parseLocation(item[2]!);
        if (loc) f.location = loc;
        findings.push(f);
      }
      continue;
    }
    if (!current) continue;
    const field = FIELD.exec(line);
    if (!field) continue;
    const [, key, value] = field as unknown as [string, string, string];
    switch (key.toLowerCase()) {
      case 'category': {
        current.category = value;
        const cwe = /CWE-\d+/i.exec(value);
        if (cwe) current.cwe = cwe[0].toUpperCase();
        break;
      }
      case 'cwe': {
        const cwe = /CWE-\d+/i.exec(value);
        if (cwe) current.cwe = cwe[0].toUpperCase();
        break;
      }
      case 'location': {
        const loc = parseLocation(value);
        if (loc) current.location = loc;
        break;
      }
      case 'evidence':
        current.evidence = value;
        break;
      case 'status': {
        const s = normalizeStatus(value);
        if (s) current.status = s;
        break;
      }
      case 'severity': {
        const s = value.toLowerCase().trim();
        if ((SEVERITIES as readonly string[]).includes(s)) current.severity = s as Severity;
        break;
      }
    }
  }
  return findings;
}
