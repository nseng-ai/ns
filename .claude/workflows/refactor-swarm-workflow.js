/**
 * refactor-swarm-workflow — a reusable, generic multi-agent refactor execution engine.
 *
 * This is the EXECUTE half of a refactor. It is a pure execution engine: it does
 * no discovery and contains no domain content. Every piece of task content arrives
 * through `args`. The same script runs any file-local refactor.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * NOT the `refactor-swarm` skill — do not confuse the two
 * ──────────────────────────────────────────────────────────────────────────────
 * This `refactor-swarm-workflow` (a `Workflow`-tool script at
 * `.claude/workflows/refactor-swarm-workflow.js`) is a DIFFERENT, independent thing
 * from the `refactor-swarm` SKILL at `.claude/skills/refactor-swarm/`. They
 * solve a similar problem but share no code and are invoked in entirely different
 * ways:
 *
 *   - refactor-swarm-workflow (THIS FILE) — runs via the `Workflow` tool. It runs
 *     detached (cannot pause to ask anything), follows the plan/execute handshake
 *     below, edits with disjoint concurrent agents, runs an adversarial verify pass,
 *     and returns a structured report. Invoke with
 *     `Workflow({ name: "refactor-swarm-workflow", args })`.
 *
 *   - refactor-swarm (the SKILL, separate) — an in-session procedure the
 *     orchestrator drives by hand, spawning `Task` subagents in two waves (source
 *     files, then tests). No `Workflow` tool, no detached run, no structured report.
 *
 * If you reached here looking for the lighter, interactive, two-wave Task approach,
 * stop and read `.claude/skills/refactor-swarm/SKILL.md` instead.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * The plan/execute handshake (read this first)
 * ──────────────────────────────────────────────────────────────────────────────
 * A Workflow runs detached and CANNOT pause to ask a human anything. So a refactor
 * splits into two halves:
 *
 *   1. PLAN — interactive, happens in the chat session, done by the orchestrator
 *      (you, the main agent), NOT here.
 *
 *      STEP 0 — REQUIRE AN INTENT BEFORE DOING ANYTHING. If the command was invoked
 *      with no refactor intent (e.g. a bare `/refactor-swarm-workflow` with nothing
 *      after it, and no intent established earlier in the conversation), the
 *      orchestrator MUST stop and ASK THE USER what to refactor, then wait for a
 *      reply. Do NOT call `Workflow({ name: "refactor-swarm-workflow" })` with empty
 *      or placeholder args — with no `simple`/`complex` entries the run is a no-op
 *      and the user gets nothing back. Prompt for the intent (and optionally a scope
 *      to search and any paths to exclude); only continue once an intent exists.
 *
 *      Then, when the user supplies the intent — typed as
 *      `refactor-swarm-workflow: <intent>` or given in reply to the Step 0 prompt —
 *      the orchestrator:
 *        a. drafts the shared `brief` from the intent,
 *        b. discovers candidate files (`git grep` + judgment), excluding generated
 *           and historical paths,
 *        c. partitions the work into `simple[]` (decidable per single file) and
 *           `complex[]` (coordinated multi-file changesets),
 *        d. asks the user the ambiguous calls and iterates until approved,
 *        e. runs any pre-flight `git mv`,
 *        f. THEN calls `Workflow({ name: "refactor-swarm-workflow", args })` with the locked
 *           partition.
 *
 *   2. EXECUTE — this script. It fans out one agent per simple file and one per
 *      complex changeset (concurrently, since the file sets are disjoint), runs an
 *      adversarial verify pass, and returns a structured report.
 *
 * After it returns, the orchestrator relays the report and runs the build/test gate.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Caller-owned brackets (this script does NOT do these)
 * ──────────────────────────────────────────────────────────────────────────────
 *   - any `git mv` / file moves BEFORE the run,
 *   - the build/test gate AFTER the run (e.g. `uv sync`, `just`, `pytest`).
 * A workflow script cannot run those reliably; the orchestrator owns them.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Disjoint-file requirement
 * ──────────────────────────────────────────────────────────────────────────────
 * The edit agents run concurrently, so no file may be assigned to more than one
 * agent — `simple[]` paths and every `complex[].files` entry must be pairwise
 * disjoint. The planner guarantees this. This script `log`s a warning if it detects
 * a collision but does not stop.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * `args` contract (all task content comes from here)
 * ──────────────────────────────────────────────────────────────────────────────
 *   {
 *     "brief":   "the shared refactor contract every SIMPLE agent applies",
 *     "simple":  [{ "path": "src/foo.py", "hint": "optional file-specific note" }],
 *     "complex": [{ "id": "rewire-X", "files": ["a.py","b.py"],
 *                   "instructions": "what to do across these files",
 *                   "model": "sonnet" }],            // optional per-changeset override
 *     "invariants": [{ "key": "no-residual",
 *                      "prompt": "git grep OLD must be empty; report any matches" }],
 *     "repoRoot":     "/abs/path",   // working dir for agent greps/edits (optional)
 *     "model":        "haiku",       // SIMPLE-tier model   (default "haiku")
 *     "complexModel": "sonnet",      // COMPLEX-tier default (default "sonnet")
 *     "verifyModel":  "sonnet"       // VERIFY-tier model   (default = complexModel)
 *   }
 *
 * `args` may arrive as a parsed object OR as a JSON string (the harness passes it
 * verbatim); the script normalizes either form.
 *
 * If both `simple` and `complex` are empty, the run is a no-op and returns
 * immediately without spawning agents. If `invariants` is empty the verify phase
 * is skipped entirely.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Neutral example
 * ──────────────────────────────────────────────────────────────────────────────
 *   Renaming every reference of OLD to NEW across a few files:
 *     args = {
 *       brief: "Rename the identifier OLD to NEW. Update imports, call sites, and "
 *            + "string literals that name it. Leave unrelated code untouched.",
 *       simple: [{ path: "src/foo.py" }, { path: "src/bar.py", hint: "OLD appears in a docstring too" }],
 *       complex: [{ id: "rewire-entrypoint",
 *                   files: ["src/app.py", "src/app_config.py"],
 *                   instructions: "Move the OLD wiring from app.py into app_config.py and re-export as NEW." }],
 *       invariants: [{ key: "no-residual", prompt: "`git grep -n OLD -- 'src/**'` must return nothing." }],
 *       repoRoot: "/abs/path/to/repo"
 *     }
 *
 * Constraints: `meta` is a pure literal; no Date.now()/Math.random()/argless
 * new Date(); no TypeScript syntax. This file contains zero domain-specific content.
 */

export const meta = {
  name: 'refactor-swarm-workflow',
  description:
    'Workflow-tool execution engine for a planned file-local refactor: fans out disjoint concurrent edit agents, runs an adversarial verify pass, returns a structured report. Distinct from the refactor-swarm skill (a separate in-session, two-wave Task-agent procedure).',
  phases: [
    { title: 'Edit', detail: 'one agent per simple file + one per complex changeset (disjoint, concurrent)' },
    { title: 'Verify', detail: 'adversarial read-only invariant checks across the tree' },
  ],
}

// ── Structured-output schemas (force data returns, no prose) ──────────────────

const EDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'changed', 'replacements', 'skipped'],
  properties: {
    file: { type: 'string', description: 'the path this agent was assigned' },
    changed: { type: 'boolean', description: 'true if the file was modified' },
    replacements: {
      type: 'array',
      description: 'each distinct edit made to the file',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['before', 'after'],
        properties: {
          before: { type: 'string', description: 'short snippet before the edit' },
          after: { type: 'string', description: 'short snippet after the edit' },
        },
      },
    },
    skipped: {
      type: 'array',
      description: 'judgment calls deliberately NOT made, each with a one-line reason',
      items: { type: 'string' },
    },
  },
}

const COMPLEX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'files', 'changed', 'summary', 'skipped'],
  properties: {
    id: { type: 'string', description: 'the changeset id from args' },
    files: { type: 'array', items: { type: 'string' }, description: 'files actually touched' },
    changed: { type: 'boolean', description: 'true if any file in the changeset was modified' },
    summary: { type: 'string', description: 'what the coordinated changeset did' },
    skipped: {
      type: 'array',
      description: 'judgment calls deliberately NOT made, each with a one-line reason',
      items: { type: 'string' },
    },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['invariant', 'pass', 'violations'],
  properties: {
    invariant: { type: 'string', description: 'the invariant key from args' },
    pass: { type: 'boolean', description: 'true ONLY if the invariant cleanly holds' },
    violations: {
      type: 'array',
      description: 'concrete evidence of each violation (file:line / matching text); empty when pass=true',
      items: { type: 'string' },
    },
  },
}

// ── Read + normalize args ─────────────────────────────────────────────────────

// `args` is delivered verbatim by the harness. Depending on how the caller passes
// it, it can arrive as an already-parsed object OR as a JSON string. Normalize to
// a plain object so the tool is robust either way.
let input = args
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch (e) {
    log(`refactor-swarm-workflow: args was a string but not valid JSON (${e}); treating as empty.`)
    input = {}
  }
}
if (input === null || typeof input !== 'object') input = {}

const simple = Array.isArray(input.simple) ? input.simple : []
const complex = Array.isArray(input.complex) ? input.complex : []
const invariants = Array.isArray(input.invariants) ? input.invariants : []
const brief = typeof input.brief === 'string' ? input.brief : ''
const repoRoot = typeof input.repoRoot === 'string' ? input.repoRoot : ''
const simpleModel = input.model || 'haiku'
const complexModel = input.complexModel || 'sonnet'
const verifyModel = input.verifyModel || complexModel

// ── 1. Validate / guard ───────────────────────────────────────────────────────

if (simple.length === 0 && complex.length === 0) {
  log('refactor-swarm-workflow: no simple or complex entries — nothing to do.')
  return {
    summary: {
      simpleFilesChanged: 0,
      simpleTotal: 0,
      changesetsDone: 0,
      changesetsTotal: 0,
      invariantsChecked: 0,
      invariantsFailed: 0,
      skips: 0,
      noop: true,
    },
    skips: [],
    failures: [],
    simple: [],
    complex: [],
    verify: [],
  }
}

// Warn (do not stop) if any file is owned by more than one agent — disjointness
// is the planner's contract, but a collision would mean concurrent edits to the
// same file, so surface it loudly.
const owners = new Map()
const claim = (path, owner) => {
  const list = owners.get(path) || []
  list.push(owner)
  owners.set(path, list)
}
for (const s of simple) claim(s.path, 'simple')
for (const cs of complex) for (const f of (Array.isArray(cs.files) ? cs.files : [])) claim(f, `complex:${cs.id}`)
const collisions = [...owners.entries()].filter(([, who]) => who.length > 1)
if (collisions.length > 0) {
  log(`refactor-swarm-workflow: WARNING — ${collisions.length} file(s) assigned to multiple agents; concurrent edits may collide:`)
  for (const [path, who] of collisions) log(`  ${path} ← ${who.join(', ')}`)
}

// ── Prompt builders ───────────────────────────────────────────────────────────

const rootLine = repoRoot ? `Work from the repo root: ${repoRoot}\n\n` : ''

function simplePrompt(entry) {
  const hint = entry.hint ? `\n## File-specific note\n${entry.hint}\n` : ''
  return `${rootLine}You are one agent in a parallel refactor swarm. You own EXACTLY ONE file. Do not read for context beyond what you need, and do NOT edit any other file.

## Shared refactor brief (applies to every file)
${brief}

## Your file
${entry.path}
${hint}
## How to work
- Read the file, apply the brief, and edit it in place.
- Make only the changes the brief calls for. Preserve everything else verbatim.
- If a change is ambiguous or risky — you are not confident the brief intends it — DO NOT make it. Record it in \`skipped\` with a one-line reason. Surfacing a judgment call is far better than a wrong edit.
- If the file needs no change, set changed=false and leave replacements empty.

Return the structured result describing exactly what you did.`
}

function complexPrompt(cs) {
  const files = (Array.isArray(cs.files) ? cs.files : []).map((f) => `- ${f}`).join('\n')
  return `${rootLine}You are one agent in a parallel refactor swarm. You own a COORDINATED CHANGESET spanning several files that must change together. Do NOT touch any file outside this changeset.

## Shared refactor brief (context)
${brief}

## Changeset: ${cs.id}
${cs.instructions || ''}

## Files in this changeset
${files}

## How to work
- Read all the files first, then make the coordinated edits so they stay consistent with one another.
- Make only the changes the instructions call for. Preserve everything else verbatim.
- If part of the change is ambiguous or risky, DO NOT guess — record it in \`skipped\` with a reason.
- In \`files\`, list the files you actually modified.

Return the structured result describing exactly what you did.`
}

function verifyPrompt(inv) {
  return `${rootLine}You are an adversarial verifier checking ONE invariant after a refactor. You are READ-ONLY: use \`git grep\`, \`git diff\`, and reading files. You must NOT edit anything.

## Invariant: ${inv.key}
${inv.prompt}

## How to judge
- Be adversarial. Actively try to find violations.
- Default to pass=false whenever you are unsure or cannot fully confirm the invariant holds.
- Put concrete evidence (matching lines, file:line) in \`violations\`. Leave it empty only when the invariant cleanly holds.

Return the structured result.`
}

// ── 2. Edit phase (one parallel() barrier over all edit thunks) ───────────────
// Simple + complex run concurrently because they touch disjoint files. Each thunk
// tags its result with its tier so we can split them back apart afterward.

phase('Edit')

const editThunks = [
  ...simple.map((entry) => () =>
    agent(simplePrompt(entry), {
      label: `simple:${entry.path}`,
      phase: 'Edit',
      schema: EDIT_SCHEMA,
      model: simpleModel,
    }).then((r) => (r ? { tier: 'simple', result: r } : null))),
  ...complex.map((cs) => () =>
    agent(complexPrompt(cs), {
      label: `complex:${cs.id}`,
      phase: 'Edit',
      schema: COMPLEX_SCHEMA,
      model: cs.model || complexModel,
    }).then((r) => (r ? { tier: 'complex', result: r } : null))),
]

const editResults = (await parallel(editThunks)).filter(Boolean)
const simpleResults = editResults.filter((e) => e.tier === 'simple').map((e) => e.result)
const complexResults = editResults.filter((e) => e.tier === 'complex').map((e) => e.result)

// ── 3. Verify phase (barrier after edits — invariants read the whole tree) ────

let verifyResults = []
if (invariants.length > 0) {
  phase('Verify')
  verifyResults = (await parallel(
    invariants.map((inv) => () =>
      agent(verifyPrompt(inv), {
        label: `verify:${inv.key}`,
        phase: 'Verify',
        schema: VERIFY_SCHEMA,
        model: verifyModel,
        agentType: 'Explore', // read-only enforcement: Explore has no Edit/Write
      })),
  )).filter(Boolean)
}

// ── 4. Aggregate + return ─────────────────────────────────────────────────────

const skips = []
for (const r of simpleResults) {
  for (const note of (Array.isArray(r.skipped) ? r.skipped : [])) {
    skips.push({ tier: 'simple', file: r.file, note })
  }
}
for (const r of complexResults) {
  for (const note of (Array.isArray(r.skipped) ? r.skipped : [])) {
    skips.push({ tier: 'complex', id: r.id, note })
  }
}

const failures = verifyResults.filter((v) => !v.pass)

const summary = {
  simpleFilesChanged: simpleResults.filter((r) => r.changed).length,
  simpleTotal: simpleResults.length,
  changesetsDone: complexResults.filter((r) => r.changed).length,
  changesetsTotal: complexResults.length,
  invariantsChecked: verifyResults.length,
  invariantsFailed: failures.length,
  skips: skips.length,
}

log(
  `refactor-swarm-workflow: ${summary.simpleFilesChanged}/${summary.simpleTotal} files changed, `
    + `${summary.changesetsDone}/${summary.changesetsTotal} changesets done, `
    + `${summary.invariantsFailed}/${summary.invariantsChecked} invariants failed, `
    + `${summary.skips} judgment call(s) surfaced.`,
)

return {
  summary,
  skips,
  failures,
  simple: simpleResults,
  complex: complexResults,
  verify: verifyResults,
}
