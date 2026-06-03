# Submit Pi Surface Moves to `/code:*` Namespace

## Summary

The submit Pi command moved from `/dev:submit` to `/code:submit`. The headless
`asdl-dev submit` contract is unchanged; only the Pi command surface namespace
changed. `submit` (and `cp`) are now registered through a new
`asdlDevCodeExtension()` with `piNamespace: "code"`, mounted by `codeExtension()`,
while `preview-url` stays under `/dev:*` via `asdlDevExtension()`. The
namespace is now selected by domain: code/source-control workflows live under
`/code:*`, and the generic `cli-command-extension` adapter is shared by both.

This is a naming/domain-namespacing decision, not a behavior change: there is no
new submit implementation, no Graphite policy moved into Pi, and no change to the
gateway-backed workflow, output interpretation, or failure policy that the prior
consolidation established.

Evidence: commit `c5e579b5` ("Rename `code-`/`dev-` skills to `internal-code-*`
and move `/dev:cp` and `/dev:submit` to `/code:*` namespace"), landed on the
default branch (`master`, an ancestor of `HEAD` at `acab3b17`). The current
`ts/packages/pi-extensions/src/asdl-dev-extension.ts` confirms the wiring:
`CODE_COMMAND_NAMES = ["cp", "submit"]` registered with `piNamespace: "code"`,
and `ts/packages/pi-extensions/src/code.ts` calls `asdlDevCodeExtension(pi)`. The
repo docs (`docs/pi/exposing-pi-commands-through-asdl-dev.md`) already describe
`/code:submit` as the clearest consolidation example. Recorded under
landed-state semantics: the move is on trunk, so the durable narrative now reads
as `/code:submit`.

## Objective Impact

- `objective.md` Thesis, Scope, Completion Criteria, and Open Questions now name
  the command surface as `/code:submit` under `/code:*` and note that
  `preview-url` remains under `/dev:*`.
- `roadmap.md` consolidation row and the thin-Pi-UX-wrapper decision row are
  re-framed for `/code:submit`; the wrapper decision still applies unchanged
  under the new name (it concerns whether any wrapper is needed at all, not which
  namespace hosts it).
- No completion state changed: the consolidation row stays `[~]` (strict review
  hardening still pending) and the wrapper-decision row stays `[ ]`. The rename
  does not satisfy any open Completion Criterion on its own.

## Follow-Ups

- When the thin-Pi-UX-wrapper decision is made, evaluate it for `/code:submit`
  specifically; the namespace move does not change the substance of that
  decision.
- The earlier `updates/2026-06-01-141420-typed-submit-gateway-causes.md` note
  referencing `/dev:submit` is a point-in-time historical record left as-is; this
  update supersedes the namespace it mentions.
