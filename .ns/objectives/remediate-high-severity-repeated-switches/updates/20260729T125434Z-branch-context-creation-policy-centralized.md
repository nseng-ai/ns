# Branch Context Creation Policy Centralized

## Summary

The fifth high-severity finding is fixed in Runner Checkpoint commit `0c3040aeb595bcc4f1d57c8a1b4cebaec69dbd90`. A package-local exhaustive Branch Context creation-policy descriptor now owns plain Git versus Graphite mode, current-HEAD versus explicit start source and reference, and current versus explicit Graphite parent behavior. Preview resolution, failure formatting, plan preparation, and execution-basis resolution consume the descriptor while dynamic Git values continue to resolve only at their required boundaries.

Characterization coverage records all four policy variants. Runner-attested verification confirmed the implementation branch, unchanged pre-finish HEAD, clean index, non-empty candidate diff, Graphite tracking, and `git diff --check`. The child additionally reported passing 237 Branch Context tests, package typecheck, formatting/lint/type checks, 168 style-guard tests, 5,992 default tests, dependency checks, and default `just`; those command-result details remain child-reported rather than runner-attested.

## Objective Impact

The roadmap finding “Centralize Branch Context creation-policy interpretation” is recorded fixed. Preview, failure, preparation, and execution paths now share one package-owned interpretation without normalizing away required dynamic resolution. One finding remains open.

## Follow-Ups

- Continue with release-reset action semantics, stopping if the smallest fix requires a broader visitor or framework decision.
