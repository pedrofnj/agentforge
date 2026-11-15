import type { RenderedFile } from '../adapters/types.js';
import type { Platform } from '../core/types.js';
import { DESCRIPTION_MAX_LENGTH, ID_MAX_LENGTH, ID_PATTERN } from './index.js';

/**
 * Validation of files the adapters generate, run before anything is written.
 * Parsers accept only the strict subset the adapters emit, so drift fails loudly.
 */

export interface RenderedCheck {
  errors: string[];
  warnings: string[];
}

/** Agent Skills spec: "Keep your main SKILL.md under 500 lines." */
export const SKILL_MD_RECOMMENDED_MAX_LINES = 500;

/** Documented fields only (code.claude.com sub-agents; learn.chatgpt.com subagents). */
const CLAUDE_AGENT_KEYS = new Set([
  'name',
  'description',
  'tools',
  'model',
  'permissionMode',
  'skills',
]);
const CODEX_AGENT_KEYS = new Set([
  'name',
  'description',
  'developer_instructions',
  'model',
  'model_reasoning_effort',
  'features.shell_tool',
]);

export function parseFrontmatter(text: string): {
  data: Record<string, string | string[]>;
  body: string;
} {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error('missing YAML frontmatter');
  const data: Record<string, string | string[]> = {};
  let list: string[] | undefined;
  for (const line of m[1]!.split('\n')) {
    const item = /^ {2}- ([a-z0-9-]+)$/.exec(line);
    if (item) {
      if (!list) throw new Error(`list item outside a list: ${line}`);
      list.push(item[1]!);
      continue;
    }
    const kv = /^([a-zA-Z][a-zA-Z-]*):(?: (.+))?$/.exec(line);
    if (!kv) throw new Error(`unexpected frontmatter line: ${line}`);
    const [, key, raw] = kv as unknown as [string, string, string | undefined];
    if (key in data) throw new Error(`duplicate frontmatter key: ${key}`);
    list = undefined;
    if (raw === undefined) {
      list = [];
      data[key] = list;
    } else if (raw.startsWith('"')) data[key] = JSON.parse(raw) as string;
    else if (/^[A-Za-z0-9 ,._-]+$/.test(raw)) data[key] = raw;
    else throw new Error(`unquoted value needs quoting: ${key}`);
  }
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v) && v.length === 0) throw new Error(`empty list: ${k}`);
  }
  return { data, body: text.slice(m[0].length) };
}

export function parseTomlSubset(text: string): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    const m = /^([a-z_]+(?:\.[a-z_]+)?) = (.*)$/.exec(line);
    if (!m) throw new Error(`unexpected TOML line: ${line}`);
    const [, key, value] = m as unknown as [string, string, string];
    if (key in out) throw new Error(`duplicate TOML key: ${key}`);
    if (value === "'''") {
      const end = lines.indexOf("'''", i + 1);
      if (end < 0) throw new Error('unterminated multi-line string');
      out[key] = `${lines.slice(i + 1, end).join('\n')}\n`;
      i = end;
    } else if (value === 'true' || value === 'false') out[key] = value === 'true';
    else if (value.startsWith('"')) out[key] = JSON.parse(value) as string;
    else throw new Error(`unsupported TOML value for ${key}`);
  }
  return out;
}

function checkIdentity(
  data: Record<string, string | string[] | boolean>,
  expected: string,
  errors: string[],
) {
  const name = typeof data.name === 'string' ? data.name : '';
  if (name !== expected) errors.push(`name "${name}" must equal "${expected}"`);
  if (!ID_PATTERN.test(name) || name.length > ID_MAX_LENGTH) {
    errors.push('name must be 1-64 chars of a-z, 0-9 and single hyphens');
  }
  const d = typeof data.description === 'string' ? data.description : '';
  if (d.trim() === '' || d.length > DESCRIPTION_MAX_LENGTH || /[\r\n]/.test(d)) {
    errors.push(`description must be a single line of 1-${DESCRIPTION_MAX_LENGTH} chars`);
  }
}

/** Validates one generated file for a client. Errors mean an adapter bug. */
export function checkRenderedFile(platform: Platform, file: RenderedFile): RenderedCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  try {
    if (file.location === 'skills') {
      const [dir, ...rest] = file.relativePath.split('/');
      if (rest.join('/') === 'SKILL.md') {
        const { data, body } = parseFrontmatter(file.content);
        const extra = Object.keys(data).filter((k) => k !== 'name' && k !== 'description');
        if (extra.length > 0) errors.push(`unexpected SKILL.md fields: ${extra.join(', ')}`);
        checkIdentity(data, dir!, errors);
        if (body.trim() === '') errors.push('SKILL.md body is empty');
        const lines = file.content.split('\n').length;
        if (lines > SKILL_MD_RECOMMENDED_MAX_LINES) {
          warnings.push(
            `SKILL.md has ${lines} lines (spec recommends < ${SKILL_MD_RECOMMENDED_MAX_LINES})`,
          );
        }
      }
    } else if (platform === 'claude-code') {
      const { data, body } = parseFrontmatter(file.content);
      const extra = Object.keys(data).filter((k) => !CLAUDE_AGENT_KEYS.has(k));
      if (extra.length > 0) errors.push(`undocumented agent fields: ${extra.join(', ')}`);
      checkIdentity(data, file.relativePath.replace(/\.md$/, ''), errors);
      if (body.trim() === '') errors.push('agent prompt is empty');
    } else {
      const data = parseTomlSubset(file.content);
      const extra = Object.keys(data).filter((k) => !CODEX_AGENT_KEYS.has(k));
      if (extra.length > 0) errors.push(`undocumented agent keys: ${extra.join(', ')}`);
      const strings = Object.fromEntries(
        Object.entries(data).filter((e): e is [string, string] => typeof e[1] === 'string'),
      );
      checkIdentity(strings, file.relativePath.replace(/\.toml$/, ''), errors);
      if (!strings.developer_instructions?.trim())
        errors.push('developer_instructions is required');
    }
  } catch (e) {
    errors.push((e as Error).message);
  }
  return { errors, warnings };
}
