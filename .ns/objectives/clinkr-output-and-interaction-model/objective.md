---
edges:
  - objective: clinkr-readme-driven-development
    annotation: Implements the model this Objective settles; the Response reshape and service reconciliations land through its rebuild stack, and their landing triggers this Objective's documentation promotion.
---

# Clinkr Output and Interaction Model

## Thesis

Own the model for how a Clinkr app communicates with a user: settle the two-tier channel ontology drafted in `references/channel-ontology.md`, validate it against prior art, decide how and when it becomes durable repository documentation, and see that promotion through after implementation lands. The model's core claims: kernel channels (Request, Response) are the framework contract because Clinkr itself must emit on them; invocation services (Progress, Notice, Elicitation) are context capabilities whose far end is the user — ordinary injected dependencies defined at the SDK layer and adapted per host; and transport vocabulary (stdout/stderr, dialogs, widgets) is confined to adapters. The immediate evidence for needing a settled model is the prototype on `clinkr-semantic-output-raw-adapters` (commit `df8ad8246`): its mechanics are sound but its stream-keyed vocabulary forces the Pi host to re-render semantic output into strings named `semanticStdout`/`semanticStderr` and print literal `stdout:`/`stderr:` labels into the transcript.

## Scope

- Relocate the draft `channel-ontology.md` from `clinkr-readme-driven-development`'s references into this Objective's `references/`, repointing the citation in that Objective's `implementation-contract-notes.md`.
- Grill and settle the model: the two-tier membership rule ("kernel only if the framework itself must emit on it"), the channel/representation/transport layer split, the design test (no stdout/stderr vocabulary outside the terminal adapter and raw commands), and the term choices with their Avoid lists (Response over ClinkrRenderedResponse, Notice as the coined durable mid-flight term, Elicitation over Prompt/Dialog per the MCP precedent).
- Resolve the model's recorded open questions as decisions: streamed-durable-body placement, the Elicitation vocabulary split (`ClinkrInteraction` vs the SDK's `NsConfirmPrompt`/`NsSelectPrompt`), and the retirement path for stream-named `onOutput(stream, text)`. Implementation of those decisions belongs elsewhere.
- Research Click (`/Users/schrockn/code/pallets/click`) in a dedicated session as the named prior art: echo/secho and styling, pager, progressbar, prompt/confirm, and `CliRunner` testing surfaces, read against the channel model. Other prior art (the MCP elicitation precedent is already cited; oclif or clap may join) is admitted only where a specific open question needs it. Findings land as a Semantic Update plus reference notes.
- Decide the documentation-promotion strategy for the whole model: whether ADRs are warranted and for which decisions, which CONTEXT.md/README surfaces the vocabulary promotes into (Clinkr package docs, SDK docs, repo conventions), and the timing — CONTEXT.md must trail implementation per repo rule.
- Execute that promotion once `clinkr-readme-driven-development` lands the implementing changes.

## Non-Goals

- Implementing the model: the `ClinkrResponse` reshape of the prototype branch, the Pi adapter fix, and any service reconciliation code changes belong to `clinkr-readme-driven-development` and its rebuild stack.
- Editing CONTEXT.md or package READMEs ahead of implementation; proposed vocabulary stays in this Objective's references until ground truth exists.
- Building new interaction machinery: no prompt/select/menu framework, no third invocation service, no speculative host beyond the two production hosts (terminal, Pi).
- Reopening the closed `clinkr-user-interaction` Objective's shipped confirmation seam; `ClinkrInteraction` is provenance and raw material here, not a redesign target.

## Completion Criteria

- The channel ontology is blessed: two-tier structure, layer split, design test, and every term with its Avoid list are settled after grilling and the Click comparison, with rejected alternatives recorded.
- The three carried open questions have recorded decisions, whatever their implementation status.
- Click research findings exist as a Semantic Update and reference notes, with any model amendments they forced applied to the ontology doc.
- `clinkr-readme-driven-development` consumes the settled vocabulary — its reshape work (rename map: `ClinkrFinalPresentation` → `ClinkrResponse`, `presentFinal` → `onResponse`, private terminal adapter, Pi de-streaming) matches the blessed model.
- The documentation-promotion decision is recorded, and after implementation lands, executed: any decided ADRs written, the relevant CONTEXT.md/README surfaces updated in sync with ground truth, and the ontology reference reduced to a provenance pointer if fully promoted.

## Assumptions and Risks

Assumptions:

- The two-tier model survives scrutiny. The membership rule and deletion test both currently give the same split, and the code already agrees (`NsProgress`/`NsCommandIo` live in `sdk/services.ts`, not Clinkr). If grilling or Click research falsifies the split, the model is redrawn here before anyone implements against it.
- Terminal and Pi remain the only two production hosts. Every "two adapters make the seam real" argument rests on this; a third host re-tests each channel contract but is out of scope until concrete.
- `clinkr-readme-driven-development` remains the implementation owner and its dependency-ordered stack is where the Response reshape lands. If that Objective's plans change, the edge annotation and this Objective's promotion gate need rework.

Risks:

- **Prototype gravity.** The prototype branch's `ClinkrFinalPresentation` vocabulary can spread into public types, SDK plumbing, and Pi before the model is blessed, multiplying rename cost. Mitigation: settle the model before broad caller migration; the rename map in the ontology doc is the containment boundary.
- **Long-lived tail.** Promotion is gated on implementation this Objective does not control. When waiting is the only remaining work, record a Blocked Sentence naming the gate rather than letting the record look stale.
- **Coined-term fragility.** Notice is newly coined and Elicitation is imported from MCP; either could fail to take hold, leaving dual vocabularies (exactly the `ClinkrInteraction` vs `NsConfirmPrompt` split this Objective is meant to end). Mitigation: the Avoid lists are part of the blessed model, and promotion includes enforcing them in the promoted docs.
- **Premature-documentation drift.** Executing promotion before implementation, or partially, violates the CONTEXT-trails-ground-truth rule and creates aspirational docs. The promotion-strategy decision must state its trigger conditions explicitly.

## Open Questions

- **Streamed durable body.** `NsExtensionApi.stdout` supports commands streaming durable output in chunks before returning; the contract notes call it exceptional and require it disabled in JSON mode. Early-emitted Response Body or Notice? The one output kind the model does not yet place; do not force it until a concrete command demands a ruling.
- **Elicitation vocabulary split.** `ClinkrInteraction` (Clinkr) and `NsConfirmPrompt`/`NsSelectPrompt` (SDK) express one service in two vocabularies. Expected resolution keeps `ClinkrInteraction` as the seam type with the Pi modal as one adapter, but the target shape and migration owner are undecided.
- **`onOutput(stream, text)`.** The one Progress-adjacent API naming streams; already flagged as compatibility surface in `execution.ts`. Retire, rename, or absorb into Progress?
- **Promotion shape.** Whether any decision here clears the ADR bar (hard to reverse, surprising without context, real trade-off — the two-tier split and the Elicitation naming both plausibly do), which CONTEXT.md/README surfaces receive the vocabulary, and what implementation milestone triggers each sync.
