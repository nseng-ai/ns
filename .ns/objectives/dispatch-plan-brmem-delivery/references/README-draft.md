# Dispatch a Saved Plan — moved to the durable README

The canonical user-facing contract for `ns dispatch plan` no longer lives in
this Objective's references. It was merged into the durable Vercel capability
README:

- `ts/packages/capabilities/vercel/README.md` — section **"Dispatch a Saved
  Plan"**.

That README is now the canonical home. It carries the settled contract
(explicit Saved Plan input with Pi latest-session sugar, `dispatch-context`
Branch Memory delivery under `<dispatch-id>/plan/<plan-slug>.md`, Dispatch ID
correlation via the `dispatch.id` Workflow attribute, supervisor precheck
followed by harness `brmem get`, retained evidence, and
progressive-disclosure output) together with an accurate status block
distinguishing locally implemented behavior from the still-unproven live path
and the blocked `build:deployable` evidence.

Do not edit contract prose here; edit the durable README. This file remains
only as a pointer so older links into this Objective's references resolve.
