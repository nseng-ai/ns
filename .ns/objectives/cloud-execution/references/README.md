# Cloud execution reference map

## Purpose

This directory separates current contracts and procedures from design rationale, live
evidence, and historical incident records. Stable topic documents are living references:
update them when new implementation or live evidence changes the current best-known truth.

## Authority order

1. `README-draft.md` — canonical user-facing contract.
2. Topic references below — current engineering contracts and procedures.
3. Design records — rationale behind current decisions.
4. `dispatch-live-evidence.md` — append-only witnessed facts and bounded claims.
5. Historical/vendor reports — chronology and feedback, not current implementation guidance.
6. `../updates/*.md` — immutable Semantic Updates explaining decisions and status changes.

A lower layer must not override a higher one. If evidence contradicts a living topic
reference, update the topic reference and record the resulting decision or roadmap impact.

## Living topic references

| Topic                                                            | Canonical owner                            |
| ---------------------------------------------------------------- | ------------------------------------------ |
| Fresh-repository setup and ordered preflight                     | `dispatch-setup-and-preflight.md`          |
| Build Output, runtime closure, Workflow inventory, and promotion | `dispatch-deployment-contract.md`          |
| OIDC, GitHub App identity, token phases, and secret custody      | `dispatch-credentials-and-trust.md`        |
| Workflow supervision, Sandbox checkout, polling, and cleanup     | `dispatch-workflow-and-sandbox-runtime.md` |
| Source push, anchor PR, run stamp, landing, and reporting        | `dispatch-anchor-and-landing.md`           |
| Headless Pi SDK hosting, tools, subagents, and result protocol   | `dispatch-pi-runner.md`                    |
| Failure classification, observability, and debugging ladders     | `dispatch-debugging-and-observability.md`  |

Each topic reference owns current engineering truth for its topic. Other documents should
link to it rather than restate its full contract.

## User contract and planning

- `README-draft.md` — user experience, commands, concise setup, anchor-PR behavior, and open
  product questions.
- `../roadmap.md` — dependency order and completion status; it links to references rather
  than owning technical detail.
- `../objective.md` — thesis, scope, completion criteria, risks, and live-action policy.
- `../orientation.md` — standing cross-repo direction.

## Design rationale and research

- `seam-design.md` — Vercel-native architecture and seam decisions.
- `credentials-design.md` — credential-design rationale and rejected alternatives.
- `git-credential-minting-research.md` — primary-source credential research.
- `vercel-kb-sandbox-private-repos.md` — focused Vercel private-repository research.

These explain why. The living topic references say what is currently true.

## Evidence and historical records

- `dispatch-live-evidence.md` — append-only deployment, run, PR, commit, and bounded-claim
  ledger.
- `vercel-workflow-deployment-feedback-report.md` — chronological Vercel deployment incident,
  reproduction, provenance, and vendor feedback.
- `vercel-sandbox-github-integration-field-guide.md` — compatibility pointer for older
  Objective references; its operational content moved to the topic references.

The proof artifact created by the first completed dispatch remains on
<https://github.com/nseng-ai/ns/pull/3612>. It is evidence cited by the ledger, not a
source-branch contract document.

## Update protocol

When a session learns something new:

1. Append the witnessed fact to `dispatch-live-evidence.md` with date, revision, locator,
   observation, bounded claim, and affected topics.
2. Update the one living topic reference that owns the fact.
3. Update `README-draft.md` only if user-visible behavior or setup changed.
4. Update `../roadmap.md` if completion status or remaining work changed.
5. Add a Semantic Update only for a meaningful decision, direction, or status transition.
6. Update the Vercel feedback report only when the finding concerns Vercel behavior.

Do not silently rewrite old evidence. Add an explicit correction or supersession entry.
