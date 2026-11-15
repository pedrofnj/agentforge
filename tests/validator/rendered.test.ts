import { describe, expect, it } from 'vitest';
import {
  checkRenderedFile,
  parseFrontmatter,
  parseTomlSubset,
} from '../../src/validator/rendered.js';

const skillMd = (fm: string, body = '# Body\n') => ({
  location: 'skills' as const,
  relativePath: 'demo/SKILL.md',
  content: `---\n${fm}\n---\n\n${body}`,
});
const errorsOf = (
  file: Parameters<typeof checkRenderedFile>[1],
  platform: 'claude-code' | 'codex' = 'codex',
) => checkRenderedFile(platform, file).errors;

describe('generated SKILL.md', () => {
  it('accepts the Agent Skills minimum', () => {
    expect(errorsOf(skillMd('name: "demo"\ndescription: "Does x. Use when y."'))).toEqual([]);
  });

  it.each([
    [
      'missing frontmatter',
      { location: 'skills' as const, relativePath: 'demo/SKILL.md', content: '# x' },
    ],
    ['name/dir mismatch', skillMd('name: "other"\ndescription: "d"')],
    ['extra field', skillMd('name: "demo"\ndescription: "d"\nallowed-tools: Bash')],
    ['empty body', skillMd('name: "demo"\ndescription: "d"', '')],
    ['bad name', skillMd('name: "Demo_1"\ndescription: "d"')],
    ['long description', skillMd(`name: "demo"\ndescription: "${'x'.repeat(1025)}"`)],
  ])('rejects %s', (_label, file) => {
    expect(errorsOf(file).length).toBeGreaterThan(0);
  });

  it('warns above the spec line recommendation', () => {
    const body = 'line\n'.repeat(600);
    expect(
      checkRenderedFile('codex', skillMd('name: "demo"\ndescription: "d"', body)).warnings,
    ).toHaveLength(1);
  });
});

describe('generated agents', () => {
  it('Claude Code: documented frontmatter fields only', () => {
    const file = (fm: string) => ({
      location: 'agents' as const,
      relativePath: 'demo.md',
      content: `---\n${fm}\n---\n\nPrompt\n`,
    });
    expect(
      errorsOf(file('name: "demo"\ndescription: "d"\ntools: Read, Grep'), 'claude-code'),
    ).toEqual([]);
    expect(
      errorsOf(file('name: "demo"\ndescription: "d"\nskills:\n  - a\n  - b'), 'claude-code'),
    ).toEqual([]);
    expect(errorsOf(file('name: "demo"\ndescription: "d"\nhooks: x'), 'claude-code')).toContain(
      'undocumented agent fields: hooks',
    );
    expect(errorsOf(file('name: "demo"\ndescription: "d"\nskills:'), 'claude-code')).toContain(
      'empty list: skills',
    );
  });

  it('Codex: documented keys only, developer_instructions required', () => {
    const file = (body: string) => ({
      location: 'agents' as const,
      relativePath: 'demo.toml',
      content: body,
    });
    expect(
      errorsOf(
        file(`name = "demo"\ndescription = "d"\ndeveloper_instructions = '''\nDo x.\n'''\n`),
      ),
    ).toEqual([]);
    expect(errorsOf(file('name = "demo"\ndescription = "d"\n'))).toContain(
      'developer_instructions is required',
    );
    expect(
      errorsOf(
        file(
          'name = "demo"\ndescription = "d"\nsandbox_mode = "read-only"\ndeveloper_instructions = "x"\n',
        ),
      ),
    ).toContain('undocumented agent keys: sandbox_mode');
  });
});

describe('strict parsers', () => {
  it('reject anything outside the emitted subset', () => {
    expect(() => parseFrontmatter('---\nname: a: b\n---\n')).toThrow();
    expect(() => parseFrontmatter('---\nname: "a"\nname: "b"\n---\n')).toThrow(/duplicate/);
    expect(() => parseTomlSubset('[table]\n')).toThrow();
    expect(() => parseTomlSubset("x = '''\nunterminated\n")).toThrow(/unterminated/);
  });
});
