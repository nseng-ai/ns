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
      `ts/packages/local/pi-tools` (since moved to `ts/packages/internal/pi-tools`);
      see `updates/2026-07-02-adopt-vs-build-decision.md`.
- [x] Explorer agent definition: scout output contract (`## Files Retrieved` with line
      ranges, `## Key Code`, `## Architecture`, `## Start Here`), cheap-model default
      with dispatch-time auth fallback and runtime failover, read-only tool allowlist
      with no `bash`/`edit`/`write`.
      Evidence: `.ns/pi/agents/explorer.md` plus `@internal/pi-tools/explore`
      (`contract.ts` allowlist `read,grep,find,ls`; `model-policy.ts` haiku default
      with AuthStorage dispatch-time probe; `dispatch.ts` single-retry runtime
      failover on `error`/`protocol-error`), 17 fake-driven tests, and a real
      end-to-end smoke: haiku child (`anthropic/claude-haiku-4-5`, 13 read-only tool
      calls, $0.055) returned an accurate line-cited four-section scout report on the
      SIGTERM-escalation question. Haiku-recon assumption held in the smoke; the
      no-`bash` risk was not stressed. Fan-out tool and `.pi/extensions/` shim are
      item 3.
- [ ] Model-invocable fan-out tool: parent-facing prompt engineering (parallel calls in
      one message, never delegate understanding, quick/medium/very-thorough breadth
      vocabulary, prefer direct grep/read for known targets) plus depth, concurrency,
      and wall-clock guards.
- [ ] Preview + pointer result plumbing: bounded preview in parent context, full
      findings on disk, retrievable on demand.
- [ ] Live inline progress rendering: placeholder-sentinel per-task rows with status
      icons, recent tool-activity lines, and a done/running counter.
- [ ] Dogfood in real ns work and tune the tool description and scout contract from
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
- [x] Apply the 2026-07-04 critique changes
      (`updates/2026-07-04-objective-critique.md`): fix the stale `.ji/` explorer path
      in `contract.ts`/`testing.ts` and correct the item-2 evidence above; record the
      home-directory-guard child-bypass risk in Assumptions and Risks; soften the
      Thesis's "no result context economy" claim and note the Anthropic-only
      cheap-model policy. Blocked item 3.
      Outcome: code fixes landed on `explorer-dispatch-auth-failover-schema-fix`
      (`contract.ts` now points at `.ns/pi/agents/explorer.md`; all 17 explore tests
      pass). Record edits applied 2026-07-05 alongside moving this record from the
      stale `.sdl/objectives/` root to `.ns/objectives/`. The guard-bypass *decision*
      itself is still open — split into the item below.
- [ ] Decide the explorer-child home-directory-guard bypass (risk recorded in
      objective.md): accept, inject the guard via the `--extension
      runtimeExtensionPath` seam in `subagent-process.ts`, or document why
      prompt-scoping suffices. Record the decision as an update.

## Parked
