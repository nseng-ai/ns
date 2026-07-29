# @nseng-ai/pi-ns-handoffs

**Handoffs Pi adapter**:
The Pi-owned registration, presentation, content-slug tooling, create flow, self-handoff lifecycle, and Claude integration over the Handoff Domain Core.
*Avoid*: Handoff Domain Core, storage owner, forwarding adapter.

**Handoff create-flow seam**:
The curated `@nseng-ai/pi-ns-handoffs/create-flow` adapter API used by another Pi adapter to register the content-slug tool and run the save-before-launch Handoff creation protocol.
*Avoid*: private deep import, generic launch API, Handoff storage API.
