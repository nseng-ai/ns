---
edges:
  - objective: cloud-execution
    annotation: Focused delivery slice — this Objective owns the user contract and implementation evidence for `ns dispatch plan` carrying a Saved Plan into the cloud through Branch Memory; cloud-execution owns the surrounding Vercel dispatch spine and broader cloud program.
---

# Dispatch Plan through Branch Memory

## Thesis

`ns dispatch plan <plan-ref>` sends a Saved Plan to the existing Vercel-native cloud dispatch spine without embedding the plan in an HTTP request or workflow payload. The command resolves an explicit Saved Plan locally, stores a dispatch-owned copy in Branch Memory, verifies that its exact Snapshot Ref is remotely reachable, and starts a dispatch carrying only a typed Branch Memory locator. In the sandbox, deterministic supervision fetches and checks that entry before launch; the harness then runs `brmem get` as its first action and executes the delivered plan. Results continue to land through the existing anchor branch and pull request.

This is a readme-driven-development Objective. Its canonical user-facing contract begins at `references/README-draft.md`; supporting records may explain implementation and rationale but never override that README. The settled contract must be merged into `ts/packages/capabilities/vercel/README.md` before this Objective closes.

## Scope

- The user-facing `ns dispatch plan <plan-ref>` kernel command with one explicit Saved Plan file reference; latest-session-plan selection remains Pi sugar outside the kernel command.
- Safe Saved Plan resolution through the curated `@nseng-ai/plans/api` boundary.
- A workflow-owned Branch Memory Namespace, `dispatch-input`, with a unique dispatch-anchor-derived Entry Key retained as durable input evidence after terminal completion.
- Preflight that confirms Branch Memory Git synchronization is configured, refusing with actionable `brmem setup-git` guidance rather than mutating clone-local Git configuration.
- Exact Snapshot Ref publication and remote-reachability verification before any cloud workflow starts.
- A typed workflow locator carrying Namespace, Entry Key, source branch, and exact ref identity rather than plan content.
- Sandbox-side exact-ref fetch and deterministic `brmem check` before harness launch, followed by a harness instruction whose first action is `brmem get` and whose task is to execute the retrieved plan.
- Plan-specific anchor PR identity, failure reporting, machine output, wrapper-skill coverage, fake-driven tests, and one real end-to-end dispatch.
- Coordination with `cloud-execution` so this focused Objective supplies the evidence for its broader `ns dispatch plan` roadmap dependency without creating a second cloud execution architecture.

## Non-Goals

- Accepting generic Branch Memory locators or Branch Context Attached Plans as command input.
- Reusing the reserved `branch-context` Namespace or representing delivery entries as Attached Plans.
- Sending the plan body through the trigger route, workflow input, or another hidden payload channel.
- Automatically running `brmem setup-git`, silently changing Git configuration, or bypassing configured synchronization with an ad hoc transport contract.
- Deleting delivery entries automatically at workflow completion; retention and future cleanup policy are separate work.
- Replacing the existing Vercel Workflow supervisor, sandbox runner, anchor branch, or pull-request result path.
- Proving long-run supervision again; this Objective reuses the existing workflow-spine evidence and tests the new plan-delivery risk.
- Adding `ns dispatch handoff`, the jobs TUI, another harness, scheduled jobs, or the broader reusable cloud setup skill.

## Completion Criteria

- The canonical README coherently documents the explicit Saved Plan input, Branch Memory delivery behavior, setup prerequisite, remote harness experience, retained evidence, failure states, and anchor-PR result contract.
- `ns dispatch plan <plan-ref>` resolves a Saved Plan, writes a unique `dispatch-input` Entry, confirms configured Branch Memory synchronization, publishes and verifies the exact Snapshot Ref, and starts the existing dispatch workflow with no plan body in its HTTP/workflow payload.
- The sandbox fetches and deterministically checks the exact entry before launch; the harness is then instructed to call `brmem get` first and execute the delivered plan.
- Failure before workflow start leaves no silently orphaned cloud run and reports any local or remote Branch Memory state already created; sandbox retrieval failure is reported durably on the anchor PR.
- Fake-driven tests cover success, unsafe or missing plan input, Branch Memory setup refusal, write/push/remote-verification failures, locator validation, sandbox precheck failure, help, machine output, and wrapper parity.
- One witnessed real Saved Plan dispatch proves exact Branch Memory delivery, harness `brmem get`, plan execution, an agent-created commit, and normal anchor-PR landing. Existing long-supervision evidence from `cloud-execution` is linked rather than repeated.
- The settled README is merged into `ts/packages/capabilities/vercel/README.md`, and this Objective's canonical reference is repointed to that durable user-facing home.

## Definition of Progress

Progress is keepable when:

- Local code and documentation implement one coherent contract slice and targeted fake-driven tests plus relevant TypeScript checks pass.
- Changes preserve the Vercel-native supervisor and use explicit gateways for Saved Plan, Branch Memory, Git remote, workflow, and sandbox boundaries.
- User-facing prose distinguishes locally implemented behavior from live-proven behavior and contains no secret or credential material.

Do not keep changes that:

- Put the Saved Plan body into trigger or workflow payloads, reuse `branch-context` for transport, or introduce a second dispatch spine.
- Mutate Git configuration automatically, perform an unconfirmed external write, or claim live verification not witnessed by the actor recording it.
- Broaden input to Attached Plans or raw Branch Memory locators without a new user decision.

Useful evidence includes targeted Vercel, Plans, Branch Memory, and capability-kit tests; `just ts-check`; CLI scenario coverage; `build:deployable` when the deployable changes; and safe, value-free live run identifiers recorded after a confirmed interlude.

## Runner Policy

This Objective is execution-friendly for `objective-next` under these boundaries.

- Direct execution after preview is allowed for local code, fake-driven tests, wrapper skills, README/reference edits, and meaningful Objective tracking within this focused contract.
- Steer or ask first when a slice changes the public input model, Branch Memory Namespace/lifecycle, remote refspec contract, harness retrieval responsibility, cloud architecture, or durable README destination.
- Runner work may be left as locally validated edits or a local commit only when the confirmed preview includes that state; branch creation and commit workflow follow repository Graphite rules.
- Before keeping TypeScript work, run targeted tests and relevant TypeScript checks; when deployable artifacts change, also pass `build:deployable`.
- `brmem put`, pushing Branch Memory or source refs, creating or mutating an anchor PR, deployment, workflow triggering, and all other external writes are out of scope unless separately previewed and explicitly confirmed. PR submission and publication are never implicit.
- Live facts and Semantic Updates are recorded only by the parent or human who witnessed the confirmed interlude.

## Assumptions and Risks

Assumptions:

- Branch Memory Snapshot Refs can act as the git-native input plane because `brmem setup-git` configures ordinary remote operations to synchronize `refs/brmem/*`.
- A retained dispatch-owned Entry gives enough immutable provenance for retries and review when paired with an exact Snapshot Ref identity.
- The sandbox checkout can fetch the exact Branch Memory ref and run the repository's available `brmem` command before the harness begins its task.
- The existing prompt dispatch spine can be deepened into a shared dispatch core without changing its Vercel-native architecture or result contract.

Risks:

- Ordinary source pushes and Branch Memory ref pushes can partially succeed. The command must order mutations deliberately, verify exact remote state, and report every durable artifact already created so retry or cleanup is safe.
- Branch Memory Entries are branch-scoped while a dispatch also has an anchor branch. The contract must keep the source branch, delivery Snapshot Ref, and result anchor distinct and explicit.
- Telling the harness to retrieve its own plan could turn deterministic transport failure into agent behavior. Mitigation: the supervisor fetches and checks the exact Entry before launch; the harness-owned `brmem get` remains the visible first action, not the only validation.
- Retained delivery Entries can accumulate. Retention is deliberate evidence for this slice; any cleanup policy must later preserve reproducibility and avoid implicit deletion.
- Generalizing prompt-only code may create a shallow abstraction. The implementation should extract only the shared dispatch phases while keeping prompt and plan input preparation explicit and testable.
- The existing Pi steel thread has live-unproven repairs. Local plan delivery can proceed, but final end-to-end evidence depends on normal harness commit and landing behavior working in production.

## Open Questions

- What exact Entry Key shape best combines the dispatch anchor ID with a human-readable plan slug while remaining stable and collision-free?
- Which safe locator fields should appear in human and machine command output and on the anchor PR without exposing implementation noise?
- Should a later explicit cleanup command prune retained `dispatch-input` Entries, and what evidence/age rules would make deletion safe?
