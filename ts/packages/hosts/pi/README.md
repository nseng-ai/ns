# @nseng-ai/pi

Private helpers and project-local extension implementations for this repository's Pi harness integration.

## Model shortcuts

The model shortcut extension registers this fixed command catalog:

| Command               | Default model                                     |
| --------------------- | ------------------------------------------------- |
| `/model:fable`        | `vercel-ai-gateway/anthropic/claude-fable-5`      |
| `/model:sonnet`       | `vercel-ai-gateway/anthropic/claude-sonnet-4.5`   |
| `/model:spud`         | `vercel-ai-gateway/openai/gpt-5.6-sol`            |
| `/model:sol`          | `vercel-ai-gateway/openai/gpt-5.6-sol`            |
| `/model:terra`        | `vercel-ai-gateway/openai/gpt-5.6-terra`          |
| `/model:luna`         | `vercel-ai-gateway/openai/gpt-5.6-luna`           |
| `/model:gpt-mini`     | `vercel-ai-gateway/openai/gpt-5.4-mini`           |
| `/model:gemini-pro`   | `vercel-ai-gateway/google/gemini-3.1-pro-preview` |
| `/model:gemini-flash` | `vercel-ai-gateway/google/gemini-3.5-flash`       |
| `/model:haiku`        | `vercel-ai-gateway/anthropic/claude-haiku-4.5`    |
| `/model:opus`         | `vercel-ai-gateway/anthropic/claude-opus-4.8`     |

Override individual shortcuts for a checkout in `ns.local.toml`:

```toml
[pi.model-shortcuts]
sonnet = "anthropic/claude-sonnet-4-5"
terra = "vercel-ai-gateway/openai/gpt-5.6-terra"
```

Values must be qualified `provider/model-id` references. Unspecified shortcuts retain their defaults;
`spud` and `sol` are independent keys even though their defaults match. Gateway-backed defaults require
`AI_GATEWAY_API_KEY` in Pi's environment. Run `/reload` after changing `ns.local.toml` or the environment
used to launch Pi.
