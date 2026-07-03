**Direction: the default test suite stays fast; real-backend tests move to an explicit integration lane.**

Getting to: default tests use in-memory fakes/gateways; tests needing real git,
subprocess, or sqlite live in the explicit integration lane (see `ts/TESTING.md`).

What you see now — legacy, do not copy: real-backend setup scattered through
default tests; per-case real-git/subprocess wiring.

Avoid: adding real-backend setup to default tests; hiding integration tests;
deleting slow tests without a fake-driven equivalent.

Active slice: see this objective's roadmap.md.
