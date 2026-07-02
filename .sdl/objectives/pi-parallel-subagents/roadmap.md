# Roadmap

## Work

- [x] Adopt-vs-build decision spike: evaluate tintinweb/pi-subagents,
      nicobailon/pi-subagents, gotgenes/pi-packages, mjakl/pi-subagent, and Pi's
      first-party example (checkouts under `~/code/githubs/`; re-pull heads first)
      against the priorities — maintenance burden, prompt/UX control, and ability to
      subsume `dispatchRunnerSubagent` + thermo-council. Adopt-as-is, fork-and-own, and
      build are all admissible outcomes.
      Evidence: decision recorded as an objective update with per-candidate rationale.
      Outcome: **build** on the runner-subagent substrate in
      `ts/packages/local/pi-tools`; see
      `updates/2026-07-02-adopt-vs-build-decision.md`.
- [ ] Explorer agent definition: scout output contract (`## Files Retrieved` with line
      ranges, `## Key Code`, `## Architecture`, `## Start Here`), cheap-model default
      with dispatch-time auth fallback and runtime failover, read-only tool allowlist
      with no `bash`/`edit`/`write`.
- [ ] Model-invocable fan-out tool: parent-facing prompt engineering (parallel calls in
      one message, never delegate understanding, quick/medium/very-thorough breadth
      vocabulary, prefer direct grep/read for known targets) plus depth, concurrency,
      and wall-clock guards.
- [ ] Preview + pointer result plumbing: bounded preview in parent context, full
      findings on disk, retrievable on demand.
- [ ] Live inline progress rendering: placeholder-sentinel per-task rows with status
      icons, recent tool-activity lines, and a done/running counter.
- [ ] Dogfood in real SDL work and tune the tool description and scout contract from
      observed transcripts.
      Evidence: at least one real task completed using explore fan-out, with prompt
      adjustments captured as an update.
- [ ] Fleet widget and transcript viewer (monitoring layers 2–3): persistent live list
      of background/running explorers plus drill-in transcript view backed by on-disk
      session JSONL. Non-blocking for completion.
- [ ] In-process runtime adapter behind a runtime seam for context-forking use cases
      (subprocess remains the default). Non-blocking for completion.
- [ ] Consolidation assessment: whether the chosen substrate can subsume
      `dispatchRunnerSubagent` and thermo-council's orchestration. Expected to park.

## Parked
