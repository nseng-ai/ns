export const meta = {
  name: 'objective-stack-impl-claude',
  description: 'Autonomously implement an approved asdl Objective plan as a serial Graphite stack (implement -> verify -> track per slice).',
  whenToUse:
    'Invoked by the objective-stack-impl-claude pre-flight skill after a human approves a 1-3 slice plan. Runs hands-off in the background: builds each slice as a stacked Graphite branch, independently verifies it, records Objective tracking, and stops the loop on any failed verdict, blocker, or question. Never pushes or submits PRs.',
  phases: [
    { title: 'Implement', detail: 'one subagent builds the slice as a gt branch and runs validation' },
    { title: 'Verify', detail: 'an independent subagent re-checks branch/head/diff/validation/scope' },
    { title: 'Track', detail: 'a subagent records the Objective Semantic Update + roadmap checkbox' },
  ],
}

// ---------------------------------------------------------------------------
// Forked, self-contained schemas. The canonical handoff contract is
// `objective-stack-impl-claude/handoff/v1`. See
// skills/objective-stack-impl-claude/references/runtime-contract.md for prose.
// ---------------------------------------------------------------------------

const HANDOFF_SCHEMA_ID = 'objective-stack-impl-claude/handoff/v1'

const HANDOFF = {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'status', 'branch', 'head_sha', 'base_ref', 'changed_files', 'validation', 'objective_update'],
  properties: {
    schema: { type: 'string', enum: [HANDOFF_SCHEMA_ID] },
    status: { type: 'string', enum: ['ok', 'failed', 'question'] },
    branch: { type: 'string' },
    head_sha: { type: 'string' },
    base_ref: { type: 'string' },
    changed_files: { type: 'array', items: { type: 'string' } },
    validation: {
      type: 'object',
      additionalProperties: false,
      required: ['command', 'exit_code'],
      properties: {
        command: { type: 'string' },
        exit_code: { type: 'integer' },
      },
    },
    objective_update: {
      type: 'object',
      additionalProperties: false,
      required: ['recorded'],
      properties: {
        recorded: { type: 'boolean' },
        path: { type: 'string' },
        summary: { type: 'string' },
      },
    },
    blockers: { type: 'string' },
    question: { type: 'string' },
    next_step: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'reasons', 'validation_exit_code', 'scope_ok'],
  properties: {
    ok: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' } },
    validation_exit_code: { type: 'integer' },
    scope_ok: { type: 'boolean' },
  },
}

const TRACK = {
  type: 'object',
  additionalProperties: false,
  required: ['recorded'],
  properties: {
    recorded: { type: 'boolean' },
    path: { type: 'string' },
    summary: { type: 'string' },
    head_sha: { type: 'string' },
  },
}

// ---------------------------------------------------------------------------
// Prompt builders (canonical source of the per-slice briefs).
// ---------------------------------------------------------------------------

function asText(value) {
  if (value === undefined || value === null || value === '') return 'none'
  if (Array.isArray(value)) return value.map((v) => `- ${v}`).join('\n')
  return String(value)
}

function priorSummary(priorResults) {
  const done = priorResults.filter((r) => r.handoff && r.handoff.status === 'ok')
  if (!done.length) return 'None — this is the first slice in the stack.'
  return done.map((r) => `- \`${r.handoff.branch}\` (slice ${r.slice.index}: ${r.slice.title})`).join('\n')
}

function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function buildBrief(slice, base, args, priorResults) {
  return [
    'You are an autonomous implementation subagent for ONE slice of a Graphite stack that implements an asdl Objective. You run in the live checkout (no isolation). Implement exactly one slice, then stop.',
    '',
    '## Objective',
    `- slug: \`${args.slug}\``,
    `- trunk branch: \`${args.trunkBranch}\``,
    `- summary: ${args.objectiveSummary}`,
    '',
    'Read the Objective records yourself before coding:',
    '```bash',
    `objective exec read-objective ${args.slug} --format md`,
    '```',
    `Also read \`.asdl/objectives/${args.slug}/objective.md\` and \`.asdl/objectives/${args.slug}/roadmap.md\` for scope and non-goals.`,
    '',
    `## This slice (index ${slice.index}): ${slice.title}`,
    `- thesis: ${slice.thesis}`,
    '- scope:',
    asText(slice.scope),
    `- expected validation: ${slice.validation ? asText(slice.validation) : args.validateCommand}`,
    `- downstream notes: ${asText(slice.downstreamNotes)}`,
    '',
    '## Prior slices already on the stack',
    priorSummary(priorResults),
    '',
    '## Graphite branch (consult the `graphite` skill at `.claude/skills/graphite/SKILL.md`)',
    '1. Confirm the working tree is clean before you start (`git status --short`). It should be — this workflow runs slices serially on a clean checkout.',
    `2. Make sure you are on the base branch \`${base}\` (use \`gt checkout ${base}\` or \`git checkout ${base}\`). If that branch is untracked by Graphite, follow the graphite skill's "Handle Untracked Branches" steps (e.g. \`gt track -p ${args.trunkBranch}\`).`,
    '3. Implement the slice, stage the changes (`git add`), then create the stacked branch:',
    '   ```bash',
    `   gt create ${slice.branchName} -m "<concise commit message for this slice>"`,
    '   ```',
    `   Use \`gt create\` (NOT \`git checkout -b\` + \`git commit\`) so the branch is tracked in the stack on top of \`${base}\`.`,
    '',
    '## Validation',
    'Run the project validation command and record its real exit code:',
    '```bash',
    args.validateCommand,
    '```',
    'If `dprint`/`ruff` formatting fails, run `just dprint-fix` / `just fix` instead of hand-editing, then re-run.',
    '',
    '## Hard constraints',
    '- Implement ONLY this slice. Do not start the next slice.',
    '- Do NOT push or submit (`gt submit`, `git push`, `gh pr create`). PR submission is left to the user.',
    '- Do NOT record Objective updates — a separate tracking step handles that. Set `objective_update.recorded` to `false`.',
    '- Stay within the slice scope above. If the slice cannot be implemented as specified, stop and report `status: "question"` with a clear `question` rather than guessing.',
    '',
    '## Required output',
    'Your final message MUST be exactly one JSON object (no prose, no surrounding code fence) matching the `objective-stack-impl-claude/handoff/v1` schema:',
    `- \`schema\`: "${HANDOFF_SCHEMA_ID}"`,
    '- `status`: "ok" if implemented and validation passed; "failed" if validation failed or you could not complete it; "question" if you need a human decision.',
    `- \`branch\`: the branch you created (\`${slice.branchName}\`).`,
    '- `head_sha`: `git rev-parse HEAD` on that branch.',
    `- \`base_ref\`: \`${base}\`.`,
    `- \`changed_files\`: \`git diff --name-only ${base}...HEAD\`.`,
    `- \`validation\`: { "command": "${args.validateCommand}", "exit_code": <int> }.`,
    '- `objective_update`: { "recorded": false }.',
    '- `blockers`, `question`, `next_step`: include when relevant.',
  ].join('\n')
}

function buildRetryBrief(slice, base, args, failedHandoff, verdict) {
  return [
    'You are an autonomous implementation subagent RETRYING one slice of a Graphite stack after the previous attempt failed verification. Fix the problems on the SAME branch, then stop. This is the only retry — make it count.',
    '',
    '## Objective',
    `- slug: \`${args.slug}\``,
    `- summary: ${args.objectiveSummary}`,
    `Read \`.asdl/objectives/${args.slug}/objective.md\`, \`roadmap.md\`, and \`objective exec read-objective ${args.slug} --format md\` for full context.`,
    '',
    `## Slice (index ${slice.index}): ${slice.title}`,
    `- thesis: ${slice.thesis}`,
    '- scope:',
    asText(slice.scope),
    '',
    '## Previous failed attempt',
    `Branch: \`${failedHandoff.branch}\` (base \`${base}\`). Previous handoff:`,
    '```json',
    JSON.stringify(failedHandoff, null, 2),
    '```',
    'Independent verifier verdict:',
    '```json',
    JSON.stringify(verdict, null, 2),
    '```',
    '',
    '## What to do',
    `1. Check out the existing branch: \`gt checkout ${failedHandoff.branch}\` (or \`git checkout ${failedHandoff.branch}\`). Do NOT create a new branch.`,
    `2. Address every failure reason above. Re-run \`${args.validateCommand}\` until it passes (use \`just fix\` / \`just dprint-fix\` for formatting).`,
    '3. Amend the existing branch with the project Graphite amend flow (`gt modify -m "<message>"`).',
    '4. Do NOT push/submit. Do NOT record Objective updates. Implement only this slice.',
    '',
    '## Required output',
    `Emit exactly one \`${HANDOFF_SCHEMA_ID}\` JSON object (same schema as before) reflecting the amended state: updated \`head_sha\`, \`changed_files\` (\`git diff --name-only ${base}...HEAD\`), \`validation.exit_code\`, and \`status\` ("ok" if fixed and validation passes, otherwise "failed" or "question").`,
  ].join('\n')
}

function buildVerify(slice, handoff, args) {
  return [
    'You are an INDEPENDENT, adversarial verifier. You did NOT implement this slice; do not trust the implementer\'s claims. Verify them against git and the live checkout. Default to `ok: false` if anything is uncertain or unverifiable.',
    '',
    `## Claimed handoff for slice ${slice.index} ("${slice.title}")`,
    '```json',
    JSON.stringify(handoff, null, 2),
    '```',
    '',
    '## Checks (run each, collect evidence)',
    `1. Branch exists: \`git rev-parse --verify ${handoff.branch}\` succeeds.`,
    `2. Head matches: \`git rev-parse ${handoff.branch}\` equals the claimed \`head_sha\` (\`${handoff.head_sha}\`).`,
    `3. Diff in scope: \`git diff --name-only ${handoff.base_ref}...${handoff.branch}\`. Compare the changed files to the slice scope below; flag any file clearly outside the slice's intent as scope drift.`,
    `4. Validation: check out the branch (\`git checkout ${handoff.branch}\`) and actually run \`${args.validateCommand}\`. Record the real exit code you observe — do not copy the implementer's claim.`,
    '',
    '## Slice scope (for the scope-drift check)',
    asText(slice.scope),
    '',
    '## Required output',
    'Return exactly one JSON object (no prose) with:',
    '- `ok`: true ONLY if the branch resolves, head matches, the diff is within scope, AND validation exits 0.',
    '- `reasons`: array of short strings, one per check, explaining each pass/fail finding (always include).',
    `- \`validation_exit_code\`: the integer exit code you observed running \`${args.validateCommand}\` (use -1 if you could not run it).`,
    '- `scope_ok`: true if the diff stays within the slice scope.',
  ].join('\n')
}

function buildObjectiveUpdate(slice, handoff, args) {
  const files = (handoff.changed_files || []).map((f) => `\`${f}\``).join(', ') || 'see git diff'
  return [
    'Record asdl Objective tracking for one completed, independently verified stack slice. Follow the Objective record conventions (see the `objective-update` and `objective` skills at `.claude/skills/objective-update/SKILL.md`). Write durable Markdown directly. Do not push or submit anything.',
    '',
    '## Objective',
    `- slug: \`${args.slug}\` (active root: \`.asdl/objectives/${args.slug}/\`)`,
    '',
    '## Completed slice (already implemented and verified)',
    `- title: ${slice.title}`,
    `- thesis: ${slice.thesis}`,
    `- branch: \`${handoff.branch}\` @ \`${handoff.head_sha}\` (base \`${handoff.base_ref}\`)`,
    `- changed files: ${files}`,
    `- validation: \`${handoff.validation.command}\` exited ${handoff.validation.exit_code}`,
    '',
    '## What to write',
    `1. Create a new Semantic Update under \`.asdl/objectives/${args.slug}/updates/\`. Generate the filename prefix from a real timestamp via the shell (the orchestrator cannot supply time):`,
    '   ```bash',
    '   date -u +%Y-%m-%dT%H%M%SZ',
    '   ```',
    `   Name the file \`<timestamp>-${slug(slice.branchName)}.md\`. Required headings: \`# <Update Title>\`, \`## Summary\`, \`## Objective Impact\`, \`## Follow-Ups\`.`,
    `2. Update \`.asdl/objectives/${args.slug}/roadmap.md\`: move the roadmap row this slice completes from \`[ ]\`/\`[~]\` to \`[x]\` (or \`[~]\` if only partially advanced). Use only \`[ ]\`, \`[~]\`, \`[x]\`.`,
    '3. Record evidence using landed-state semantics (write the state as if this branch has merged to trunk): cite the branch and validation as durable evidence; prefer "command passed" over exact test counts.',
    '',
    '## Fold tracking into the slice commit',
    `In asdl, a slice\'s implementation and its Objective edit land together in one PR. After writing the Markdown, run \`dprint fmt\` (or \`just dprint-fix\`) so the new Markdown is formatted, then stage \`.asdl/objectives/${args.slug}/\` and amend the slice commit using the project Graphite flow (\`git add\` + \`gt modify -m "<keep the slice message>"\`). This keeps the working tree clean for the next slice and ships code + tracking together. Report the new HEAD sha after amending.`,
    '',
    '## Constraints',
    `- Edit only files under \`.asdl/objectives/${args.slug}/\`. Do not change the slice's code.`,
    '- Do NOT run the closure gate or close the Objective during this autonomous run.',
    '- Do NOT push or submit.',
    '',
    '## Required output',
    'Return exactly one JSON object: { "recorded": true, "path": "<update file path>", "summary": "<one line>", "head_sha": "<HEAD after amend>" }. If you could not record (e.g. no matching roadmap row), return { "recorded": false, "summary": "<why>" }.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Orchestration: strictly serial. Each slice builds on the previous branch, so
// there is no pipeline()/parallel() — an awaited for-loop guarantees one slice
// agent mutates the shared worktree at a time.
// ---------------------------------------------------------------------------

if (!args || !Array.isArray(args.slices) || args.slices.length === 0) {
  log('No approved slices supplied in args — nothing to implement.')
  return {
    error: 'invalid-args',
    message: 'objective-stack-impl-claude requires args.slices (the approved plan assembled by the pre-flight skill).',
  }
}

const validateCommand = args.validateCommand || 'just'
const runArgs = { ...args, validateCommand }

log(`Implementing Objective \`${runArgs.slug}\` as a ${runArgs.slices.length}-slice Graphite stack (validation: \`${validateCommand}\`).`)

const results = []
let prevBranch = null
let stopReason = null

for (let i = 0; i < runArgs.slices.length; i++) {
  const slice = runArgs.slices[i]
  const base = prevBranch || slice.baseRef || runArgs.trunkBranch
  const tag = slice.branchName || `slice-${slice.index}`

  log(`Slice ${slice.index}/${runArgs.slices.length}: ${slice.title} (base \`${base}\`)`)

  // --- Implement -------------------------------------------------------------
  phase('Implement')
  let handoff = await agent(buildBrief(slice, base, runArgs, results), {
    label: `impl:${tag}`,
    phase: 'Implement',
    schema: HANDOFF,
  })

  // A question means the implementer needs a human decision: stop the loop.
  if (handoff.status === 'question') {
    results.push({ slice, handoff, verdict: null, retried: false, objectiveUpdate: null, stopReason: 'question' })
    stopReason = 'question'
    break
  }

  // --- Verify ----------------------------------------------------------------
  phase('Verify')
  let verdict = await agent(buildVerify(slice, handoff, runArgs), {
    label: `verify:${tag}`,
    phase: 'Verify',
    schema: VERDICT,
  })

  // --- One bounded retry on a failed verdict / failed status -----------------
  let retried = false
  if (handoff.status === 'failed' || !verdict.ok) {
    retried = true
    log(`Slice ${slice.index} failed verification — one bounded retry.`)
    phase('Implement')
    handoff = await agent(buildRetryBrief(slice, base, runArgs, handoff, verdict), {
      label: `retry:${tag}`,
      phase: 'Implement',
      schema: HANDOFF,
    })
    if (handoff.status === 'question') {
      results.push({ slice, handoff, verdict, retried, objectiveUpdate: null, stopReason: 'question' })
      stopReason = 'question'
      break
    }
    phase('Verify')
    verdict = await agent(buildVerify(slice, handoff, runArgs), {
      label: `verify-retry:${tag}`,
      phase: 'Verify',
      schema: VERDICT,
    })
  }

  // Still failing after the optional retry -> stop the loop and report.
  if (handoff.status === 'failed' || !verdict.ok) {
    const reason = retried ? 'verification-failed-after-retry' : 'verification-failed'
    results.push({ slice, handoff, verdict, retried, objectiveUpdate: null, stopReason: reason })
    stopReason = reason
    break
  }

  // --- Track -----------------------------------------------------------------
  phase('Track')
  const objectiveUpdate = await agent(buildObjectiveUpdate(slice, handoff, runArgs), {
    label: `track:${tag}`,
    phase: 'Track',
    schema: TRACK,
  })

  results.push({ slice, handoff, verdict, retried, objectiveUpdate, stopReason: null })
  prevBranch = handoff.branch

  // A blocker reported even on an otherwise-ok slice stops the loop after tracking.
  if (handoff.blockers && handoff.blockers.length) {
    stopReason = 'blocker'
    break
  }
}

if (!stopReason) stopReason = 'completed'

log(`Stack run finished: ${stopReason} (${results.length}/${runArgs.slices.length} slices attempted).`)

return {
  slug: runArgs.slug,
  trunkBranch: runArgs.trunkBranch,
  validateCommand,
  objectiveSummary: runArgs.objectiveSummary,
  stopReason,
  slicesPlanned: runArgs.slices.length,
  slicesAttempted: results.length,
  slices: results.map((r) => ({
    index: r.slice.index,
    title: r.slice.title,
    branch: r.handoff ? r.handoff.branch : r.slice.branchName,
    base_ref: r.handoff ? r.handoff.base_ref : null,
    head_sha: (r.objectiveUpdate && r.objectiveUpdate.head_sha) || (r.handoff && r.handoff.head_sha) || null,
    status: r.handoff ? r.handoff.status : 'not-run',
    retried: r.retried,
    verdict_ok: r.verdict ? r.verdict.ok : null,
    scope_ok: r.verdict ? r.verdict.scope_ok : null,
    validation: r.handoff ? r.handoff.validation : null,
    objective_update: r.objectiveUpdate || (r.handoff ? r.handoff.objective_update : null),
    question: r.handoff ? r.handoff.question : null,
    blockers: r.handoff ? r.handoff.blockers : null,
    stop_reason: r.stopReason,
  })),
  // Token telemetry is unavailable in the Claude harness (no per-subagent JSONL
  // accounting like Pi's runner-subagent logs). Surface only the coarse aggregate.
  budgetSpentTokens: budget.total ? budget.spent() : null,
}
