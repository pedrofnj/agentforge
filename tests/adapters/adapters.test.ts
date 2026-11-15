import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADAPTERS, renderFor } from '../../src/adapters/index.js';
import { tomlMultiline, tomlString, yamlString } from '../../src/adapters/shared.js';
import type { AgentManifest, LoadedAgent } from '../../src/core/types.js';
import { loadFixtures } from '../helpers.js';

const withAgent = (a: LoadedAgent, patch: Partial<AgentManifest>): LoadedAgent => ({
  ...a,
  manifest: { ...a.manifest, ...patch },
});

describe('skill rendering (both platforms share the Agent Skills format)', () => {
  it.each(['claude-code', 'codex'] as const)('%s: SKILL.md + lazy references', async (p) => {
    const { skill } = await loadFixtures();
    const { files, warnings } = renderFor(p, skill);
    expect(warnings).toEqual([]);
    expect(files.map((f) => `${f.location}:${f.relativePath}`)).toEqual([
      'skills:sample-skill/SKILL.md',
      'skills:sample-skill/references/checklist.md',
      'skills:sample-skill/references/example-stack.md',
    ]);
    const md = files[0]!.content;
    expect(
      md.startsWith(
        '---\nname: "sample-skill"\ndescription: "Fixture skill used by tests."\n---\n',
      ),
    ).toBe(true);
    // Reference content is NOT inlined; only a one-line index is.
    expect(md).not.toContain('Item one');
    expect(md).toContain('## References');
    expect(md).toContain(
      '- [references/checklist.md](references/checklist.md): Generic checklist.',
    );
    expect(md).toContain('## Optional specializations');
    expect(md).toContain('Load only if the project shows: example.lock.');
  });
});

describe('claude-code agent', () => {
  it('maps capabilities to a tools allowlist and tier to a model alias', async () => {
    const { agent } = await loadFixtures();
    const { files } = renderFor('claude-code', agent);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ location: 'agents', relativePath: 'sample-reviewer.md' });
    const md = files[0]!.content;
    // Skill is needed to invoke skills from a subagent; no Edit/Write/Agent/web tools.
    expect(md).toContain('\ntools: Read, Grep, Glob, Bash, Skill\n');
    expect(md).toContain('\npermissionMode: plan\n');
    expect(md).toContain('\nmodel: sonnet\n');
    expect(md).not.toMatch(/^skills:/m); // nothing to preload in this fixture
    expect(md).toContain('- Read-only: never modify files');
    expect(md).toContain('- Do not delegate to other agents.');
    expect(md).toContain('- Load only when a step needs it: sample-skill.');
  });

  it('grants the Agent tool only when delegation is allowed', async () => {
    const { agent } = await loadFixtures();
    const md = renderFor(
      'claude-code',
      withAgent(agent, { budget: { maxDepth: 2, maxSubagents: 1 } }),
    ).files[0]!.content;
    expect(md).toContain('\ntools: Read, Grep, Glob, Bash, Skill, Agent\n');
  });
});

describe('codex agent', () => {
  it('renders TOML with developer_instructions and keeps command-based reading', async () => {
    const { agent } = await loadFixtures();
    const { files, warnings } = renderFor('codex', agent);
    expect(files[0]).toMatchObject({ location: 'agents', relativePath: 'sample-reviewer.toml' });
    const toml = files[0]!.content;
    expect(toml).toMatch(
      /^name = "sample-reviewer"\ndescription = ".+"\nmodel_reasoning_effort = "medium"\ndeveloper_instructions = '''\n/,
    );
    expect(toml).toContain("Review the code it's given.");
    // Codex reads files through commands: disabling the shell would break a reviewer.
    expect(toml).not.toContain('shell_tool');
    expect(warnings.some((w) => w.includes('sandbox_mode'))).toBe(true);
  });

  it('omits model settings for inherit and keeps the shell when requested', async () => {
    const { agent } = await loadFixtures();
    const toml = renderFor(
      'codex',
      withAgent(agent, { model: 'inherit', mode: 'read-write', capabilities: ['read', 'shell'] }),
    ).files[0]!.content;
    expect(toml).not.toContain('model_reasoning_effort');
    expect(toml).not.toContain('features.');
  });
});

describe('location resolution', () => {
  const home = path.resolve('home');
  const project = path.resolve('proj');
  const ctx = (scope: 'global' | 'project', env: Record<string, string> = {}) => ({
    scope,
    homeDir: home,
    projectRoot: project,
    env,
  });

  it('claude-code uses the documented .claude dirs and ignores CLAUDE_CONFIG_DIR', () => {
    const a = ADAPTERS['claude-code'];
    expect(a.resolveLocation('skills', ctx('global'))).toBe(path.join(home, '.claude', 'skills'));
    expect(a.resolveLocation('agents', ctx('project'))).toBe(
      path.join(project, '.claude', 'agents'),
    );
    expect(
      a.resolveLocation('agents', ctx('global', { CLAUDE_CONFIG_DIR: path.resolve('cfg') })),
    ).toBe(path.join(home, '.claude', 'agents'));
  });

  it('codex uses .agents/skills for skills and .codex/agents (or CODEX_HOME) for agents', () => {
    const a = ADAPTERS.codex;
    expect(a.resolveLocation('skills', ctx('global'))).toBe(path.join(home, '.agents', 'skills'));
    expect(a.resolveLocation('skills', ctx('project'))).toBe(
      path.join(project, '.agents', 'skills'),
    );
    expect(a.resolveLocation('agents', ctx('project'))).toBe(
      path.join(project, '.codex', 'agents'),
    );
    expect(a.resolveLocation('agents', ctx('global', { CODEX_HOME: path.resolve('ch') }))).toBe(
      path.join(path.resolve('ch'), 'agents'),
    );
  });

  it('requires a project root for project scope', () => {
    expect(() =>
      ADAPTERS.codex.resolveLocation('agents', { scope: 'project', homeDir: home, env: {} }),
    ).toThrow(/projectRoot/);
  });
});

describe('compatibility checks', () => {
  it('blocks agent ids that would shadow built-in agents', async () => {
    const { agent } = await loadFixtures();
    expect(ADAPTERS.codex.checkCompatibility({ ...agent.manifest, id: 'explorer' })).toHaveLength(
      1,
    );
    expect(
      ADAPTERS['claude-code'].checkCompatibility({ ...agent.manifest, id: 'general-purpose' }),
    ).toHaveLength(1);
    expect(ADAPTERS.codex.checkCompatibility(agent.manifest)).toEqual([]);
  });
});

describe('rendering guards and escaping', () => {
  it('refuses platforms a component does not target', async () => {
    const { agent } = await loadFixtures();
    expect(() => renderFor('codex', withAgent(agent, { targets: ['claude-code'] }))).toThrow(
      /does not target codex/,
    );
  });

  it('escapes strings safely for YAML and TOML', () => {
    expect(yamlString('a: "b"')).toBe('"a: \\"b\\""');
    expect(tomlString('x\x7fy')).toBe('"x\\u007Fy"');
    expect(tomlMultiline("has ''' inside")).toBe("\"has ''' inside\"");
    expect(tomlMultiline('plain')).toBe("'''\nplain\n'''");
  });
});
