export const meta = {
  name: 'ns-cutover-classify',
  description: 'Classify judgment-needing candidate files for the ji→ns cutover plan (skip vs simple+hint)',
  phases: [{ title: 'Classify', detail: 'read-only classifier agents, ~15 files each' }],
}

// args: { repoRoot: string, evidencePath: string, batches: string[][] }
if (typeof args === "string") args = JSON.parse(args)

const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decisions'],
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'decision', 'reason'],
        properties: {
          path: { type: 'string' },
          decision: { type: 'string', enum: ['skip', 'simple'] },
          reason: {
            type: 'string',
            enum: [
              'only-atji-imports', 'only-identifier', 'only-src-ji-path-segment',
              'only-package-or-skill-or-slug-name', 'post-window-branding', 'false-positive-match',
              'historical-record', 'phase-two-surface',
              'has-in-window-literals',
            ],
          },
          hint: { type: 'string', description: 'for simple: file-specific guidance naming the exact literals to rename and any traps' },
          suspectedNewCoupling: { type: 'string', description: 'set ONLY if this file must change together with specific other files; name them and why' },
        },
      },
    },
  },
}

function prompt(paths) {
  return `You are a read-only classifier for the ji→ns rename cutover in the repo at ${args.repoRoot}. Work from that directory. Do NOT edit anything.

## The rename (in-window surfaces)
bin \`ji\`→\`ns\`; \`.ji/\` path literals→\`.ns/\`; \`/ji:*\` and \`ji:*\` namespace/machine keys→\`ns:*\`; XDG \`state|data|config|share|tmp/ji\`→\`…/ns\` and \`~/.ji\`→\`~/.ns\`; JI_* env var NAMES→NS_* (incl. string values, env reads, fixture keys); \`refs/ji/*\`→\`refs/ns/*\`; the "# >>> ji shell integration >>>" sentinel markers and their prose; brand machine keys/artifact filenames ("ji-command-ack", "ji-pi-cli-command-extension.jsonl", "ji-pr-description-v2"); markers \`<!-- ji-reviewer:\`/\`<!-- ji-pr-description:\`→\`<!-- ns-…\`; snake codes \`ji_extension_contribution_import_failed\`/\`ji_reviewer_marker\`→\`ns_…\`; \`ji <command>\` instruction lines and Bash(ji …) allowed-tools; brand tmpdir prefixes ("ji-…-", "/tmp/ji"); references to the four MOVED skill dirs skills/ji-flow-{autobranch,branch-latest-commit,cp,submit}→skills/ns-flow-*.

## PHASE-TWO surfaces — files whose ONLY matches are these get decision=skip reason=phase-two-surface (PR-5 owns them; a baseline asserts they are untouched)
- \`ji.toml\` (the file, all references, the \`ji_toml_invalid\` code)
- the package.json extension-manifest KEY \`"ji": {\` in ANY manifest (incl. .ji/extensions/*/package.json and test fixtures), reads of that key (\`manifest.ji\`, \`readonly ji?:\`, \`value.ji\`, \`"ji" in value\`), and dotted prose \`ji.tier\`/\`ji.subpackages\`/\`ji.remainder\`/\`ji.commands\`
- EXCEPTION: the kernel BIN key \`"ji": "./src/cli/index.ts"\` in ts/packages/kernel/package.json IS in-window (already anchored — not yours)
- \`jicc\` package/dir/bin names

## Other SURVIVORS — files whose ONLY matches are these get decision=skip with the matching reason
- \`@ji/*\` package scope and any import specifier containing it (only-atji-imports)
- TypeScript/JS identifiers containing ji or sdl in any casing (only-identifier)
- \`src/ji/\` path segments, \`./ji/\` or \`../ji/\` relative imports, \`ji-*.ts\` FILENAMES and their import subpaths (\`../../submit/ji-runtime.ts\`) (only-src-ji-path-segment)
- package/skill-dir/slug names that did NOT move: \`sdl-typescript\`, \`sdl-cli-design\`, objective slugs \`ji-core-cutover\`, \`rename-sdl-to-ji\`, \`rename-ji-to-ns\`, \`migrate-areg-and-ns-skills\` (only-package-or-skill-or-slug-name)
- bare "ji"/"SDL" brand PROSE in sentences/titles/labels (post-window-branding)
- historical narration in checked-in plan/record docs (historical-record)
- pre-existing non-brand \`ns\` tokens are NEVER rename targets and NEVER evidence: brmem's BRMEM_NS_SEGMENT="ns" / refs/brmem/ns, \`--namespace <ns>\` placeholders in skills/brmem/SKILL.md. If a file's only "hits" are ns tokens something is wrong — flag it (false-positive-match).

## Evidence pack
Your files' pre-extracted match lines are in ${args.evidencePath} under \`### <path>\` headers (read that file first; read the actual source file whenever evidence is ambiguous — especially to distinguish an env-var NAME position from an identifier, an operative instruction from historical prose, or the manifest KEY from an argv "ji").

## Your files
${paths.map((p) => `- ${p}`).join('\n')}

## Rules
- decision=simple ⇒ the file has at least one genuine in-window literal; write a hint naming the exact literals/lines to rename AND any adjacent survivor to leave alone (especially phase-two surfaces sharing the file).
- decision=skip ⇒ every match is a survivor; pick the dominant reason from the enum (phase-two-surface dominates when present — those skips are audited against PR-5).
- A file with BOTH in-window literals AND phase-two surfaces is decision=simple; the hint MUST name the phase-two literals to leave untouched.
- Set suspectedNewCoupling ONLY when a correct edit requires cross-file coordination (a typed contract, a duplicated constant that must stay in sync) — name the coupled files.
- NEVER suggest renaming anything to/from \`ns\` outside the enumerated anchored ji forms; never treat existing ns tokens as drift.
- Be precise; a wrong 'skip' silently loses a rename site, a wrong 'simple' on a phase-two file breaks the PR-5 baseline.

Return one decision per file, all ${paths.length} files.`
}

phase('Classify')
const results = await parallel(
  args.batches.map((paths, i) => () =>
    agent(prompt(paths), {
      label: `classify:batch-${i + 1}`,
      phase: 'Classify',
      schema: DECISION_SCHEMA,
      agentType: 'Explore',
    })),
)
const decisions = results.filter(Boolean).flatMap((r) => r.decisions)
const missing = args.batches.flat().filter((p) => !decisions.some((d) => d.path === p))
log(`classified ${decisions.length}, missing ${missing.length}`)
return { decisions, missing }
