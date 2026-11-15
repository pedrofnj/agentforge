# Uninstalling

```bash
agentforge uninstall --project --all --dry-run       # preview
agentforge uninstall --project --all --yes
agentforge uninstall appsec-auditor --client codex --global --yes
```

- Removes only files whose content still matches what AgentForge installed (SHA-256).
- Files you edited, and anything you added yourself, stay in place; the summary lists them.
- Warns when you remove a skill that another installed component requires.
- Removes empty directories it emptied, but never the client directories themselves
  (`.claude/skills`, `.codex/agents`, ...).

Removing the CLI afterwards: `npm uninstall --global @pedrofnj/agentforge`. The project state directory
`.agentforge/` can be deleted once nothing is installed in that project.
