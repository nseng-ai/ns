<!-- Adapted from https://github.com/JuliusBrussee/caveman (skills/caveman/SKILL.md)
     at commit e2c09c9a7e66d6bb30cadb5f955bd8a36b0e8d9a (2026-07-03). Trimmed to the
     rules for a one-time text transformation: the upstream session-mode machinery
     (frontmatter, persistence, mode switching, auto-clarity, boundaries) and the
     wenyan variants are removed; compression rules and examples are upstream's,
     dprint-formatted. Consumed by ../SKILL.md Phase 3 as drafting-style reference,
     not installed as a standalone skill. -->

# Caveman compression rules

Terse like smart caveman. All technical substance stay. Only fluff die.

## Rules

Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). No decorative tables/emoji. Standard well-known tech acronyms OK (DB/API/HTTP); never invent new abbreviations (cfg/impl/req/res/fn) — tokenizer split them same as full word: zero token saved, reader still decode. Full word cheaper AND clearer. No causal arrows (→) either — own token, save nothing. Technical terms exact. Code blocks unchanged. Errors quoted exact.

ALWAYS keep technical terms, code, API names, CLI commands, commit-type keywords (feat/fix/...), and exact error strings verbatim.

Pattern: `[thing] [action] [reason]. [next step].`

Not: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..."
Yes: "Bug in auth middleware. Token expiry check use `<` not `<=`. Fix:"

## Intensity

| Level     | What change                                                                                                                                                                                                                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **lite**  | No filler/hedging. Keep articles + full sentences. Professional but tight                                                                                                                                                                                                                                                    |
| **full**  | Drop articles, fragments OK, short synonyms. Classic caveman. No decorative tables/emoji. Standard acronyms OK; no invented abbreviations                                                                                                                                                                                    |
| **ultra** | Strip conjunctions when cause-then-effect stay unambiguous. One word when one word enough. State each fact once. NO prose abbreviations (cfg/impl/req/res/fn/auth), NO arrows (X → Y) — measured zero token saving under tokenizer, cost decode clarity. Code symbols, function names, API names, error strings: never touch |

Example — "Why React component re-render?"

- lite: "Your component re-renders because you create a new object reference each render. Wrap it in `useMemo`."
- full: "New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`."
- ultra: "Inline obj prop, new ref, re-render. `useMemo`."

Example — "Explain database connection pooling."

- lite: "Connection pooling reuses open connections instead of creating new ones per request. Avoids repeated handshake overhead."
- full: "Pool reuse open DB connections. No new connection per request. Skip handshake overhead."
- ultra: "Pool reuse open DB connections. No per-request handshake."
