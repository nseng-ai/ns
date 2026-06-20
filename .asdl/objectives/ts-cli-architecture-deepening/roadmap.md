# Roadmap

## Work

- [ ] **Collapse the PR-description pipeline into one deep module** (`asdl-core/submit`) — merge `pr-description.ts`, `pr-description-apply.ts`, and the orchestration in `submit-pr-descriptions.ts` into one module returning a discriminated result (`matched | updated | generated | failed`); view, fingerprint, generation, and prewritten reconciliation become private implementation. *Strong. Cleanest self-contained first cut — exercises the deepening pattern on contained code before touching wider-blast-radius candidates.*
- [ ] **Make `TextGenerationGateway` a real seam** (`asdl-core/submit`) — add an in-memory fake adapter beside the real one, exported from `testing/`, so generation orchestration tests run deterministically. *Strong. Pairs directly with the PR-description collapse; the fake is what makes that module's tests assert state→result.*
- [ ] **Collapse slot-dispatch into one orchestration module** (`ccc/cmux`) — introduce `SlotDispatchPlan` owning the branch → Branch Memory payload → slot checkout → cmux-workspace sequence; `dispatch-prompt`, `dispatch-from-trunk`, and `dispatch-plan` handlers become thin call sites. *Strong. First confirm whether `slot-dispatch-plan.ts` is already most of the target shape (Open Question).*
- [ ] **Hide occupancy reconciliation behind the slot inventory** (`slot`) — a reconciler module owns merging worktree state with occupancy metadata and exposes `reconcile()` plus a pure occupancy lookup; `inventory`, `planning`, and `gt/navigation` stop pattern-matching `SlotRecord.branch === null`. *Strong.*
- [ ] **Put a stack-navigator adapter over Graphite's discriminants** (`slot/gt`) — `GraphiteStackNavigator` absorbs topology discriminants and error classification behind `{ branch | error }`; git vs Graphite reasoning separated. *Strong. Must stay inside the `slot gt` boundary and use Graphite plumbing (`gt parent/children --no-interactive`), never parsed display output.*
- [ ] **Deepen Branch Memory behind an entry locator** (`brmem` / `handoff` / `branch-context`) — `BrmemEntryLocator.parse()` and a thin `BrmemEntriesGateway` absorb ref naming + validation that currently leak into brmem operations, handoff, and branch-context. *Strong. Highest leverage in the survey; widest blast radius — treat ref encoding as compatible and cover it with the locator's own tests before migrating callers (see Risk).*
- [ ] **Replace the shallow brmem adapter with a plan-attachment module** (`branch-context`) — `PlanAttachmentStorage` hides namespace + entry-key semantics so `attach` and `attached-plan` work in slugs. *Worth exploring. Composes onto the brmem entry locator.*
- [ ] **Pull objective-markdown rules into one validator** (`objective`) — `ObjectiveMarkdownValidator` owns objective/roadmap/update structure so schema changes land in one module; operations stop re-deriving headings. *Worth exploring.*
- [ ] **Decide disposition of lifting diff parsing into `asdl-core`** (`roaster` / `pr-address` / `asdl-core`) — hold as a one-adapter watch-point; relocate `parseUnifiedDiff` / `commentableRightSideLines` only if a real second consumer (e.g. pr-address) needs hunk geometry. *Speculative. Contradicts the spirit of ADR-0007; if rejected outright, record as an ADR-0007 amendment rather than leaving indeterminate.*

## Parked

*None.*
