import type { LoadedComponent, LoadedSkill, Platform } from '../core/types.js';
import { claudeCodeAdapter } from './claude-code/index.js';
import { codexAdapter } from './codex/index.js';
import type { PlatformAdapter, RenderResult } from './types.js';

export const ADAPTERS: Readonly<Record<Platform, PlatformAdapter>> = {
  'claude-code': claudeCodeAdapter,
  codex: codexAdapter,
};

const isSkill = (c: LoadedComponent): c is LoadedSkill => c.manifest.kind === 'skill';

/** Renders a component for one platform, refusing platforms it does not target. */
export function renderFor(platform: Platform, component: LoadedComponent): RenderResult {
  if (!component.manifest.targets.includes(platform)) {
    throw new Error(`${component.manifest.id} does not target ${platform}`);
  }
  const adapter = ADAPTERS[platform];
  return isSkill(component) ? adapter.renderSkill(component) : adapter.renderAgent(component);
}

export type * from './types.js';
