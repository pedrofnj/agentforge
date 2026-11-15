# Repository discovery

## Goal

Produce a short repository map that later steps reuse, reading as little as possible.

## When to use

- Before a review or audit, when the structure is not already known in this conversation.
- When the user asks how a repository is organized or what it contains.

## When not to use

- A repository map already exists in this conversation: reuse it.
- The user named the exact files to inspect.

## Procedure

1. List the root and one level below by name only. Do not open files yet.
2. Infer ecosystems from build, package, lock and container file names. Open a manifest only to
   confirm a fact the map needs.
3. Locate entry points and trust boundaries with targeted searches instead of full reads.
   Search (case-insensitive) for: `main|listen|route|handler|controller|endpoint|server|command`
4. Flag sensitive areas whose path matches (case-insensitive): `auth|session|user|admin|account|permission|role|token|crypto|config|secret|upload|payment`
5. Skip vendored, generated and build output (dependency folders, build dirs, minified files).
6. Stop when each map item is filled or marked unknown. Do not keep listing without new facts.

## Output

```text
Repository map
- Ecosystems: <name> (evidence: <file>)
- Entry points: <path> - <kind of input>
- Trust boundaries: <where external input arrives>
- Sensitive areas: <path> - <why>
- Excluded: <paths skipped>
- Unknown: <what could not be determined>
```

## Done when

- Every map item cites paths or is marked unknown; nothing is guessed.
- Fewer files were opened than listed; content was read only to confirm a map item.
