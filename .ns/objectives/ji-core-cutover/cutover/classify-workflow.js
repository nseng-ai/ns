export const meta = {
  name: 'ji-cutover-classify',
  description: 'Classify 87 judgment-needing candidate files for the sdl→ji cutover plan (skip vs simple+hint)',
  phases: [{ title: 'Classify', detail: 'read-only classifier agents, 15 files each' }],
}

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
              'only-atsdl-imports', 'only-identifier', 'only-src-sdl-path-segment',
              'only-package-or-skill-or-slug-name', 'post-window-branding', 'false-positive-match',
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
  return `You are a read-only classifier for the sdl→ji rename cutover in the repo at ${args.repoRoot}. Work from that directory. Do NOT edit anything.

## The rename (in-window surfaces)
bin \`sdl\`→\`ji\`; \`.sdl/\` path literals→\`.ji/\`; \`/sdl:*\` and \`sdl:*\` namespace/machine keys→\`ji:*\`; XDG \`state|data|config|share/sdl\`→\`…/ji\` and \`~/.sdl\`→\`~/.ji\`; package.json manifest KEY \`"sdl":\`→\`"ji":\` (incl. sdl.tier prose); \`sdl.toml\`→\`ji.toml\`; SDL_* env var names→JI_*; sdl-brand artifact filenames in strings (e.g. "sdl-pi-cli-command-extension.jsonl"); \`sdl <command>\` instruction lines; prose naming the CLI operatively ("completion setup for sdl.").

## SURVIVORS — files whose ONLY matches are these get decision=skip
- \`@sdl/*\` package scope and any import specifier containing it (later package-scope sweep row)
- TypeScript/JS identifiers containing sdl (resolveSdlXdgPath, sdlToml, SdlCommandInfo, sdlSubpackages, …)
- \`src/sdl/\` path segments, \`./sdl/\` or \`../sdl/\` relative imports, \`/sdl/commands\` path fragments
- bare \`"sdl"\` VALUES inside package.json \`subpackages\` arrays
- package/dir/file names: \`sdl-flow\`, \`sdl-capability-kit\`, \`sdlcc\`, \`sdl-tools\`, skill dir names (\`sdl-flow-submit\`, \`sdl-typescript\`, \`sdl-cli-design\`), source filenames (\`sdl-extension.ts\`), objective slugs (\`rename-sdl-to-ji\`)
- documentation BRANDING strings ("sdl-docs" site id, site titles) — post-window branding row
- \`skills-lock.json\` skill-name keys
- historical prose in old plan documents

## Evidence pack
Your files' pre-extracted match lines are in ${args.evidencePath} under \`### <path>\` headers (read that file first; read the actual source file whenever evidence is ambiguous — especially to distinguish an env-var READ site from an identifier, or an operative instruction from historical prose).

## Your files
${paths.map((p) => `- ${p}`).join('\n')}

## Rules
- decision=simple ⇒ the file has at least one genuine in-window literal; write a hint naming the exact literals/lines to rename AND any adjacent survivor to leave alone.
- decision=skip ⇒ every match is a survivor; pick the dominant reason from the enum.
- Set suspectedNewCoupling ONLY when a correct edit requires cross-file coordination (a typed contract, a duplicated constant that must stay in sync) — name the coupled files.
- SDL_* env vars: reads like process.env.SDL_CHECKPOINT_MODEL, SDL_TS_BAN_* style-guard rule names, justfile SDL_TOOL vars are IN-WINDOW (rename to JI_*). Note them explicitly in hints.
- Be precise; a wrong 'skip' silently loses a rename site.

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