# Ideas — jot pad

Free-form. Never authoritative. Sessions working the map sweep this: sharp
jots become tickets, dim ones graduate to the map's Not yet specified, and
graduated jots may be pruned.

- Dispatch coding jobs to remote execution from a local session.
- Slack bots for doing sessions — e.g. creating objectives from Slack.
- Scheduling workflows to do agentic coding (nightly objective advancement).
- Responding to external events: the classic listen-for-issue/ticket about a
  bug → triage → fix loop.
- Speculative execution of objectives: when a HITL ambiguity point is reached
  overnight, fork and execute BOTH options, see where things net out, present
  both in the morning. Loser branch keeps its branch-memory record as the
  road not taken.
- Eve dogfooding is likely part of the job — leverage it rather than rebuild
  channels/scheduling/park-resume plumbing.
- ns state travels via git: any cloud sandbox that clones the repo gets
  objectives, branch context, branch memory for free — no state-sync problem.
- Slack reframe (2026-07-08): Slack is a **general input channel**, not a
  use case — you should be able to do anything through it. A Slack→objective
  bot was considered as a steel thread and killed as overfit. Likely there is
  *already* an agent at Vercel to extend with ns features rather than a new
  bot to build — worth a research ticket later: what is that agent and what
  is its extension surface?
- Steel-thread candidate (2026-07-08): **remote plan dispatch** — the
  existing dispatch-plan-to-cmux-workspace flow (CCC: branch prep → workspace
  → child Pi dispatch), retargeted so the same dispatch sends the plan to
  cloud-based execution (Eve session + sandbox) instead of a local cmux
  workspace. Plan is authored locally (HITL happens locally, before
  dispatch); remote side is plan-*following*, so coding-loop noise is
  bounded. Aligns with cross-harness-parity direction: dispatch becomes a
  CLI-first capability with an execution-target seam (local cmux | cloud),
  not another Pi-only surface. Proves: harness executes real planned work in
  a sandbox, git-native write-back of a branch/stack, dispatch/handoff
  semantics across the seam. Doesn't touch: inbound channels, HITL
  park/resume, scheduling.
- Dispatch target naming: `--target local` or `--target cmux` covers the
  current cmux-workspace functionality; `--target cloud` is the new backend.
  Naming decision belongs to the implementation effort.
- AI SDK harness APIs (verified 2026-07-08 in
  `/Users/schrockn/code/githubs/vercel/ai`): `HarnessAgent` runs established
  runtimes — Claude Code, Codex, **Pi** (`@ai-sdk/harness-pi`), OpenCode,
  Deep Agents — behind one AI SDK surface. Claude Code adapter is a
  sandbox bridge (runtime in sandbox, custom tools/approvals bridged to
  host); skills injected per-session via the Agent Skills standard (ns
  skills qualify as-is). Experimental. Eve does NOT consume HarnessAgent
  today — separate Vercel surfaces. For the dispatch steel thread,
  HarnessAgent + harness-claude-code + sandbox + ns skills may be a shorter
  path than Eve itself; Eve earns its place when channels/schedules/durable
  HITL arrive.
