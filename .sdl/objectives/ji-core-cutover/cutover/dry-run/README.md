# Dry-run artifacts

Capture area for rehearsal runs of the landing window (runbook §B). Save here, per
run, so nothing has to be reconstructed later:

- `<n>-chunk-<name>-report.json` — the verbatim engine return for each chunk
  invocation (summary, skips, failures, simple, complex, verify).
- `<n>-fix-round-<m>.json` — fix-list args payloads sent to the engine and their
  reports.
- `<n>-invariants.json` — the final chunk's verify results (all 21).
- `<n>-gate.txt` — `pnpm install` + `just` + smoke-test output tails.
- `<n>-findings.md` — what the rehearsal taught: wrong hints, missing sites,
  partition amendments. Fold every finding back into the pipeline inputs
  (`anchors.json`, `brief.md`, `invariants.json`, `classification-decisions.json`)
  and re-run `assemble-plan.py` — the plan JSON is generated, never hand-patched.

Post-mv path sanity check (runbook §A5), runnable any time:

```sh
cd <repo-root> && uv run python - <<'EOF'
import json
from pathlib import Path
plan = json.load(open(".sdl/objectives/ji-core-cutover/cutover/cutover-plan.json"))
def pre_mv(p):
    if p == "ji.toml": return "sdl.toml"
    if p == ".pi/extensions/ji.ts": return ".pi/extensions/sdl.ts"
    if p.startswith(".ji/"): return ".sdl/" + p[4:]
    return p
missing = [e for ch in plan["chunks"] for e in
           ([s["path"] for s in ch["simple"]] + [f for c in ch["complex"] for f in c["files"]])
           if not Path(pre_mv(e)).is_file()]
print(f"{len(missing)} unresolvable:", *missing, sep="\n  ")
EOF
```

(After the mvs have run, drop the `pre_mv` mapping and check the paths directly.)
