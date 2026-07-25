# Follow-up: Objective context management and compaction

**Point in time:** 2026-07-11\
**Origin:** analysis after extension-uninstall work on branch `extension-uninstall-lifecycle-reconciliation`, commit `acc512d73`, submitted as PR #3437\
**Status at capture:** potentially valuable, but not yet formed into an Objective

## Why this follow-up exists

The completed extension-uninstall session reached roughly 60% context usage. A substantial contributor was repeatedly loading the large, long-lived Umbrella Objective `ship-objectives-to-customers`: its current purpose and routing were mixed with a growing immutable history and large design references.

At this point, improving Objective context management appears valuable because Objective records are meant to survive many sessions and PRs. Their provenance should grow over time, but the amount an agent must load for routine execution should not grow at the same rate.

This has not yet become an Objective because the desired product contract is unsettled. It is not clear whether the right intervention is a reader behavior change, a durable semantic-compaction workflow, more aggressive Subobjective extraction, or a combination. Compatibility, provenance, cutoff representation, and migration behavior also need explicit decisions before there is a trustworthy thesis and executable roadmap.

## Point-in-time evidence

On 2026-07-11, `.ns/objectives/ship-objectives-to-customers/` contained:

- 24 files, 125,883 characters, and 15,883 words — roughly 28K–36K tokens depending on tokenizer;
- `objective.md`: approximately 5.2K tokens (16.6% of the record);
- `roadmap.md`: approximately 3.8K tokens (12.2%);
- 20 immutable Semantic Updates: 63,943 bytes, approximately 15.9K tokens (50.7%);
- two references: 26,006 bytes, approximately 6.5K tokens (20.6%); and
- `ns objective exec read-objective ship-objectives-to-customers --format md`: 101,623 characters and 12,611 words, approximately 25.4K tokens by the same character-based estimate.

Roughly 63% of the assembled reader output was update history. In the motivating session, direct reads of the Objective, roadmap, and references plus the assembled history likely consumed roughly 26K–29K context tokens, with substantial duplication. Tool output may also be truncated by harness output limits, imposing the cost without reliably delivering the complete record.

These numbers are a snapshot, not a permanent benchmark. Re-measure before designing or implementing anything.

## Current interpretation

`ship-objectives-to-customers` still appears coherent as an Umbrella Objective. The problem is not simply that the Objective should be deleted or that its history is useless. The problem is that the current reading interface conflates two different needs:

1. **Current working context:** present purpose, active obligations, current routing, live risks, unresolved questions, and the next meaningful work.
2. **Durable provenance:** the complete sequence of immutable findings, decisions, corrections, completion evidence, and historical references.

The existing `updates/` directory already serves as the immutable historical archive. Physically moving old updates would break stable paths and conflict with the current immutability contract. Ordinary reads may not need to include all of that archive by default.

## Candidate product ideas

### Compact reads with explicit history access

Make the normal reader optimize for current working context, while retaining deliberate ways to inspect provenance. Candidate history modes include:

- full history;
- the latest N Semantic Updates;
- updates since a named update key or explicit cutoff; and
- no update history unless requested.

A compact default could assemble `objective.md`, `roadmap.md`, and only the references or recent updates needed for current routing. The full record must remain directly accessible and understandable.

### Durable semantic compaction

Provide a deliberate workflow that rewrites mutable `objective.md` and `roadmap.md` to accurately express current truth while leaving every existing Semantic Update untouched. The workflow would append a new Semantic Update recording what was compacted and why.

Compaction must preserve, rather than merely shorten:

- active obligations and completion criteria;
- live risks and assumptions;
- unresolved questions;
- current sequencing and routing;
- relevant cross-Objective relationships;
- decisions that still constrain future work; and
- pointers needed to recover full provenance.

This should be semantic work owned by an agent/skill, not a deterministic CLI summarizer pretending to understand Markdown meaning.

### Compaction checkpoints or snapshots

Explore whether a durable checkpoint can mark the point before which history is normally omitted. Any representation must remain visible in checked-in Markdown and compatible with the system's prose-first model.

Do not introduce hidden metadata, a side database, forbidden frontmatter, or deterministic parsing of Objective prose. Record Frontmatter currently permits exactly `blocked` and `edges`; a cutoff design must not casually expand that contract.

### Subobjective extraction for context locality

Use Subobjectives when remaining work contains coherent execution outcomes that deserve independent purpose, completion criteria, risks, and local history. Candidate outcomes in the motivating umbrella included:

- completing extension administration (`update`, `list`, and migration work);
- unbundling bare core and republishing; and
- first-customer onboarding verification.

Do not create children merely as buckets for tasks or PRs. Subobjectives are complementary to compaction, not a substitute for a better reader.

After extraction, parent updates should become sparse and synthetic. Good parent-level events include:

- creating a Subobjective;
- making a major cross-child decision;
- completing a Subobjective;
- changing an integration risk; and
- recording synthesized closure evidence.

The parent should not duplicate each implementation PR or the child's full history.

## Design alternatives to compare

At minimum, design the interface twice before selecting a direction:

1. **Reader-only approach:** retain records exactly as they are, but change `read-objective` defaults and add explicit history-selection modes.
2. **Durable-compaction approach:** add semantic compaction checkpoints or snapshots, potentially alongside reader modes, so mutable current-context files are periodically rebaselined.

Compare them on:

- routine context reduction;
- provenance safety and discoverability;
- risk of hiding still-live obligations;
- compatibility with existing consumers;
- migration cost for existing Objectives;
- whether deterministic tooling must interpret Markdown meaning; and
- whether the approach improves or merely masks oversized Objective structure.

## Candidate work items if promoted

1. Inventory the Objective capability implementation around `read-objective`, update discovery, output assembly, and all consumers.
2. Inspect Objective skill workflows to understand when full history is actually required.
3. Establish product requirements and invariants for compact reads, durable compaction, history access, and Subobjective extraction.
4. Prototype reader-only modes and durable-compaction/checkpoint designs independently, then compare them.
5. Decide whether the capability is a deterministic reader change, a skill-owned semantic workflow with deterministic CLI primitives, or both.
6. Define how a record exposes a historical cutoff without hidden metadata, extra frontmatter, or semantic parsing in deterministic CLI code.
7. Determine compatibility and defaults for every current `read-objective` consumer.
8. Prototype against `ship-objectives-to-customers` and measure actual context reduction. A plausible target is a normal implementation load of roughly 4K–8K tokens.
9. Decide which remaining umbrella outcomes deserve Subobjectives and how the parent synthesizes them without duplicating child history.
10. Document the resulting user contract in the canonical Objective-system docs if and when a direction is accepted.

## Constraints that should survive later design

- Semantic Updates are immutable; do not edit, rewrite, normalize, relocate, or delete old updates as a compaction mechanism.
- Objective meaning remains Markdown and agent/human interpreted.
- Deterministic CLI tooling should inventory files and facts, not parse roadmap or prose meaning.
- Objective patterns remain prose-recognized rather than schema kinds.
- Umbrella Objectives coordinate Subobjectives through Objective Edges and retain a synthesis duty.
- Full provenance must remain available even if routine reads become compact.
- Context reduction must not silently discard active obligations, risks, questions, or routing.

## Verification needed before acting

- Re-measure the Objective and assembled reader output; this note captures only the 2026-07-11 state.
- Confirm whether `read-objective` behavior, output limits, or consumers have changed.
- Inspect all current consumers before changing defaults.
- Check current Objective doctrine, especially `docs/objective-system.md`, `CONTEXT.md`, ADR 0025, ADR 0030, and Objective skill references.
- Verify that the candidate Subobjectives still represent outstanding coherent outcomes.
- Test token counts with the actual harnesses/tokenizers that matter rather than relying only on character estimates.
- Validate that compact output is sufficient for real `objective-next`, update, runner, and implementation sessions, not merely smaller.

## Promotion signal

Promote this follow-up into an Objective when there is enough evidence to state:

- which user-facing context-management outcome is being pursued;
- the invariants for current context and full provenance;
- the compatibility boundary for existing readers and skills;
- the first bounded implementation or prototype slice; and
- completion criteria measurable against representative large Objectives.

Until then, this note preserves the opportunity and its reasoning without implying that the work is committed or ready for execution.

## Starting points

- `.ns/objectives/ship-objectives-to-customers/objective.md`
- `.ns/objectives/ship-objectives-to-customers/roadmap.md`
- `.ns/objectives/ship-objectives-to-customers/updates/`
- `.agents/skills/objective/SKILL.md`
- `.agents/skills/objective/references/objective-patterns.md`
- `skills/objective-update/SKILL.md`
- `docs/objective-system.md`
- `ts/packages/incubator/objectives/`
- `ns objective exec read-objective ship-objectives-to-customers --format md`
- `ns objective show ship-objectives-to-customers --format md`
- `rg -n "read-objective" ts/packages/incubator/objectives skills .agents/skills`
