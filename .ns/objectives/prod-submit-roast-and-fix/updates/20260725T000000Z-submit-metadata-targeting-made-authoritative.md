# Semantic Update: Submit Metadata Targeting Made Authoritative

Ordinary `ns flow submit` now treats its pre/post branch inventory as the ownership model for interim initial PR metadata. After Graphite publishes, Flow queries GitHub for the open PR on every branch in the pre-submit plan and reconciles those identities before description preparation. Graphite stdout links remain diagnostic evidence only and cannot select a metadata target or label a branch by position.

Every planned branch must resolve exactly one open PR. Missing, ambiguous, malformed, query-failed, changed pre-existing, or duplicate identities fail after publication with branch-specific diagnostics and recovery guidance; metadata generation and GitHub edits do not start. On success, only branches classified `new` before publication become metadata targets, while pre-existing PRs remain untouched. The existing prepare-all-before-edit and sequential fail-fast application contracts remain unchanged.

Evidence: pure reconciliation unit coverage, ordinary-submit coverage with omitted Graphite PR links and aggregated unresolved inventory, branch-keyed matrix coverage, and the submit command scenario suite.
