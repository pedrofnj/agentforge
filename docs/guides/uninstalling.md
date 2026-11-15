# Uninstalling

```bash
agentforge uninstall                                  # interactive
agentforge uninstall --scope project --all --dry-run  # preview
agentforge uninstall --scope project --all --yes
agentforge uninstall appsec-auditor --provider codex --scope global --yes
```

Interactive mode asks for the scope, the components (all or some; `--provider` restricts it to
one client) and shows a preview before asking to apply. When you remove an agent, it offers to
also remove the skills no remaining agent needs and keeps (and names) the skills other installed
agents still require. Without a terminal, the scope and `--all` or ids are required, and
`--yes` or `--dry-run`.

- Removes only files whose content still matches what AgentForge installed (SHA-256).
- Files you edited, and anything you added yourself, stay in place; the summary lists them.
- Warns when you remove a skill that another installed component requires.
- Removes empty directories it emptied, but never the client directories themselves
  (`.claude/skills`, `.codex/agents`, ...).

Removing the CLI afterwards: `npm uninstall --global @pedrofnj/agentforge`. The project state directory
`.agentforge/` can be deleted once nothing is installed in that project.
