# Semantic dispatch anchor identity adopted

## Summary

Cloud prompt dispatch now prepares semantic anchor names as
`dispatch/<semantic-slug>-<YYYYMMDD-HHmmss>` before its first mutation. Prompt content is
the default naming input through a dispatch-owned content-slug Consumer Gateway; a future
plan command can pass resolved plan content through the same `{ kind, content, cwd }` seam.
`--slug/-s` overrides only the semantic portion and bypasses model generation.

The timestamp uses `[dispatch].anchor_timezone`, validated and canonicalized as an IANA
timezone and defaulted to `America/Los_Angeles`. Exact remote collisions try the base name,
then `-2` through `-50`. Semantic generation, configured-zone formatting, and availability
selection now precede source reachability pushes. Generation, configuration, availability,
or exhaustion failure therefore leaves the source, anchor, PR, and Workflow untouched. A
concurrent create race remains possible after the availability read; the existing
non-overwriting anchor-push failure reports that race.

## Objective Impact

This replaces source/random anchor identity with durable work intent plus repository-defined
civil time while preserving the load-bearing `dispatch/` jobs-discovery prefix, up-front PR,
source branch as PR base, metadata-only initialization commit, Workflow run stamp, and landing
protocol. Model failure intentionally has no deterministic fallback; `--slug/-s` is the
recovery and automation path.

The Vercel package tests and package typecheck cover semantic derivation/bypass, timezone
default and override, DST repeated-hour behavior, exact remote availability and collisions,
all pre-mutation failure modes, and unchanged post-mutation partial-failure reporting. This
is local implementation evidence only; no deployment or live dispatch was performed.

## Follow-Ups

- Use the semantic name during the already-required controlled Pi steel-thread rerun and
  record live evidence only if an authorized operator witnesses it.
- Route future `ns dispatch plan` naming from resolved plan content, not a filename or plan
  reference.
- Keep `dispatch/` as the jobs-TUI enumeration prefix and retain the existing anchor-push
  recovery for concurrent-create races.
