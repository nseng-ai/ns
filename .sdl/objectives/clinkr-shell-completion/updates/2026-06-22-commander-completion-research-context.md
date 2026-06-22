# Commander Completion Research Context

## Summary

Additional Commander.js completion research confirms the Objective's design premise: Commander intentionally does not ship built-in shell completion. Maintainer comments frame this as a scope and maintenance-burden decision driven by shell/platform setup, Windows/PowerShell implications, philosophical disagreement about whether completion belongs in a lean parser, and the absence of a maintained Commander-native library that integrates cleanly. Commander 15 still has no native completion support.

Community approaches remain useful as design evidence but not as direct dependencies. Older Commander packages such as `commander-completion`, `commander-auto-complete`, tabtab/autocmdr, and Omelette-era approaches are stale or narrow. Recent Commander options either require an external engine such as Carapace or cover only Bash. By contrast, yargs and oclif show that completion works best when the framework owns enough command-tree and shell integration machinery.

## Objective Impact

This strengthens the architecture direction: Clinkr should treat completion as a first-party primitive over its own surface metadata rather than delegating to a Commander plugin. The first roadmap row now explicitly calls out this boundary, and the Objective narrative records the Commander maintainer rationale, recent package landscape, and the need for a final current-issue scan before implementation or documentation.

## Follow-Ups

- When implementing the architecture slice, decide whether reusable visible `completion <shell>` and hidden resolver helpers belong in Clinkr or only in SDL.
- Before final docs or closure, perform a quick 2025-2026 Commander issue/discussion scan to confirm no late revival changes the research baseline.
- Keep PowerShell/Windows and per-shell script generation as explicit risk/cost centers rather than accidental scope creep.
