import type {
  ComponentManifest,
  InstallScope,
  LoadedAgent,
  LoadedSkill,
  Platform,
} from '../core/types.js';

/** Logical destination; each adapter maps it to a real directory per scope. */
export type ArtifactLocation = 'skills' | 'agents';

export interface RenderedFile {
  location: ArtifactLocation;
  /** Forward-slash path relative to the resolved location directory. */
  relativePath: string;
  content: string;
}

export interface RenderResult {
  files: RenderedFile[];
  /** Known gaps between the canonical contract and what the platform enforces. */
  warnings: string[];
}

export interface ResolveContext {
  scope: InstallScope;
  homeDir: string;
  projectRoot?: string;
  env: Readonly<Record<string, string | undefined>>;
}

/**
 * Adapters are pure: they turn canonical components into platform files in
 * memory. Writing to disk belongs to `src/installer`.
 */
export interface PlatformAdapter {
  readonly platform: Platform;
  /** Human-readable client name for messages. */
  readonly displayName: string;
  /**
   * Blocking incompatibilities (empty when the component can be installed).
   * Non-blocking gaps are reported as render warnings instead.
   */
  checkCompatibility(manifest: ComponentManifest): string[];
  renderSkill(skill: LoadedSkill): RenderResult;
  renderAgent(agent: LoadedAgent): RenderResult;
  resolveLocation(location: ArtifactLocation, ctx: ResolveContext): string;
}
