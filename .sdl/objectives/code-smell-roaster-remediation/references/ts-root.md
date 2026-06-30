# ts/root -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 2 confirmed finding(s) (0 high, 2 medium, 0 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/root

1. **Shotgun Surgery** (medium) -- `ts/vitest.config.ts:13-17`
   - Roast: Adding a new test category means editing three different files in lockstep -- a new const in vitest.shared.ts, a new vitest.<category>.config.ts, and a new exclude entry here -- with nothing enforcing that the exclude list and the new config's include actually stay in sync.
   - Evidence: exclude: [...configDefaults.exclude, ...INTEGRATION_TEST_GLOBS, ...TYPESCRIPT_STYLE_GUARD_TEST_GLOBS] manually re-lists every specialized category's globs so the default run won't double-execute them; each new category requires touching this array plus its own config file plus vitest.shared.ts.
   - Smallest fix: Have vitest.shared.ts export a single registry of {category, globs} entries; derive both each specialized config's include and the main config's exclude from that one registry so a new category is a one-place edit.

2. **Duplicated Code** (medium) -- `ts/vitest.shared.ts:1-9`
   - Roast: Three configs hand-roll the exact same 'packages/*/test/<X>/**/*.test.ts' + 'packages/*/*/test/<X>/**/*.test.ts' glob pair with only the directory name changed, instead of admitting it's one parameterized shape.
   - Evidence: INTEGRATION_TEST_GLOBS and TYPESCRIPT_STYLE_GUARD_TEST_GLOBS each repeat the two-line glob-pair literal (vitest.shared.ts:1-9), and vitest.config.ts:12 repeats the identical shape again for the default/unit case ('packages/*/test/**/*.test.ts', 'packages/*/*/test/**/*.test.ts').
   - Smallest fix: Extract a `testGlobsFor(subdir?: string)` helper that returns the two-pattern pair for a given category name (or empty for the default), and have all three call sites use it.
