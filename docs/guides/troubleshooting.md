# Troubleshooting

Start with `agentforge doctor --verbose`. Exit codes: 0 ok, 1 error, 2 usage, 3 conflict
(nothing changed), 4 cancelled.

| Message                                                                                                                     | What it means                                                   | What to do                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--client claude\|codex\|both is required in non-interactive mode` (also `--global or --project`, `component ids or --all`) | No terminal to ask in (CI, pipe)                                | Pass the flags, or run in a terminal                                                                               |
| `Use --yes to apply without prompting, or --dry-run to preview`                                                             | Non-interactive run needs explicit consent                      | Add `--yes` (never overwrites conflicts)                                                                           |
| `file exists and was not installed by AgentForge` (exit 3)                                                                  | A file of yours is in the way                                   | Move it, or run interactively and confirm the overwrite; the original is kept under the state dir's `overwritten/` |
| `file was modified after installation` (exit 3)                                                                             | You edited a managed file and reinstalled                       | Keep it (use `update`, which preserves edits) or revert it                                                         |
| `path contains a symbolic link (never followed)`                                                                            | A link inside a client skills/agents dir                        | Replace the link with a real directory; links on the client root itself are allowed                                |
| `The current directory is your home directory`                                                                              | `--project` in `~` would hit global locations                   | Use `--global`, or run from a project directory                                                                    |
| `interrupted operation pending` (doctor)                                                                                    | A previous run stopped mid-way                                  | Run any `install`, `update` or `uninstall`; it rolls back first                                                    |
| `Another AgentForge operation (pid N) is running`                                                                           | Concurrent run on the same scope                                | Wait for it to finish                                                                                              |
| `invalid JSON` / `malformed state manifest`                                                                                 | `.agentforge/manifest.json` was edited or corrupted             | Restore it from version control, or delete it and reinstall (identical files are adopted)                          |
| `Path uses a reserved Windows device name` / `not portable`                                                                 | A catalog or state path would be unsafe on Windows              | Rename the file in the catalog                                                                                     |
| `CLAUDE_CONFIG_DIR is set...` (doctor)                                                                                      | Claude Code docs do not say agents/skills move with it          | AgentForge installs to `~/.claude`; confirm where your Claude Code reads them                                      |
| `CODEX_HOME=... does not exist` (doctor)                                                                                    | Codex requires the directory to exist                           | Create it or unset the variable                                                                                    |
| `Codex agents cannot enforce read-only` (doctor)                                                                            | Codex agents inherit the session sandbox                        | Start audits with `codex --sandbox read-only`                                                                      |
| `overrides the agents' plan mode` (doctor)                                                                                  | Your Claude Code settings use bypass, accept-edits or auto mode | Use default mode for audits if you rely on read-only                                                               |

Components do not appear in the client:

- Start a new session; restart the client if the skills or agents directory did not exist before.
- Codex: project-level agents load only in trusted projects; ask for the agent by name.
- Check that you installed for the right client and scope: `agentforge doctor --verbose` prints
  the exact directories.
