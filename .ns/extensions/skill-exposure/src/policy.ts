import { transformSkillFrontmatter } from "@nseng-ai/ns/api";
import type {
  ExposurePolicy,
  PiSettings,
  SkillFacts,
  SkillInspection,
  SkillPlan,
} from "./types.ts";
import {
  MANAGED_OPENAI_POLICY,
  SkillExposureInputError,
  SkillExposureRepositoryError,
} from "./types.ts";

const DISABLE_KEY = "disable-model-invocation";

export function inferPolicy(facts: SkillFacts): ExposurePolicy | "inconsistent" {
  if (!facts.modelInvocationDisabled && facts.sidecarState === "missing" && !facts.piExcluded)
    return "normal";
  if (facts.modelInvocationDisabled && facts.managedSidecar && !facts.piExcluded)
    return "invoke-only";
  if (
    facts.modelInvocationDisabled &&
    facts.managedSidecar &&
    facts.piExcluded &&
    facts.replacementVerified
  )
    return "command-backed";
  return "inconsistent";
}

export function diagnosticsFor(facts: SkillFacts): string[] {
  const diagnostics: string[] = [];
  if (facts.sidecarState === "unexpected")
    diagnostics.push("agents/openai.yaml has non-managed content");
  if (facts.sidecarState === "symlink") diagnostics.push("agents/openai.yaml is a symlink");
  if (facts.modelInvocationDisabled !== facts.managedSidecar)
    diagnostics.push("model invocation frontmatter and managed sidecar disagree");
  if (facts.piExcluded && !facts.replacementVerified)
    diagnostics.push("Pi exclusion is missing a verified replacement registry row");
  return diagnostics;
}

export function implicationsFor(policy: ExposurePolicy | "inconsistent"): readonly string[] {
  if (policy === "normal") return ["model invocation allowed", "native Pi skill visible"];
  if (policy === "invoke-only")
    return ["implicit model invocation disabled", "native Pi skill visible"];
  if (policy === "command-backed")
    return ["implicit model invocation disabled", "native Pi skill replaced by command surface"];
  return ["overlay facts do not form a retained policy"];
}

export function planSkillExposure(
  inspection: SkillInspection,
  policy: ExposurePolicy,
  _settings?: PiSettings,
): SkillPlan {
  if (inspection.facts.sidecarState === "symlink" || inspection.facts.sidecarState === "unexpected")
    throw new SkillExposureRepositoryError(
      "unsafe-managed-path",
      `Refusing unexpected sidecar at ${inspection.relativePath}/agents/openai.yaml.`,
      { path: `${inspection.relativePath}/agents/openai.yaml` },
    );
  if (policy === "command-backed" && !inspection.facts.replacementVerified)
    throw new SkillExposureInputError(
      `Skill '${inspection.skill}' has no verified command-backed registry row.`,
    );

  const skillMdPath = `${inspection.relativePath}/SKILL.md`;
  const transformed = transformSkillFrontmatter(inspection.skillMdText, skillMdPath, {
    [DISABLE_KEY]: policy === "normal" ? undefined : "true",
  });
  if (!transformed.ok)
    throw new SkillExposureRepositoryError(
      "malformed-skill-frontmatter",
      transformed.error.message,
      {
        path: skillMdPath,
      },
    );
  const operations: SkillPlan["operations"] extends readonly (infer T)[] ? T[] : never = [];
  operations.push(
    transformed.value === inspection.skillMdText
      ? {
          type: "skip",
          path: skillMdPath,
          description: "SKILL.md",
          evidence: "frontmatter already current",
        }
      : {
          type: "write",
          target: "skill-md",
          path: skillMdPath,
          description: "SKILL.md frontmatter",
          content: transformed.value,
        },
  );

  const sidecarPath = `${inspection.relativePath}/agents/openai.yaml`;
  if (policy === "normal") {
    if (inspection.facts.sidecarState === "managed") {
      operations.push({
        type: "delete",
        path: sidecarPath,
        description: "managed OpenAI policy",
      });
      operations.push({
        type: "remove-empty-dir",
        path: `${inspection.relativePath}/agents`,
        description: "empty agents directory",
      });
    } else
      operations.push({
        type: "skip",
        path: sidecarPath,
        description: "OpenAI policy",
        evidence: "sidecar absent",
      });
  } else
    operations.push(
      inspection.facts.sidecarState === "managed"
        ? {
            type: "skip",
            path: sidecarPath,
            description: "OpenAI policy",
            evidence: "managed sidecar already current",
          }
        : {
            type: "write",
            target: "sidecar",
            path: sidecarPath,
            description: "managed OpenAI policy",
            content: MANAGED_OPENAI_POLICY,
          },
    );

  return {
    skill: inspection.skill,
    policy,
    canonicalPath: inspection.canonicalPath,
    relativePath: inspection.relativePath,
    operations,
  };
}

export function settingsForPolicy(
  settings: PiSettings,
  skill: string,
  policy: ExposurePolicy,
): PiSettings {
  const exclusion = `-skills/${skill}`;
  const exclusions =
    policy === "command-backed"
      ? settings.exclusions.includes(exclusion)
        ? [...settings.exclusions]
        : [...settings.exclusions, exclusion]
      : settings.exclusions.filter((entry) => entry !== exclusion);
  if (
    exclusions.length === settings.exclusions.length &&
    exclusions.every((entry, index) => entry === settings.exclusions[index])
  )
    return settings;
  return {
    ...settings,
    exists: true,
    data: { ...settings.data, skills: exclusions },
    exclusions,
  };
}
