/**
 * objective-autopilot-workflow — dynamic Workflow driver for bounded, fresh-slice Objective
 * autopilot (Option B from the `/objective:autopilot` Claude Code port plan).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Safety model (read this first)
 * ──────────────────────────────────────────────────────────────────────────────
 * This script owns the loop + keep/reject decision in deterministic JS. It never
 * shells out itself (Workflow scripts can't run Bash) — instead it dispatches thin
 * "operator" subagents that run exactly one hidden, deterministic CLI verb each:
 *
 *   - `sdl objective exec autopilot-preflight <slug> --format json`
 *   - `sdl objective exec autopilot-land-slice <slug> --start-branch <b> --message <m>
 *      [--submit] [--dry-run] --format json`
 *
 * Those verbs (ts/packages/objective/src/operations/autopilot/{preflight,land-slice}.ts) own
 * ALL git truth: they independently re-check live repo state via `GitGateway` and the new
 * `AutopilotGateway`, and only `autopilot-land-slice` can stage/commit/submit — and only after
 * its own verification passes against live git, never trusting what a slice agent claims. This
 * script reads ONLY the parsed `data` JSON the operator returns (via a forced schema), never the
 * operator's prose, so a compromised or confused operator agent cannot talk its way past the
 * verify→commit boundary. The slice-implementer agent runs in a separate phase, is told to leave
 * changes uncommitted, and never itself calls the land-slice verb.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * `args` contract
 * ──────────────────────────────────────────────────────────────────────────────
 *   {
 *     "slug":       "objective-slug",   // required — the Objective to run autopilot against
 *     "iterations": 1,                  // optional, default 1 — max slices to land this run
 *     "submit":     false,              // optional, default false — pass --submit to land-slice
 *     "dryRun":     false               // optional, default false — verify only, stop after one check
 *   }
 * `args` may arrive as a parsed object or as a JSON string; both are accepted.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Honest caveat
 * ──────────────────────────────────────────────────────────────────────────────
 * A model still *invokes* the preflight/land-slice verbs (Workflow scripts cannot shell
 * directly). This is mitigated by: the CLI owning all truth and refusing on any live-git
 * mismatch; the operator prompt forbidding any action beyond running the one exact command; and
 * `autopilot-land-slice` itself refusing to stage/commit while on `main`/`master` (the `on-trunk`
 * violation is enforced in tested code, not in a prompt). Note: an earlier version of this plan
 * also called for a repo-level `PreToolUse` guard hook as defense-in-depth; that hook was
 * intentionally not added, so trunk-commit safety rests solely on the tested land-slice verb.
 */

export const meta = {
  name: 'objective-autopilot-workflow',
  description: 'Bounded fresh-slice Objective autopilot: slice → verify → commit, parent owns git truth.',
  phases: [
    { title: 'Preflight' },
    { title: 'Slice' },
    { title: 'Land' },
  ],
}

// ── Structured-output schemas ─────────────────────────────────────────────────

// Mirrors the union of the autopilot-preflight and autopilot-land-slice `data` envelopes.
// Only `ok` is required since the two verbs populate disjoint optional fields.
const CLI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok'],
  properties: {
    ok: { type: 'boolean' },
    committed: { type: 'boolean' },
    submitted: { type: 'boolean' },
    prUrl: { type: ['string', 'null'] },
    branch: { type: ['string', 'null'] },
    startBranch: { type: ['string', 'null'] },
    trunk: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    violations: { type: 'array', items: { type: 'string' } },
    recoveryNotes: { type: 'array', items: { type: 'string' } },
  },
}

// The slice-implementer agent's report contract (see skills/objective-autopilot-slice/SKILL.md).
const SLICE_REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ready', 'stop', 'failed'] },
    branch: { type: 'string', description: 'the implementation branch after the slice' },
    recommendedSlice: { type: 'string', description: 'one-line summary of the slice done' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    validation: { type: 'array', items: { type: 'string' }, description: 'command: passed|failed|skipped notes' },
    commitMessage: { type: 'string' },
    prTitle: { type: 'string' },
    prBodySummary: { type: 'string' },
    stopReason: { type: 'string', description: 'set when status is stop or failed' },
  },
}

// ── Read + normalize args ─────────────────────────────────────────────────────

let input = args
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch (e) {
    log(`objective-autopilot-workflow: args was a string but not valid JSON (${e}); treating as empty.`)
    input = {}
  }
}
if (input === null || typeof input !== 'object') input = {}

const slug = typeof input.slug === 'string' ? input.slug : ''
const iterations = Number.isInteger(input.iterations) && input.iterations > 0 ? input.iterations : 1
const submit = input.submit === true
const dryRun = input.dryRun === true

if (slug === '') {
  log('objective-autopilot-workflow: no slug in args — nothing to do.')
  return { stopped: 'no-slug', summaries: [] }
}

// Operator agent: run exactly ONE deterministic CLI verb and return its parsed `data`, nothing
// else. Its prose is never read by this script — only the schema-validated JSON matters.
function op(cmd, phaseName) {
  return agent(
    `Run exactly this command and nothing else:\n\n    ${cmd}\n\n` +
      `Do not edit any file, do not run any other command, do not retry on failure. ` +
      `Parse its stdout as JSON and return ONLY the value of the top-level "data" field.`,
    { label: cmd.split(' ').slice(0, 4).join(' '), phase: phaseName, schema: CLI_SCHEMA, effort: 'low' },
  )
}

function slicePrompt(iteration, startBranch) {
  return `You are slice ${iteration}/${iterations} for Objective "${slug}", starting from branch "${startBranch}".

Follow the objective-autopilot-slice skill for this Objective. Run objective-next scoped to THIS
slug only — never auto-select a different Objective.

- If objective-next stops, asks a human, finds no substantive work, or says ready-to-close: return
  status "stop" with a one-line stopReason. Do not implement anything.
- Otherwise: create a branch-context-backed implementation plan and branch off "${startBranch}",
  implement exactly ONE coherent slice, run relevant validation for changed files, record a
  Semantic Update under .sdl/objectives/${slug}/, and LEAVE CHANGES UNCOMMITTED.
- Never commit, amend, submit, push, restack, or otherwise mutate git/Graphite state yourself —
  the parent verifies live repo state and owns commit/submit through a separate deterministic step.
- If validation fails and you cannot recover it locally, return status "failed" with stopReason.

Return the structured report describing exactly what you did.`
}

// ── 1. Preflight (barrier: nothing else can run until this passes) ────────────

phase('Preflight')
const pre = await op(`sdl objective exec autopilot-preflight ${slug} --format json`, 'Preflight')
if (!pre?.ok) {
  const violations = pre?.violations ?? ['preflight-failed']
  log(`objective-autopilot-workflow: preflight failed for ${slug}: ${violations.join(', ')}`)
  return { slug, stopped: 'preflight', violations, summaries: [] }
}

let startBranch = pre.startBranch
const summaries = []

// ── 2. Slice → Land loop ───────────────────────────────────────────────────────

for (let iteration = 1; iteration <= iterations; iteration++) {
  phase('Slice')
  const report = await agent(slicePrompt(iteration, startBranch), {
    label: `slice ${iteration}`,
    phase: 'Slice',
    schema: SLICE_REPORT_SCHEMA,
  })

  if (!report || report.status === 'stop') {
    summaries.push(`#${iteration} stop: ${report?.stopReason ?? 'no work'}`)
    break
  }
  if (report.status === 'failed') {
    summaries.push(`#${iteration} failed: ${report.stopReason ?? 'unknown failure'}`)
    break
  }

  phase('Land')
  const flags =
    `--start-branch ${startBranch} --message ${JSON.stringify(report.commitMessage ?? report.recommendedSlice ?? 'Objective autopilot update')}` +
    (submit ? ' --submit' : '') +
    (dryRun ? ' --dry-run' : '')
  const land = await op(`sdl objective exec autopilot-land-slice ${slug} ${flags} --format json`, 'Land')

  if (!land?.ok) {
    summaries.push(`#${iteration} verify failed: ${(land?.violations ?? ['land-slice-failed']).join('; ')}`)
    break
  }
  if (dryRun) {
    summaries.push(`#${iteration} dry-run ok on ${land.branch} (${(land.changedFiles ?? []).length} file(s))`)
    break
  }

  summaries.push(
    `#${iteration} ${report.recommendedSlice ?? 'completed slice'} → ${land.branch}` +
      (land.submitted ? ` (PR ${land.prUrl})` : ''),
  )
  // The new slice branch parents the next iteration.
  startBranch = land.branch ?? startBranch
}

log(`objective-autopilot-workflow: ${summaries.length} iteration(s) recorded for ${slug}.`)

return { slug, iterations, submitted: submit, dryRun, summaries }
