# Reusable setup skill added to the cloud objective

## Summary

A reusable setup skill is now an explicit deliverable of this Objective (user decision,
2026-07-12). The skill will guide a fresh repository through the proven Vercel Sandbox
and GitHub integration used by cloud dispatch: GitHub App registration and installation,
Vercel project linkage, environment-variable names and sensitivity, repo-local
`[dispatch]` configuration, preflight, and a controlled Sandbox dispatch probe.

The skill is deliberately **not being authored during the current mint-endpoint slice**.
Instead, the credentials and steel-thread slices will continuously collect the real setup
inputs, ordering, failure modes, and safe verification evidence as implementation lands.
Those facts fold into the canonical README's Setup contract and materially meaningful
Semantic Updates; secret values are never recorded. The setup skill is distilled only
after the steel thread proves the workflow, so it does not preserve speculative steps or
present prototype shortcuts as durable security guidance.

The final distribution and invocation shape remains open until authoring: either a
module-bundled artifact of `@nseng-ai/vercel` or a one-shot project-setup leaf, following
`docs/conventions/skill-conventions.md`. This placement decision does not block the mint
endpoint or Sandbox steel thread.

## Objective Impact

- `objective.md` now includes the setup skill in Scope and Completion Criteria, records
  the risk of leaking credentials or fossilizing prototype shortcuts, and carries the
  distribution/invocation decision as an Open Question.
- `roadmap.md` adds a post-steel-thread setup-skill row and makes evidence collection an
  ongoing responsibility of the credentials and steel-thread slices.
- `orientation.md` now tells agents to collect proven setup facts during implementation
  and not author the skill ahead of the steel thread.
- Existing dependency order remains intact: mint endpoint and dispatch preflight still
  gate the `ns dispatch prompt` steel thread; the skill distills that proven path rather
  than delaying it.

## Follow-Ups

- As each credentials or steel-thread slice lands, fold user-required setup steps and
  observed failure modes into the canonical README's Setup section without recording
  secrets.
- After the steel thread succeeds, decide the skill's package/discovery and invocation
  shape, then author and verify the reusable setup flow.
- Keep v1 shared-secret authentication, sandbox self-landing, and the GitHub App's extra
  Actions/Workflows permissions explicitly labeled as prototype shortcuts with named
  upgrades before wider deployment.
