# Context Profiler Message-Part Semantics Centralized

## Summary

The fourth high-severity finding is fixed in Runner Checkpoint commit `7aab19cf10c2328e68c565c0589722ec708ebfb7`. A private exhaustive `messagePartFacts` projection in the context-profiler model now owns each `MessagePart` variant's normalized section text, character count, excerpt text, and contributed tool names. Rendering, accounting, excerpt generation, and tool-name extraction consume those facts with their existing surrounding behavior retained.

Runner-attested verification confirmed the implementation branch, unchanged pre-finish HEAD, clean index, non-empty candidate diff, Graphite tracking, and `git diff --check`. The child additionally reported passing 31 focused context-profiler tests, 568 pi-tools tests, package typecheck, formatting/lint/type/dependency checks, 168 style-guard tests, 5,991 default tests, and default `just`; those command-result details remain child-reported rather than runner-attested.

## Objective Impact

The roadmap finding “Centralize context-profiler `MessagePart` semantics” is recorded fixed. The verified consumers now derive semantic contributions from one exhaustive owner rather than separate variant cascades. Two findings remain open.

## Follow-Ups

- Continue with Branch Context creation-policy interpretation, stopping if normalization becomes design-bearing.
- Preserve one complete finding disposition per accepted autorun slice.
