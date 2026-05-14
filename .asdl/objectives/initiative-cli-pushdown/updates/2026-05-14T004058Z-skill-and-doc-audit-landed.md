# Skill and Doc Audit Landed

## Summary

PR 467 (`delegate-objective-skills-to-exec`) closes out the PR 5 audit. The five remaining Objective skill `SKILL.md` files (`objective-current`, `objective-update`, `objective-close`, `objective`, `objective-create`) and `docs/objective-system.md` now delegate deterministic mechanics to the shipped `objective exec` commands:

- Candidate listing → `objective exec list --format md`.
- Record reading and closed-marker detection → `objective exec read-objective <slug> --format md`.
- Tracking Gate changed-path facts → `objective exec tracking-gate-facts <slug-or-path> --base-ref <ref>` (already wired in `objective-next`).

Read-only skills got read-only wording; mutating skills (`objective-update`, `objective-close`, `objective-create`) got read-and-edit wording that explicitly keeps mutation direct. The umbrella `objective` skill replaced its stale "do not add or call Python CLI tooling" line with the new CLI-meaning-versus-CLI-facts split and kept an explicit prohibition against parsing Markdown headings, roadmap checkboxes, or prose meaning in CLI code. `docs/objective-system.md` now distinguishes shipped from future CLI responsibilities per operation and replaces the "deterministic git comparison is future work" sentence with a pointer to `tracking-gate-facts`.

Verification on the PR 467 branch: `uv run pytest packages/asdl-objectives/tests tests/scenario/test_plugins.py` and `just` both passed (1572 tests, ruff/dprint/ty clean). No `.asdl/objectives/` files were touched by that PR; the roadmap edits and this update live in this `objective-update` invocation instead.

## Objective Impact

PR 5 is now fully done: the `tracking-gate-facts` command landed earlier on PR 466, and the closeout skill/doc audit landed on PR 467. The "Update Objective skills and docs to delegate deterministic mechanics" roadmap item is materially covered by the same PR 467 change set and flips to `[x]` here.

Only one roadmap item remains: "Validate the full steelthread." That item is largely satisfied by the green suites on PR 466 and PR 467, but is kept open until a deliberate final pass confirms no test gaps for the new CLI surface beyond the existing scenario/unit coverage.

The CLI-boundary risk (creep from fact collection into Markdown interpretation) is reduced further by the umbrella skill's explicit prohibition on parsing Markdown headings, roadmap checkboxes, or prose meaning in CLI code. The "less-clear skill docs" risk is reduced by keeping the canonical snippets short and consistent across the five edited skills.

## Follow-Ups

- Validate the final steelthread item: confirm there are no remaining test gaps for the JSON contracts and Markdown renderers shipped across PRs 3–5, and run the repository test/lint suite once more before considering this Objective ready for `objective-close`.
- When PR 466 and PR 467 land on `master`, consider whether the umbrella skill's explicit "do not parse Markdown headings, roadmap checkboxes, or prose meaning in CLI code" guard should also live in `CONTEXT.md` as a domain rule rather than only in the umbrella skill.
