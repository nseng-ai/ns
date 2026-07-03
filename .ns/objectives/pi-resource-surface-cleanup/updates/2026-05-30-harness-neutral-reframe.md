# Harness-Neutral Reframe

## Summary

Reframed the Objective from Pi-only resource-surface cleanup into harness-neutral agent-resource cleanup targeting Pi, Codex, and Claude first.

Key analysis:

- The Pi RPC inventory remains valid evidence for Pi's visible slash-command surface, but it is only one harness-specific projection of the repo's broader agent capability surface.
- Repo-owned skills under `skills/<name>/SKILL.md`, surfaced through `.agents/skills/` and `.claude/skills/`, are the strongest existing portable workflow layer for Codex and Claude.
- `AGENTS.md` and `CLAUDE.md` should route agents to skills, docs, and CLIs rather than duplicate long workflow bodies.
- No dedicated `.codex/` surface exists in this checkout today, so Codex support should start from `AGENTS.md`, repo-owned skills, and CLI/docs workflows unless later evidence shows a concrete gap.
- The duplicate `/objective-stack-impl` cleanup must not simply hide or delete the only portable prompt-like workflow; it should leave a clear Pi public entrypoint and a Codex/Claude-usable path.
- The `/land` disposition must say what non-Pi agents should do, especially because it mutates GitHub state.

## Objective Impact

The Objective slug remains `pi-resource-surface-cleanup`, but the title, scope, completion criteria, assumptions, risks, open questions, and roadmap now treat Pi as the first audited harness rather than the only target.

Closure now requires a per-capability disposition that names the portable core, Pi entrypoint, Codex path, Claude path, safety/testing expectations, and any harness-specific caveats for closure-critical workflows. The next implementation slice should update the checked-in resource policy docs with that harness-neutral framing before or alongside resolving `/objective-stack-impl`.

## Follow-Ups

- Update `docs/pi/README.md` or create/link an adjacent harness-neutral agent doc so the checked-in policy reflects Pi, Codex, and Claude rather than Pi alone.
- Inventory Pi RPC commands plus Codex/Claude-relevant checked-in skill and instruction surfaces after the reframe.
- Resolve `/objective-stack-impl` by keeping one Pi public entrypoint while preserving a portable Objective-stack implementation path.
- Decide `/land` with explicit Pi, Codex, and Claude guidance.
