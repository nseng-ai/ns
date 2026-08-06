# Roadmap

## Work

- [ ] Relocate `channel-ontology.md` from `clinkr-readme-driven-development/references/` into this Objective's `references/` and repoint the citation in that Objective's `implementation-contract-notes.md`. Both files are currently uncommitted on `clinkr-semantic-output-raw-adapters`; land the move with them.
- [ ] Grill and settle the model: two-tier membership rule, channel/representation/transport layers, the no-stream-vocabulary design test, and every term plus Avoid list. Record rejected alternatives and any structural amendments in the ontology doc and a Semantic Update.
- [ ] Run the Click prior-art session against `/Users/schrockn/code/pallets/click`: echo/secho and styling, pager, progressbar, prompt/confirm, and `CliRunner`, each read as "which channel is this, and what does Click's shape teach or falsify?" Admit other prior art only where a specific open question needs it. Capture findings as reference notes plus a Semantic Update.
- [ ] Resolve the three carried open questions as recorded decisions: streamed-durable-body placement, Elicitation vocabulary reconciliation target, and the `onOutput(stream, text)` retirement path.
- [ ] Decide the documentation-promotion strategy: which decisions (if any) become ADRs, which CONTEXT.md/README surfaces receive the vocabulary, and what implementation milestone triggers each sync given CONTEXT must trail ground truth.
- [ ] Bless the final model and hand it to `clinkr-readme-driven-development`: confirm the rename map (`ClinkrFinalPresentation` → `ClinkrResponse`, `presentFinal` → `onResponse`, private terminal adapter, Pi de-streaming) is the implementation's acceptance spec, and record the blessing as a Semantic Update. Expect a Blocked Sentence while implementation proceeds there.
- [ ] Execute the decided promotion once implementation lands: write any decided ADRs, sync the chosen CONTEXT.md/README surfaces in the same change window as (never ahead of) ground truth, and reduce the ontology reference to a provenance pointer if fully promoted.
      Evidence: promoted docs match shipped code; `just` and relevant repo checks pass on the promoting changes.

## Parked

- Fixed comparative survey of additional CLI frameworks (oclif, clap, cliffy); prior art beyond Click enters only through a specific open question.
- Third-host generalization of the channel contracts; revisit when a concrete host beyond terminal and Pi exists.
- Any new invocation service beyond Progress, Notice, and Elicitation; the streamed-durable-body ruling may propose one, which returns through the open-question decision, not this list.
