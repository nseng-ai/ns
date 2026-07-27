# @nseng-ai/pi-ns-objectives

This context names the Pi host-adapter boundary for Objectives. Canonical Objective-system
vocabulary remains in the root [ns context](../../../../../../../CONTEXT.md), and the
harness-independent Objective command and extension-package-API vocabulary remains in the
[`@nseng-ai/objectives` context](../../../../extensions/objectives/CONTEXT.md). This
package cites those terms rather than redefining them.

## Language

**Objective Pi host adapter**:
The incubating `@nseng-ai/pi-ns-objectives` package under
`ts/packages/incubating/hosts/pi/extensions/pi-ns-objectives/`. It consumes the curated
`@nseng-ai/objectives/api` extension package API and neutral `@nseng-ai/pi-runtime/...`
helpers to present Objective workflows through Pi while keeping the Objectives ns extension
harness-independent. It is implemented on the current feature branch but is not landed or
published.
*Avoid*: Objective domain owner, Objectives Pi subpackage, `@nseng-ai/objectives/pi`, private Objective source consumer, published adapter

**Objective Pi command surface**:
The preserved `/ns:objective:*` Pi slash-command family registered by the **Objective Pi
host adapter**, including list, create, next, update, close, and autorun workflows. The
adapter owns Pi registration, completion, picker and notification presentation, skill
expansion, and parity metadata; Objective behavior and policy come from
`@nseng-ai/objectives/api` and the portable Objective skills.
*Avoid*: new Objective lifecycle, Pi-owned Objective semantics, CLI replacement, package-path namespace

**Objective runner-step distinction**:
The boundary between the packaged `/ns:objective:autorun` command and the project-local
`objective_runner_step` tool. The command belongs to the **Objective Pi host adapter**; the
tool remains the provisional consumer artifact in `.pi/extensions/objective-autorun.ts`
that mechanically performs one runner step and returns a Runner Checkpoint for parent
judgment.
*Avoid*: packaging the local tool by implication, autonomous adapter-owned loop, command/tool conflation
