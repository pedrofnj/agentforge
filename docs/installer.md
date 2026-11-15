# Installer, manifests and safety

Code: `src/installer` (state, planning, apply) and `src/updater` (update planning).

## Flow

1. **Recover**: if a journal from an interrupted run exists, roll it back first.
2. **Plan** (read-only): render each selected component per client, inspect every target path,
   and classify each file. Nothing is written while planning.
3. **Review**: print the plan; stop on conflicts unless the user consents interactively.
4. **Apply** (all-or-nothing): journal, back up, atomic writes, write manifest, delete journal.

## File actions

| Action          | Meaning                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `create`        | Path is free                                                             |
| `update`        | We own the file (hash matches the manifest) and the new content differs  |
| `unchanged`     | Already identical                                                        |
| `adopt`         | An identical file already exists; it becomes managed                     |
| `overwrite`     | Conflict resolved by explicit interactive consent; original is preserved |
| `remove`        | Managed file still identical to what we wrote                            |
| `keep-modified` | User edited a managed file: update and uninstall leave it in place       |
| `forget`        | Managed file already gone; dropped from the manifest                     |

Conflicts:

| Reason           | Overridable | When                                                      |
| ---------------- | ----------- | --------------------------------------------------------- |
| `unmanaged-file` | yes         | A different file exists that AgentForge did not install   |
| `modified`       | yes         | Reinstall over a managed file the user edited             |
| `symlink`        | never       | Target or a directory below the client dir is a link      |
| `not-a-file`     | never       | Target is a directory/special file, or a parent is a file |

`--yes` never resolves conflicts. In non-interactive runs they abort with exit code 3 and no
change. `update` treats edited files as `keep-modified`, not as conflicts.

## State (local manifest)

| Scope   | State dir                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| project | `<project>/.agentforge/` (with its own `.gitignore` for journal/backups)                                                                                            |
| global  | `AGENTFORGE_HOME`, else Windows `%LOCALAPPDATA%\agentforge`, macOS `~/Library/Application Support/agentforge`, Linux `${XDG_STATE_HOME:-~/.local/state}/agentforge` |

`manifest.json`:

```json
{
  "schemaVersion": 1,
  "components": [
    {
      "platform": "codex",
      "id": "sample-skill",
      "kind": "skill",
      "version": "1.0.0",
      "files": [{ "location": "skills", "path": "sample-skill/SKILL.md", "sha256": "…" }]
    }
  ]
}
```

- `path` is relative to the client's location dir for that scope (e.g. `~/.agents/skills`). It is
  validated like catalog paths (no `..`, no absolute paths), so a tampered manifest cannot point
  outside client dirs. A malformed manifest stops install, update and uninstall; `doctor` reports it.
- `sha256` is the proof of ownership: only files whose current hash equals the recorded one are
  updated or removed.

## Atomicity and recovery

- `journal.json` is created with an exclusive flag and doubles as a lock. It stores the previous
  manifest, each step, backups of files to be replaced or removed, and directories created.
- Each file is written to `<file>.agentforge-tmp`, fsynced and renamed over the target.
- The commit point is deleting the journal. Any error before that rolls back in-process.
- If the process dies, the next `install`/`update`/`uninstall` rolls the operation back (files,
  created directories and manifest) before planning. `doctor` and `--dry-run` report it.
  If the journal's process is still alive, the command refuses to run.
- Files replaced by consent are copied to `<state>/overwritten/<tx>/` and kept.

## Symbolic links

The client location dir itself may be a link (common with dotfiles managers). Anything below it is
inspected with `lstat`; links and Windows junctions are refused, before planning and again right
before each write. Empty directories are pruned after removal, never the location dir itself.

## What is never done

No network access, no script execution, no AI calls, no telemetry, no background processes. No
writes to client settings, `config.toml`, `CLAUDE.md`, `AGENTS.md`, hooks or permissions.
