# ns naming brief

The naming story and brand rationale for **ns**, the product formerly named ji (and
before that SDL). The binding verdicts — the casing rule, the accepted collisions, the
npm package plan — live in [ADR 0026](adr/0026-rename-ji-to-ns.md); this brief is the
deliberation and the narrative, and it is the only in-repo home for the marketing story.
It supersedes [the ji naming brief](ji-naming-brief.md), whose narrative is preserved
verbatim as history.

## The spine

**ns is nonslop: the toolkit that stands athwart slop calling stop.**

The Buckley riff is the thesis, not decoration. Agents generate; most of what they
generate evaporates or curdles into slop. ns's capabilities — durable planning
Objectives, branch memory, directed handoffs, stacked PRs — exist to make agent work
accumulate instead: records instead of residue. That one sentence is the story; resist
building a web of terms and analogies out of it.

## Three names in one

Unlike ji, which stood for nothing, ns means three things at once:

- **nonslop.** The thesis above — and established vocabulary, not a retrofit: the
  owner's old `nonslop` repo shipped `ns-*` prefixed skills and an `ns-ci` workflow, so
  "ns = nonslop" predates this rename.
- **namespace.** The CLI is literally a namespace, and the name says so at every
  surface it appears on: `/ns:handoff:create` is a namespace path, `.ns/` is the
  namespace dotdir, `NS_*` are the namespace's env vars, `ns objective …` roots the
  subcommand tree. The name is self-describing wherever you meet it.
- **Nick Schrock's initials.** A private signature.

The two-letter-CLI aesthetic carries over from the ji deliberation, now with the
infrastructure register ns actually lives in: `gt`, `gh`, `jj`.

## Usage

- Always lowercase: `ns`, never `NS` or `Ns` — including at the start of a sentence;
  rewrite the sentence instead. `NS_*` env vars are ordinary env-var uppercase, not an
  exception to the brand rule.
- No single expansion. All three meanings are intended; none is the official one.
- The marketing narrative stays out of CONTEXT.md and AGENTS.md; this brief is its only
  in-repo home.
