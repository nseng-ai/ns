# Pressure test: Slack as a chat-seam front end

> Evidence record for the `composable-command-core` Objective: a thought-experiment pressure test (2026-07-19) of the chat-seam `hostable` contract (`{ cwd, events, interact }`, design decision 4) against a Slack front end — maximally far from a terminal while still being "chat." **No action taken; nothing here changes scope or roadmap.** Recorded because two findings are durable design insights that future host or contract work should start from.

## Mapping (the seam holds)

| Chat-seam element                                         | Slack realization                                                                                                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| events out (progress)                                     | one message per run, `chat.update` as phases advance; matrix progress = an updating Block Kit table                                                                  |
| events out (notification/preview)                         | posted blocks                                                                                                                                                        |
| `interact.confirm` (message + embedded preview + default) | section block + Approve/Cancel buttons — the embedded-preview requirement is exactly Block Kit's shape                                                               |
| `interact.select`                                         | static select / radio blocks                                                                                                                                         |
| typed result                                              | host renders blocks from the typed result; no `renderHuman` string involved                                                                                          |
| transient vs durable output                               | transient = the updated progress message; durable = a permanently posted message — an independent second consumer perspective on the transient/durable open question |

Design decisions validated hard by the exercise:

1. **Semantic events over byte streams** — frames/bytes would make Slack rendering impossible; events → Block Kit is the whole payoff.
2. **`caps`/`format?` living only in the clinkr bundle, not the hostable contract** — Slack has no width/color caps; the seam carries nothing terminal-flavored. The layering survives contact.
3. **The hostable middle tier gets a genuine non-clinkr consumer shape.** A Slack host is precisely the thesis line "non-terminal hosts consume events and typed exits and render themselves" — and unlike Pi, it cannot be dismissed as terminal-adjacent. (Shape only: nobody is building this; the middle-tier risk retires on a real port, not a thought experiment.)

## Finding 1 — the host-keeps-the-run-alive assumption

The contract is an in-process `await interact.confirm(...)`: the command's stack *is* the conversation state. Terminal and Pi hosts satisfy this trivially; Slack interactions arrive as webhooks minutes later. Outs, in order of honesty:

- **(a) Long-lived host process** (Socket-Mode bot holding the run alive, bridging clicks back to the awaiting promise). Zero contract change. The honest answer.
- (b) Durable suspend/resume of command state — a workflow engine; contradicts "commands are normal programs." Rejected.
- (c) Timeout-with-default semantics on `confirm` — small contract addition, only if a named host needs it.

Durable takeaway: **the hostable contract implicitly assumes the host keeps the run alive for the duration of the conversation.** Same family as the parked `AbortSignal` cancellation seam — a Slack-shaped host is the first named host that would pull cancellation off the parked list (abandoned conversations leak live runs).

## Finding 2 — `cwd` models the target worktree (recorded; no contract change)

`cwd`'s real meaning in the contract is **"which checkout is the subject of this conversation."** Every host binds it differently but means the same thing:

- **Terminal:** the user's shell cwd — subject selection by *standing in it*.
- **Pi:** the session's project directory — subject selection by *which session you're in*.
- **Slack/runner:** an explicitly addressed slot worktree — subject selection by *addressing*.

So `cwd` is the degenerate terminal encoding of "target worktree," and hosting varies exactly this field because hosting varies *how the subject gets chosen*. This retroactively grounds design decision 1: cwd is not arbitrarily "the one OS fact worth virtualizing" — it is the only bundle field that is invocation *identity* rather than environment. It also decomposes "Slack front end" honestly: a renderer for the chat seam + a subject-addressing mechanism, and ns already has the latter (slots). Slack is a renderer on an ns runner, not a standalone host. Multi-user arbitration (who may click Approve) is host policy, correctly absent from the contract.

**Decision (settled with the user, 2026-07-19): do nothing about a cwd/worktree split for now.** The field stays `cwd: string`, because:

1. **Repo-ness stays a library concern.** Commands resolve repo facts from `cwd` via `GitGateway`; a `worktree` field would assert "every command targets a checkout" in the platform contract and need a story for pre-checkout commands. A plain directory makes no such claim.
2. **Sub-directory position carries information in the terminal host** (relative path args, cwd-scoped behavior — cf. the open `validateNsExecCwd` call); collapsing to "worktree root" loses it in the one host where it exists. Remote hosts binding root-only is graceful degeneration, not the contract's meaning.
3. **A structured `{ root, cwd }` workspace object is YAGNI** until a host needs the distinction.

The doctrine line for future host work: *`cwd` models the target worktree — the checkout the conversation is about. Binding it is host policy: terminal = where the user stands, Pi = the session's project, remote hosts = an addressed slot.*
