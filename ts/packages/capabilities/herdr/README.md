# @nseng-ai/herdr

Private Herdr capability for resource-first space and tab workflows.

## Pi command catalog

Herdr registers eleven resource-first commands: seven space commands (`new`, `goal`, `objective-summary`, `dispatch-prompt`, `dispatch-trunk-prompt`, `dispatch-plan`, `dispatch-trunk-plan`) and four tab commands (`new`, `goal`, `dispatch-plan`, `handoff`). `tab:handoff` is the only optional registration; its exact module absence is ignored while failures from an installed integration remain visible.

## Optional Slot label enrichment

Space goal (`/ns:herdr:space:goal`), tab goal (`/ns:herdr:tab:goal`), and Objective summary (`/ns:herdr:space:objective-summary`) labels gain a compact Slot prefix (`s1:add-auth`, `s1:obj:<slug>`) only when both facts hold:

- the command handler cwd has the canonical managed-Slot path shape (`slotLabelInput()`);
- the invocation-owned ns extension API reports `hasExtension("@nseng-ai/slots")`.

Every Herdr Pi host supplies a factory for the complete ns extension API directly to `registerHerdrPiExtension(pi, factory, options?)`; there is no generic-host or unavailable fallback. Each relevant Pi command handler constructs that API from its exact `ctx.cwd` before entering Herdr core—before caller targeting, validation, prompting, model work, or any early return—and at most once per invocation. Registration and unrelated dispatch/new-space/new-tab commands remain lazy.

The direct Pi helper calls `hasExtension("@nseng-ai/slots")` without catching factory, configuration, or programming failures. Such failures propagate and prevent the core operation and rename; extension absence is the normal `false` result and produces an unprefixed label. Herdr core receives only that resolved required boolean plus its narrow genuine collaborators, never the predicate, runtime context, factory, or complete API.

Prefixing still requires both effective Slots presence and canonical managed-Slot path identity. Do not conflate either fact with package resolution or infer Slot use from a directory basename or Pi command registration.

Label enrichment being optional does not make Slots optional for dispatch: current Herdr dispatch remains Slots-backed. The label-composition policy is provisional and should move behind a Herdr workflow pluggability point when that extension surface is designed.
