# Writing an adapter

An adapter maps the canonical catalog to one client. It is pure: no file I/O, no `process.env`.
The installer does all writing, so a new adapter automatically gets planning, conflict detection,
atomic writes, update, uninstall and doctor.

## Contract (`src/adapters/types.ts`)

```ts
interface PlatformAdapter {
  platform: Platform; // add the id to PLATFORMS in src/core/types.ts
  displayName: string;
  checkCompatibility(manifest): string[]; // blocking reasons; [] = installable
  renderSkill(skill): RenderResult; // { files, warnings }
  renderAgent(agent): RenderResult;
  resolveLocation(location, ctx): string; // 'skills' | 'agents' -> absolute dir per scope
}
```

- `files[].relativePath` uses forward slashes and is relative to the location dir. The installer
  confines it with `resolveInside`, so a bad path fails instead of escaping.
- `warnings` are non-blocking gaps (e.g. a rule the client cannot enforce). Never emit a setting
  the client ignores just to look equivalent; warn instead.
- `checkCompatibility` returns reasons that make a component unsafe or wrong to install for this
  client (e.g. an agent id that would shadow a built-in).

## Steps

1. Read the client's official docs: directories per scope and OS, file format, required fields,
   reload behavior. Record sources and anything unverified in
   [platform-compatibility.md](platform-compatibility.md).
2. Create `src/adapters/<client>/index.ts` implementing the contract. Reuse `shared.ts`
   (`renderSkillMarkdown`, `renderAgentBody`, escaping helpers).
3. Register it in `ADAPTERS` (`src/adapters/index.ts`) and add the id to `PLATFORMS`.
4. Map the new id in the CLI `--client` choices (`src/cli/context.ts`).
5. Add tests: rendered format (parse it strictly), locations per scope, compatibility checks, and
   one installer round-trip in a sandbox.
