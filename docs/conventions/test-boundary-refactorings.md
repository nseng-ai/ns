# Test-Boundary Refactorings

A catalog of named refactoring techniques for moving test cost across this repository's test
boundaries while preserving behavior confidence. The techniques are distilled from applied,
evidenced slices recorded in `.ns/objectives/standing-test-performance-boundaries/updates/`; each
entry names a transformation that has already been used there. Entry names are imperative verb
phrases naming the transformation, in the style of Fowler's *Refactoring*.

Entries cite their governing documents rather than restating them. Where an entry touches gateway
shape, `docs/conventions/consumer-gateways-and-command-shape.md` is authoritative; where it touches
lanes and coverage doctrine, `ts/TESTING.md` is authoritative; vocabulary is defined in root
`CONTEXT.md` § Architecture Boundaries and the `typescript-fake-driven-testing` skill.
