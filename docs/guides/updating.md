# Updating

1. Update the CLI itself: `npm install --global @pedrofnj/agentforge@latest` (with npx,
   `@latest` always fetches the newest version).
2. Update installed components:

```bash
agentforge update --project --dry-run   # see what would change
agentforge update --project --yes
agentforge update --global --client codex --yes
agentforge update appsec-auditor --global --yes
```

What update does:

- Rewrites only files AgentForge installed and you have not changed (hash check).
- Keeps files you edited (`keep-modified`) and tells you; to get the new version of such a file,
  revert or delete your edit and run update again.
- Restores missing managed files, removes files a component no longer ships (if unmodified).
- Never downgrades: a catalog version older than the installed one is skipped.
- Warns when a component now requires a skill you have not installed
  (`agentforge install <skill>`).

Restart Claude Code or Codex if updated components do not show up. Version policy:
[docs/releasing.md](../releasing.md).
