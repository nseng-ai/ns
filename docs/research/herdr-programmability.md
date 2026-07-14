# Herdr programmability for ns-style integration

**Researched:** 2026-07-15 against Herdr's official documentation and upstream source at commit `5d24d0d214d05858e344a9e15a63856dc1328eae`.

## Conclusion

Yes. Herdr is programmable enough to support integrations analogous to this repo's cmux capability. For terminal/workspace orchestration, its public surface is at least as direct and in several areas richer: CLI wrappers, a schema-described local socket API, event subscriptions and waits, agent-aware operations, declarative layouts, worktree operations, and executable plugins.

The main adaptation is vocabulary and targeting: map cmux workspace/surface concepts to Herdr workspace/tab/pane IDs, and use Herdr's injected caller IDs rather than whichever pane the UI currently focuses.

## Public integration layers

Herdr documents three layers sharing the same control surface:

1. an agent skill for teaching agents to operate Herdr;
2. CLI wrappers for scripts and simple orchestration;
3. a raw local socket API for direct request/response clients and long-lived subscriptions.

The protocol is newline-delimited JSON over a Unix-domain socket on Unix and a named pipe on Windows. The installed binary emits its own bundled JSON Schema with `herdr api schema --json` or `--output`, covering requests, responses, errors, and events. This makes a typed gateway practical without binding ns to Herdr's Rust internals.

Source: [official Socket API documentation](https://herdr.dev/docs/socket-api/); upstream [`docs/next/website/src/content/docs/socket-api.mdx`](https://github.com/ogulcancelik/herdr/blob/5d24d0d214d05858e344a9e15a63856dc1328eae/docs/next/website/src/content/docs/socket-api.mdx).

## Capability comparison

| ns/cmux need                            | Herdr equivalent                                                                                                              | Assessment                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Identify the caller                     | Managed processes receive `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, and `HERDR_PANE_ID`; `pane.current` can accept caller context | Supported; safer than relying on UI focus                                  |
| Create a workspace at a cwd             | `herdr workspace create --cwd … --label … [--no-focus]`; raw `workspace.create`                                               | Supported                                                                  |
| Open branch/worktree work               | `worktree.create`, `worktree.open`, `worktree.list`, and `worktree.remove`                                                    | Supported, including native checkout provenance                            |
| Create a terminal surface/tab           | `tab.create`, `pane.split`, or declarative `layout.apply`                                                                     | Supported                                                                  |
| Launch a command/agent                  | `pane run`; `agent.start`; process-launching API methods accept argv/env                                                      | Supported                                                                  |
| Send input                              | `pane.send_text`, `pane.send_keys`, `pane.send_input`; CLI `pane run` sends text plus Enter                                   | Supported                                                                  |
| Rename UI entities                      | Workspace, tab, pane, and agent rename operations                                                                             | Supported                                                                  |
| Read terminal output                    | `pane.read` with viewport/recent/unwrapped/detection sources                                                                  | Supported                                                                  |
| Wait for completion/state               | output waits, agent-status waits, and `events.subscribe` / `events.wait`                                                      | Supported and more agent-aware than the current cmux gateway               |
| Report sidebar/status metadata          | `workspace.report_metadata`, `pane.report_metadata`, custom tokens and TTLs; `pane.report_agent` for semantic agent state     | Supported, though presentation differs from cmux descriptions/status pills |
| Save/apply pane arrangements            | `layout.export`, `layout.apply`, and split-ratio operations                                                                   | Supported                                                                  |
| Extend workflows inside the multiplexer | Manifest-declared plugins with actions, event hooks, panes, and link handlers                                                 | Supported                                                                  |

Sources: [Socket API](https://herdr.dev/docs/socket-api/), [CLI reference](https://herdr.dev/docs/cli-reference/), and [Plugins](https://herdr.dev/docs/plugins/).

## Plugin model

A Herdr plugin is an ordinary executable package declared by `herdr-plugin.toml`, not a restricted SDK. It can declare:

- context-sensitive actions;
- lifecycle event hooks such as `worktree.created`;
- terminal pane entrypoints;
- URL link handlers;
- custom keybindings invoking plugin actions.

Herdr injects `HERDR_BIN_PATH`, socket and caller IDs, plugin config/state directories, and invocation/event context. Plugin commands may call the entire Herdr CLI or raw socket. Plugins are not sandboxed and run as the user.

Source: [official Plugins documentation](https://herdr.dev/docs/plugins/); upstream [`plugins.mdx`](https://github.com/ogulcancelik/herdr/blob/5d24d0d214d05858e344a9e15a63856dc1328eae/docs/next/website/src/content/docs/plugins.mdx).

## Recommended ns architecture

Do not rewrite the existing cmux capability around a generic lowest-common-denominator terminal API. Add a separate `HerdrGateway` adapter and share only vendor-neutral orchestration logic where the semantics genuinely match.

A first steel thread could implement:

1. caller detection from `HERDR_*_ID`;
2. `workspace create --cwd --label --no-focus`;
3. launch Pi/Claude in the returned root pane, or create a tab/pane and run it;
4. rename/report metadata;
5. optionally wait for `working` then `done` and read output.

Prefer CLI wrappers initially because Herdr recommends them for ordinary automation and they abstract Unix sockets versus Windows named pipes. Generate or validate raw API types from `herdr api schema --json` only if event streaming or lower-level control becomes necessary.

## Caveats

- Herdr's official agent skill says control should originate inside a Herdr-managed pane (`HERDR_ENV=1`) and recommends explicit caller IDs or `--current`, not implicit focused-pane targeting. An ns integration should follow that posture.
- Herdr's workspace metadata is token/presentation based rather than a direct clone of cmux's description plus status-pill model. UI output should be designed for Herdr rather than mechanically translated.
- Plugin v1 has no native non-terminal plugin UI and no separate managed storage API; plugins own durable files/databases. Actions and hooks are declared in the manifest rather than registered dynamically at runtime.
- The installed CLI/schema should be treated as the runtime authority because the project is moving quickly. Herdr itself instructs agents to inspect current command-group help and parse returned IDs rather than predict them.

Source: upstream [`SKILL.md`](https://github.com/ogulcancelik/herdr/blob/5d24d0d214d05858e344a9e15a63856dc1328eae/SKILL.md) and the official API/plugin docs above.
