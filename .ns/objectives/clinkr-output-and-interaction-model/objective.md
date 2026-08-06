---
edges:
  - objective: clinkr-readme-driven-development
    annotation: Implements the model this Objective settles; the Response reshape and service reconciliations land through its rebuild stack, and their landing triggers this Objective's documentation promotion.
---

# Clinkr Output and Interaction Model

## Thesis

Own the model for the communication between a Clinkr app and a user. Settle the two-tier channel ontology in the draft `references/channel-ontology.md`. Validate the model against prior art. Decide how and when the model becomes durable repository documentation. Complete that promotion after the implementation lands.

The model has these core claims:

- The kernel channels (Request, Response) are the framework contract, because Clinkr itself must emit on them.
- The invocation services (Progress, Notice, Elicitation) are context capabilities, and their far end is the user. They are ordinary injected dependencies. The SDK layer defines them, and each host adapts them.
- The transport vocabulary (stdout/stderr, dialogs, widgets) stays only in the adapters.

The immediate evidence for the need of a settled model is the prototype on `clinkr-semantic-output-raw-adapters` (commit `df8ad8246`). The mechanics of the prototype are sound. But its stream-keyed vocabulary forces the Pi host to re-render the semantic output into strings named `semanticStdout`/`semanticStderr`. The vocabulary also forces the Pi host to print literal `stdout:`/`stderr:` labels into the transcript.

## Scope

- Move the draft `channel-ontology.md` from the references of `clinkr-readme-driven-development` into the `references/` directory of this Objective. Point the citation in the `implementation-contract-notes.md` of that Objective to the new location.
- Grill the model and settle it. Settle these parts:
  - the two-tier membership rule ("kernel only if the framework itself must emit on it");
  - the layer split between channel, representation, and transport;
  - the design test (no stdout/stderr vocabulary outside the terminal adapter and the raw commands);
  - the term choices with their Avoid lists: Response over ClinkrRenderedResponse, Notice as the coined durable mid-flight term, and Elicitation over Prompt/Dialog, which follows the MCP precedent.
- Resolve the recorded open questions of the model as decisions:
  - the placement of the streamed durable body;
  - the Elicitation vocabulary split (`ClinkrInteraction` vs the SDK's `NsConfirmPrompt`/`NsSelectPrompt`);
  - the retirement path for the stream-named `onOutput(stream, text)`.

  The implementation of those decisions belongs elsewhere.
- Research Click (`/Users/schrockn/code/pallets/click`) in a dedicated session as the named prior art. Read these surfaces against the channel model: echo/secho and styling, the pager, the progressbar, prompt/confirm, and the `CliRunner` testing surfaces. Admit other prior art only where a specific open question needs it. The MCP elicitation precedent is already cited; oclif or clap may join. Record the findings as a Semantic Update plus reference notes.
- Decide the documentation-promotion strategy for the whole model. Decide these items:
  - whether ADRs are warranted, and for which decisions;
  - which CONTEXT.md/README surfaces receive the vocabulary (the Clinkr package docs, the SDK docs, the repo conventions);
  - the timing — CONTEXT.md must trail the implementation, because the repo rule requires it.
- Execute that promotion after `clinkr-readme-driven-development` lands the changes that implement the model.

## Non-Goals

- The implementation of the model. The `ClinkrResponse` reshape of the prototype branch, the Pi adapter fix, and all service-reconciliation code changes belong to `clinkr-readme-driven-development` and its rebuild stack.
- Edits to CONTEXT.md or the package READMEs before the implementation. The proposed vocabulary stays in the references of this Objective until the ground truth exists.
- New interaction machinery. No prompt/select/menu framework, no third invocation service, and no speculative host beyond the two production hosts (terminal, Pi).
- A reopen of the shipped confirmation seam from the closed `clinkr-user-interaction` Objective. `ClinkrInteraction` is provenance and raw material here, not a redesign target.

## Completion Criteria

- The channel ontology is blessed. The two-tier structure, the layer split, the design test, and each term with its Avoid list are settled after the grilling and the Click comparison. The rejected alternatives are recorded.
- The three carried open questions have recorded decisions, whatever their implementation status.
- The Click research findings exist as a Semantic Update and reference notes. The ontology doc contains each model amendment that the findings forced.
- `clinkr-readme-driven-development` consumes the settled vocabulary. Its reshape work matches the blessed model. The reshape work includes the rename map (`ClinkrFinalPresentation` → `ClinkrResponse`, `presentFinal` → `onResponse`), the private terminal adapter, and the Pi de-streaming.
- The documentation-promotion decision is recorded. After the implementation lands, the decision is executed:
  - each decided ADR is written;
  - the relevant CONTEXT.md/README surfaces are updated in sync with the ground truth;
  - the ontology reference is reduced to a provenance pointer if the model is fully promoted.

## Assumptions and Risks

Assumptions:

- The two-tier model survives scrutiny. The membership rule and the deletion test currently give the same split. The code already agrees: `NsProgress`/`NsCommandIo` live in `sdk/services.ts`, not in Clinkr. If the grilling or the Click research falsifies the split, this Objective redraws the model before anyone implements against it.
- Terminal and Pi remain the only two production hosts. Each "two adapters make the seam real" argument rests on this assumption. A third host re-tests each channel contract, but a third host is out of scope until it is concrete.
- `clinkr-readme-driven-development` remains the implementation owner. Its dependency-ordered stack is where the Response reshape lands. If the plans of that Objective change, the edge annotation and the promotion gate of this Objective need rework.

Risks:

- **Prototype gravity.** The `ClinkrFinalPresentation` vocabulary of the prototype branch can spread into the public types, the SDK plumbing, and Pi before the model is blessed. That spread multiplies the rename cost. Mitigation: settle the model before the broad caller migration. The rename map in the ontology doc is the containment boundary.
- **Long-lived tail.** The promotion is gated on an implementation that this Objective does not control. When the wait is the only remaining work, record a Blocked Sentence that names the gate. Do not let the record look stale.
- **Coined-term fragility.** Notice is a new coined term, and Elicitation is imported from MCP. Either term could fail to take hold. A failure leaves dual vocabularies — exactly the `ClinkrInteraction` vs `NsConfirmPrompt` split that this Objective is meant to end. Mitigation: the Avoid lists are a part of the blessed model, and the promotion includes the enforcement of the Avoid lists in the promoted docs.
- **Premature-documentation drift.** A promotion that occurs before the implementation, or a partial promotion, violates the CONTEXT-trails-ground-truth rule and creates aspirational docs. The promotion-strategy decision must state its trigger conditions explicitly.

## Open Questions

- **Streamed durable body.** `NsExtensionApi.stdout` lets commands stream durable output in chunks before they return. The contract notes call this behavior exceptional, and they require that it is disabled in JSON mode. Is this an early-emitted Response Body or a Notice? This is the one output kind that the model does not yet place. Do not force the placement until a concrete command demands a ruling.
- **Elicitation vocabulary split.** `ClinkrInteraction` (Clinkr) and `NsConfirmPrompt`/`NsSelectPrompt` (SDK) express one service in two vocabularies. The expected resolution keeps `ClinkrInteraction` as the seam type, with the Pi modal as one adapter. But the target shape and the migration owner are undecided.
- **`onOutput(stream, text)`.** This is the one Progress-adjacent API that names streams. It is already flagged as a compatibility surface in `execution.ts`. Retire it, rename it, or absorb it into Progress?
- **Promotion shape.** These questions are open:
  - Does any decision here clear the ADR bar (hard to reverse, surprising without context, a real trade-off)? The two-tier split and the Elicitation naming both plausibly clear it.
  - Which CONTEXT.md/README surfaces receive the vocabulary?
  - What implementation milestone triggers each sync?
