# Submit & Ship — README-driven design draft

> **Status: fiction.** This is the README for the feature as if it already shipped
> (README-driven development). Every concrete claim below is a *position* on an open
> Question Row in `../roadmap.md`. Iterate by editing sentences, not by re-litigating
> abstractions. Annotations like `[Row: …]` mark where a claim resolves a frontier row.

---

# Pushing stacks with `ns flow`

`flow` is the ns extension that moves a Graphite stack through its life: you push it
to GitHub while you work, you ship it when it's done, you land it when it's
approved. Two of its verbs cover the pushing:

```
ns flow submit     # push/repush the stack to GitHub, fast; no reviews, no prose
ns flow ship       # ship: validate, review, autofix, describe, push clean
```

**`submit` is how you push.** A stack gets pushed many times, for many reasons —
backing up work, self-reviewing on GitHub, a cheap repush after a rebase, letting
another agent or a human look at work-in-progress. Submit is the plain push: mirror
the local stack to its PRs and nothing else. No validation, no reviews, no PR prose.
It is fast because everything it omits only matters when shipping.

**`ship` is how you say "this stack is done."** Ship makes the stack merge-ready
before it pushes: it validates the repo, runs the cheap mechanical reviews over the
whole stack, autofixes what can be safely autofixed, writes the PR descriptions, and
pushes — then records that this content was reviewed so nothing reviews it again.
PRs arrive clean instead of accumulating review comments that someone has to
download, hand-apply, and repush.

`submit` (push) → `ship` (ready) → `land` (merge) is the stack lifecycle.

`[Row: Submission-class surface — position: two separate commands, not a flag.]`

The design commitments:

- **Pushes are fast.** Submit does nothing that only matters when shipping.
- **PRs arrive clean.** Ship runs the review-and-autofix loop locally, *before* the
  push, so remote review is a backstop, not the default cleanup mechanism.
- **Nothing blocks.** Ship warns and continues; a failed autofix is discarded, never
  a reason to stop a push.
- **Nothing is reviewed twice.** Shipped content carries its review state; local and
  remote reviewers respect it.

## The happy path: `ns flow ship`

You've finished a stack. You run:

```
$ ns flow ship
```

and ship walks the stack through five phases:

1. **Validate.** The hooks installed at the `flow.ship.pre` point run (repo-root
   `ns.toml`, `[points]."flow.ship.pre"` — in this repo, `["just"]`). This is the one
   phase that can abort a ship: if the repo doesn't validate, it isn't shipping.
   `[Position: the existing flow.submit.pre point migrates to ship and is renamed
   flow.ship.pre; submit has no hook point.]`
2. **Review.** Every applicable tripwire review — the cheap, mechanical,
   quick-profile reviews in `.ns/reviews/` — runs over the whole stack's diff
   against trunk. One pass at the stack tip, never per-branch. Each finding is
   classified as it is produced: **autofix-able** — the fix is bounded, reviewable,
   and requires no product/design decision — or **manual**, meaning a person or a
   session with judgment has to look at it. (How this classification is defined and
   customized is covered below.) All findings, with their classifications, are
   stored in the Branch Memory findings store and surface in ship's **findings
   report** at the end of the run. `[Row: Stack-tip review semantics — position:
   diff is merge-base(trunk, tip)..tip; findings are stack-scoped, not mapped back
   to owning branches.]`
3. **Autofix.** Autofix-able findings are applied by the fixer, validated, and
   committed as a single labeled commit (`autofix(reviews): …`) at the tip. A fix
   that fails validation is **discarded**: the fix is dropped, the finding remains.
   The findings report groups every finding by outcome — *autofixed* (in the labeled
   commit), *discarded*, and *manual* — and discarded and manual findings are yours
   to judge after the push; they never block it.

   **Manual findings are follow-up work, not noise.** The loop for them: read the
   report (or reload it later — the findings store keeps it), fix what's real in a
   normal editing session, and ship again; the re-review confirms the fix or
   re-raises the finding. The review re-finding it *is* the tracking — there is no
   separate ledger of acknowledged/dismissed findings, and manual findings are
   never published to the PR (PRs stay clean; local findings stay local).
   `[Position: manual follow-ups are fix-and-reship; no dismissal ledger in v1 —
   Fog: an acknowledge/waive mechanism if re-raised findings prove noisy.]`
4. **Describe.** PR descriptions are generated for the stack — once, *after* the
   autofix commit, so the prose describes what actually ships.
5. **Push & attest.** `gt submit` pushes the stack, and ship records that this exact
   stack content was reviewed, so nothing re-reviews it (see "Never review the same
   content twice").

### Where ship runs, and who confirms

Ship is a local operation; it never runs in CI (the remote workflow described below
is a backstop, not a runner of ship). That leaves two contexts:

- **A person at a terminal.** Ship shows the autofix diffstat and asks before
  pushing model-written fixes.
- **A non-interactive run** — an agent session driving `ns flow ship`, or a script
  with piped output. Ship pushes without asking: only autofix-able,
  validation-surviving fixes are ever pushed, and the findings report always ends
  with the autofix commit SHA and diffstat, so a human scanning the transcript sees
  exactly what was pushed.

The safety rails are the same in both contexts — the autofix-able gate, validation,
and one-commit revertability — not the confirmation prompt. `[Row: Prod-submit
pipeline integration — position: non-interactive runs push autofixes without
confirmation.]`

### What "autofix-able" means

The classification standard is **a prompt, not code**: a prompt point (point-system
prompt, name provisionally `reviews.autofix.disposition`) that tells the reviewing
model what qualifies. The default prompt defines autofix-able as *bounded,
reviewable, and not requiring a product/design decision* — the **same standard
download-feedback uses** for remote PR feedback, one bar across both surfaces.
Consumers tighten or loosen the bar by installing an override prompt at the point;
building this pluggable prompt is part of the objective, not a later refinement.

A finding is autofixed only when **both** gates pass:

- The review opts in: `auto_apply: true` in the review definition's frontmatter
  (default `false`). Only mechanical tripwires should set this.
- The finding opts in: the reviewing model emits `disposition: "autofix"` alongside
  `severity` in each `ReviewFinding`, judged against the disposition prompt.
  Anything judgment-shaped stays `"manual"`.

`[Row: AUTO classification axis — position: two-level gate, review frontmatter +
per-finding disposition field; the disposition standard is a pluggable prompt point
whose default is shared verbatim with download-feedback's standard, which also
de-fogs eventual fixer reuse against remote feedback.]`

An applied fix survives only if validation passes: `tsgo` typecheck + lint scoped to
the touched packages (not the full `just` wave — the validate phase already ran that
on the pre-fix tree, and CI backstops the rest). Fail → the fix is discarded and the
finding lands in the report's *discarded* group. `[Row: Validation bar — position:
scoped typecheck+lint; "safe to push" = compiles and lints.]`

### The invariant

> Ship never blocks and never dirties. If the fixer crashes, validation fails, or a
> review errors out, the fixes are discarded, the findings are reported, and the push
> proceeds exactly as a plain submit would have. (Only the validate phase — explicit
> hook failure — aborts.)

## `ns flow submit` — the plain push

Submit mirrors your local stack to its GitHub PRs as fast as possible: checkpoint any
pending changes (with a template, diffstat-derived commit message — no model call),
check stack readiness, `gt submit`, thin verification. That's the whole pipeline.

Deliberately absent, because they only matter when shipping:

- **No validation hooks.** CI is the backstop for un-shipped pushes; ship's validate
  phase owns local validation.
- **No reviews.** Pushing a stack shouldn't cost a review wave.
- **No PR description generation.** Ship writes the prose once, post-autofix.

Use it constantly, for whatever reason you push: backup, self-review, a repush after
a rebase, sharing with another agent.

## Running ship's stages individually

The happy path is one command, but each phase is also a subcommand you can run on its
own:

```
ns flow ship                # the happy path: all phases, in order
├─ ns flow ship check       # validate: run the flow.ship.pre point's hooks
├─ ns flow ship review      # tripwire wave; print + store findings, change nothing
├─ ns flow ship fix         # autofix stored findings, validate, commit
├─ ns flow ship describe    # (re)generate PR descriptions for the stack
└─ (push + attest)          # gt submit + record review state — ship-only, not standalone
```

[Position: subcommands are thin porcelain in flow; the machinery stays owned by the
reviews capability (review execution, fixer engine) and flow (descriptions). The `ship review`
subcommand is a flow-flavored composition of reviews plumbing, not a fork of it.]

Details that only matter when running stages individually:

- **`review` stores its findings** in the Branch Memory findings store, keyed by the
  stack diff hash. The storage mechanism is owned by the reviews capability, not
  flow: reviews already records run logs to Branch Memory (`ns roaster review log`,
  `ns roaster exec record-findings`); findings-at-rest extends that surface with a
  diff-hash key. Staleness is a key mismatch, never a judgment call: amend the stack
  and the stored findings simply stop matching. `[Position: findings persist in
  Branch Memory via the reviews capability; flow subcommands are read/write clients
  of that surface.]`
- **`fix` consumes stored findings** when their key matches the current stack
  content; on a miss (or none stored) it runs the review wave itself first. So
  `review` then `fix` never pays for two waves unless the stack changed in between.
  `[Position: fix placement — one labeled tip commit, no absorb-style per-branch
  distribution. Revert = revert one commit.]`
- **Push and attest are not standalone subcommands.** Attestation is only honest as
  the terminal act of the composed pipeline; a standalone attest verb would let you
  attest unreviewed content. The escape hatch for "just push" is `ns flow submit`.
- **Rerunning ship resumes for free.** Ship keeps no pipeline progress state, but if
  it dies after the review wave, the rerun finds fresh findings under the current
  diff hash and skips straight to fix. The diff-hash key does all the work.

The reviews capability also keeps a branch-scoped fixer primitive
(`ns roaster exec review-fix`) that `ship fix` wraps with stack-tip semantics.
`[Row: Fixer engine — dogfood the primitive standalone before any ship integration.]`

> Naming note: the capability is **reviews** (`@nseng-ai/reviews`); `roaster` remains
> the CLI command face (`ns roaster …`), the Branch Memory namespace, and the remote
> workflow name (`roaster.yml`). Whether the command face migrates to `ns reviews …`
> is an open question outside this objective.

## Never review the same content twice

After a ship, the reviewed state is recorded durably, keyed by the stack diff hash
(`merge-base..tip` patch-id):

- Local ships skip reviews whose recorded key matches the current stack content;
  amend anything and the key changes, so the next ship re-reviews.
- The remote reviews workflow (`roaster.yml`) reads the same recorded state — from
  wherever the encoding decision below puts it. If the pushed content carries a valid
  attestation, remote tripwires **skip**; if not (plain submit, or content changed
  since attestation), remote tripwires run as the backstop they are today. `[Row:
  Remote roaster's residual role — position: the remote workflow stays as backstop
  for un-attested content; it does not retire.]`

> **TODO — Anti-incremental review state encoding (open row).** Where this state
> lives is deliberately unresolved. Candidates:
>
> - a **git note** on the tip commit — git-native, but notes refs aren't pushed by
>   gt and GitHub tooling for them is poor;
> - a **machine block in the tip PR body** — trivially remote-readable, but per-PR
>   state for a stack-scoped fact, and UI-editable;
> - **Branch Memory itself** — brmem already holds the findings store and is
>   git-native ref storage, but whether the remote workflow can fetch and trust it
>   is exactly the open question.
>
> Keyed-by-diff-hash is the settled part: any encoding fails safe, because a stale
> or tampered key simply stops matching and reviews rerun.

The attestation is soft — a local claim, not CI proof. The remote workflow trusts it
for tripwires only; deep reviews are never automatic and remain human-invoked
(`ns roaster review run code-smell-roaster`).

## Latency

Ship adds one tripwire wave (plus the fix wave when findings exist) to the push
path. Target: review + autofix + validate completes in under ~2 minutes on a typical
stack of this repo.

> **TODO — Latency reality check (open row).** The ~2-minute number is asserted,
> not measured. Run the quick-profile wave over representative whole-stack diffs on
> this repo and replace this TODO with real numbers before integration design
> hardens.

## What ship is not

- It does not run deep reviews (code-smell, thermonuclear). Ever. Those are
  on-demand.
- It does not block on `error`-severity manual findings. (Fog: trust escalation may
  add blocking modes later.)
- It does not touch the download-feedback / pr-address surface.

---

## Open TODOs

The structural gaps this README knowingly leaves, in one place:

1. **Anti-incremental review state encoding** — where the attestation lives (git
   note vs PR machine block vs Branch Memory). See the TODO in "Never review the
   same content twice".
2. **Latency reality check** — measure the tripwire wave; the ~2-minute target is
   unmeasured. See the TODO in "Latency".
3. **`land` interaction** — whether landing warns on (or requires) un-attested
   content; blocked by the encoding TODO. Currently Fog in the objective.
4. **Manual-finding fatigue** — if fix-and-reship re-raising proves noisy, an
   acknowledge/waive mechanism becomes a row. Currently Fog.
5. **Command-face naming** — whether `ns roaster …` becomes `ns reviews …`; out of
   scope for this objective but touched by every command example here.

## Appendix: positions this README takes on the frontier

| Roadmap row / decision         | Position taken above                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submission-class surface       | separate verbs: `ns flow submit` (plain push) and `ns flow ship` (shipping pipeline)                                                                                                                                                                       |
| Submit scope (new)             | checkpoint (template message) → readiness → gt submit → thin verify; no hooks, no reviews, no PR prose; completion criterion upgrades to "submit gets faster"                                                                                              |
| Hook point migration (new)     | `flow.submit.pre` point becomes `flow.ship.pre`; submit has no hook point                                                                                                                                                                                  |
| Ship decomposition (new)       | subcommands `check` / `review` / `fix` / `describe`; push+attest ship-only terminal, never standalone                                                                                                                                                      |
| Findings persistence (new)     | findings-at-rest in Branch Memory, owned by reviews capability (extends `record-findings`/review-log surface), keyed by stack diff hash; `fix` consumes on key match, re-reviews on miss; resume falls out for free                                        |
| Findings report (new)          | classification happens at review time (autofix-able vs manual); report groups outcomes autofixed / discarded / manual; discarded+manual never block; persisted in the findings store                                                                       |
| Disposition prompt point (new) | the autofix-able standard is a pluggable point-system prompt (provisionally `reviews.autofix.disposition`); default shared with download-feedback; building it is in-scope for the objective                                                               |
| Stack-tip review semantics     | `merge-base(trunk, tip)..tip`; stack-scoped findings                                                                                                                                                                                                       |
| AUTO classification axis       | renamed **autofix-able**: `auto_apply` frontmatter gate + per-finding `disposition: "autofix" \| "manual"`; definition shared with download-feedback (bounded, reviewable, no product/design decision)                                                     |
| Latency reality check          | asserted <~2 min, **unmeasured**                                                                                                                                                                                                                           |
| Validation bar                 | scoped tsgo+lint on touched packages (full `just` lives in ship's validate phase)                                                                                                                                                                          |
| Fixer engine                   | reviews capability keeps branch-scoped `review-fix` primitive; `ship fix` wraps it                                                                                                                                                                         |
| Fix placement                  | single labeled autofix commit at tip                                                                                                                                                                                                                       |
| Anti-incremental state         | **OPEN** — encoding undecided (git note vs PR machine block vs Branch-Memory-derived); diff-hash keying is the settled part                                                                                                                                |
| Pipeline integration           | validate → review/autofix → describe → push+attest; ship is local-only, never a CI runner; terminal runs confirm autofixes, non-interactive runs push without confirmation (SHA+diffstat always in report); never-block/never-dirty (only validate aborts) |
| Remote reviews residual role   | roaster.yml stays as backstop for un-attested content                                                                                                                                                                                                      |
| Naming (aside)                 | capability = reviews; `roaster` CLI face / namespace / workflow name unchanged; face rename out of scope                                                                                                                                                   |
