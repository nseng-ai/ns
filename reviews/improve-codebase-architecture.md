---
description: |
  Review the supplied diff for architecture deepening opportunities: modules,
  interfaces, seams, adapters, leverage, and locality problems introduced or
  revealed by the current branch.
default_model: sonnet
applies_to:
  include:
    - "**/*.ts"
    - "**/*.tsx"
    - "**/*.py"
  exclude:
    - "**/tests/**"
    - "**/test/**"
    - "**/*.test.ts"
    - "**/test_*.py"
    - ".agents/skills/**"
    - ".claude/skills/**"
    - "skills/**"
---

Review the supplied diff/current branch changes for architecture deepening
opportunities. This is a diff-grounded Roaster review, not an interactive repo
survey: do not write HTML reports, do not open browser artifacts, do not run a
grilling loop, and do not propose broad architecture projects unrelated to the
changed code.

Use the codebase-design vocabulary precisely where helpful:

- **module**: a unit that hides implementation decisions behind an interface;
- **interface**: the surface a caller must understand and the main test surface;
- **depth**: the amount of useful behavior hidden behind a small interface;
- **seam**: a deliberately placed split where independent change or testing is
  useful;
- **adapter**: a module that translates an external or volatile boundary into a
  project-owned interface;
- **leverage**: how much simplification callers get from a module;
- **locality**: whether behavior can be understood and tested in one place.

## Mandate

Find architectural friction introduced or revealed by the diff. A good finding
should explain how the changed code could become a deeper module, a cleaner
interface, a better seam, or a higher-leverage adapter. The recommendation must
be reviewable from the diff and nearby context; suppress speculative repo-wide
redesigns that require a separate exploration to validate.

Focus on changes that make future work harder:

- shallow modules whose interface is nearly as complex as their implementation;
- pure-function extraction that improves unit-test access while losing locality
  for the real workflow;
- modules coupled through leaked data shapes, lifecycle assumptions, or shared
  mutable state;
- adapters missing at external or volatile boundaries;
- duplicated orchestration because no module owns the end-to-end concept;
- feature logic placed in a package or layer that does not own the domain term;
- call sites forced to know too much about setup, ordering, validation, or
  cleanup;
- test seams that require contorting production code rather than exercising a
  coherent interface.

## Procedure

1. Start from the changed files and read enough nearby code to understand the
   module/interface being modified.
2. Identify the concept the change is trying to express. Prefer project domain
   vocabulary when available, and do not invent new canonical terms unless the
   diff clearly introduces one.
3. Ask whether the changed interface gives callers leverage or merely exports
   implementation details.
4. Apply the deletion test to suspected shallow modules: would deleting the
   module concentrate complexity into a better owner, or only move the same
   complexity around?
5. Check whether a second concrete caller, backend, mode, or test surface makes
   a seam real. Avoid recommending hypothetical seams with no leverage.
6. Recommend the smallest architecture change that improves locality and reduces
   caller knowledge.

## Finding bar

Emit a finding only when the diff provides enough evidence for a concrete
architecture recommendation. Good findings usually name:

- the changed module/interface and the caller or owner affected;
- the current friction in terms of depth, seam quality, adapter placement,
  leverage, or locality;
- the specific refactoring direction;
- why the result would be easier to test, change, or reason about.

Suppress findings when:

- the advice is only a broad repo survey unrelated to the diff;
- the proposed seam has only one speculative user and no obvious leverage;
- the recommendation would duplicate an existing module without checking it;
- the issue is a local style/type violation better handled by another review;
- you would need a grilling session or HTML exploration before stating a concrete
  recommendation.

## Output expectations

Keep findings grounded in changed lines and nearby context. Phrase them as
reviewable architecture feedback, not as a multi-step implementation plan. If a
branch is architecturally fine, return no findings rather than padding the review
with speculative deepening ideas.
