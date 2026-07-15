# Extracted Dispatch Client Seam Consumed

## Summary

The separate Graphite-aware source-publication feature was implemented in the extracted `src/dispatch-client/` feature home. Local command composition injects Flow's curated minimal-submit client and the interaction channel there; the `src/ns/` directory remains only the extension descriptor and thin command adapter. No `ctx.extensions.dispatch` override, old `src/ns/dispatch-prompt/` ownership, or public `./dispatch-client` package export was reintroduced.

## Objective Impact

This is downstream evidence that M4+M5 produced the intended feature seam and that H9's path derivation remains intact. It does not close or alter H1, H2, H3+H5, H4+M1, M6, M10, or any other thermo finding. The source-publication behavior belongs to Cloud Execution and the cheap engine belongs to Prod Submit; this record notes only consumption of the extraction.

No live Vercel deployment, dispatch, Graphite submit, Git push, or PR mutation was performed or claimed.

## Follow-Ups

- Continue remaining thermo rows independently from this feature.
- Preserve the dispatch-client ownership boundary when future `dispatch plan|handoff` commands land.
- Revisit deployable evidence only in an appropriately configured checkout without weakening the no-external-write boundary.
