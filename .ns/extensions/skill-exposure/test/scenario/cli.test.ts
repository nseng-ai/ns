import { describe, expect, test } from "vitest";
import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";
import { runCli, type NsCliBaseContext } from "@nseng-ai/sdk/cli";
import { createTestNsCliExtensionRegistry } from "@nseng-ai/sdk/testing";
import { createSkillExposureApplyCommand } from "../../src/commands/apply.ts";
import { createSkillExposureCheckCommand } from "../../src/commands/check.ts";
import { createSkillExposureShowCommand } from "../../src/commands/show.ts";
import {
  InMemorySkillExposureGateway,
  inMemorySkill,
  type InMemorySkillExposureState,
} from "../../src/in-memory-skill-exposure-gateway.ts";

interface CliRun {
  exit: number;
  stdout: string;
  stderr: string;
}

function createRunner(state: InMemorySkillExposureState) {
  const gateway = new InMemorySkillExposureGateway(state);
  const factory = () => gateway;
  const registry = createTestNsCliExtensionRegistry({
    commands: [
      {
        command: createSkillExposureApplyCommand(factory),
        segments: ["skill-exposure", "apply"],
        groupDescription: "Inspect and reconcile repository skill exposure overlays.",
      },
      {
        command: createSkillExposureShowCommand(factory),
        segments: ["skill-exposure", "show"],
        groupDescription: "Inspect and reconcile repository skill exposure overlays.",
      },
      {
        command: createSkillExposureCheckCommand(factory),
        segments: ["skill-exposure", "check"],
        groupDescription: "Inspect and reconcile repository skill exposure overlays.",
      },
    ],
  });
  const context: NsCliBaseContext = {
    cwd: "/repo",
    env: {},
    commandIo: noopNsCommandIo,
    progress: noopNsProgress,
    renderCapabilities: { canEmitAnsi: false },
    outputFormat: "human",
    exec: async () => {
      throw new Error("unexpected exec");
    },
    textGenerator: {
      generateText: async () => {
        throw new Error("unexpected generation");
      },
    },
  };
  async function run(args: readonly string[]): Promise<CliRun> {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exit = await runCli(args, {
      context,
      cwd: context.cwd,
      env: context.env,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
      extensionRegistry: registry,
    });
    return { exit, stdout: stdout.join(""), stderr: stderr.join("") };
  }
  return { gateway, run };
}

function json(result: CliRun): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

const defaultState: InMemorySkillExposureState = {
  skills: [inMemorySkill("skills/code-gh"), inMemorySkill("skills/other")],
};

describe("skill-exposure CLI scenarios", () => {
  test("publishes group and command help plus schemas through the SDK runner", async () => {
    const { run } = createRunner(defaultState);
    const group = await run(["skill-exposure", "--help"]);
    expect(group.exit).toBe(0);
    expect(group.stdout).toContain("apply");
    expect(group.stdout).toContain("show");
    expect(group.stdout).toContain("check");
    for (const command of ["apply", "show", "check"]) {
      const help = await run(["skill-exposure", command, "-h"]);
      expect(help.exit).toBe(0);
      expect(help.stdout).toContain(`ns skill-exposure ${command}`);
      const schema = await run(["skill-exposure", command, "--json-schema"]);
      expect(schema.exit).toBe(0);
      expect(JSON.parse(schema.stdout)).toHaveProperty("outputJsonSchema");
    }
  });

  test("returns representative ok, negative, and usage JSON envelopes", async () => {
    const { run } = createRunner({
      skills: [inMemorySkill("skills/code-gh"), inMemorySkill("skills/unknown")],
      settings: {
        path: "/repo/.pi/settings.json",
        exists: true,
        data: { skills: ["-skills/unknown"] },
        exclusions: ["-skills/unknown"],
      },
    });
    const okRun = await run(["skill-exposure", "show", "skills/code-gh", "--format", "json"]);
    expect(okRun.exit).toBe(0);
    expect(json(okRun)).toMatchObject({ status: "ok" });
    const negativeRun = await run([
      "skill-exposure",
      "check",
      "skills/unknown",
      "--format",
      "json",
    ]);
    expect(negativeRun.exit).toBe(1);
    expect(json(negativeRun)).toMatchObject({ status: "negative", data: { ok: false } });
    const usage = await run(["skill-exposure", "show", "unknown", "--format", "json"]);
    expect(usage.exit).toBe(2);
    expect(json(usage)).toMatchObject({ status: "usageError" });
  });

  test("dry-run does not mutate and noninteractive deletion requires --yes", async () => {
    const state = {
      skills: [
        inMemorySkill("skills/code-gh", {
          sidecarState: "managed" as const,
          skillMdText: "---\nname: code-gh\ndisable-model-invocation: true\n---\n",
        }),
      ],
    };
    const dry = createRunner(state);
    expect(
      (
        await dry.run([
          "skill-exposure",
          "apply",
          "normal",
          "skills/code-gh",
          "--dry-run",
          "--format",
          "json",
        ])
      ).exit,
    ).toBe(0);
    expect(dry.gateway.appliedBatches).toHaveLength(0);
    const guarded = createRunner(state);
    const result = await guarded.run([
      "skill-exposure",
      "apply",
      "normal",
      "skills/code-gh",
      "--format",
      "json",
    ]);
    expect(result.exit).toBe(2);
    expect(json(result)).toMatchObject({ data: { missingFlag: "--yes" } });
    expect(guarded.gateway.appliedBatches).toHaveLength(0);
  });

  test("preflights all paths before mutation and consolidates settings", async () => {
    const { gateway, run } = createRunner({
      skills: [
        inMemorySkill("skills/code-gh"),
        inMemorySkill("skills/other", { skillMdSymlink: true }),
      ],
    });
    const result = await run([
      "skill-exposure",
      "apply",
      "command-backed",
      "skills/code-gh",
      "skills/other",
      "--format",
      "json",
    ]);
    expect(result.exit).toBe(2);
    expect(gateway.appliedBatches).toHaveLength(0);
  });

  test("is idempotent and accepts a canonical first-party symlink spelling", async () => {
    const linked = inMemorySkill(".agents/skills/code-gh", {
      canonicalPath: "/repo/skills/code-gh",
    });
    const runner = createRunner({ skills: [linked] });
    expect(
      (
        await runner.run([
          "skill-exposure",
          "apply",
          "invoke-only",
          ".agents/skills/code-gh",
          "--format",
          "json",
        ])
      ).exit,
    ).toBe(0);
    expect(
      (
        await runner.run([
          "skill-exposure",
          "apply",
          "invoke-only",
          ".agents/skills/code-gh",
          "--format",
          "json",
        ])
      ).exit,
    ).toBe(0);
  });

  test("rejects duplicate canonical inputs before mutation", async () => {
    const runner = createRunner({
      skills: [
        inMemorySkill("skills/code-gh"),
        inMemorySkill(".agents/skills/code-gh", {
          canonicalPath: "/repo/skills/code-gh",
        }),
      ],
    });
    const result = await runner.run([
      "skill-exposure",
      "apply",
      "invoke-only",
      "skills/code-gh",
      ".agents/skills/code-gh",
      "--format",
      "json",
    ]);
    expect(result.exit).toBe(2);
    expect(json(result)).toMatchObject({ status: "usageError" });
    expect(runner.gateway.appliedBatches).toHaveLength(0);
  });

  test("reports the consolidated settings operation exactly once", async () => {
    const changed = createRunner({ skills: [inMemorySkill("skills/skill-management")] });
    const applied = await changed.run([
      "skill-exposure",
      "apply",
      "command-backed",
      "skills/skill-management",
      "--format",
      "json",
    ]);
    expect(json(applied)).toMatchObject({
      status: "ok",
      data: {
        sharedOperations: [
          { type: "write-settings", outcome: "applied", evidence: "consolidated Pi settings" },
        ],
      },
    });
    const dry = createRunner({ skills: [inMemorySkill("skills/skill-management")] });
    const planned = await dry.run([
      "skill-exposure",
      "apply",
      "command-backed",
      "skills/skill-management",
      "--dry-run",
      "--format",
      "json",
    ]);
    expect(json(planned)).toMatchObject({
      data: { sharedOperations: [{ type: "write-settings", outcome: "planned" }] },
    });
    const unchanged = createRunner({ skills: [inMemorySkill("skills/code-gh")] });
    const skipped = await unchanged.run([
      "skill-exposure",
      "apply",
      "normal",
      "skills/code-gh",
      "--format",
      "json",
    ]);
    expect(json(skipped)).toMatchObject({
      data: {
        sharedOperations: [
          { type: "write-settings", outcome: "skipped", evidence: "Pi settings already current" },
        ],
      },
    });
  });

  test("rejects malformed settings and non-managed or symlink sidecars as repository failures", async () => {
    const malformed = createRunner({
      skills: [inMemorySkill("skills/code-gh")],
      settings: {
        path: "/repo/.pi/settings.json",
        exists: true,
        data: { skills: 3 },
        exclusions: [],
      },
    });
    const malformedResult = await malformed.run([
      "skill-exposure",
      "show",
      "skills/code-gh",
      "--format",
      "json",
    ]);
    expect(malformedResult.exit).toBe(2);
    expect(json(malformedResult)).toMatchObject({
      status: "failure",
      errorType: "malformed-pi-settings",
      data: { path: ".pi/settings.json" },
    });
    const malformedFrontmatter = createRunner({
      skills: [inMemorySkill("skills/code-gh", { skillMdText: "not frontmatter\n" })],
    });
    const frontmatterResult = await malformedFrontmatter.run([
      "skill-exposure",
      "check",
      "skills/code-gh",
      "--format",
      "json",
    ]);
    expect(frontmatterResult.exit).toBe(2);
    expect(json(frontmatterResult)).toMatchObject({
      status: "failure",
      errorType: "malformed-skill-frontmatter",
      data: { path: "skills/code-gh/SKILL.md" },
    });
    for (const sidecarState of ["unexpected", "symlink"] as const) {
      const runner = createRunner({ skills: [inMemorySkill("skills/code-gh", { sidecarState })] });
      const result = await runner.run([
        "skill-exposure",
        "apply",
        "invoke-only",
        "skills/code-gh",
        "--format",
        "json",
      ]);
      expect(result.exit).toBe(2);
      expect(json(result)).toMatchObject({
        status: "failure",
        errorType: "unsafe-managed-path",
      });
      expect(runner.gateway.appliedBatches).toHaveLength(0);
    }
  });

  test("show, check, and apply reject a symlinked agents parent even for skipped sidecars", async () => {
    for (const command of ["show", "check"] as const) {
      const runner = createRunner({
        skills: [
          inMemorySkill("skills/code-gh", {
            agentsParentState: "symlink",
            sidecarState: "missing",
          }),
        ],
      });
      const result = await runner.run([
        "skill-exposure",
        command,
        "skills/code-gh",
        "--format",
        "json",
      ]);
      expect(result.exit).toBe(2);
      expect(json(result)).toMatchObject({
        status: "failure",
        errorType: "unsafe-managed-path",
        data: { path: "skills/code-gh/agents" },
      });
    }
    const apply = createRunner({
      skills: [
        inMemorySkill("skills/code-gh", {
          agentsParentState: "symlink",
          sidecarState: "missing",
        }),
      ],
    });
    const result = await apply.run([
      "skill-exposure",
      "apply",
      "normal",
      "skills/code-gh",
      "--format",
      "json",
    ]);
    expect(result.exit).toBe(2);
    expect(json(result)).toMatchObject({
      status: "failure",
      errorType: "unsafe-managed-path",
    });
    expect(apply.gateway.appliedBatches).toHaveLength(0);
  });
});
