# Evidence reporting

## Goal

Turn review results into a report a reader can verify quickly, without restating the code.

## When to use

- A review, audit or analysis has findings (or a confirmed absence of findings) to report.

## When not to use

- Casual questions that need a direct answer, not a report.

## Procedure

1. One finding per root cause. Merge duplicates; list every location under one id.
2. Ids: the prefix your agent gives (e.g. `SEC-001`), otherwise `F-001`, numbered by severity.
3. Status (does the issue exist?): `confirmed` when the evidence shows the full path from cause
   to effect; `likely` when one condition is unverified; `needs investigation` when only a
   pattern was seen. Needs-investigation items go to their own section.
4. Severity: Critical (confirmed, real impact, no meaningful preconditions), High (serious impact,
   realistic preconditions), Medium (limited impact or harder preconditions), Low (defense in
   depth), Info (no direct risk). Never Critical for likely or needs-investigation items. Read the
   severity reference only when unsure.
5. Confidence (in the severity and impact assessment): high, medium or low.
6. Category: the problem class; for security add a CWE id only when the mapping is clear.
7. Evidence: at most 5 lines or one fact, secrets masked. Never invent files, lines, CVEs or tool
   output; cite only what you read or ran.
8. Order by severity, then status. Keep each field to one or two sentences.
9. State coverage: what was reviewed and what was not.

## Output

```text
## Findings
### SEC-001 [HIGH] <title>
- Category: <class> (CWE-89)
- Location: path/to/file:42-47
- Evidence: <short snippet or fact, secrets masked>
- Impact: <what an attacker or failure achieves>
- Conditions: <what must be true for it to happen>
- Recommendation: <specific, proportional fix>
- Confidence: high | medium | low
- Status: confirmed | likely

## Needs investigation
- SEC-004 <pattern> at path:line; to confirm: <what to check>

## Coverage
- Reviewed: <areas>
- Not reviewed: <areas and why>
```

If nothing was found, say so and keep the Coverage section.

## Done when

- Every finding has all fields and a real location.
- No secret value appears in the report.
- Needs-investigation items are separated from findings.
