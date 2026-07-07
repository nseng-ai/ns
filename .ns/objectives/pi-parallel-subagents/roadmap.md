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
- [x] Model-invocable fan-out tool: parent-facing prompt engineering (parallel calls in
      one message, never delegate understanding, quick/medium/very-thorough breadth
      vocabulary, prefer direct grep/read for known targets) plus depth, concurrency,
      and wall-clock guards.
      Outcome: `@internal/pi-tools/explore/extension` registers `explore` with 2+
      task schema validation, quick/medium/very-thorough breadth caps, bounded ordered
      concurrency, TimerScheduler-backed wall-clock aborts, compact progress updates,
      friendly `.ns/pi/agents/explorer.md` configuration errors, first-pass capped child
      final-text excerpts, and the repo-local `.pi/extensions/explore.ts` shim. Tests:
      focused explore Vitest suite (24 tests), `pnpm --dir ts run check`, lint, and
      format check passed on branch `explore-fan-out-tool`. Item 4 preview/pointer and
      item 5 live widget remain open.
- [x] Direct parent-context findings shaping: bounded scout findings are returned
      directly in parent context (target caps: about 8k chars per task and 32k total),
      and existing child Pi session files remain the overflow/debug path. No new
      durable findings artifact, retrieval handle, or retrieval command is intended for
      this slice.
      Outcome: `@internal/pi-tools/explore` now uses product-intent direct-result caps
      (`8_000` per task, `32_000` total), result copy points truncation overflow at
      the child Pi session file, and fake-driven tests cover partial success, total
      failure, wording regression, and multi-task total-cap behavior. Validation:
      focused explore Vitest suite, `pnpm --dir ts run check`, lint, and format check
      passed on branch `direct-parent-context-scout-findings`.
- [x] Live inline progress rendering: placeholder-sentinel per-task rows with status
      icons, recent tool-activity lines, and a done/running counter.
      Outcome: `@internal/pi-tools/explore` now emits a display-only
      `ns.explore.progress` widget through the existing safe runner-subagent widget
      helper while preserving compact `onUpdate` progress for non-UI/transcript
      sessions. Widget rows stay in input order, show queued/running/success/failure
      icons, recent child activity/tool text, and done/running counts, then clear on
      completion. Validation: focused explore Vitest suite, `pnpm --dir ts run check`,
      lint, and format check passed on branch `explore-live-inline-progress-rendering`.
- [x] Decide the explorer-child home-directory-guard bypass (risk recorded in
      objective.md): accept, inject the guard, or document why prompt-scoping
      suffices. Injection is not an existing seam: `buildChildPiArgs` takes
      `--extension` only from generated terminal-runtime files, and
      `RunnerSubagentOptions` has no caller-facing extension-injection surface, so
      that option costs a small plumbing slice (new option, threading, coexistence
      with the terminal runtime extension, tests).
      Outcome: accept prompt-level local policy for dogfooding. Explorer children
      still launch with `--no-extensions` and the read-only tool allowlist; the
      explorer prompt now instructs children to read and obey root `AGENTS.local.md`
      when present. This checkout's `AGENTS.local.md` is ignored/local-only and
      carries the workstation-specific home-root rule. This is not a capability
      sandbox or extension-equivalent guard. Evidence:
      `updates/2026-07-05-explorer-local-policy-decision.md`.
- [x] Dogfood in real ns work and tune the tool description and scout contract from
      observed transcripts. Unblocked by the local-policy decision above; use the
      root `AGENTS.local.md` convention during dogfood and record whether
      prompt-level scope guidance is sufficient.
      Outcome: human dogfooding feedback on 2026-07-05 confirmed the current feature set
      has been dogfooded enough to proceed; no immediate prompt-level scope or scout
      contract tuning was requested. The earlier positive signal already moved the work
      toward packaging, and `updates/2026-07-05-dogfood-current-features.md` records the
      dogfood-so-far evidence.
- [x] Create `ns-pi-subagents` as a properly formed Pi extension package for the
      dogfooded explore/subagent capability. Preserve the engineered implementation's
      tested core while replacing repo-local extension-shim assumptions with a clean
      package boundary, install/registration surface, and package-level docs.
      Outcome: `@nseng-ai/ns-pi-subagents` is a private workspace Pi extension package
      under `ts/packages/extensions/ns-pi-subagents`, with package manifest `pi.extensions`,
      package-level README, public subpath exports, migrated explore source/tests, and a
      repo-local `.pi/extensions/explore.ts` shim that imports the package entrypoint
      instead of internal implementation code. Package validation passed with
      `pnpm --dir ts --filter @nseng-ai/ns-pi-subagents run check` and `pnpm --dir ts
      --filter @nseng-ai/ns-pi-subagents run test` (5 files / 29 tests). A follow-on
      package-quality refactor split explore result/progress/type plumbing into focused
      modules and made dispatch consume a validated explorer definition directly; PR
      #3005 records that review-remediation evidence.
- [x] Fleet widget and transcript viewer (monitoring layers 2–3): persistent live list
      of background/running explorers plus drill-in transcript view backed by on-disk
      session JSONL. Non-blocking for completion.
      Outcome: implemented as a session-local explore fleet widget plus
      `ns:explore:transcript` command backed by child Pi session JSONL files. The fleet
      state uses a generic runner-subagent fleet registry in `@internal/pi-tools`; no
      durable fleet index was added. Evidence:
      `updates/2026-07-05-optional-follow-ons-implemented.md`.
- [x] In-process runtime adapter behind a runtime seam for context-forking use cases
      (subprocess remains the default). Non-blocking for completion.
      Outcome: implemented as an explicit `ExplorerRuntime` seam with subprocess as the
      default runtime and a non-default fake-covered in-process runtime adapter available
      by injection. Evidence:
      `updates/2026-07-05-optional-follow-ons-implemented.md`.
- [x] Consolidation assessment: whether the chosen substrate can subsume
      `dispatchRunnerSubagent` and thermo-council's orchestration. Expected to park.
      Outcome: do not subsume `dispatchRunnerSubagent`, and park shared orchestration
      consolidation for thermo-council. Explore and thermo-council already share the
      right low-level substrate (`dispatchRunnerSubagent`, `mapWithConcurrency`,
      activity/progress helpers) while retaining divergent capability policy for
      final-text scouts vs. terminal-capture review seats. Evidence:
      `updates/2026-07-05-consolidation-assessment.md`.
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
      itself is still open — split into its own item, now sequenced before dogfood.

## Parked

- Shared higher-level parallel subagent orchestration for explore + thermo-council is
  intentionally parked. Reassess only if a future third caller demonstrates a neutral
  scheduler/progress abstraction that preserves capability-specific result contracts,
  recovery, and reporting without coupling the tools together. Monitoring/runtime
  integration is no longer parked: thermo-council now uses the generic agents fleet and
  runtime seam through `@nseng-ai/ns-pi-subagents/api` while keeping orchestration local
  (see `updates/2026-07-06-council-monitoring-consolidation.md`).
