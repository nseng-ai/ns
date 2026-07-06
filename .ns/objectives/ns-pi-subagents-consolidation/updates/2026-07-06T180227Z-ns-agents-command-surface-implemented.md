# Semantic Update: ns:agents Command Surface Implemented

- **Concrete agents key.** The rename slice uses `ns.agents.fleet` for both the fleet widget key and footer status key. Rationale: there is one fleet/status surface today, so the key is the stable and obvious concrete member of the roadmap's `ns.agents.*` namespace.
- **Vocabulary split recorded.** Current docs and `CONTEXT-MAP.md` now describe `agents` as the user-facing session-tree/fleet command vocabulary (`ns:agents:fleet`, `ns:agents:transcript`) while keeping `subagent` for dispatched child sessions, runner-subagent helpers, package/subpath names, and model-visible tool identifiers.
- **No compatibility aliases.** Package tests assert the extension registers `ns:agents:fleet` and `ns:agents:transcript` and does not register `ns:subagents:fleet` or `ns:explore:transcript`.
