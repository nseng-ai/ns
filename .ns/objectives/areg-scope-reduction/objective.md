# Reduce and Rename areg Around Skill-to-Harness Policy

## Thesis

Replace `areg`'s broad agent-registry scope with a smaller, renamed standalone tool whose differentiated job is to compile and audit ns's skill-to-coding-harness exposure policy across Claude Code, Codex, and Pi. Delegate repository skill discovery, Git/local acquisition, installation, updating, removal, harness-root population, and generic installation health to the established Agent Skills toolchain (`npx skills`). Preserve `ns skills` / `@nseng-ai/harness-artifacts` as the separate channel for npm-module-bundled first-party provisioning.

The retained tool is intentionally ns-opinionated rather than prematurely generalized as an ecosystem utility. It should accept explicit skill directories or `SKILL.md` paths, reconcile the harness-specific overlays implied by user intent, and verify ns/Pi replacement commands where applicable. Its exact replacement name must describe skill-to-harness exposure and be settled before implementation.

## Scope

- Establish the reduced ownership contract among three complementary channels:
  - `npx skills` owns Agent Skills discovery plus Git/local acquisition, installation, updating, removal, lockfile behavior, and harness installation topology.
  - `ns skills` / `@nseng-ai/harness-artifacts` owns npm-module-bundled first-party artifact provisioning.
  - the renamed `areg` successor owns ns-opinionated skill exposure policy across Claude Code, Codex, and Pi.
- Rename the standalone CLI/package so its name communicates skill-to-harness exposure rather than a broad "agent registry". Decide the exact name from the retained interface before implementation.
- Remove generic discovery and installation-health surfaces from `areg`, including `skill find` and the generic portions of `check` and `doctor`. Retain `skill list`, `skill show`, `skill apply`, and checking only insofar as they present, mutate, or audit invocation policy.
- Make explicit skill directories or direct `SKILL.md` paths the authoritative input. Do not add recursive canonical-source discovery to replace behavior delegated to `npx skills`.
- Infer invocation kind from reconciled overlays rather than introducing a new policy registry or manifest.
- Retire `unlisted`. Fold router-only leaves such as `setup-dprint` and `setup-dprint-gh-ci` into their parent skill's body or `references/`, then delete their standalone skill records and `unlisted` machinery.
- Preserve `normal`, `ambient-only`, `invoke-only`, and `command-backed` initially, while validating each against current Claude Code, Codex, and Pi behavior and removing any kind that current evidence proves redundant.
- Delete redundant surfaces without compatibility shims; ns is private and unreleased, and first-party callers can move atomically.
- Pin the supported `skills` CLI version or range and add contract evidence for the upstream behavior ns adopts rather than reimplementing it.
- Prove the ownership boundary through the Objective skill family as one nested-catalog steelthread: canonical source under `skills/<category>/<name>`, flat installation by `npx skills`, continued npm-bundled provisioning where applicable, and correct invocation-policy reconciliation.

## Non-Goals

- Migrating every first-party skill into grouped source folders; the Objective family is the proving slice and broader organization is follow-up breadth.
- Replacing, wrapping, or forking `npx skills` for repository/Git skill acquisition or installation.
- Converging `skills-lock.json` with the `@nseng-ai/harness-artifacts` install manifest; they remain records of different distribution channels.
- Retiring or redesigning `ns skills` npm-module-bundled provisioning.
- Designing a generally reusable Agent Skills policy library before a second independent consumer proves that seam.
- Preserving removed `areg` commands through aliases, warnings, or compatibility adapters.
- Adding an Objective Edge to `professional-repo-curation`; that Objective's incubator/graduation direction remains relevant context but does not make this record its child or formal counterpart.
- Moving or graduating the package under the professional-repo-curation initiative; this Objective narrows the contract, while that initiative owns package placement and graduation timing.

## Completion Criteria

- The `areg` name has been replaced by an explicitly chosen name describing skill-to-harness exposure, with first-party callers and active documentation updated.
- The retained standalone command surface concerns invocation policy only: applying policy, showing/listing inferred policy, and auditing policy consistency across Claude Code, Codex, and Pi.
- Generic skill discovery, acquisition, installation, updating, removal, lockfile validation, mirror-topology enforcement, and installation-health code and commands are absent from the renamed tool.
- The tool accepts explicit skill-directory or `SKILL.md` paths and does not recursively discover canonical first-party skills.
- `unlisted` no longer exists. Router-only leaf content has been embedded into its parent skill and the standalone leaf skills have been removed.
- The remaining invocation kinds each have current harness evidence, or redundant kinds have been deleted with callers migrated.
- Tests prove policy reconciliation for skills delivered through both `npx skills` and `ns skills` without making the policy tool own either installation channel.
- The Objective skill family is organized as a nested catalog proving slice, remains selectable by leaf skill name through the pinned `skills` CLI, installs to flat harness destinations, publishes/provisions correctly where applicable, and retains the intended Claude/Codex/Pi exposure behavior.
- The supported upstream `skills` CLI version or range and relied-upon contracts are explicit, with contract coverage for nested discovery, flat installation, and relevant harness links.
- Relevant targeted tests and the repository validation suite pass as completion evidence.

## Assumptions and Risks

Assumptions:

- Current `npx skills` nested-catalog discovery (`skills/<category>/<name>/SKILL.md`), leaf-name selection, and flat harness installation are stable enough to adopt when pinned and contract-tested.
- Skill identity is the frontmatter/leaf skill name, while category folders are source organization rather than runtime namespaces.
- `normal`, `ambient-only`, `invoke-only`, and `command-backed` capture real current differences across Claude Code, Codex, and Pi, though evidence may justify simplifying them.
- Cross-harness policy remains valuable as one atomic ns-opinionated operation even though generic installation management moves upstream.
- Explicit source paths are an acceptable interface because policy application is an authoring or maintenance action, not skill discovery.

Risks:

- Upstream `skills` behavior may change. Pinning and behavioral contract tests mitigate silent drift without recreating the implementation.
- Invocation kinds may encode incidental current harness mechanics rather than durable user intent. Validate them from intended exposure semantics and current runtime behavior before preserving implementation details.
- Renaming the package and CLI can create broad mechanical churn that obscures the deletion work. Settle the name and public interface first, then perform one bounded cutover without compatibility residue.
- Removing whole-project discovery may reveal hidden first-party consumers of `areg skill find` or generic doctor/check output. Inventory callers before deletion and migrate only genuine policy consumers; do not preserve generic surfaces merely because they exist.
- The Objective-family steelthread touches source layout, package publication metadata, npm-bundled provisioning, Pi backing-skill expansion, and invocation overlays. Keep it a proving slice rather than widening into the whole skills tree.
- An ns-opinionated standalone tool may later need a reusable core. Defer extraction until a second independent consumer proves a real seam rather than designing one speculatively now.
- Retiring `unlisted` may expose content that was incorrectly modeled as an independent skill. The migration must embed each router-only leaf under its actual parent and verify that no legitimate direct invocation use is lost.

## Open Questions

- What exact replacement name best communicates an ns-opinionated tool for skill-to-harness exposure across Claude Code, Codex, and Pi?
- Which of `normal`, `ambient-only`, `invoke-only`, and `command-backed` remain necessary after current harness behavior is revalidated?
- What is the smallest retained `list`/`show`/`check` interface when explicit paths, rather than discovery by name, are authoritative?
- Which existing callers depend on generic `areg` inventory or diagnostics, and which should move to `npx skills`, `ns skills`, or direct policy inspection?
- What pinning mechanism best keeps local development, CI contract checks, and skill-management guidance on the same supported `skills` CLI release?

## Closure

**Outcome: Abandoned.**

The standalone successor thesis and the broader upstream/nested-catalog program were rejected. The closing change intentionally salvages only this repository's useful Skill Exposure Policy as the explicitly declared, private project-local `ns skill-exposure` extension. It does not complete or silently transfer the proposed upstream `skills` pin and contract tests, the nested Objective-family catalog steelthread, or general ecosystem productization; the unchecked roadmap rows remain unchanged.

Durable current ownership now lives in `.ns/extensions/skill-exposure/` and the active skill conventions rather than only in this Objective. The remaining risk is that both the policy and its Pi replacement registry are coupled to this repository. Promote the extension to `ts/packages/internal/*` only if broader package-grade reuse appears, and promote it to a first-party extension only after another consumer proves the product need.
