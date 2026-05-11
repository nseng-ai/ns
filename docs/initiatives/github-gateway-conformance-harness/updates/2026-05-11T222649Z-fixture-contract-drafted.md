# Fixture Contract Drafted

## Summary

A first checked-in fixture contract was added in `docs/github-gateway-conformance-fixtures.md` on branch `add-github-gateway-conformance-fixtures-contract-d` at commit `fa9c2216`.

The document defines the live conformance repository shape, required environment variables, persistent golden fixtures, ephemeral per-run fixture markers, allowed and forbidden mutations, local preflight checks, and maintainer setup expectations. It explicitly leaves the canonical repository, visibility, owner, CI token model, and first-run command selection as open decisions.

## Roadmap Context

This advances the roadmap's current work to define the test-repository fixture contract. It also gives the future opt-in conformance entry point and read-only parity slice a concrete configuration and fixture target to build against.

## Initiative Impact

The initiative now has a reviewable artifact that separates fixture lifecycle and repository safety rules from test implementation. Future conformance tests can rely on documented conventions for `ASDL_GH_CONFORMANCE_*` configuration, read-only golden resources, per-run mutation markers, and setup-vs-contract-drift failure classification.

The work does not yet select or create the canonical GitHub repository, so the fixture contract is an operating draft rather than a completed live setup.

## Follow-Ups

- Choose the canonical conformance repository, visibility, owning maintainer, and CI token model.
- Create or verify the golden label, golden issue, golden PR, golden branch, and review/comment/thread resources described by the fixture contract.
- Build the opt-in conformance test entry point against the documented `ASDL_GH_CONFORMANCE_*` environment surface.
- Use the golden PR and issue fixtures to prove the first read-only fake/real parity slice.
