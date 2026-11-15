# Large repositories and monorepos

- Workspace roots: look for a top-level workspace or build file that lists packages; map
  packages as units instead of walking every directory.
- Scope first: ask which package or service matters when the task does not say. If you cannot
  ask, start with packages that expose network or CLI entry points.
- Sample, then extend: map one package fully, then only the entry points of the others.
- Shared code: record shared libraries once and reference them from each package.
- Generated or vendored trees can be very large; confirm by one file header, then exclude the
  whole tree.
- Record what you skipped in "Excluded" so later steps do not repeat the search.
