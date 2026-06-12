# Sources — annotated bibliography

The research basis for this skill's taxonomy, anti-pattern rules, and
"grounded in" notes. Load this file only when the user asks "why" or disputes
a finding. Every entry carries (a) the claim the skill relies on, (b) a
methodology class, (c) a transfer caveat. All URLs and arXiv IDs verified
2026-06-12.

## Methodology classes

The class determines what a source licenses the skill to claim:

- **Class A — synthetic retrieval benchmarks** (single-shot, constructed
  haystacks): directional findings transfer (position matters; semantic
  similarity of distractors matters; degradation begins far below the window
  limit); magnitudes do NOT transfer.
- **Class B — controlled distractor injection**: mechanism evidence;
  semantically adjacent distractors hurt most; distraction changes which
  approach is taken, not just recall.
- **Class C — multi-turn simulation**: the aptitude-loss vs.
  unreliability-increase axis pair transfers; headline percentages are lab
  ceilings.
- **Class D — absence detection**: a fresh session cannot detect what
  compaction or a handoff dropped.
- **Class E — observational anecdote**: vivid mechanism illustration only.
- **Class F — practitioner frameworks**: vocabulary and remediation menus;
  expert priors, not measurements.

## Tier 1 — the frame the skill quotes

### Breunig, "How Long Contexts Fail" (June 2025)

- Drew Breunig.
  <https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html>
- **Claim relied on**: the four-mode diagnosis vocabulary, defined verbatim:
  - _Poisoning_: "when a hallucination or other error makes it into the
    context, where it is repeatedly referenced."
  - _Distraction_: "when a context grows so long that the model over-focuses
    on the context, neglecting what it learned during training."
  - _Confusion_: "when superfluous content in the context is used by the model
    to generate a low-quality response."
  - _Clash_: "when you accrue new information and tools in your context that
    conflicts with other information in the context."
- **Class**: F.
- **Caveat**: a synthesis of other people's results, not a measurement. The
  numbers it quotes (~100k distraction onset, ~32k degradation onset, the 39%
  multi-turn drop) belong to the underlying mid-2025 studies and are not
  universal constants. The four categories overlap in practice (a poisoned
  goal also clashes); no frequency or inter-rater data exists.

### Breunig, "How to Fix Your Context" (June 2025)

- Drew Breunig.
  <https://www.dbreunig.com/2025/06/26/how-to-fix-your-context.html>
- **Claim relied on**: the remediation menu behind this skill's action
  vocabulary — six fixes, each "the act of …": RAG, tool loadout, **context
  quarantine** (isolating contexts in dedicated threads), **context pruning**
  (removing irrelevant or unneeded information), **context summarization**,
  and context offloading. The skill's `prune` and `quarantine` actions take
  their names and intent from this menu; `handoff` combines summarization with
  a fresh thread. Closing stance the rubric inherits: "Context is not free.
  Every token influences the model's behavior" — everything in context must be
  "earning its keep."
- **Class**: F.
- **Caveat**: fix→failure-mode pairings are the author's judgment, not
  validated; cited effect sizes come from heterogeneous vendor or single-paper
  evaluations and don't transfer.

### Anthropic, "Effective Context Engineering for AI Agents" (September 2025)

- Anthropic Applied AI.
  <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
- **Claim relied on**: the attention-budget framing — LLMs have a finite
  attention budget; "every new token introduced depletes this budget";
  curation quality, not raw quantity, drives reliability; degradation is a
  gradient, not a cliff. Mechanistic rationale: n² pairwise attention gets
  stretched thin, and training-length distributions under-prepare models for
  context-wide dependencies — i.e., context rot is architectural, not fixed by
  bigger windows. Long-horizon decision rubric the skill's `handoff` and
  `quarantine` advice leans on: compaction when conversational flow must
  continue; structured note-taking for milestone-driven iteration; sub-agent
  isolation for parallel exploration that returns condensed summaries. This is
  the basis for "handoff was the right call" verdicts.
- **Class**: F.
- **Caveat**: vendor guidance grounded in Anthropic's own products; the
  compaction/note-taking/sub-agent rubric has no comparative evaluation; the
  n² framing is a plausibility argument, not a quantitative predictor.

## Tiers 2–4 — verified at abstract level

### Chroma, "Context Rot" (July 2025)

- Hong, Troynikov, Huber. <https://www.trychroma.com/research/context-rot>
  (the older research.trychroma.com URL redirects here).
- **Claims**: degradation appears even on deliberately simple, controlled
  tasks as input grows; lower needle–question semantic similarity → steeper
  degradation; distractors do not have uniform impact; model-family split —
  Claude models tend to abstain conservatively, GPT models produce confidently
  wrong answers.
- **Class**: A.
- **Caveat**: vendor-published (a retrieval-DB company with a stake in
  "context is fragile" — see the Greyling critique below) and not
  peer-reviewed; directional effects credible, absolute curves are benchmark
  artifacts.

### NoLiMa (ICML 2025)

- Modarressi et al. (Adobe Research). arXiv:2502.05167
  <https://arxiv.org/abs/2502.05167>
- **Claims**: removing lexical overlap between question and needle collapses
  long-context performance (at 32k, 11 of 13 models drop below 50% of their
  short-context baseline). The canonical "percent-full is the wrong metric"
  anchor. "Effective length" — the longest context retaining ≥85% of the
  short-context base score — is defined in the paper body and official repo,
  not the abstract; attribute accordingly.
- **Class**: A.
- **Caveat**: real agent tasks rarely have zero lexical anchors; NoLiMa is a
  worst-case bound, and the 32k cliff magnitude does not transfer.

### Lost in the Middle (TACL 2024)

- Liu et al. arXiv:2307.03172 <https://arxiv.org/abs/2307.03172>
- **Claims**: positional U-curve — performance is highest when relevant
  information sits at the beginning or end of the context and degrades
  significantly mid-context, including for explicitly long-context models.
  Basis for the skill's read-the-edges step.
- **Class**: A.
- **Caveat**: 2023-era models, single-shot retrieval; the U-curve's strength
  varies by model generation — treat position sensitivity as a risk to probe,
  not a fixed law.

### Michelangelo (2024)

- Vodrahalli et al. (Google DeepMind). arXiv:2409.12640
  <https://arxiv.org/abs/2409.12640>
- **Claims**: on latent-structure synthesis tasks (model must "chisel away"
  irrelevant context), frontier models substantially underperform at long
  context — evidence that long context ≠ long reasoning. The
  super-linear-degradation characterization comes from the paper body/figures,
  not the abstract; attribute accordingly.
- **Class**: A.
- **Caveat**: tasks are deliberately non-retrievable-by-search, rarer in real
  agent sessions; use for direction, never magnitude.

### RULER (COLM 2024)

- Hsieh et al. (NVIDIA). arXiv:2404.06654 <https://arxiv.org/abs/2404.06654>
  (ID verified — previously flagged as recalled-from-memory.)
- **Claims**: claimed vs. effective context length — of models advertising
  ≥32k windows, only about half maintain satisfactory performance at 32k.
- **Class**: A.
- **Caveat**: 2024 model cohort; the rankings are stale, but the
  claimed≠effective distinction transfers.

### GSM-IC (ICML 2023)

- Shi et al. arXiv:2302.00093 <https://arxiv.org/abs/2302.00093>
- **Claims**: "Large Language Models Can Be Easily Distracted by Irrelevant
  Context" — adding irrelevant information dramatically decreases performance
  on otherwise-solved problems. The finer findings the skill leans on —
  single-sentence granularity, and topic-relevant / entity-overlapping
  distractors hurting most — are paper-body results, not abstract claims. This
  is the basis for weighting semantically adjacent stale content above inert
  bulk.
- **Class**: B.
- **Caveat**: grade-school arithmetic with 2022/23-era models; the mechanism
  (distractor similarity matters more than volume) transfers far better than
  the effect sizes.

### GSM-DC (2025)

- Yang et al. arXiv:2505.18761 <https://arxiv.org/abs/2505.18761> (paper
  title: "How Is LLM Reasoning Distracted by Irrelevant Context?")
- **Claims**: with precisely controlled distractor injection, irrelevant
  context affects _reasoning-path selection_, not just final-answer accuracy —
  distractors derail the trajectory.
- **Class**: B.
- **Caveat**: synthetic symbolic math graphs; the transferable insight for
  agents is that a derailed path compounds across subsequent tool calls, not
  any number.

### AbsenceBench (NeurIPS 2025)

- Fu et al. arXiv:2506.11440 <https://arxiv.org/abs/2506.11440>
- **Claims**: "Language Models Can't Tell What's Missing" — models fail to
  identify deliberately removed content _even when given both the original and
  edited documents_ (Claude-3.7-Sonnet ≈ 69.6% F1 at ~5k average context).
  Proposed mechanism: attention cannot attend to gaps — absences have no keys.
  Basis for never assuming a continued/compacted session's context is
  complete, and for the parked handoff-completeness-scoring enhancement.
- **Class**: D.
- **Caveat**: agents are usually asked "what's missing?" with no original to
  diff against — expect worse than benchmark numbers, not better.

### "LLMs Get Lost in Multi-Turn Conversation" (2025)

- Laban, Hayashi, Zhou, Neville (Microsoft Research + Salesforce Research).
  arXiv:2505.06120 <https://arxiv.org/abs/2505.06120>
- **Claims**: in 200k+ simulated sharded-instruction conversations, an average
  39% multi-turn performance drop, decomposed into a minor aptitude loss and a
  significant unreliability increase; models anchor on premature early
  solution attempts and "when LLMs take a wrong turn... they get lost and do
  not recover." The specific ~15–16% aptitude / ~112% unreliability split is a
  paper-body figure (the abstract gives only the 39% and the qualitative
  split). Basis for clash diagnoses on superseded early attempts.
- **Class**: C.
- **Caveat**: the simulated user is an LLM following a sharding protocol;
  headline percentages are lab ceilings (see the Arani critique below); the
  aptitude-vs-unreliability axis is what transfers.

### Gemini-plays-Pokémon observation

- Gemini 2.5 technical report (Google DeepMind), arXiv:2507.06261
  <https://arxiv.org/abs/2507.06261>; popularized via Breunig.
- **Claim**: as context grew significantly beyond 100k tokens, the agent
  favored "repeating actions from its vast history rather than synthesizing
  novel plans" — the vivid mechanism picture behind distraction diagnoses.
- **Class**: E.
- **Caveat**: single agent harness, N=1 game, vendor-reported; an
  illustration, never evidence of a threshold.

### LongMemEval (ICLR 2025)

- Wu et al. arXiv:2410.10813 <https://arxiv.org/abs/2410.10813>
- **Catalogue entry**: 500-question benchmark of five long-term interactive
  memory abilities across multi-session chat histories; commercial assistants
  show ~30% accuracy drops on sustained-interaction memory. Catalogued for
  future multi-session work; not load-bearing for this skill.

## Tiers 5–6 — catalogue

- **Manus, "Context Engineering for AI Agents: Lessons from Building Manus"**
  (Yichao Ji).
  <https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus>
  — KV-cache hit rate as the production metric (stable prefixes, append-only
  context); mask tools rather than remove them; keep failed actions in context
  so the model updates its beliefs. Class F. Caveat: production lore, not
  measurement — and a counterweight to over-eager `prune` advice: some error
  content is load-bearing for recovery.
- **Cognition, "Don't Build Multi-Agents"** (Walden Yan).
  <https://cognition.ai/blog/dont-build-multi-agents> — share full traces, not
  summaries; compress at handoff with a dedicated model; parallel subagents
  make conflicting implicit decisions. Class F. Caveat: opinionated position
  paper; tempers `quarantine` advice — isolation has coordination costs.
- **langchain-ai/how_to_fix_your_context** (GitHub, archived March 2026).
  <https://github.com/langchain-ai/how_to_fix_your_context> — notebook
  implementations of all six Breunig fixes, framed against the four failure
  modes. Reference implementation; reflects mid-2025 APIs.
- **16x Eval, "LLM Context Management Guide"**.
  <https://eval.16x.engineer/blog/llm-context-management-guide> — practitioner
  hygiene guidance (effective length < advertised; audit context consumers;
  fresh sessions). Class F; benchmark citations are secondhand.
  **Fiction.liveBench** (<https://fiction.live/stories/Fiction-liveBench-Mar-25-2025/oQdzQvKHw8JyXbN87>,
  mirrored at <https://epoch.ai/benchmarks/fictionlivebench>) is the living
  long-context degradation leaderboard — relevant to the parked per-model
  effective-length enhancement.
- **Cobus Greyling, "LLM Context Rot"**.
  <https://cobusgreyling.medium.com/llm-context-rot-28a6d0399655> — critique
  of the Chroma report: "If long contexts prove detrimental as claimed, it
  bolsters Chroma's RAG ecosystem; if not, it could be seen as marketing
  spin." Mild — flags the conflict of interest without disputing the data.
- **Reza Arani, "Are Large Language Models Really 'Lost' in Multi-Turn
  Conversations?"** (July 2025).
  <https://medium.com/@reza.arani/are-large-language-models-really-lost-in-multi-turn-conversations-0f2980ab25af>
  — argues the 39% drop is substantially simulator artifact (forced
  one-shard-per-turn pacing, self-contradictory prompts, no memory
  management; the paper's own recap ablations recover 15–20 points).
  Well-managed real sessions should degrade less. Reanalysis without new
  experiments; the skill's anti-pattern rule 2 already encodes this caveat.

## Cross-source note

The Tier 1 frameworks are mutually reinforcing but not independent: Breunig's
June 2025 pair predates and is conceptually congruent with Anthropic's
September 2025 piece (quarantine/summarization/offloading ≈
sub-agents/compaction/note-taking). Class F sources license terminology and
remediation menus, never effect sizes. The Greyling and Arani entries are kept
deliberately as counterweights: when a finding leans on Chroma or the
multi-turn paper, their caveats apply.
