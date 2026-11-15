# Review planning

## Goal

Get the requested review done with the fewest agents and the least repeated context.

## When to use

- The user asks for a full, broad or multi-area review or audit.
- The request does not make clear which specialist fits.

## When not to use

- The request clearly fits one area: hand it to that specialist directly, or do it yourself if
  it is a small, targeted question.
- Trivial questions about one file or function: answer without delegating.

## Procedure

1. Restate the goal and scope in one sentence. Ask only if the scope is truly ambiguous.
2. Choose the profile the user named; otherwise `standard`. Use `quick` for narrow questions and
   `deep` only when the user asks for depth or the risk justifies it. Keep the budget the user
   named (`economy`, `balanced`, `thorough`; default `balanced`); with `economy`, use one
   specialist unless the user asked for several areas.
3. Build the repository map once with `repository-discovery` (skip for `quick` with a clear
   scope).
4. Pick specialists from the request and the map (see `references/agent-selection.md`):
   one by default; add another only when the request or the map gives a concrete reason. Skip
   specialists whose area does not exist in the repository.
5. Delegate with the client's own agent mechanism. Give each agent: goal, scope, profile, budget,
   the repository map, and the areas it must not repeat. Run independent agents in parallel when the
   client supports it. If a specialist is not installed, do that part yourself with the same
   skills.
6. Merge the results with `evidence-reporting`: keep each agent's ids, merge findings that share
   a root cause or location, and keep one combined coverage section.

## Done when

- Each selected agent had a stated reason, and no agent was started without one.
- One merged report, without duplicate findings, covers the requested scope.
