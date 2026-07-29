# @nseng-ai/pi-ns-herdr

Pi host adapter for Herdr's twelve-entry catalog: eleven base `/ns:herdr:*` commands plus optional `/ns:herdr:tab:handoff`. It delegates resource mechanics to `@nseng-ai/herdr/api` and owns Pi registration, interaction, presentation, launch-profile resolution, and canonical Pi argv construction for implementation workflows.

Prompt, session, and Saved Plan implementation are symmetric across new-space and new-tab destinations. Tab prompt/plan commands target the explicit caller space; session commands produce a visible model summary turn and prefill the matching prompt command for review without auto-submitting or mutating state.

The optional Handoff tab command composes the narrow `@nseng-ai/pi-ns-handoffs/handoff-launch` host interface and transports the caller's provider, model, and thinking level. Only exact absence of that subpath disables optional registration; other load failures propagate. The hidden Herdr command verifies the durable Handoff reference and constructs its canonical Pi launch at the narrow launch boundary.
