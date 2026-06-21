# Roaster Model Profiles

Roaster review definitions use provider-neutral model profiles instead of concrete provider model names.

Valid review-definition frontmatter values:

```yaml
model_profile: quick
model_profile: deep
```

Built-in profile defaults:

- `quick` resolves to `haiku`.
- `deep` resolves to `opus`.

Repositories can override either profile in `sdl.toml`:

```toml
[roaster.model_profiles]
quick = "haiku"
deep = "opus"
```

`roaster review list` reports both `model_profile` and `resolved_model`. `roaster review run` accepts `--model-profile quick|deep`; an explicit concrete `--model` still takes precedence over profile resolution.

This only configures Roaster's profile vocabulary and concrete model resolution. The current real execution harness remains Claude Code-only; profile config values that the Claude Code harness cannot run fail at review execution time.
