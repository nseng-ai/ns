# Flow model performance benchmark

**Run date:** 2026-08-25\
**Branch:** `update-luna-fast-model-selection`\
**Benchmark anchor:** `6abca4578` (`[accountable] Establish generation-aware snapshot reconciliation contracts`)\
**Models:** GPT-5.6 Luna, Terra, and Sol, including each Fast variant\
**Route:** Vercel AI Gateway, OpenAI-direct models

## Summary

For `ns flow changes` and `ns flow cp`, Luna Fast with minimal thinking is the best default among the models tested.

The final sequential benchmark found:

- Luna Fast completed a long, cold-prompt generation 35% faster than Luna at minimal thinking.
- Terra Fast was 42% faster than Terra at minimal thinking and 46% faster at high thinking.
- Sol Fast was 20% faster than Sol at minimal thinking and 23% faster at high thinking.
- Short Flow summaries took about two to three seconds for nearly every model. Fixed request overhead compressed the Fast advantage to fractions of a second.
- Higher thinking did not improve the practical quality of this constrained summarization task.
- At undiscounted list prices, Terra and Sol cost far more than Luna Fast without a useful quality gain for Flow summaries.

The earlier concurrent benchmark understated Fast performance. Its prompts were cached, its outputs were short, and concurrent requests introduced gateway queueing noise. The sequential benchmark corrected those weaknesses.

## Decision

Keep this configuration for Flow summary and checkpoint-message operations:

```toml
[models.profiles.fast]
model = "vercel-ai-gateway/openai/gpt-5.6-luna-fast"
thinking = "medium"
```

The benchmark itself supports **minimal** thinking for these operations. If operation routing can select a lower thinking level without changing unrelated `fast` consumers, use Luna Fast with minimal thinking for `changes-summary` and `checkpoint-message`.

Do not choose Terra or Sol for these operations based only on their current discounted prices. Their list-price premium did not buy a meaningful improvement in the tested outputs.

## Workloads

The benchmark used a historical change large enough to expose input-processing and sustained-generation differences:

- Commit: `6abca4578`
- Files changed: 27
- Additions: 1,459
- Deletions: 1,071
- Raw diff: about 226 KB
- Model-reported prompt size: about 52,900 tokens

Two output workloads used the same diff:

1. **Short Flow summary.** One to four reviewer-facing bullets and a branch slug. Responses were about 180 to 240 output tokens.
2. **Long technical review.** A requested 1,200 to 1,500-word review covering architecture, contracts, tests, risks, omissions, and verification. Responses were roughly 1,350 to 1,750 words.

The short workload approximates `ns flow changes`. Its generation shape also resembles the terse checkpoint message produced by `ns flow cp`. The long workload is diagnostic. It creates enough sustained output to reveal differences that a 200-token response hides.

## Final method

The final benchmark made 72 calls:

- Six models
- Two thinking levels: `minimal` and `high`
- Two workloads: short and long
- Three repetitions per combination

Calls ran sequentially in a deterministic randomized order. Each prompt began with a unique marker before the diff. This prevented reuse of the large prompt prefix. The gateway reported about 52,900 cache-write tokens and no cache reads for 71 of 72 calls. One Terra Fast call unexpectedly used the cache.

Each call used:

- Vercel AI Gateway
- The OpenAI-direct model route
- No tools
- No extensions, skills, prompt templates, or repository context files
- An ephemeral Pi session
- The same workload instructions and diff apart from the unique marker

The benchmark recorded:

- Time from request start to first visible text
- Time from request start to completed response
- Output tokens
- Response text
- Gateway-reported cost
- Cost recalculated at undiscounted list prices

Latency tables report the median of three runs. A median limits the effect of one queueing spike but does not make three runs statistically strong. These results are suitable for choosing a practical default, not for claiming provider-wide service-level performance.

## Short Flow summary results

### Minimal thinking

| Model      | First text | Total time | Output tokens | Valid outputs |
| ---------- | ---------: | ---------: | ------------: | ------------: |
| Luna       |     2.34 s |     2.73 s |           219 |           3/3 |
| Luna Fast  |     2.15 s | **2.46 s** |           238 |           3/3 |
| Terra      |     1.72 s |     2.51 s |           178 |           3/3 |
| Terra Fast |     1.81 s | **2.41 s** |           198 |           3/3 |
| Sol        |     2.59 s |     3.08 s |           201 |           3/3 |
| Sol Fast   |     1.48 s | **2.45 s** |           233 |           3/3 |

Fast improvement in median total time:

- Luna Fast: 10%
- Terra Fast: 4%
- Sol Fast: 21%

### High thinking

| Model      | First text | Total time | Output tokens | Valid outputs |
| ---------- | ---------: | ---------: | ------------: | ------------: |
| Luna       |     1.31 s |     4.09 s |           231 |           2/3 |
| Luna Fast  |     0.94 s |     2.36 s |           235 |           3/3 |
| Terra      | **0.46 s** |     2.43 s |           184 |           3/3 |
| Terra Fast |     1.87 s | **1.95 s** |           212 |           3/3 |
| Sol        |     2.00 s |     2.78 s |           190 |           3/3 |
| Sol Fast   |     1.83 s | **1.96 s** |           192 |           3/3 |

Fast improvement in median total time:

- Luna Fast: 42%
- Terra Fast: 20%
- Sol Fast: 30%

One Luna high-thinking response omitted the required slug. Every other short response passed the expected Flow format.

The short results should not be overread. Request startup, gateway routing, and time to first text account for most of a two-to-three-second response. The model has little sustained generation work in which to demonstrate a throughput advantage.

## Long technical review results

### Minimal thinking

| Model      |  First text |  Total time | Approximate words |
| ---------- | ----------: | ----------: | ----------------: |
| Luna       |      7.49 s |     27.13 s |             1,737 |
| Luna Fast  |  **4.03 s** | **17.50 s** |             1,671 |
| Terra      |      7.47 s |     37.73 s |             1,645 |
| Terra Fast |  **5.17 s** | **21.98 s** |             1,644 |
| Sol        |     17.38 s |     46.40 s |             1,386 |
| Sol Fast   | **16.92 s** | **37.08 s** |             1,366 |

Fast improvement in median total time:

- Luna Fast: 35%
- Terra Fast: 42%
- Sol Fast: 20%

### High thinking

| Model      |  First text |  Total time | Approximate words |
| ---------- | ----------: | ----------: | ----------------: |
| Luna       |  **2.96 s** | **26.46 s** |             1,689 |
| Luna Fast  |      5.26 s |     34.31 s |             1,702 |
| Terra      |     14.20 s |     42.65 s |             1,670 |
| Terra Fast |  **4.85 s** | **23.12 s** |             1,660 |
| Sol        |     22.71 s |     52.78 s |             1,400 |
| Sol Fast   | **20.39 s** | **40.52 s** |             1,453 |

Fast improvement in median total time:

- Luna Fast: 30% slower
- Terra Fast: 46% faster
- Sol Fast: 23% faster

Luna Fast at high thinking was unstable. Its three long runs took about 23, 34, and 56 seconds. Regular Luna stayed near 25 to 27 seconds. Three runs cannot distinguish model behavior from serving or queueing behavior, but this result gives no reason to use high thinking for Flow summaries.

The long workload exposed the expected Fast advantage for five of the six base/Fast comparisons. Terra Fast showed the clearest and most consistent gain. Sol Fast also improved consistently. Luna Fast improved strongly at minimal thinking but not at high thinking.

## Quality observations

The short Flow task had a low quality ceiling. The prompt supplied the full diff and prescribed a narrow output contract. All models identified the main work:

- The move from history-dependent reconciliation to complete target snapshots
- Generation-aware cursors and compare-and-swap behavior
- Durable pending reconciliation plans
- Gateway simplification
- SQLite and in-memory conformance coverage

Higher thinking did not consistently identify important facts that minimal thinking missed. Terra and Sol did not produce a practical improvement that justified their list-price premium for this task.

The long reviews were not scored by an independent judge. Their purpose was to expose latency under sustained generation, not to rank review quality. Word count also varied across models, so total latency is not a pure tokens-per-second measurement.

## Pricing basis

The benchmark ran during temporary Vercel pricing promotions. The observed effective rates should not be treated as the durable model ladder.

As of 2026-08-25:

| Model | List input/output per million | Current effective input/output per million | Promotion |
| ----- | ----------------------------: | -----------------------------------------: | --------: |
| Terra |                $2.50 / $15.00 |                             $2.00 / $12.00 |   20% off |
| Sol   |                $4.00 / $20.00 |                             $2.00 / $10.00 |   50% off |

The Terra and Sol promotions happen to produce the same current input price. At list price, Sol input costs 60% more than Terra and Sol output costs 33% more. The apparent Terra/Sol price convergence is promotional, not structural.

The report uses these undiscounted rates per million tokens:

| Model      | Input | Output | Cache read | Cache write |
| ---------- | ----: | -----: | ---------: | ----------: |
| Luna       | $0.20 |  $1.20 |      $0.02 |       $0.25 |
| Luna Fast  | $0.40 |  $2.40 |      $0.04 |       $0.25 |
| Terra      | $2.50 | $15.00 |      $0.25 |      $3.125 |
| Terra Fast | $5.00 | $30.00 |      $0.50 |      $3.125 |
| Sol        | $4.00 | $20.00 |      $0.40 |       $5.00 |
| Sol Fast   | $8.00 | $40.00 |      $0.80 |       $5.00 |

Terra and Sol input/output prices come from their stated list prices. Cache rates and Fast list prices were inferred by reversing the observed discounts and applying the observed Fast multiplier. Vercel did not expose every Fast field directly in the evidence reviewed, so those values remain estimates.

These prices apply to the OpenAI-direct route used by the benchmark. Azure, Bedrock, or another failover route can have different prices. The 52,900-token sample stayed in the short-context tier. Requests crossing a provider's long-context threshold can reprice the entire input.

## Full-price cost of the final benchmark

Each row covers 12 cold calls: three repetitions of each workload at both thinking levels.

| Model      | Six short calls | Six long calls | Twelve-call total |
| ---------- | --------------: | -------------: | ----------------: |
| Luna       |          $0.081 |         $0.100 |        **$0.181** |
| Luna Fast  |          $0.083 |         $0.122 |        **$0.205** |
| Terra      |          $1.010 |         $1.288 |        **$2.298** |
| Terra Fast |          $1.029 |         $1.411 |        **$2.441** |
| Sol        |          $1.611 |         $1.978 |        **$3.589** |
| Sol Fast   |          $1.637 |         $2.418 |        **$4.055** |

The undiscounted estimate for all 72 calls is **$12.77**. The gateway charged about **$8.00** under the effective promotional rates.

For these cold workloads:

- Terra cost about 11 to 13 times Luna Fast.
- Sol cost about 18 times Luna Fast.
- Sol cost about 56% more than Terra across the full 12-call set.
- Fast variants added a modest cost premium relative to their base model because cold input cache writes dominated the bill.

Warm repeated prompts would cost much less. A previous run with a 52,900-token cache read cost roughly one tenth as much as writing the cold prompt. Flow usually summarizes a novel diff, so the cold-input result is the safer planning assumption.

## Why the first benchmark looked flat

The initial benchmark produced little separation between models because:

1. It requested only about 200 output tokens.
2. Repeated prompts became cache reads.
3. Eighteen calls ran concurrently.
4. One run per condition could not separate queueing from inference.
5. End-to-end timing included Pi startup, authentication, gateway routing, provider scheduling, inference, streaming, and shutdown.

Under those conditions, most calls finished in three to five seconds. Fixed overhead and queueing swamped differences in model throughput.

The sequential cold-prompt benchmark retained the short result but added a long generation. That made the distinction visible: short Flow calls remain close, while sustained output shows a 20% to 46% Fast improvement in most comparisons.

## Limitations

- Three repetitions provide a median, not a stable latency distribution.
- The benchmark measured one Vercel route on one day. Provider capacity and routing can change.
- A unique marker forced cold prompt processing but slightly changed each request.
- Time to first text was measured from Pi's assistant-message start event, not from the instant the HTTP request left the process.
- Output-token usage may include provider reasoning tokens. It is not a clean visible-text throughput measure.
- The long workload did not use Flow's production output limit. It was designed to expose generation speed.
- Long-review quality was inspected informally rather than judged blind.
- List-price cache and Fast rates include stated assumptions where Vercel's UI did not expose a direct value.
- One Terra Fast long/high call unexpectedly read the prompt cache despite the unique marker.

## Recommendation

Use **Luna Fast with minimal thinking** for Flow change summaries and checkpoint messages.

It offers the useful part of the Fast tradeoff:

- Low list price
- Valid short outputs in every minimal-thinking run
- Competitive two-to-three-second short latency
- A 35% long-generation improvement over Luna at minimal thinking
- Only a modest cold-input cost increase over Luna

Terra Fast is the strongest latency option if speed matters regardless of price, but it cost roughly 12 times Luna Fast at list price in this benchmark. Sol Fast costs more again and remained slower than Luna Fast and Terra Fast on the long workload.

Revisit this decision if any of these conditions change:

- Flow begins requesting substantially longer outputs.
- The model route or provider changes.
- Vercel's promotions expire or list prices change.
- Production measurements show repeated cache hits rather than cold diffs.
- A quality-sensitive Flow operation demonstrates a repeatable Terra or Sol advantage.
