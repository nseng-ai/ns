# @nseng-ai/herdr

Harness-independent Herdr extension and curated `@nseng-ai/herdr/api`. It owns Herdr destination behavior, resource labels, prepared launches, and the hidden durable-reference Handoff launch command. Host interaction and launch-command construction are supplied through narrow Herdr-owned collaborators.

Pi registration and presentation live in `@nseng-ai/pi-ns-herdr`; this package has no Pi host surface or Pi Runtime dependency.
