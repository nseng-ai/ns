# @nseng-ai/pi-ns-herdr

Pi host adapter for Herdr's twelve-entry catalog: eleven base `/ns:herdr:*` commands plus optional `/ns:herdr:tab:handoff`. It delegates resource mechanics to `@nseng-ai/herdr/api` and owns Pi registration, interaction, presentation, and launch construction.

Prompt, session, and Saved Plan implementation are symmetric across new-space and new-tab destinations. Tab prompt/plan commands target the explicit caller space; session commands produce a visible model summary turn and prefill the matching prompt command for review without auto-submitting or mutating state.

The optional Handoff tab command composes `@nseng-ai/pi-ns-handoffs/handoff-launch`. Only exact absence of that subpath disables registration; other load failures propagate.
