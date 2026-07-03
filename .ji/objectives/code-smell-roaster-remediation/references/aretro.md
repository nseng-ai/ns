# ts/packages/aretro -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 5 confirmed finding(s) (0 high, 3 medium, 2 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/aretro/src

1. **Duplicated Code** (medium) -- `ts/packages/aretro/src/sessions/evidence.ts:535-551`
   - Roast: The exact same 'truncate a long command and tack on a sha256 prefix' trick is hand-rolled twice in this module with different field names, so nobody editing the truncation policy will remember to touch both copies.
   - Evidence: evidence.ts `boundedCommandSubject` truncates at MAX_SUBJECT_LENGTH=500 and emits `{subjectTruncated, commandSha256Prefix}`, while payloads/evidence-payload.ts `commandSubjectForPayload` (lines 189-207) truncates at a 120-char prefix with a different threshold (500) and emits `{truncated, originalLength, sha256Prefix}` — same shape, already-diverged field names and constants.
   - Smallest fix: Extract one `boundedCommandSubject(command, { prefixLength, hashPrefixLength })` helper (e.g. in a shared module) with one metadata shape, and have both evidence.ts and evidence-payload.ts call it.

2. **Data Clumps** (medium) -- `ts/packages/aretro/src/sessions/types.ts:53-72`
   - Roast: Truncation metadata travels as an identical four-field bundle through two different interfaces, just wearing a different name tag each time.
   - Evidence: SessionToolResult has `text_length`, `line_count`, `truncated`, `source_ref`; SessionCommandExecution has the same shape as `output_length`, `line_count`, `truncated`, `source_ref` — same clump, renamed length field.
   - Smallest fix: Extract a shared `TruncatableOutput { length: number | null; line_count: number | null; truncated: boolean | null; source_ref: SessionSourceRef | null }` and embed it in both interfaces instead of re-declaring the same four fields twice under different names.

3. **Primitive Obsession** (medium) -- `ts/packages/aretro/src/sessions/types.ts:25`
   - Roast: `confidence: string` lets you type 'definitely', '100%', or a typo just as happily as the five actual codes the only producer emits.
   - Evidence: SessionAssociation declares `confidence: string`, but pi-jsonl-source.ts (the sole producer) only ever assigns one of `"unknown" | "query-repo-root" | "cwd" | "repo-cwd" | "cwd-mismatch"` (lines 560, 569, 578, 583).
   - Smallest fix: Replace `confidence: string` with a string-literal union of the closed set already in use, so the compiler rejects stray values instead of silently accepting any string.

4. **Data Clumps** (low) -- `ts/packages/aretro/src/contracts.ts:42-48`
   - Roast: The trio {path, uri, lineNumber} gets re-declared as its own independent type/schema in three different files (sessions/types.ts SessionSourceRef, contracts.ts SessionSourceRefDto, evidence-payload.ts PayloadSourceRefDto) instead of being one shared value type, so every layer needs its own bespoke converter just to ferry the same three fields across a boundary.
   - Evidence: `sessionSourceRefDtoSchema` (contracts.ts:42-48) duplicates `SessionSourceRef` (sessions/types.ts:7-11) duplicates `payloadSourceRefDtoSchema` (evidence-payload.ts:36-40), wired together by `sourceRefToDto` (collect-evidence.ts:520-526), `optionalSourceRefToDto` and `dtoSourceRefToPayload` (evidence-payload.ts:464-481).
   - Smallest fix: Define one canonical SourceRef schema/type and reuse it (or a thin alias) at every layer instead of re-declaring it per-DTO, collapsing the three converter functions into one.

5. **Duplicated Code** (low) -- `ts/packages/aretro/src/sessions/pi-jsonl-source.ts:182-216`
   - Roast: `query()` stats the session root and then stats the repo-session directory using two copy-pasted try/stat/isDirectory blocks that only differ in which error codes they report.
   - Evidence: Lines 182-197 (`statSync(sessionRoot)` -> `session-root-not-directory`/`session-root-missing`) and lines 201-216 (`statSync(repoSessionDir)` -> `repo-session-dir-not-directory`/`repo-session-dir-missing`) are the same stat-catch-isDirectory shape repeated verbatim.
   - Smallest fix: Extract a `requireDirectory(path, { notDirectoryCode, missingCode })` helper returning the warningResult or null, and call it twice.
