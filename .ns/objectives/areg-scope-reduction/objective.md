# Reduce and Rename areg Around Skill-to-Harness Policy

## Thesis

Replace `areg`'s broad agent-registry scope with smaller, renamed standalone tool. Differentiated job: compile and audit ns's skill-to-coding-harness exposure policy across Claude Code, Codex, and Pi. Delegate repository skill discovery, Git/local acquisition, installation, updating, removal, harness-root population, and generic installation health to established Agent Skills toolchain (`npx skills`). Preserve `ns skills` / `@nseng-ai/harness-artifacts` as separate channel for npm-module-bundled first-party provisioning.

Retained tool stays ns-opinionated, not prematurely generalized as ecosystem utility. It accepts explicit skill directories or `SKILL.md` paths, reconciles harness-specific overlays implied by user intent, and verifies ns/Pi replacement commands where applicable. Exact replacement name must describe skill-to-harness exposure and settle before implementation.

## Scope

- Establish reduced ownership contract among three complementary channels:
  - `npx skills` owns Agent Skills discovery plus Git/local acquisition, installation, updating, removal, lockfile behavior, and harness installation topology.
  - `ns skills` / `@nseng-ai/harness-artifacts` owns npm-module-bundled first-party artifact provisioning.
  - renamed `areg` successor owns ns-opinionated skill exposure policy across Claude Code, Codex, and Pi.
- Rename standalone CLI/package so name communicates skill-to-harness exposure, not broad "agent registry". Decide exact name from retained interface before implementation.
- Remove generic discovery and installation-health surfaces from `areg`, including `skill find` and generic portions of `check` and `doctor`. Retain `skill list`, `skill show`, `skill apply`, and checking only where they present, mutate, or audit invocation policy.
- Make explicit skill directories or direct `SKILL.md` paths authoritative input. Add no recursive canonical-source discovery replacing behavior delegated to `npx skills`.
- Infer invocation kind from reconciled overlays. Add no policy registry or manifest.
- Retire `unlisted`. Fold router-only leaves such as `setup-dprint` and `setup-dprint-gh-ci` into parent skill body or `references/`, then delete standalone skill records and `unlisted` machinery.
- Preserve `normal`, `ambient-only`, `invoke-only`, and `command-backed` initially. Validate each against current Claude Code, Codex, and Pi behavior. Remove any kind current evidence proves redundant.
- Delete redundant surfaces without compatibility shims. ns is private and unreleased; first-party callers can move atomically.
- Pin supported `skills` CLI version or range. Add contract evidence for adopted upstream behavior instead of reimplementing it.
- Prove ownership boundary through Objective skill family as one nested-catalog steelthread: canonical source under `skills/<category>/<name>`, flat installation by `npx skills`, continued npm-bundled provisioning where applicable, and correct invocation-policy reconciliation.

## Non-Goals

- Migrating every first-party skill into grouped source folders. Objective family is proving slice; broader organization is follow-up breadth.
- Replacing, wrapping, or forking `npx skills` for repository/Git skill acquisition or installation.
- Converging `skills-lock.json` with `@nseng-ai/harness-artifacts` install manifest. They record different distribution channels.
- Retiring or redesigning `ns skills` npm-module-bundled provisioning.
- Designing generally reusable Agent Skills policy library before second independent consumer proves seam.
- Preserving removed `areg` commands through aliases, warnings, or compatibility adapters.
- Adding Objective Edge to `professional-repo-curation`. That Objective's incubator/graduation direction remains relevant context but does not make this record its child or formal counterpart.
- Moving or graduating package under professional-repo-curation initiative. This Objective narrows contract; that initiative owns package placement and graduation timing.

## Completion Criteria

- `areg` name replaced by explicitly chosen name describing skill-to-harness exposure. First-party callers and active documentation updated.
- Retained standalone command surface concerns invocation policy only: applying policy, showing/listing inferred policy, and auditing policy consistency across Claude Code, Codex, and Pi.
- Generic skill discovery, acquisition, installation, updating, removal, lockfile validation, mirror-topology enforcement, and installation-health code and commands absent from renamed tool.
- Tool accepts explicit skill-directory or `SKILL.md` paths and does not recursively discover canonical first-party skills.
- `unlisted` gone. Router-only leaf content embedded into parent skill; standalone leaf skills removed.
- Remaining invocation kinds each have current harness evidence, or redundant kinds deleted with callers migrated.
- Tests prove policy reconciliation for skills delivered through both `npx skills` and `ns skills` without making policy tool own either installation channel.
- Objective skill family organized as nested catalog proving slice, remains selectable by leaf skill name through pinned `skills` CLI, installs to flat harness destinations, publishes/provisions correctly where applicable, and retains intended Claude/Codex/Pi exposure behavior.
- Supported upstream `skills` CLI version or range and relied-upon contracts explicit, with contract coverage for nested discovery, flat installation, and relevant harness links.
- Relevant targeted tests and repository validation suite pass as completion evidence.

## Assumptions and Risks

Assumptions:

- Current `npx skills` nested-catalog discovery (`skills/<category>/<name>/SKILL.md`), leaf-name selection, and flat harness installation are stable enough to adopt when pinned and contract-tested.
- Skill identity is frontmatter/leaf skill name. Category folders are source organization, not runtime namespaces.
- `normal`, `ambient-only`, `invoke-only`, and `command-backed` capture real current differences across Claude Code, Codex, and Pi, though evidence may justify simplifying them.
- Cross-harness policy remains valuable as one atomic ns-opinionated operation even when generic installation management moves upstream.
- Explicit source paths are acceptable interface because policy application is authoring or maintenance action, not skill discovery.

Risks:

- Upstream `skills` behavior may change. Pinning and behavioral contract tests mitigate silent drift without recreating implementation.
- Invocation kinds may encode incidental current harness mechanics, not durable user intent. Validate from intended exposure semantics and current runtime behavior before preserving implementation details.
- Package and CLI rename can create broad mechanical churn obscuring deletion work. Settle name and public interface first, then perform one bounded cutover without compatibility residue.
- Removing whole-project discovery may reveal hidden first-party consumers of `areg skill find` or generic doctor/check output. Inventory callers before deletion. Migrate only genuine policy consumers; do not preserve generic surfaces because they exist.
- Objective-family steelthread touches source layout, package publication metadata, npm-bundled provisioning, Pi backing-skill expansion, and invocation overlays. Keep it proving slice; do not widen into whole skills tree.
- ns-opinionated standalone tool may later need reusable core. Defer extraction until second independent consumer proves real seam.
- Retiring `unlisted` may expose content incorrectly modeled as independent skill. Embed each router-only leaf under actual parent and verify no legitimate direct invocation use is lost.

## Open Questions

- What exact replacement name best communicates ns-opinionated tool for skill-to-harness exposure across Claude Code, Codex, and Pi?
- Which of `normal`, `ambient-only`, `invoke-only`, and `command-backed` remain necessary after current harness behavior is revalidated?
- What is smallest retained `list`/`show`/`check` interface when explicit paths, not discovery by name, are authoritative?
- Which existing callers depend on generic `areg` inventory or diagnostics, and which should move to `npx skills`, `ns skills`, or direct policy inspection?
- What pinning mechanism best keeps local development, CI contract checks, and skill-management guidance on same supported `skills` CLI release?
