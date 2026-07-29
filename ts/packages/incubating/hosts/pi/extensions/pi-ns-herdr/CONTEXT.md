# @nseng-ai/pi-ns-herdr

`@nseng-ai/pi-ns-herdr` is the Pi host adapter for Herdr. It owns Pi command registration, interaction, presentation, launch-option and command construction, session/model state, direct Pi discovery, and parity metadata for the nine `/ns:herdr:*` command identities.

Herdr resource creation, labels, explicit caller targeting, Slot-backed prepared destinations, and pane process launch remain owned by `@nseng-ai/herdr` and are consumed through `@nseng-ai/herdr/api`.

The dependency on `@nseng-ai/pi-ns-handoffs/handoff-launch` is an intentional host-to-host composition edge. The Handoffs adapter continues to own Handoff Artifact creation and slugging; this adapter adds Herdr preflight and destination launch behavior.
