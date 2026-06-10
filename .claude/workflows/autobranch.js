/**
 * autobranch — a saved-workflow port of the Pi extension `/code:autobranch`.
 *
 * Creates a Graphite branch from the current state of the repo:
 *
 *   - DIRTY worktree → stage everything and `gt create <branch> -m "[cp] …"`,
 *     turning the uncommitted changes into a checkpoint commit on a new branch.
 *   - CLEAN worktree → extract the latest unpushed, single-parent, non-trunk
 *     commit onto a new branch (SHA preserved via branch-pointer moves, not
 *     cherry-pick), reset the source branch to the commit's parent, and
 *     `gt track` the new branch onto the source.
 *
 * Invocation: `/autobranch` (filename-derived slash command), optionally with
 * a slug — e.g. `/autobranch --slug=fix-login-redirect`. The orchestrator
 * passes `args` as either a string (raw argument text) or `{ slug: "…" }`.
 *
 * Division of labor:
 *   - This SCRIPT owns all control flow: dirty-vs-clean path selection,
 *     precondition refusals, slug sanitization, and branch-name availability.
 *     These are deterministic and never delegated to a model.
 *   - AGENTS own the three jobs that need a shell or a model: inspecting git
 *     state, deriving a slug + checkpoint message, and executing the
 *     transaction. Each returns schema-validated structured output.
 *
 * A workflow runs detached and cannot ask the user anything, so every
 * precondition failure returns a structured refusal ({ ok: false, refusal })
 * instead of prompting. The orchestrator relays it.
 *
 * Refusal conditions (mirroring the Pi extension):
 *   - not a git repo / detached HEAD / `gt` not installed
 *   - clean path: latest commit is on trunk, already pushed, a merge commit,
 *     or the root commit
 */

export const meta = {
  name: 'autobranch',
  description:
    'Create a Graphite branch from uncommitted changes, or extract the latest unpushed commit onto a new branch when the worktree is clean. Port of the Pi /code:autobranch extension.',
  whenToUse:
    'When work has accumulated on the wrong branch (or no branch) and should be checkpointed onto a fresh Graphite branch.',
  phases: [
    { title: 'Inspect', detail: 'capture git/Graphite state as structured data' },
    { title: 'Plan', detail: 'derive a kebab-case slug and checkpoint message' },
    { title: 'Execute', detail: 'run the gt/git transaction' },
  ],
}

// ── Structured-output schemas ──────────────────────────────────────────────────

const STATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'isGitRepo',
    'detached',
    'currentBranch',
    'trunkBranch',
    'gtAvailable',
    'dirty',
    'changedFiles',
    'localBranches',
    'latestCommit',
  ],
  properties: {
    isGitRepo: { type: 'boolean' },
    detached: { type: 'boolean', description: 'true if HEAD is detached' },
    currentBranch: { type: 'string', description: 'current branch name, or "" if detached' },
    trunkBranch: {
      type: 'string',
      description: 'the trunk branch (origin/HEAD target, or main/master fallback)',
    },
    gtAvailable: { type: 'boolean', description: 'true if the gt CLI is on PATH' },
    dirty: { type: 'boolean', description: 'true if git status --porcelain is non-empty' },
    changedFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'paths from git status --porcelain (staged, unstaged, and untracked)',
    },
    localBranches: {
      type: 'array',
      items: { type: 'string' },
      description: 'all local branch names (refs/heads)',
    },
    latestCommit: {
      type: 'object',
      additionalProperties: false,
      required: ['sha', 'subject', 'parentCount', 'onTrunk', 'onAnyRemote'],
      properties: {
        sha: { type: 'string' },
        subject: { type: 'string' },
        parentCount: { type: 'number' },
        onTrunk: {
          type: 'boolean',
          description: 'true if HEAD is an ancestor of (or equal to) the trunk branch tip',
        },
        onAnyRemote: {
          type: 'boolean',
          description: 'true if any remote-tracking branch contains HEAD (git branch -r --contains HEAD)',
        },
      },
    },
  },
}

const SLUG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'checkpointMessage'],
  properties: {
    slug: {
      type: 'string',
      description: 'kebab-case branch slug, verb-led, <= 50 chars, [a-z0-9-] only',
    },
    checkpointMessage: {
      type: 'string',
      description: 'one-line summary of the changes, suitable as a commit subject (no "[cp]" prefix)',
    },
  },
}

const EXEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['success', 'branchName', 'parentBranch', 'commitSha', 'commitSubject', 'detail'],
  properties: {
    success: { type: 'boolean' },
    branchName: { type: 'string' },
    parentBranch: { type: 'string', description: 'the branch the new branch is stacked on' },
    commitSha: { type: 'string', description: 'sha of the commit now at the tip of the new branch ("" on failure)' },
    commitSubject: { type: 'string' },
    detail: {
      type: 'string',
      description: 'on success: one-line confirmation; on failure: which command failed, its output, and what state the repo was left in',
    },
  },
}

// ── Deterministic helpers (script-owned, never delegated) ──────────────────────

const SLUG_RULES = `Slug rules: kebab-case lowercase ASCII, max 50 characters, only [a-z0-9-],
no slashes/spaces/underscores/punctuation. Lead with a verb (add, fix, refactor,
migrate, rename, remove, update). Prefer concrete deliverables and specific nouns
over vague descriptions.`

function sanitizeSlug(raw) {
  const slug = String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '')
  return slug
}

function pickAvailableBranchName(slug, takenBranches) {
  const taken = new Set(takenBranches)
  if (!taken.has(slug)) return slug
  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const candidate = `${slug}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return null
}

function parseSlugArg(rawArgs) {
  if (rawArgs == null) return null
  if (typeof rawArgs === 'object' && typeof rawArgs.slug === 'string' && rawArgs.slug) {
    return rawArgs.slug
  }
  if (typeof rawArgs !== 'string') return null
  const parts = rawArgs.trim().split(/\s+/).filter(Boolean)
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (part === '--slug' && parts[index + 1]) return parts[index + 1]
    if (part.startsWith('--slug=') && part.length > '--slug='.length) {
      return part.slice('--slug='.length)
    }
  }
  // A single bare token is treated as the slug itself.
  if (parts.length === 1 && !parts[0].startsWith('-')) return parts[0]
  return null
}

function refuse(reason) {
  log(`refused: ${reason}`)
  return { ok: false, refusal: reason }
}

// ── Phase 1: Inspect ───────────────────────────────────────────────────────────

phase('Inspect')

const state = await agent(
  `Inspect the git repository in the current working directory and report its state
as structured data. Run these checks (read-only — do NOT modify anything):

1. git rev-parse --is-inside-work-tree  → isGitRepo (if false, fill remaining fields with empty/false defaults and return)
2. git symbolic-ref --quiet --short HEAD → currentBranch; a non-zero exit means detached=true
3. command -v gt → gtAvailable
4. Trunk branch: try "git symbolic-ref refs/remotes/origin/HEAD" (strip the origin/ prefix);
   if unset, use "main" if it exists locally, else "master".
5. git status --porcelain → dirty (non-empty output) and changedFiles (the paths, including untracked)
6. git for-each-ref refs/heads --format='%(refname:short)' → localBranches
7. Latest commit: git log -1 --format='%H%n%s%n%P' → sha, subject, parentCount (count of parent shas)
8. onTrunk: git merge-base --is-ancestor HEAD <trunkBranch> (exit 0 → true; also true if currentBranch IS the trunk)
9. onAnyRemote: git branch -r --contains HEAD → true if any output

Return exactly the structured fields. No prose.`,
  { label: 'inspect:git-state', phase: 'Inspect', schema: STATE_SCHEMA },
)

if (!state) return refuse('inspection agent failed')
if (!state.isGitRepo) return refuse('not inside a git repository')
if (state.detached) return refuse('HEAD is detached — check out a branch first')
if (!state.gtAvailable) return refuse('the gt (Graphite) CLI is not installed')

const cleanPath = !state.dirty
log(cleanPath ? 'clean worktree → latest-commit extraction path' : `dirty worktree (${state.changedFiles.length} changed paths) → checkpoint path`)

if (cleanPath) {
  const commit = state.latestCommit
  if (commit.onTrunk) return refuse(`latest commit ${commit.sha.slice(0, 8)} is already on trunk (${state.trunkBranch}) — nothing to extract`)
  if (commit.onAnyRemote) return refuse(`latest commit ${commit.sha.slice(0, 8)} is already pushed to a remote — refusing to rewrite it`)
  if (commit.parentCount > 1) return refuse(`latest commit ${commit.sha.slice(0, 8)} is a merge commit — cannot extract`)
  if (commit.parentCount === 0) return refuse('latest commit is the root commit — cannot extract')
}

// ── Phase 2: Plan (slug + checkpoint message) ──────────────────────────────────

phase('Plan')

const userSlug = parseSlugArg(args)
let plan
if (userSlug) {
  log(`using user-provided slug: ${userSlug}`)
  plan = { slug: userSlug, checkpointMessage: cleanPath ? state.latestCommit.subject : 'checkpoint of pending changes' }
} else if (cleanPath) {
  plan = await agent(
    `Derive a git branch slug from this commit subject:

  "${state.latestCommit.subject}"

${SLUG_RULES}

Return the slug, and return the commit subject verbatim as checkpointMessage. No prose.`,
    { label: 'plan:slug-from-commit', phase: 'Plan', schema: SLUG_SCHEMA },
  )
} else {
  plan = await agent(
    `Derive a git branch slug and a one-line checkpoint message for the pending
changes in the current repository. Run (read-only):

  git status --porcelain
  git diff HEAD

If the diff is very large, look at the first ~400 lines plus the file list.
For untracked files, peek at the first ~30 lines of up to 5 of them.

${SLUG_RULES}

checkpointMessage: one line, imperative mood, describing what the pending changes
do — it becomes the subject of a checkpoint commit (a "[cp] " prefix is added by
the caller; do not include it). No prose outside the structured fields.`,
    { label: 'plan:slug-from-diff', phase: 'Plan', schema: SLUG_SCHEMA },
  )
}

if (!plan) return refuse('slug derivation agent failed')

const slug = sanitizeSlug(plan.slug)
if (!slug) return refuse(`could not derive a usable slug from "${plan.slug}"`)

const branchName = pickAvailableBranchName(slug, state.localBranches)
if (!branchName) return refuse(`no available branch name for slug "${slug}" after 50 candidates`)

log(`branch: ${branchName} (stacking on ${state.currentBranch})`)

// ── Phase 3: Execute ───────────────────────────────────────────────────────────

phase('Execute')

const commitMessage = `[cp] ${plan.checkpointMessage}`

const dirtyInstructions = `The worktree has uncommitted changes. Turn them into a
checkpoint commit on a new Graphite branch:

1. Verify the branch does not already exist: git show-ref --verify --quiet refs/heads/${branchName}
   (a zero exit means it EXISTS — stop and report failure).
2. git add -A
3. gt create ${branchName} -m ${JSON.stringify(commitMessage)} --no-interactive

If gt create fails, report its full output, run "git reset" to unstage, and report
that the worktree was left dirty but intact (success=false).`

const cleanInstructions = `The worktree is clean. Extract the latest commit
(${state.latestCommit.sha}, "${state.latestCommit.subject}") from branch
"${state.currentBranch}" onto a new Graphite branch, PRESERVING ITS SHA
(branch-pointer moves only — no cherry-pick, no rebase):

1. Verify HEAD is still ${state.latestCommit.sha} and the worktree is still clean
   (git status --porcelain empty). If not, stop and report failure — the repo
   changed since inspection.
2. Verify refs/heads/${branchName} does not exist (git show-ref --verify --quiet; zero exit = exists = stop).
3. Backup:        git branch autobranch-backup-${branchName} HEAD
4. New branch:    git branch ${branchName} HEAD
5. Reset source:  git reset --hard HEAD~1   (moves ${state.currentBranch} to the parent; worktree is clean so nothing is lost)
6. Switch:        git checkout ${branchName}
7. Track with Graphite: gt track ${branchName} --parent ${state.currentBranch}
   (if --parent is rejected by this gt version, run "gt track" on the branch and
   accept the inferred parent if it is ${state.currentBranch})
8. Cleanup:       git branch -D autobranch-backup-${branchName}

ON ANY FAILURE at steps 4-7: restore by running
  git checkout ${state.currentBranch} && git reset --hard autobranch-backup-${branchName} && git branch -D ${branchName} autobranch-backup-${branchName}
(delete only the branches that exist), then report success=false with the failing
command's output and the restored state.`

const result = await agent(
  `Execute this git/Graphite transaction in the current repository, exactly as
specified, stopping at the first failure:

${cleanPath ? cleanInstructions : dirtyInstructions}

After success, report the new branch tip: git log -1 --format='%H %s' ${branchName}.
Return only the structured fields; put any failure diagnostics in "detail".`,
  { label: `execute:${branchName}`, phase: 'Execute', schema: EXEC_SCHEMA },
)

if (!result) return refuse('execution agent failed before reporting a result')

return {
  ok: result.success,
  mode: cleanPath ? 'latest-commit-extraction' : 'dirty-checkpoint',
  branch: result.branchName,
  stackedOn: result.parentBranch,
  commit: { sha: result.commitSha, subject: result.commitSubject },
  detail: result.detail,
}
