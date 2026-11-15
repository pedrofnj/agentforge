# Versioning and releases

## Versioning policy (SemVer)

The npm package follows [Semantic Versioning](https://semver.org/). While the version is `0.x`:

- **minor** (`0.x.0`): new commands, components or options; changes to generated files or to the
  catalog contract that may need users to run `agentforge update`.
- **patch** (`0.x.y`): fixes, documentation, security fixes, catalog text fixes.
- Breaking CLI behavior is called out under **Changed** in the changelog even in `0.x`.

From `1.0.0`: breaking changes to the CLI, the manifest formats (`schemaVersion`) or the state
file require a major version.

Each agent and skill also has its own `version` in `manifest.json`. Bump it whenever the
generated output changes; `agentforge update` uses it (and never downgrades).

## Compatibility policy

- Node.js: the active and maintenance LTS lines (`engines.node` is `>=22`; CI tests 22 and 24).
- OS: Linux, macOS, Windows; all three run in CI for every change.
- Clients: generated files follow the Claude Code and Codex documentation verified on the date in
  [platform-compatibility.md](platform-compatibility.md). When a client changes its format, the
  adapter changes in a minor release and the date is updated.
- State files (`.agentforge/manifest.json`) keep `schemaVersion: 1` within `0.x` unless a release
  note says otherwise; older state is migrated, never silently discarded.

## Release checklist

1. Package name: `@pedrofnj/agentforge` (scoped, public; binary `agentforge`).
2. `main` is green in CI (Linux, macOS, Windows; Node 22 and 24) and in package validation.
3. `npm run check`, `npm run smoke`, `node dist/cli/bin.js eval validate` pass locally.
4. Version bumped in `package.json`; `CHANGELOG.md` entry dated (`## [x.y.z] - YYYY-MM-DD`).
5. Docs match the release (README commands, compatibility date, known limitations).
6. Release notes written from [the template](release-template.md).
7. A maintainer pushes the tag `vX.Y.Z`; the `release` workflow verifies tag, changelog and
   checks, runs package validation, then waits for approval in the `npm-release` environment.
8. After approval it publishes with npm provenance. Verify with
   `npm view @pedrofnj/agentforge version` and `npx @pedrofnj/agentforge@x.y.z --version` in a clean directory.
9. Create the GitHub release from the release notes (manual, after verification).

First release (0.1.0): npm trusted publishing can only be configured for a package that
already exists, so 0.1.0 was published once from a maintainer workstation (`npm publish
--access public`, interactive 2FA) at the validated commit. The `v0.1.0` tag then runs the
release workflow, which validates everything and skips publishing because the version exists.
From 0.1.1 on, releases go through the workflow only.

## Publishing setup

| Where                            | Setting                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GitHub environment `npm-release` | Required reviewer: the maintainer; deployments only from tags `v*`                                               |
| npm trusted publisher            | GitHub Actions, `pedrofnj/agentforge`, workflow `release.yml`, environment `npm-release`; allowed: `npm publish` |
| npm publishing access            | Require two-factor authentication and disallow bypass-2FA tokens                                                 |
| npm account                      | Two-factor authentication for authorization and writes                                                           |
| GitHub                           | Private vulnerability reporting enabled                                                                          |

No npm token exists in the repository, in GitHub secrets or on CI. The publish job authenticates
with OIDC (npm 11.5.1 or newer is required, so the workflow installs npm 11 before publishing)
and npm adds provenance automatically.

A new trusted publisher stays "pending validation" until the workflow publishes once. If a
configuration expires before that, add it again with the same values.

Staged publishing: npm recommends letting the trusted publisher only stage versions
(`npm stage publish`) so each release is promoted with 2FA. The workflow uses `npm publish`
because the npm CLI used for this project does not provide `npm stage` yet; the GitHub
environment approval is the human gate. Revisit when `npm stage` is available.

## Rollback

- Bad release on npm: `npm deprecate @pedrofnj/agentforge@x.y.z "reason; use x.y.(z+1)"` and publish a
  fixed patch. Use `npm unpublish` only within npm's policy window and only for severe cases
  (for example, a leaked secret).
- Users: `npm install --global @pedrofnj/agentforge@<previous>` and `agentforge update` (update never
  downgrades components; to go back, `agentforge uninstall` then install with the older CLI).
- Repository: revert the release commit; never move or delete a published tag.
