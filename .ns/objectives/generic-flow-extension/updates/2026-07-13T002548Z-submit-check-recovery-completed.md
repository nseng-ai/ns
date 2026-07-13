# Submit-check recovery completed with consumer-configurable prompt policy

## Summary

Completed the submit-check recovery slice around the settled
`flow.submit.pre.recovery` override prompt point. The point is defined in both Flow's
extension descriptor and the SDK's mirrored built-in catalog. Flow packages a generic
repository-neutral default, while this repository installs a conventional
`.ns/prompts/flow.submit.pre.recovery.md` override that names `code-just-fix`; no
repository-specific skill or `just` reference entered the Flow package.

The generic Flow Pi mirror now uses the awaited CLI completion hook to recognize only
failed `ns:flow:submit` commands whose stderr contains one exact renderer-owned marker
line: `NS_FLOW_SUBMIT_CHECK_FAILURE` or
`error: NS_FLOW_SUBMIT_CHECK_FAILURE`. A match resolves the Git repository root and
repository point policy, then sends one user-message turn containing the recovery
instructions, shell-safe original invocation, cwd, exit code, and a bounded indented
stderr tail labeled as untrusted diagnostic data. It does not run a check or submit
command itself.

The implementation preserves the grilled fail-fast policy. Recovery returns actionable
failures when upward discovery finds no `.git` file or directory, a Git marker probe
errors, `ns.toml` cannot be trusted, a recovery-point-specific catalog diagnostic occurs,
or a selected repository prompt is missing, unreadable, or empty. Unrelated point
diagnostics do not block recovery, and the built-in prompt is used only when no repository
override is installed.

## Objective Impact

The **Recovery slice** roadmap row is complete. Fake-driven unit and Pi tests cover Git
root discovery (including linked-worktree `.git` files), exact marker matching, point
precedence and diagnostics, repository-policy hard failures, submit-only routing, idle
user-message delivery, shell-safe invocation context, and tail bounds. SDK unit/scenario
coverage proves the mirrored point and active conventional source; integration coverage
loads the checked-in Flow descriptor and resolves its packaged default relative to the
manifest.

Focused recovery/Pi/catalog/scenario tests pass, the full integration lane passes,
TypeScript check/lint/format pass, and the repository `just` entrypoint passes. Live
`ns extension point` inspection reports the conventional recovery prompt as active and
leaves `flow.submit.pre` installed as the existing additive hook. Bounded neutrality
searches confirm `code-just-fix` appears only in consumer prompt policy and no
`flow.validation.*` or standalone Flow validation/check command was introduced.

The Objective remains open: adopter point documentation, the four audit-driven
genericization clusters, and README promotion are still active work.

## Follow-Ups

- Add the adopter-facing extension-point guide routing and catalog-consumption section.
- Complete the audit-driven repository identity, Graphite machine facts, Pi ownership,
  and point-default fidelity slices without expanding the parked failure protocol.
- Promote the settled README after implementation and documentation match its contract.
