# Umbrella skill families

Design guidance for umbrella skill families: when one capability has several
explicit workflow steps, how to split content between the umbrella and its step
skills.

Use an umbrella skill family when one capability has several explicit workflow
steps that share terminology, storage contracts, safety rules, or diagnostics.
The umbrella is compact agent-facing documentation; step skills remain the
invocable entrypoints.

Split content by what is cross-cutting vs per-operation:

- **Shared, cross-cutting model and edge flows → umbrella references.** The
  terminology and storage contracts every step can confuse, plus the repair,
  admin, and diagnostics flows owned by no single step.
- **Per-operation procedure → the step skill that owns it.** Each step's command
  invocation, argument/slug derivation rules, step-specific recovery, and success
  evidence live in that step skill, not in a shared reference.

Do not pull per-operation command contracts up into a shared umbrella reference.
That is the most common over-abstraction: the contract duplicates whatever the
step skills already carry, and it forces a reference hop to run a single command.

Umbrella skill:

- Lives at `skills/<capability>/` and is installed like any other public local
  skill.
- Triggers only on explicit capability/reference/admin terms, not generic step
  words.
- Keeps `SKILL.md` as a concise reference root that routes to bundled
  `references/` files for the shared model (lifecycle, terminology, storage),
  safety posture, and diagnostics/admin — not per-operation commands.
- Contains enough shipped context for external agents to operate the capability
  without relying on internal repo docs.

Step skills:

- Stay installed and discoverable for explicit workflow-step requests.
- Say they are part of the family and instruct agents to use the umbrella skill
  first by skill name, not by relative filesystem path.
- Are self-contained for their own happy path: the step's command, derivation
  rules, step-specific recovery, boundaries, and success evidence inline, so the
  common path runs with no reference hop. This self-containment is what keeps the
  step portable across harnesses.
- Route to the umbrella for the shared model; do not restate cross-cutting
  lifecycle/terminology or another step's procedure.

When step skills mirror an external command surface (e.g. Pi slash commands),
treat them as independent parallel entrypoints over the same underlying CLI, not
a dispatch chain — which is why each step must stand alone.

Avoid hidden installation dependencies where a step references an uninstalled
umbrella.
