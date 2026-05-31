---
title: CLI conventions
description: Shared output formats, exit codes, JSON envelopes, and human-vs-agent command surfaces across asdl tools.
sidebar:
  order: 2
---

Every asdl tool shares one CLI grammar. Learn one tool's output, exit behavior,
and agent boundary, and the rest should feel familiar.

## Output formats — `--format {human,json,md}`

Human-readable output is the default. Agents and scripts should request JSON when
they need stable structure.

```bash
slot list --format json
pr-address exec get-reviews --format json
```

| Format  | Audience        | Use when                                       |
| ------- | --------------- | ---------------------------------------------- |
| `human` | Interactive CLI | A person is reading terminal output.           |
| `json`  | Agents/scripts  | A caller needs a stable machine-readable body. |
| `md`    | Humans/agents   | A command emits Markdown for comments or docs. |

## Exit codes

| Code | Meaning                          | Typical case                          |
| ---- | -------------------------------- | ------------------------------------- |
| `0`  | OK                               | Command completed successfully.       |
| `1`  | Ran, but the answer was negative | Not found, no work, nothing to do.    |
| `2`  | Failure                          | Invalid input or unrecoverable error. |

## JSON envelope

Successful JSON output includes the command exit code and a `data` payload.
Failures include an error type and message.

```json
{
  "exit_code": 0,
  "data": {
    "slots": [
      {
        "slot_name": "slot-01",
        "status": "assigned",
        "branch": "feature-x"
      }
    ]
  }
}
```

```json
{
  "exit_code": 2,
  "error_type": "invalid_input",
  "message": "--size is required"
}
```

## Human vs agent surface — `exec`

Top-level commands are for humans. Commands intended for skills and agents live
under a hidden `exec` subgroup:

```bash
pr-address exec get-reviews --format json
aretro exec collect-evidence --format json
```

Hidden means omitted from top-level `--help`, not unavailable. The paired skill
is the user-facing documentation for those agent operations.

## Shared flags

| Option         | Description                                       |
| -------------- | ------------------------------------------------- |
| `-h`, `--help` | Show help for the current command or subgroup.    |
| `--version`    | Print the installed package version when exposed. |
