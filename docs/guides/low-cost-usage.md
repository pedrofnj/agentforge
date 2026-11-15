# Using AgentForge on a limited plan

**English** · [Português (Brasil)](low-cost-usage.pt-BR.md)

AgentForge cannot change your plan's limits or quotas. What it can do is keep each request small:
short skill descriptions, instructions that load on demand, and reviewers that read selectively.
These habits help:

1. **Install only what you use.** `agentforge install appsec-auditor --client claude --project --yes`
   installs one agent and the five skills it needs, nothing else. Every installed skill adds a
   short line to the client's always-loaded skill list (all six together are about 1,400
   characters, measured with `agentforge stats`).
2. **Ask for one agent by name.** "Use the appsec-auditor agent to ..." avoids the client trying
   several. Use `review-planning` only for a genuinely broad review.
3. **Pick the profile deliberately.**
   - `quick`: one file or folder, a suspicion to check, a pre-commit look. Up to 5 findings.
   - `standard` (default): a normal review of a feature or service.
   - `deep`: before a release or after `quick`/`standard` found something worth tracing.
4. **Pick the budget.** `economy` reads only matched regions and opens references only when a
   finding depends on them; `thorough` reads whole files. Combine freely: `quick + economy` is the
   cheapest triage; `deep + economy` traces widely but reads little per step.
5. **Narrow the scope in the request.** "Review src/payments" beats "review the repository".
6. **Avoid delegation chains.** Agents never start other agents; do not ask an agent to "use all
   reviewers".
7. **Reuse context.** In the same session, ask follow-ups instead of starting over; the
   repository map is reused when it already exists.

Budgets and profiles are instructions: models usually follow them, but clients do not enforce
token limits per request. To see real usage, check your client (for example `/usage` in Claude Code) or import a run with `agentforge eval import` ([evaluation.md](../evaluation.md)).
