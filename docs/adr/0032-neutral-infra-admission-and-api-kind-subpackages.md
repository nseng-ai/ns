# ADR 0032: External-applicability Neutral Infra admission and API-kind subpackages

## Status

Accepted — supersedes the foundation-placement portions of ADR 0018 and ADR 0019, refines
ADR 0023's subpackage-kind model, and refines the subpackage-tier semantics layered on ADR 0017
and ADR 0022. The superseded claims are itemized in the Supersession section; everything not named
there — the four-bucket consumption analysis, the multi-factor placement gate, old-door deletion
atomicity, edge-significance rank, and the Testing/Host-surface importer restrictions — remains in
force.

## Context

`@nseng-ai/foundation` is declared `neutral-infra` and already exports broad, reusable APIs,
including real process execution (`@nseng-ai/foundation/exec`), a CLI runtime, and time seams. The
accepted standards contradict that reality in three places:

1. **Purity.** The root `CONTEXT.md` defines Neutral Infra as "the pure floor below the SDK" with
   "no real-world I/O", and ADR 0018/0019 classify every real-world I/O wrapper as Kit Gateway
   material that must leave foundation. Taken literally, exec cannot live where it lives, and a
   future generic harness-session surface could never be admitted regardless of how ns-independent
   its contract is.
2. **One public door.** ADR 0023 describes the `api` subpackage as a container package's *sole*
   cross-package programmatic import surface. Foundation's public surface is many precise doors
   (`/exec`, `/clock`, `/primitives`, …), and collapsing them behind one `@nseng-ai/foundation/api`
   barrel would destroy exactly the precision that makes them good contracts.
3. **One-way tier overrides.** `docs/conventions/subpackage-conventions.md` says
   `ns.subpackageTiers` may only declare subpaths *lower* than the container package's tier. The
   style guard has never enforced that direction; the effective-tier pipeline
   (`component.tier ?? metadata.nsTier`) is already direction-agnostic.

This ADR records one linked trade-off resolving all three, so foundation is an honest home for
generic infrastructure — including I/O-performing infrastructure — behind a strong admission
boundary.

## Decision

### Neutral Infra is defined by external applicability, not purity

Neutral describes domain and runtime independence from ns, not absence of effects. A surface
qualifies as Neutral Infra when both hold:

1. **ns-independent public contract.** Its types, lifecycle, errors, configuration, and
   dependencies make sense without ns vocabulary or ns runtime assumptions.
2. **Credible external-consumer scenario.** The design can state, in reviewable prose, a concrete
   scenario in which a consumer outside ns would use the surface as-is. Actual external adoption is
   not required, but the scenario must be concrete enough to evaluate the contract against it;
   hypothetical genericity alone is insufficient.

Neutral Infra may perform real-world I/O. **Pure Utility** remains the narrower term for
deterministic, I/O-free transforms; it is no longer synonymous with all of Neutral Infra. The
distinction to draw is Pure Utility versus I/O-performing Neutral Infra, and generic foundation
infrastructure versus ns-specific Capability Kit and capability code — never a vague
"neutral vs. non-neutral".

Concrete genericity evidence for the two motivating surfaces:

- **Process execution.** Running a child process with bounded output, timeouts, and structured
  results is independently useful to any Node tool; nothing in the `exec` contract requires ns.
- **Harness sessions (future).** Consuming a Claude Code/Codex-style coding harness through a
  bounded session lifecycle — start a session, exchange turns, observe events, terminate — is a
  generic integration need for any tool driving such a harness. To retain admission, that future
  contract must stay free of ns-specific Reviews/text-generation routing policy; capability policy
  layered on top of the session lifecycle lives above foundation.

### Foundation versus Capability Kit: audience and contract shape

- **Foundation** owns externally credible, ns-independent infrastructure contracts and their
  cohesive implementations, including I/O-performing implementations when appropriate.
- **Capability Kit** owns first-party ns extension-building substrate: the `ctx`→gateway adapter,
  gateways shaped around ns composition, consumer-oriented fakes, and shared capability-building
  primitives.
- I/O by itself never forces code into Capability Kit; ns-shaped vocabulary, capability-specific
  policy, and ns workflow semantics do.
- **Reclassification is prospective.** Existing Git, GitHub, Graphite, cmux, filesystem, and other
  Kit Gateways stay where they are. Moving any of them into foundation requires explicit follow-up
  work applying ADR 0019's placement gate and the consumer-gateway/channel analysis in
  `docs/conventions/consumer-gateways-and-command-shape.md`; this ADR is not that analysis.

**Kit Gateway** remains the term for first-party per-domain gateway seams owned by Capability Kit.
What is retired is the categorical claim that a gateway is *never* Neutral Infra: a gateway seam,
fake, and real adapter may live in foundation when the surface passes the admission test above.

### Package and subpackage tier semantics

- `ns.tier` is the **default effective tier** for the package and its unannotated declared
  subpackages.
- `ns.subpackageTiers` may override the default **in either direction** — a subpackage may sit
  above or below its container's tier. This is a general mixed-tier container rule, not a
  foundation allowlist.
- Cross-package layering is enforced against each topology circle's **effective tier**
  (`component.tier ?? metadata.nsTier`); intra-package circle edges remain allowed regardless of
  tier, exactly as today.
- No new `platform` tier is added. Because Neutral Infra admits generic I/O, foundation exec and a
  future harness-session subpackage stay `neutral-infra`; performing I/O is not grounds for a
  higher tier.

### API-kind subpackages

ADR 0023's kind model is generalized: **API-kind** is a kind, and the literal `api` subpackage is
one specialization of it.

- A container package's top-level exports and public subpackage exports collectively are its API.
- Any declared subpackage with supported cross-package runtime exports is **API-kind**, regardless
  of its name. A container may have multiple API-kind subpackages when each passes the rank test —
  it anchors a class of inbound dependency edges its siblings do not.
- The literal `api` subpackage remains the required naming convention for a **Capability API**,
  where capability consumer/provider rules apply. Capabilities still expose exactly
  `@nseng-ai/<cap>/api` to consumers; nothing about capability consumption changes.
- Foundation keeps its precise public doors (`@nseng-ai/foundation/exec`,
  `@nseng-ai/foundation/clock`, …). No `@nseng-ai/foundation/api` barrel is created and no
  consumers are migrated behind one.
- Private implementation features remain folders inside the owning public API-kind subpackage, not
  separately declared subpackages. For the later harness work, the public harness-session
  subpackage may be API-kind while its parameterized lifecycle engine and provider mechanics remain
  private implementation folders.
- **Feature subpackages** remain the term for declared subpackages whose edges stay inside the
  package; their sibling-only rule stands. External appetite for a feature's contract is still a
  promotion signal — the change is that the promotion may resolve to declaring the surface API-kind
  (a deliberate public contract) rather than only to extracting a package.
- **Testing** and **Host-surface** kinds and their importer restrictions are unchanged.

The guard encoding is deliberately manifest-derived: the export map already states which
subpackages have supported cross-package runtime exports, so no new kind metadata is introduced and
no package-name allowlist exists. If kind metadata is ever needed, it must be designed generally.

## Supersession

Claims that no longer govern:

- **ADR 0018** — "`@sdl/core` … becomes the pure neutral-infra utility library" and the consequence
  that its "target role is pure utility only", including the disposition-table target homes that
  move `exec` (and by extension any I/O-performing generic surface) out of foundation solely
  because it performs I/O. The four-bucket *consumption* analysis stands: pure utilities are
  importable anywhere, ns-shaped gateways are Kit Gateway material, intrinsic host services are
  SDK-provided, and boot code is runtime harness.
- **ADR 0019** — the premise that foundation cannot be the concrete owner of a real gateway
  implementation. The multi-factor placement gate itself stands and gains foundation as a possible
  outcome for surfaces passing the admission test. Old-door deletion atomicity is preserved
  unchanged for any actual migration.
- **ADR 0023** — the description of the `api` subpackage as "the package's *sole* cross-package
  programmatic import surface", and the implication that a second public door is per se illegal.
  The kind taxonomy, edge-significance rank test, Testing/Host-surface restrictions, and the
  layers-are-folders rule all stand.
- **`docs/conventions/subpackage-conventions.md`** (operational, updated in place) — the rule that
  `ns.subpackageTiers` may only declare tiers lower than the container's tier.

Historical ADR text is not rewritten; each affected ADR carries a one-line refinement annotation
pointing here, matching the existing amendment convention.

## Consequences

- `@nseng-ai/foundation` keeps `ns.tier: neutral-infra` and its existing manifest unchanged;
  `/exec` is legitimately home. No `ns.subpackageTiers` entry is added merely to restate the
  default.
- The style guard needs no behavioral change: the effective-tier pipeline is already bidirectional
  and export-subpackage conformance already accepts multiple exporting subpackages. Tests pin both
  override directions, effective-tier cross-package edge enforcement, and the conformance of
  multiple API-kind surfaces, so the semantics are deliberate rather than accidental.
- The admission boundary is enforced in review prose, not tooling: a foundation addition must state
  its external-consumer scenario concretely enough to evaluate the contract without ns vocabulary.
- Capability Kit retains a clear role as ns extension-building substrate; nothing moves out of it
  as a side effect of this decision.

## Rejected Alternatives

- **Retain the purity definition and move exec out of foundation.** Rejected: it forces generic,
  externally credible infrastructure into ns-shaped homes, and would bar a generic harness-session
  surface from the only honest tier for it.
- **Add a `platform` tier for I/O-performing generic infrastructure.** Rejected: it multiplies tier
  vocabulary to encode a distinction (Pure Utility vs. I/O-performing Neutral Infra) that placement
  and prose already carry; dependency rules would be identical to `neutral-infra`.
- **A foundation-specific exception or package-name allowlist.** Rejected: special-casing
  `@nseng-ai/foundation` hides the rule from the next package that earns it and makes the guard
  lie about the general model.
- **Require actual external adoption for admission.** Rejected: adoption is lagging evidence;
  the reviewable test is a concrete external-consumer scenario against an ns-independent contract.
- **One `@nseng-ai/foundation/api` façade.** Rejected: a giant barrel erases precise contracts,
  creates a meaningless topology circle, and would force a pointless consumer migration.
- **Migrate every plausibly generic gateway into foundation now.** Rejected: reclassification is
  prospective; each move needs ADR 0019's gate and consumer-channel analysis on its own evidence.
