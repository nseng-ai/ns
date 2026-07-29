# @nseng-ai/pi-ns-herdr

Pi host adapter for the Herdr extension. It registers and presents the `/ns:herdr:*` command surface while delegating Herdr resource mechanics to `@nseng-ai/herdr/api`.

The optional Handoff tab command composes the narrow `@nseng-ai/pi-ns-handoffs/handoff-launch` host interface. Only exact absence of that subpath disables the optional registration; other load failures propagate.
