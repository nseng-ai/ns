# Skill Invocation Kinds Specification

Status: **Distilled from the Python prototype tracked by PR #1510.**

This document specifies the user-visible behavior that the future TypeScript implementation must preserve. It intentionally avoids Python implementation details except where the on-disk artifacts are themselves the compatibility contract.

## 1. Purpose

`areg` manages first-party local skills in a Git project. A local skill can be assigned an **invocation kind** that controls whether agents may discover or invoke that skill ambiently, directly, or through a replacement Pi extension command.

The kind system exists because the three supported harnesses do not expose the same controls:

- Claude Code and Pi can remove a skill from model ambient context with `disable-model-invocation: true`.
- Codex can block implicit invocation only through `skills/<name>/agents/openai.yaml`; it still pays ambient description cost.
- Pi can additionally hide native `/skill:<name>` commands with `.pi/settings.json` skill exclusions, but only if a verified replacement command exists.

Kinds are **inferred from concrete artifacts**, not stored in a central config file.

## 2. Scope

In scope:

- `areg skill apply KIND SKILL...`
- `areg skill list`
- `areg skill show SKILL`
- The kind artifact matrix and inference rules.
- The Pi replacement verification rule used before command-backed conversion.
- `areg check` validation for invoke-only / command-backed artifact consistency.

Out of scope:

- Installing skills.
- Maintaining lockfiles.
- Implementing Pi extension replacement commands themselves.
- Any attempt to make Codex explicit-only skills zero-ambient.

## 3. Terms

### Local skill

A first-party skill whose canonical source is `skills/<name>/SKILL.md` under the target Git project.

`areg skill` commands MUST only mutate local skills. A skill found only under `.agents/skills/<name>` is not local and MUST be rejected, even if it is invocable by harnesses.

### Invocation kind

One of four desired states for a local skill:

| Kind             | Meaning                                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normal`         | Default skill behavior. Remove managed explicit-only, ambient-only, and Pi-exclusion artifacts.                                                                                         |
| `invoke-only`    | Hide from Claude/Pi model ambient context and block Codex implicit invocation where possible, but leave native direct skill invocation available.                                       |
| `command-backed` | Compatibility kind for skills replaced by Pi extension commands. Same explicit-only artifacts as `invoke-only`, plus a Pi native skill exclusion after verifying a replacement command. |
| `ambient-only`   | Disable direct user invocation where supported by skill frontmatter, while leaving model/ambient discovery enabled.                                                                     |

### Inferred kind

The kind reported by `list` and `show`, derived from the current artifact set. In addition to the four desired kinds, reports may use:

| Inferred kind  | Meaning                                                                               |
| -------------- | ------------------------------------------------------------------------------------- |
| `mixed`        | `user-invocable` artifacts are combined with explicit-only or Pi-exclusion artifacts. |
| `inconsistent` | Artifacts are incomplete or contradictory but not specifically `mixed`.               |

### Pi replacement command

A Pi extension command that replaces native `/skill:<name>` for a command-backed skill. A command-backed apply MUST NOT hide `/skill:<name>` unless such a replacement is verified.

## 4. Target project resolution

All skill invocation kind commands accept:

```text
--path PATH
```

Rules:

- Default `PATH` is the current directory.
- `PATH` MUST exist and be a directory.
- The command resolves the Git root containing `PATH` and treats that root as the target project.
- Failure to find a Git root is a command failure.

## 5. Skill argument resolution

Commands accepting `SKILL...` or `SKILL` accept either a skill name or a path-like skill spec.

A spec is path-like if it is absolute, contains `/` or `\`, or ends with `SKILL.md`.

Accepted local-skill specs:

- `my-skill`
- `skills/my-skill`
- `skills/my-skill/SKILL.md`
- an absolute path to `skills/my-skill`
- an absolute path to `skills/my-skill/SKILL.md`
- a harness-visible symlink path that resolves to a canonical local skill under `skills/<name>`

Rejected specs:

- missing skills
- real vendored/installed skills under `.agents/skills/<name>`
- paths that resolve outside `skills/<name>`
- paths nested below a skill directory beyond `SKILL.md`
- symlinked canonical `skills/<name>` directories
- symlinked canonical `skills/<name>/SKILL.md` files

Before mutation, the implementation MUST verify that:

- `skills/<name>` exists and is a real directory, not a symlink.
- `skills/<name>/SKILL.md` exists, is a real file, and is not a symlink.

## 6. Managed artifacts

### `disable-model-invocation` frontmatter

Managed in `skills/<name>/SKILL.md`.

- When set, the frontmatter contains exactly one top-level line:

  ```yaml
  disable-model-invocation: true
  ```

- When removed, all top-level `disable-model-invocation:` lines are removed.
- If the key is inserted, it is inserted immediately after the top-level `name:` line.
- Existing frontmatter comments, multiline fields, ordering after the insertion point, and body content MUST be preserved.
- Missing frontmatter delimiters or missing `name:` is a command failure.

### `user-invocable` frontmatter

Managed in `skills/<name>/SKILL.md`.

- `ambient-only` sets exactly one top-level line:

  ```yaml
  user-invocable: false
  ```

- Other kinds remove all top-level `user-invocable:` lines.
- If inserted, it is inserted immediately after the top-level `name:` line.

### Codex OpenAI policy sidecar

Path:

```text
skills/<name>/agents/openai.yaml
```

Content:

```yaml
policy:
  allow_implicit_invocation: false
```

Rules:

- `invoke-only` and `command-backed` create or update the sidecar.
- `normal` and `ambient-only` delete the sidecar if present.
- The sidecar parent directory may be created when writing.
- When the sidecar is removed, the now-empty `skills/<name>/agents/` directory may be removed.
- Symlinked sidecar paths MUST be rejected.

### Pi skill exclusion

Path:

```text
.pi/settings.json
```

Managed entry:

```json
"-skills/<name>"
```

Rules:

- `command-backed` adds `-skills/<name>` to the JSON `skills` array.
- `normal`, `invoke-only`, and `ambient-only` remove the exact `-skills/<name>` entry.
- Existing settings object fields MUST be preserved.
- Existing `skills` entries MUST be preserved except for the exact removed entry.
- If `.pi/settings.json` does not exist and an exclusion must be added, it is created with a JSON object containing `skills`.
- If all exclusions are removed, the `skills` array remains present as an empty array when it already existed.
- `.pi/` and `.pi/settings.json` MUST NOT be symlinks.
- Existing `.pi/settings.json` MUST contain a JSON object.
- Existing `skills`, if present, MUST be an array of strings.

## 7. Kind-to-artifact matrix

Setting a kind produces this managed artifact state:

| Kind             | `disable-model-invocation` | Codex sidecar | `user-invocable:false` | Pi `-skills/<name>` |
| ---------------- | -------------------------- | ------------- | ---------------------- | ------------------- |
| `normal`         | absent                     | absent        | absent                 | absent              |
| `invoke-only`    | present                    | present       | absent                 | absent              |
| `command-backed` | present                    | present       | absent                 | present             |
| `ambient-only`   | absent                     | absent        | present                | absent              |

Setting a kind is idempotent. If an artifact already has the desired state, the command reports a skip for that artifact rather than treating it as an error.

For multi-skill commands, skills are processed in argument order. If a later skill fails, earlier successful mutations remain applied; there is no cross-skill transaction.

## 8. Pi replacement verification

Before setting `command-backed`, the command MUST verify a replacement Pi command.

Verification succeeds if either:

1. The skill has a specialized replacement mapping, or
2. A generic backing-skill replacement layer is installed.

### Specialized replacement mappings

These mappings are verified by definition:

| Skill                      | Replacement command         |
| -------------------------- | --------------------------- |
| `branch-context-from-plan` | `/branch-context:from-plan` |
| `branch-context-impl`      | `/branch-context:impl`      |
| `enriched-plan-save`       | `/enriched-plan:save`       |
| `handoff-create`           | `/handoff:create`           |
| `handoff-pickup`           | `/handoff:pickup`           |
| `objective-create`         | `/objective:create`         |
| `objective-current`        | `/objective:current`        |
| `objective-next`           | `/objective:next`           |
| `objective-stack-impl`     | `/objective:stack-impl`     |
| `objective-update`         | `/objective:update`         |
| `pi-grill-ui`              | `/pi:grill-me`              |
| `pi-grill-with-docs-ui`    | `/pi:grill-with-docs`       |
| `code-autobranch`          | `/code:autobranch`          |
| `code-checkpoint`          | `/code:checkpoint`          |
| `code-just-fix`            | `/code:just-fix`            |
| `code-submit`              | `/code:submit`              |
| `ccc-sidebar`              | `/ccc:sidebar:pr-summary`   |

### Derived replacement commands

For skills without a specialized mapping, derive the expected command surface from the skill name:

1. Match the longest known namespace prefix from this set:

   ```text
   branch-context, enriched-plan, objective, handoff, context,
   changelog, typescript, python, refactor, setup, create, skill,
   code, ccc, claude, dev, cli, pr, sdl, pi, stack
   ```

2. If the skill starts with `<namespace>-`, derive `/namespace:remainder`.
3. Otherwise, split on the first hyphen and derive `/prefix:remainder`.
4. If no non-empty prefix and remainder can be derived, replacement verification fails.

Examples:

| Skill                      | Derived command             |
| -------------------------- | --------------------------- |
| `objective-create`         | `/objective:create`         |
| `objective-stack-impl`     | `/objective:stack-impl`     |
| `branch-context-from-plan` | `/branch-context:from-plan` |
| `foo-bar-baz`              | `/foo:bar-baz`              |

### Generic backing-skill layer

For derived commands, verification succeeds when both files exist:

```text
.pi/extensions/backing-skill-commands.ts
ts/packages/pi-extensions/src/backing-skill-commands.ts
```

The existence of these files is the compatibility signal that a generic replacement extension can serve the derived command.

### Missing replacement failure

If verification fails, `command-backed` conversion MUST fail before mutating that skill.

The failure message SHOULD tell the user:

- the skill name
- the expected command, if derivable
- that applying `command-backed` would hide `/skill:<name>` in Pi
- that a replacement command must read `skills/<name>/SKILL.md` directly because native Pi skill discovery will exclude `/skill:<name>`
- that tests should prove the command works while the backing skill is excluded

## 9. CLI surfaces

### `areg skill apply`

Synopsis:

```text
areg skill apply [--path PATH] [--dry-run] [--yes] KIND SKILL...
```

`KIND` MUST be one of:

```text
normal
invoke-only
command-backed
ambient-only
```

Behavior:

- Resolves the target project.
- Resolves each skill spec to a canonical local skill name.
- Applies the kind artifact plan for each skill in order.
- With `--dry-run`, prints planned writes/deletes/removals, writes nothing, and does not prompt.
- Without `--dry-run`, planned managed-artifact deletions require confirmation unless `--yes` is passed.
- `--yes` only approves deletion prompts; it does not bypass path safety, malformed files, or missing replacement checks.

Human output:

```text
Applying <kind> to <skill>...
```

For each artifact, output uses these verbs:

- `Would write` / `Wrote`
- `Would skip` / `Skipped`
- `Would delete` / `Deleted`
- `Would remove <path> if empty`
- `Removed <path>` when an empty directory was actually removed

Exact paths are included in artifact output.

### `areg skill list`

Synopsis:

```text
areg skill list [--path PATH]
```

Behavior:

- Lists all local skills with `skills/*/SKILL.md`, sorted by skill directory name.
- If no local skills exist, prints:

  ```text
  No local skills found.
  ```

Columns:

| Column   | Meaning                                             |
| -------- | --------------------------------------------------- |
| `Skill`  | local skill name                                    |
| `Kind`   | inferred kind                                       |
| `Model`  | model-invocation status                             |
| `Native` | native direct-invocation status                     |
| `Pi`     | Pi extension replacement status                     |
| `Notes`  | only shown when at least one listed skill has notes |

The table may use color/styling for humans; styling is not semantic.

### `areg skill show`

Synopsis:

```text
areg skill show [--path PATH] SKILL
```

Behavior:

- Resolves one local skill.
- Prints the inferred kind, status dimensions, concrete artifact presence, replacement label, and notes.

Required labels:

```text
Skill: <name>
Kind: <kind>
model-invocation: <enabled|disabled|mixed>
native-direct: <enabled|partial|mixed>
pi-extension: <n/a|enabled|missing>
Artifacts:
- disable-model-invocation: <present|absent>
- agents/openai.yaml: <present|absent>
- user-invocable:false: <present|absent>
- Pi skill exclusion: <present|absent>
- Pi replacement: <replacement-label>
```

If notes exist, append:

```text
Notes:
- <note>
```

## 10. Kind inference

For each local skill, collect these facts:

| Fact                         | Meaning                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `disable_model_invocation`   | `SKILL.md` frontmatter has `disable-model-invocation: true`                 |
| `codex_sidecar`              | `skills/<name>/agents/openai.yaml` exists as a file                         |
| `user_invocable_key_present` | frontmatter contains any top-level `user-invocable:` key                    |
| `user_invocable_false`       | parsed frontmatter value for `user-invocable` is `false` case-insensitively |
| `pi_excluded`                | `.pi/settings.json` contains exact `-skills/<name>` entry                   |
| `replacement`                | Pi replacement verification result                                          |

Inference rules, in order:

1. `command-backed` when all are true:
   - `disable_model_invocation`
   - `codex_sidecar`
   - `pi_excluded`
   - replacement exists and is verified
   - no `user-invocable:` key is present
2. `invoke-only` when all are true:
   - `disable_model_invocation`
   - `codex_sidecar`
   - not `pi_excluded`
   - no `user-invocable:` key is present
3. `ambient-only` when all are true:
   - `user_invocable_false`
   - not `disable_model_invocation`
   - not `codex_sidecar`
   - not `pi_excluded`
4. `normal` when all are true:
   - not `disable_model_invocation`
   - not `codex_sidecar`
   - no `user-invocable:` key is present
   - not `pi_excluded`
5. `mixed` when a `user-invocable:` key is present together with any explicit-only or Pi-exclusion artifact.
6. Otherwise `inconsistent`.

## 11. Status dimensions and notes

### Model invocation status

| Artifacts                                                 | Status     |
| --------------------------------------------------------- | ---------- |
| `disable-model-invocation` and Codex sidecar both present | `disabled` |
| exactly one of those two artifacts present                | `mixed`    |
| neither present                                           | `enabled`  |

### Native direct-invocation status

| Condition                                           | Status    |
| --------------------------------------------------- | --------- |
| inferred kind is `normal` or `invoke-only`          | `enabled` |
| inferred kind is `command-backed` or `ambient-only` | `partial` |
| `user-invocable:` key is present or Pi is excluded  | `mixed`   |
| otherwise                                           | `enabled` |

### Pi extension status

| Condition                            | Status    |
| ------------------------------------ | --------- |
| no Pi skill exclusion                | `n/a`     |
| Pi excluded and replacement verified | `enabled` |
| Pi excluded and replacement missing  | `missing` |

### Notes

Notes are human diagnostics. Their presence and categories are contract; exact wording may be preserved for compatibility but should not be parsed by external tools.

Required note conditions:

- `disable-model-invocation` present without Codex sidecar.
- Codex sidecar present without `disable-model-invocation`.
- `user-invocable:` present with a value other than `false`.
- `user-invocable:false` mixed with explicit-only or Pi-exclusion artifacts.
- Pi skill exclusion present without a verified replacement.
- `ambient-only` kind, explaining:
  - Claude native direct invocation is disabled.
  - Pi native direct invocation is not enforced.
  - Codex native direct invocation is not enforced.

## 12. `areg check` validation

For local skills only, `areg check` validates invoke-only / command-backed consistency:

- If `disable-model-invocation: true` is present but `skills/<name>/agents/openai.yaml` is missing, report an invoke-only missing-policy issue.
- If the Codex sidecar exists but `SKILL.md` does not set `disable-model-invocation: true`, report a sidecar-without-invoke-only issue.
- If Pi skill exclusion is present but no verified replacement command exists, report a command-converted missing-Pi-replacement issue with the expected command when derivable.

Malformed frontmatter in this check is ignored by the invoke-only consistency check rather than reported there.

## 13. Failure behavior

Commands fail without mutation for the current skill when:

- target path does not exist or is not a directory
- no Git root can be found
- skill spec cannot be resolved to a local skill
- canonical local skill directory or `SKILL.md` is missing or unsafe
- `SKILL.md` frontmatter is malformed for a mutation or skill show/list operation
- `.pi/settings.json` is malformed, not a JSON object, has non-string `skills`, or is unsafe
- `command-backed` replacement verification fails

Mutation planning for a single skill should validate all files it will need before applying writes for that skill. Dry-run mode performs the same validation but writes nothing.

## 14. Worked example

Initial project:

```text
skills/my-skill/SKILL.md
.pi/extensions/backing-skill-commands.ts
ts/packages/pi-extensions/src/backing-skill-commands.ts
```

Initial `SKILL.md`:

```markdown
---
name: my-skill
description: Example skill.
---

# Body
```

Command:

```bash
areg skill apply command-backed my-skill
```

Expected artifact results:

`skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
disable-model-invocation: true
description: Example skill.
---

# Body
```

`skills/my-skill/agents/openai.yaml`:

```yaml
policy:
  allow_implicit_invocation: false
```

`.pi/settings.json`:

```json
{
  "skills": [
    "-skills/my-skill"
  ]
}
```

`areg skill show my-skill` reports:

```text
Skill: my-skill
Kind: command-backed
model-invocation: disabled
native-direct: partial
pi-extension: enabled
Artifacts:
- disable-model-invocation: present
- agents/openai.yaml: present
- user-invocable:false: absent
- Pi skill exclusion: present
- Pi replacement: replacement-verified:my:skill
```

Reverting:

```bash
areg skill apply normal my-skill
```

restores `SKILL.md` to no managed frontmatter keys, deletes `agents/openai.yaml`, removes `skills/my-skill/agents/` if empty, and removes only the exact `-skills/my-skill` entry from `.pi/settings.json`.

## 15. Non-goals and design constraints

- Do not introduce a central desired-kind config file. The artifact set is the source of truth.
- Do not mutate vendored or installed `.agents/skills` content unless it resolves to a canonical local skill under `skills/<name>`.
- Do not hide Pi native `/skill:<name>` unless a replacement command is verified first.
- Do not rely on Codex filesystem tricks to remove ambient context; Codex cannot provide zero-ambient explicit-only skills with the current harness contract.
- Do not require atomic rollback across multiple skills.

## 16. Acceptance checklist for the TypeScript port

- [ ] Implements all four kind-setting modes and the exact artifact matrix.
- [ ] Infers `normal`, `invoke-only`, `command-backed`, `ambient-only`, `mixed`, and `inconsistent` from artifacts.
- [ ] Preserves local-skill-only safety boundaries and rejects unsafe symlinks.
- [ ] Supports skill-name, local path, `SKILL.md` path, and harness symlink path resolution.
- [ ] Verifies Pi replacement commands before adding `-skills/<name>`.
- [ ] Preserves existing `.pi/settings.json` object fields and unrelated `skills` entries.
- [ ] Provides `skill apply/list/show` surfaces with the documented arguments and outputs.
- [ ] Keeps `--dry-run` validation and no-write semantics.
- [ ] Extends `areg check` with missing sidecar, sidecar without flag, and missing Pi replacement diagnostics.
- [ ] Includes conformance tests for idempotency, round trip, malformed files, path safety, replacement verification, and multi-skill partial failure behavior.
