# Local Feedback Resolution: Current Journey Inventory

## 1. Purpose and decided Destination baseline

This note inventories the current Reviews, Address/Pi, and Slots behavior against the already-decided local-feedback-resolution Destination. It is requirements evidence, not a proposal for package seams, persistence, gateways, or a canonical cross-source model. The governing scope is a coherent local, pre-PR path from engineer-controlled adversarial review through validated candidate fixes, without mutating the engineer's active checkout or coupling the loop to submit/ship (`.ns/objectives/local-feedback-resolution/objective.md`).

The decided first journey is:

1. Prompt for an arbitrary revision range, suggest and explain `trunk merge-base...HEAD`, and never silently default.

2. Show applicable checked-in `.ns/reviews/<key>/review.md` definitions, their resolved models, and prompt the engineer to confirm/toggle the roster.

3. Run the roster in the foreground with live per-review progress; retain each failed reviewer as a source-attributed coverage gap while continuing completed reviewers.

4. Aggregate findings into proposed, engineer-correctable duplicate clusters while preserving every original finding, severity, evidence, and source verbatim.

5. Flag proposed recommendation conflicts; exclude unresolved conflicts from bulk acceptance; let bulk triage confirm or override proposed actionability.

6. Steer confirmed work into a dependency-ordered set of planned PRs, then require one deliberate confirmation before attempting fixes.

7. Use a disposable ordinary slot/worktree and produce one local candidate branch per planned PR; do not touch the active checkout without deliberate adoption.

8. Validate each candidate branch in the slot. Validation is visible evidence, not an adoption gate.

9. Show one outcome report per planned PR, permit manual slot inspection, and prompt for per-branch adoption.

10. Account for every finding as adopted, rejected, deferred, failed, or unattempted. Early exit must be honestly incomplete, not silently lossy.

11. Make findings/triage and slot outcomes durable stage-boundary checkpoints; restart an interrupted stage rather than pretending to resume within it.

These decisions come from the three 2026-07-16 Semantic Updates (`.ns/objectives/local-feedback-resolution/updates/2026-07-16-end-to-end-journey-defined.md`, `.ns/objectives/local-feedback-resolution/updates/2026-07-16-engineer-review-control-defined.md`, `.ns/objectives/local-feedback-resolution/updates/2026-07-16-multi-reviewer-feedback-semantics-defined.md`). The source contract also requires each finding to retain review key, definition version, resolved model, and reviewed range, while the run record retains toggled-off and failed reviews. Model selection is declarative through checked-in definition/profile mapping; range and roster are the only first-loop run-time controls.

## 2. Reviews current journey

### User commands and surfaces

- The canonical surface is `ns reviews ...`: list definitions, optionally filter for CI and applicability, run one key, and inspect per-branch Review logs. A run is explicitly read-only review, not remediation (`ts/packages/capabilities/reviews/README.md`, `ts/packages/capabilities/reviews/CONTEXT.md`).

- `ns reviews list [--ci] [--applicable] [--base-ref ...]` loads every direct-child definition and, when requested, filters by changed paths (`ts/packages/capabilities/reviews/src/commands/list.ts:1-37`, `ts/packages/capabilities/reviews/src/operations/cli-operations.ts:45-75,175-227`).

- `ns reviews run <key>` runs exactly one selected key; there is no roster-run command, roster confirmation prompt, or aggregate run surface (`ts/packages/capabilities/reviews/src/commands/run.ts:1-35`, `ts/packages/capabilities/reviews/src/operations/cli-operations.ts:77-97,255-273`).

- The run command currently accepts `--model` and `--model-profile`, in addition to `--base-ref`, log branch, and optional PR prior-findings inputs. The model/profile overrides conflict with the decided first-loop rule that model changes remain versioned/declarative and range plus roster are the only run-time controls (`ts/packages/capabilities/reviews/src/commands/run.ts:16-27`, `ts/packages/capabilities/reviews/src/operations/review-run.ts:224-269`).

- Human output reports findings and usage after completion. The diagnostic called “progress” is emitted only after `runReview` returns, so it is useful resolved-run metadata but not live foreground per-review progress (`ts/packages/capabilities/reviews/src/operations/cli-operations.ts:299-338`).

### Reusable behavior

- Repo-only catalog discovery already enforces `.ns/reviews/<key>/review.md`, direct-child keys, and checked-in instructions/assets (`ts/packages/capabilities/reviews/src/gateways/review-catalog.ts:15-109`).

- Definition parsing already validates description, instructions, `model_profile`, `local_only`, and repo-relative include/exclude globs (`ts/packages/capabilities/reviews/src/core/review-definition.ts:11-113,153-258`).

- Applicability already means path intersection after include/exclude filtering; an unscoped definition applies to all changed paths (`ts/packages/capabilities/reviews/src/core/review-applicability.ts:7-50`). This matches the decided first-loop applicability semantics.

- Project model policy already resolves quick/deep operations through `ns.toml`, and the runner retains the qualified resolved model. That is the reusable declarative model behavior once per-run overrides are excluded from this journey (`ts/packages/capabilities/reviews/src/core/project-config.ts:12-21,73-94`, `ts/packages/capabilities/reviews/src/operations/review-run.ts:224-269`).

- `ReviewsClient` exposes typed list, run, log, record, and publish operations without requiring command-output parsing (`ts/packages/capabilities/reviews/src/core/api.ts:45-104`).

- Runner failures are typed outcomes, and log-write failure is distinguished from review failure, which is relevant to continuing a roster while truthfully recording gaps (`ts/packages/capabilities/reviews/src/operations/review-run.ts:44-57,90-148`).

- Input coverage records omitted files and token caps, giving useful evidence that a nominally completed review may not have seen the full diff (`ts/packages/capabilities/reviews/src/core/models.ts:186-214`).

### Current range, artifacts, and provenance

- Current range selection is a base branch label, resolved to trunk when omitted, and executed as `origin/<baseRef>...HEAD`. It cannot express an arbitrary revision range, does not prompt, and can silently use resolved trunk (`ts/packages/capabilities/reviews/src/core/project-config.ts:100-118`, `ts/packages/capabilities/reviews/src/gateways/local-diff.ts:38-119`).

- `ReviewFinding` is structured as `{path, line, severity, summary, details}` with the shared `info | warning | error` enum. It has no finding ID, source key, definition version, resolved model, or reviewed range of its own (`ts/packages/capabilities/reviews/src/core/models.ts:3,74-90`).

- `ReviewRunResult` adds run-level review name/path, model profile, resolved model, base ref, findings, usage, and input coverage. It still records only a base-ref label, not the selected range endpoints/merge-base, and has no definition commit/content hash or roster decisions (`ts/packages/capabilities/reviews/src/core/models.ts:216-234`).

- Review logs add timestamp, branch, HEAD commit, base ref, model, findings, usage, and coverage, but serialize these as presentation-oriented Markdown in branch-scoped Branch Memory (`ts/packages/capabilities/reviews/src/gateways/review-log.ts:15-49,215-259`). They are useful durable evidence, but not a structured findings/triage checkpoint a future consumer can use without parsing Markdown.

- Logs are keyed per review and timestamp under the `reviews` Branch Memory namespace; listing is scoped to the current branch (`ts/packages/capabilities/reviews/src/gateways/review-log.ts:268-301,372-404`, `ts/packages/capabilities/reviews/src/operations/cli-operations.ts:425-467`).

### PR/GitHub assumptions, gaps, and constraints

- Local listing and running are PR-free. A normal local run needs git diff, a model harness, and Branch Memory, but not a GitHub PR (`ts/packages/capabilities/reviews/src/operations/review-run.ts:90-148`).

- GitHub enters at optional convergence and publication boundaries: prior-findings can be gathered by explicit PR number, and `publish-findings` writes summary/inline PR comments (`ts/packages/capabilities/reviews/src/operations/cli-operations.ts:275-297,469-518`). The README explicitly says local runs remain PR-context-free by default and gathering failure degrades to context-free review (`ts/packages/capabilities/reviews/README.md`, “Review convergence”).

- There is no prompted arbitrary-range selection, range explanation, prompted roster, roster-level run, live multi-review progress, continue-on-one-review-failure aggregation, failed/toggled-off roster record, clustering, conflict flagging, bulk triage, steering, planned PRs, or handoff to fixes. Reviews remains correctly bounded as a read-only findings producer (`ts/packages/capabilities/reviews/CONTEXT.md`).

- Applicability filtering and actual run filtering use the same path predicate, but each one independently loads a diff; requirements must preserve one confirmed range across roster and all runs rather than allow range drift between stages (`ts/packages/capabilities/reviews/src/operations/cli-operations.ts:198-211`, `ts/packages/capabilities/reviews/src/operations/review-run.ts:150-180`).

- A definition version is not captured today. Dirty checked-in definitions make the already-open commit-vs-content-hash choice observable, not merely cosmetic.

## 3. Address current journey

### Download, primitive, and mutation surfaces

- Address currently retains a Markdown feedback downloader, branch/PR/check plumbing, structured read primitives, and reply/resolve/bulk-close mutations under `ns address exec ...` (`ts/packages/capabilities/pr-feedback/README.md`, `ts/packages/capabilities/pr-feedback/src/exec-commands.ts:1-17`).

- Download resolves an explicit PR or current branch PR, concurrently fetches PR reviews, review threads, and discussion comments, filters resolved/empty/automation-like items, and returns target metadata, counts, `bodyMarkdown`, and wrapped `markdown` (`ts/packages/capabilities/pr-feedback/src/core/feedback-snapshot.ts:8-65`, `ts/packages/capabilities/pr-feedback/src/core/download-feedback.ts:26-119,135-167`).

- The principal download artifact is intentionally a human-facing Markdown report plus counts/target metadata, not a triage request or durable structured classification (`ts/packages/capabilities/pr-feedback/src/core/download-feedback.ts:169-246`, `ts/packages/capabilities/pr-feedback/test/scenario/download-feedback.test.ts:120-148`).

- Read primitives preserve GitHub identity and source details: PR summaries, review IDs, thread IDs and state, comment IDs/authors/locations/timestamps, and discussion-comment IDs/URLs (`ts/packages/capabilities/pr-feedback/src/primitive-results.ts:14-75`, `ts/packages/capabilities/pr-feedback/src/operation-schemas/collection.ts:133-191`).

- Reply and resolve primitives return thread IDs and resulting comment/resolution state. Bulk close returns ordered per-request entries with reply, resolution, and staged error, plus aggregate counts (`ts/packages/capabilities/pr-feedback/src/core/review-thread-mutations.ts:10-51,126-181`).

- Bulk close attempts reply before resolution, skips resolution for a failed reply, uses batch resolution when available, falls back to per-thread resolution, and restores request order in outcomes (`ts/packages/capabilities/pr-feedback/src/core/review-thread-mutations.ts:126-252`). This is useful behavioral evidence for per-item accounting and partial failure, not a reusable local-triage mechanism by itself.

### Pi stack-feedback report to prompted disposition behavior

- `/pr:download-stack-feedback` discovers the Graphite downstack, maps branches to open PRs, downloads each PR, combines the reports, totals counts, and prefills one Pi editor document (`ts/packages/hosts/pi/src/core/pr/extension.ts:72-97,219-281,315-395,424-517`).

- Pi owns orchestration and presentation: it appends a workflow-boundary prompt asking the agent to propose an omnibus/split-out disposition plan and wait for explicit human approval. Address itself returns a report and does not initiate triage (`ts/packages/hosts/pi/src/core/pr/extension.ts:25-39,420-424,535-540`, `ts/packages/hosts/pi/test/pr-download-feedback.test.ts:314-449`).

- Current disposition policy is prompt/skill behavior: stack feedback is always HITL; group omnibus, split-out, decline, and defer; itemize declines/deferrals; steer placement; then fix, validate, submit, and resolve threads in one bounded snapshot pass (`.agents/skills/pr-address/SKILL.md`, “Disposition structures” and “Addressing workflows”).

- The prompted report-to-decision grammar is strong journey evidence, but the edited Markdown/conversation is not itself a typed, durable triage or planned-PR artifact.

### Reusable behavior, GitHub assumptions, gaps, and constraints

- Reusable behavior includes parallel source collection, explicit filtering/counts, combined-report presentation, stable primitive IDs/provenance, ordered partial outcomes, and a human-confirmed plan before mutation (`ts/packages/capabilities/pr-feedback/src/core/feedback-snapshot.ts:31-65`, `ts/packages/hosts/pi/src/core/pr/extension.ts:34-39`).

- The capability API is intentionally a GitHub PR-feedback seam: PR lookup, PR reviews, discussion comments, review threads, checks, replies, and resolutions (`ts/packages/capabilities/pr-feedback/src/api.ts:1-90`). Local findings have none of the required PR number, GitHub thread/comment IDs, thread resolution state, or GitHub mutation destination.

- GitHub replies and unresolved/resolved thread state are current durable disposition memory across sessions; deferral leaves a thread unresolved, while decline replies and resolves (`.agents/skills/pr-address/SKILL.md`, “Thread resolution”). Those semantics cannot transfer unchanged to local findings, which need their own explicit durable disposition and full-accounting behavior.

- The download shape does not preserve a structured unified item roster: the individual DTOs exist behind read primitives, but the main artifact embeds them in Markdown and counts. There are no local finding clusters, correction history, proposed-vs-confirmed categories, conflict flags, dependency-ordered planned PRs, fix-attempt records, validation attachments, checkpoints, or adopted/rejected/deferred/failed/unattempted accounting (`ts/packages/capabilities/pr-feedback/src/operation-schemas/collection.ts:111-131`).

- **The old payload-session/classification/planning/resolver-payload/batch-orchestration/ checkpoint/finalization workflow engine was intentionally retired and deleted. It should not be blindly resurrected.** The current requirement is to preserve useful outcomes and interaction evidence, not restore obsolete mechanics (`ts/packages/capabilities/pr-feedback/README.md`, opening and “Retained contract”; `skills/pr-address/references/cli-collection.md`, “Retired helpers”).

- The existing Pi experience is host presentation and prompt policy, not a portable structured contract. A future non-Pi consumer must not be forced to scrape its combined Markdown or infer decisions from conversational text (`ts/packages/hosts/pi/src/core/pr/extension.ts:72-97,420-540`).

## 4. Slots/worktree current substrate

### Checkout, create, free, and cleanup

- `SlotClient.checkoutBranch` can check out an existing branch or create a plain local branch at `base ?? HEAD`, then place it in the lowest-numbered clean available managed slot. Its safe API defaults avoid clipboard and parent-shell navigation side effects (`ts/packages/capabilities/slots/src/api/index.ts:24-94`, `ts/packages/capabilities/slots/src/lifecycle/checkout.ts:31-86`).

- Allocation derives inventory from git worktrees; a slot is available only when detached, without an operation, and clean. Existing assignment is reused, main-worktree assignment is reported, and other occupancy/pool-full states block placement (`ts/packages/capabilities/slots/src/core/inventory.ts:11-86`, `ts/packages/capabilities/slots/src/core/planning.ts:47-71`).

- Moving the current checkout requires a branch and clean worktree; the source worktree is redirected to a previous branch, trunk, or detached HEAD before placement (`ts/packages/capabilities/slots/src/core/planning.ts:73-177`, `ts/packages/capabilities/slots/src/lifecycle/checkout.ts:88-129`).

- Normal `free` refuses dirty slots and active git operations, detaches the worktree to trunk, and retains the local branch (`ts/packages/capabilities/slots/src/lifecycle/free.ts:28-112`, `ts/packages/capabilities/slots/src/lifecycle/release-target.ts:35-75`).

- Destructive cleanup is explicit: `free --all` can close a matching PR and force-delete the local branch, supports dry-run, and requires confirmation/`--yes` (`ts/packages/capabilities/slots/src/lifecycle/operations/free.ts:25-127`, `ts/packages/capabilities/slots/src/lifecycle/release-cleanup.ts:5-20,90-217`).

- `gc` is oriented around merged/closed PR cleanup and optional local branch deletion, not ephemeral local candidate lifecycle (`ts/packages/capabilities/slots/src/lifecycle/operations/gc.ts:55-125`).

### Branch tracking, isolation, validation precedent, and gaps

- Slot branch creation uses git `createBranch`; it does not Graphite-track the branch (`ts/packages/capabilities/slots/src/lifecycle/checkout.ts:43-62`). Graphite tracking is a separate concern in existing workflows.

- Cmux dispatch demonstrates `git branch` followed by `gt track --parent`; if tracking fails, the git branch remains and launch stops. This is direct evidence of a partial- failure boundary any adoption journey must account for (`ts/packages/capabilities/cmux/src/core/dispatch-prompt.ts:172-239`).

- Flow autoslot demonstrates composition in the opposite order: create a Graphite branch, require cleanliness, then move the current branch into a slot; branch creation can succeed while slot movement fails or is skipped (`ts/packages/capabilities/flow/src/autoslot/autoslot.ts:76-149`).

- Slots provide worktree isolation from the active checkout, but share repository refs and git history; “disposable” therefore requires explicit branch ownership and cleanup semantics, not merely placing work in another directory (`ts/packages/capabilities/slots/CONTEXT.md`, “Slot” and “Slot Inventory”).

- Existing `flow.submit.pre` hooks are precedent for repo-configured ordered validation: commands run in order, stream output, stop on first failure, and run before submit state changes (`ts/packages/capabilities/flow/src/submit/submit-hooks.ts:1-10,32-42,87-147`). Public `ns flow submit` is coupled to checkpointing/publishing and is outside this Objective; it must not be reused wholesale for local candidate validation.

- Current Slots can host a candidate branch, but do not express one-candidate-branch-per- planned-PR ownership, dependencies among candidates, validation evidence, manual inspection status, adoption into the engineer's Graphite stack, rejection, or outcome accounting. The curated `SlotClient` also exposes checkout but not free/cleanup (`ts/packages/capabilities/slots/src/api/index.ts:40-54`).

## 5. Cross-capability reuse/gap matrix

| Decided journey stage       | Current reusable substrate                                                                                                                                               | Missing capability/evidence requirement                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Range                       | Reviews loads changed paths and a three-dot diff (`reviews/src/gateways/local-diff.ts:38-91`)                                                                            | Prompted arbitrary range, coverage explanation, confirmed immutable range identity/endpoints                           |
| Roster                      | Catalog listing, applicability globs, resolved profiles (`reviews/src/operations/cli-operations.ts:175-227`)                                                             | Prompted toggles, resolved model display, one roster record including toggled-off entries                              |
| Run/progress                | Typed single-review outcome and post-run metadata (`reviews/src/operations/review-run.ts:44-66,90-148`)                                                                  | Foreground multi-run progress, continue-on-failure orchestration, failed-source gaps                                   |
| Provenance                  | Structured finding plus run-level key/path/model/base; Markdown log adds HEAD (`reviews/src/core/models.ts:74-83,216-234`; `reviews/src/gateways/review-log.ts:221-259`) | Per-finding key, definition version, exact range, resolved model; structured run/coverage provenance                   |
| Aggregation/triage          | Pi combined stack report and human-confirmation prompt (`hosts/pi/src/core/pr/extension.ts:424-517`)                                                                     | Cluster-never-merge records, correction history, conflict flags, proposed/confirmed category and bulk decisions        |
| Steering/planned PRs        | Address skill names omnibus/split-out/decline/defer (`.agents/skills/pr-address/SKILL.md`)                                                                               | Durable dependency-ordered planned PRs, complete source-finding membership, deliberate set confirmation                |
| Disposable slot             | Plain branch creation and lowest clean slot placement (`slots/src/lifecycle/checkout.ts:31-86`)                                                                          | Journey-owned slot lifecycle and branch-per-plan behavior without active-checkout mutation                             |
| Validation                  | Ordered configurable `flow.submit.pre` hook behavior (`flow/src/submit/submit-hooks.ts:87-147`)                                                                          | Candidate-local selection/results, command/output/status evidence, non-gating semantics, skipped validation            |
| Inspection/adoption         | Slot path/branch target and manual worktree access (`slots/src/api/index.ts:6-14`)                                                                                       | Per-candidate diff summary/outcome report, prompted adoption, Graphite adoption semantics and partial failures         |
| Checkpoints/full accounting | Branch Memory review logs; ordered bulk mutation outcomes (`reviews/src/gateways/review-log.ts:56-129`; `pr-feedback/src/core/review-thread-mutations.ts:126-181`)       | Structured findings/triage checkpoint, structured slot-outcome checkpoint, resumable stages, every-finding disposition |

## 6. Independently discovered constraints and implications

1. “Range” cannot remain synonymous with `baseRef`: reproducibility requires enough identity to distinguish a moving `origin/main...HEAD` from what was actually reviewed.

2. Roster applicability and each run currently load independently; the next contract must decide what evidence proves every reviewer saw the same confirmed range.

3. Definition versioning must address dirty-tree definitions; commit identity alone may not identify instructions actually executed.

4. Input-coverage omissions are reviewer gaps even when execution succeeds; aggregation must not present “completed” as “complete coverage.”

5. Branch Memory proves git-native durability is available, but current Markdown logs are presentation artifacts and branch namespacing may not naturally survive candidate rejection, deletion, or adoption.

6. Local feedback has no GitHub thread whose open/resolved state can double as durable disposition memory. Deferral, rejection, and completion therefore need explicit local evidence rather than simulated thread semantics.

7. Current Address bulk mutation establishes that ordered per-item partial outcomes and fallback behavior matter. It does not establish that local findings should share the same mutation vocabulary.

8. A disposable worktree does not imply disposable refs. Normal free retains branches; destructive branch deletion is separately confirmed. Candidate ownership and cleanup must remain visible to the engineer.

9. Plain git branch creation and Graphite tracking are separate, failure-prone steps. Adoption requirements must define observable outcomes when only part succeeds without deciding the implementation transaction now.

10. Validation can rewrite files in the submit precedent. The next rows must distinguish validation evidence from candidate mutation and say what diff is ultimately inspected.

11. The decided journey permits adoption despite failed validation, so “validated” must report exactly what ran and its outcome, never imply safety or gate adoption.

12. Pi's report-to-prompt experience is valuable interaction evidence, but durable requirements cannot depend on editor prefill, Markdown scraping, or agent memory.

13. The first loop excludes submit, push, PR publication, merge, and deployment. Existing helpers coupled to those actions are precedents only, not journey completion steps (`.ns/objectives/local-feedback-resolution/objective.md`, “Non-Goals”).

Implication for the next requirements row: define the **local addressing contract** in terms of user-visible decisions, source semantics, durable disposition evidence, and complete accounting. Do not begin by assigning the behavior to current packages or by reviving the retired Address engine.

## 7. Primary sources

- Destination: `.ns/objectives/local-feedback-resolution/objective.md` and `roadmap.md`.

- Decided journey/control/semantics: the three files under `.ns/objectives/local-feedback-resolution/updates/2026-07-16-*.md`.

- Reviews overview/vocabulary: `ts/packages/capabilities/reviews/README.md` and `CONTEXT.md`.

- Reviews commands/operations: `src/commands/list.ts`, `src/commands/run.ts`, `src/operations/cli-operations.ts:45-338`, `src/operations/review-run.ts:35-269`.

- Reviews contracts: `src/core/models.ts:27-234`, `src/core/review-definition.ts:11-258`, `src/core/review-applicability.ts:7-50`, `src/core/project-config.ts:73-118`.

- Reviews adapters/API: `src/gateways/local-diff.ts:22-119`, `src/gateways/review-catalog.ts:15-109`, `src/gateways/review-log.ts:15-301`, `src/core/api.ts:45-104`; corroborating range tests are in `test/gateways/local-diff.test.ts:73-119`.

- Address policy/catalog: `.agents/skills/pr-address/SKILL.md` and `skills/pr-address/references/cli-collection.md`.

- Address capability: `ts/packages/capabilities/pr-feedback/README.md`, `src/api.ts`, `src/exec-commands.ts`, `src/primitive-commands.ts:35-292`, `src/operation-schemas/collection.ts:111-229`.

- Address collection/mutation: `src/core/feedback-snapshot.ts:8-65`, `src/core/download-feedback.ts:26-246`, `src/primitive-results.ts:14-75`, `src/core/review-thread-mutations.ts:10-272`.

- Pi presentation: `ts/packages/hosts/pi/src/core/pr/extension.ts:19-97,179-281,315-540` and `ts/packages/hosts/pi/test/pr-download-feedback.test.ts:314-449`.

- Slots: `ts/packages/capabilities/slots/README.md`, `CONTEXT.md`, `src/api/index.ts:6-94`, `src/lifecycle/checkout.ts:14-189`, `src/core/planning.ts:19-180`, `src/core/inventory.ts:11-86`, `src/lifecycle/free.ts:12-136`, `src/lifecycle/release-target.ts:11-92`, `src/lifecycle/release-cleanup.ts:5-236`, and lifecycle operation tests adjacent to `test/`.

- Composition precedents: `ts/packages/capabilities/flow/src/autoslot/autoslot.ts:76-149`, `ts/packages/capabilities/flow/src/submit/submit-hooks.ts:1-177`, and `ts/packages/capabilities/cmux/src/core/dispatch-prompt.ts:172-239`.

## Evidence questions for the local addressing contract grilling

1. What is the smallest engineer-visible unit of disposition: original finding, proposed cluster, corrected cluster, or more than one of these at different stages?

2. Which exact local dispositions are required before planning, and how do they map to final adopted/rejected/deferred/failed/unattempted accounting without erasing history?

3. What bulk actions are allowed, and which conflict/uncertainty states must force explicit engineer attention?

4. What must a planned PR say about included clusters, originals, dependencies, rationale, and deferred work before the engineer can confirm the set?

5. Which existing omnibus/split-out steering outcomes remain meaningful pre-PR, and which GitHub-only ideas (thread reply/resolution, PR placement, submit) must be excluded?

6. What constitutes a durable triage checkpoint, including proposed decisions, engineer corrections, roster gaps, and an honest incomplete state?

7. On resume, what changed-range or changed-definition evidence makes the checkpoint stale, and what may be reused versus rerun?

8. How should one finding be accounted for when it belongs to a cluster whose planned PR fails, is partially adopted, or is deliberately split across candidates?

9. What explicit authorization boundary separates confirming planned PRs from allowing fix attempts, and later from adopting candidate branches?

10. Which facts must survive so later human-GitHub and external-reviewer sources can join without pretending their source semantics are identical to local Reviews findings?
