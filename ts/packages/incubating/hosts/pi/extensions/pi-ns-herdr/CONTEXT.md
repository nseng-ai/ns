# @nseng-ai/pi-ns-herdr

`@nseng-ai/pi-ns-herdr` is the Pi host adapter for Herdr. It owns Pi command registration, interaction, presentation, launch-option and command construction, session/model state, direct Pi discovery, and parity metadata for the twelve-entry `/ns:herdr:*` catalog: eleven base registrations plus optional `/ns:herdr:tab:handoff`.

Prompt, session, and Saved Plan implementation are symmetric across space and tab destinations. A tab prompt captures and validates `HERDR_WORKSPACE_ID` immediately after command acknowledgement, before idle waiting, Git inspection, interaction, or mutation, and creates a focused tab in that explicit caller space. Session commands create a visible model summary turn and prefill the matching prompt command in the editor for review; they share one pending-summary coordinator and never auto-submit or mutate Herdr, Git, Handoff, or Branch Memory state.

Herdr resource creation, labels, explicit caller targeting, Slot-backed prepared destinations, and pane process launch remain owned by `@nseng-ai/herdr` and are consumed through `@nseng-ai/herdr/api`. User-facing language says **space**, **tab**, and **caller space**; **workspace** is reserved for `HERDR_WORKSPACE_ID` and upstream mechanics.

The dependency on `@nseng-ai/pi-ns-handoffs/handoff-launch` is an intentional host-to-host composition edge. The Handoffs adapter continues to own Handoff Artifact creation and slugging; this adapter adds Herdr preflight and destination launch behavior.
