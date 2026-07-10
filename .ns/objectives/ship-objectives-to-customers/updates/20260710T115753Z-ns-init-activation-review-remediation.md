# `ns init` activation review remediation

## Summary

Closed the five surviving review findings in the descriptor-driven activation slice without adding extension-specific behavior to `@nseng-ai/ns-init`.

The kernel declared-descriptor loader now canonicalizes declaration identities before loading. npm declarations are grouped by package name and local declarations by their normalized absolute module root. Every duplicate identity group produces one ordered structured diagnostic and contributes no descriptor.

Harness-artifact reconciliation now consumes those canonical loaded descriptor records rather than maintaining a second package/descriptor loader. Its prepared desired-state transition owns exact source bytes, immediate apply-time target facts, and the expected same-key manifest entry. Apply preserves unrelated manifest entries, accounts for earlier transitions in the same aggregate, and refuses source, target, or same-key manifest drift. Full activation reads project manifests for every supported harness and safely removes only unchanged manifest-tracked files belonging to removed extensions, deselected harnesses, replacements, or obsolete files. Missing tracked files are safe, untracked files remain, non-empty directories remain, malformed/out-of-root ownership records are refused, and consumer directories are never deletion inputs.

`ns init` now treats stale locally edited tracked artifacts as preflight diagnostics, so one conflict prevents every activation write. It also plans, applies, and reports `.gitignore` as a first-class duty, appending the exact `.ns/managed-extensions/` rule while preserving customer content. Human and structured reports include removed artifact reasons and files.

## Objective Impact

This remediation supersedes the earlier bounded choice recorded in `20260709T235519Z-generic-ns-init-activation-implemented.md` to preserve every stale manifest entry. That update remains intact as historical evidence; current activation behavior reconciles stale manifest-owned artifacts under the stricter ownership and local-edit safety rules above.

The activation roadmap row remains `[~]`. Full `ns init` reconciliation is implemented, but `ns extension install|uninstall|update` still needs to invoke the same activation lifecycle before the row can close.

## Review Finding Closure

1. **Competing descriptor loaders:** removed the root-based harness-artifact loader; reconcile now uses the kernel's canonical declared-descriptor gateway and loaded records.
2. **Absent stale reconciliation:** added explicit safe removal, deselected-harness, obsolete-file, and same-target replacement transitions with full-versus-targeted authority.
3. **Duplicate canonical identities:** added one diagnostic per duplicate npm/local identity group and excluded all group members.
4. **Missing managed-extension ignore duty:** added deterministic `.gitignore` create/append/idempotence behavior and reporting.
5. **Prepared-state drift:** bound writes to prepared bytes and added immediate source/target/same-key manifest reread validation while preserving unrelated manifest updates.

## Validation

Focused kernel, harness-artifact, and ns-init checks and tests pass, including fake-driven deletion/conflict/drift coverage and real-adapter integration coverage. Workspace TypeScript format, lint, and tsgo checks pass. Final repository-wide validation is recorded in the implementation session closeout.

## Follow-Ups

- Wire the same descriptor-driven activation and safe artifact reconciliation into the
  extension install, uninstall, and update lifecycle commands.
- Preserve consumer directories and customer-owned data while adding lifecycle
  deprovisioning behavior.
