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
	skills: [
		inMemorySkill("skills/internal/code/code-gh"),
		inMemorySkill("skills/internal/test/other"),
	],
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

	test("omits absent replacement surfaces and serializes verified replacements", async () => {
		const { run } = createRunner({
			skills: [
				inMemorySkill("skills/internal/test/unknown"),
				inMemorySkill("skills/internal/skill-system/skill-management"),
			],
		});
		const result = await run([
			"skill-exposure",
			"show",
			"skills/internal/test/unknown",
			"skills/internal/skill-system/skill-management",
			"--format",
			"json",
		]);
		expect(result.exit).toBe(0);
		const envelope = json(result);
		const skills = (envelope.data as { skills: Array<{ facts: Record<string, unknown> }> }).skills;
		expect(Object.hasOwn(skills[0]?.facts ?? {}, "replacementSurface")).toBe(false);
		expect(skills[1]?.facts.replacementSurface).toBe("skill:management");
	});

	test("returns representative ok, negative, and usage JSON envelopes", async () => {
		const { run } = createRunner({
			skills: [
				inMemorySkill("skills/internal/code/code-gh"),
				inMemorySkill("skills/internal/test/unknown"),
			],
			settings: {
				path: "/repo/.pi/settings.json",
				exists: true,
				data: { skills: ["-skills/unknown"] },
				exclusions: ["-skills/unknown"],
			},
		});
		const okRun = await run([
			"skill-exposure",
			"show",
			"skills/internal/code/code-gh",
			"--format",
			"json",
		]);
		expect(okRun.exit).toBe(0);
		expect(json(okRun)).toMatchObject({ status: "ok" });
		const negativeRun = await run([
			"skill-exposure",
			"check",
			"skills/internal/test/unknown",
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
				inMemorySkill("skills/internal/code/code-gh", {
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
					"skills/internal/code/code-gh",
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
			"skills/internal/code/code-gh",
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
				inMemorySkill("skills/internal/code/code-gh"),
				inMemorySkill("skills/internal/test/other", { skillMdSymlink: true }),
			],
		});
		const result = await run([
			"skill-exposure",
			"apply",
			"command-backed",
			"skills/internal/code/code-gh",
			"skills/internal/test/other",
			"--format",
			"json",
		]);
		expect(result.exit).toBe(2);
		expect(gateway.appliedBatches).toHaveLength(0);
	});

	test("accepts canonical nested, product-exception, and vendored skill paths", async () => {
		const runner = createRunner({
			skills: [
				inMemorySkill("skills/internal/code/code-gh"),
				inMemorySkill("skills/incubating/brmem"),
				inMemorySkill(".agents/skills/diagnosing-bugs"),
			],
		});
		const result = await runner.run([
			"skill-exposure",
			"show",
			"skills/internal/code/code-gh",
			"skills/incubating/brmem",
			".agents/skills/diagnosing-bugs",
			"--format",
			"json",
		]);
		expect(result.exit).toBe(0);
		expect(json(result)).toMatchObject({ status: "ok" });
	});

	test.each([
		"skills/code-gh",
		"skills/internal/code-gh",
		"skills/internal/code/code-gh/extra",
		"skills/public/brmem",
	])("rejects noncanonical first-party path %s", async (skillPath) => {
		const runner = createRunner({ skills: [inMemorySkill(skillPath)] });
		const result = await runner.run(["skill-exposure", "show", skillPath, "--format", "json"]);
		expect(result.exit).toBe(2);
		expect(json(result)).toMatchObject({ status: "usageError" });
	});

	test("is idempotent and accepts a canonical first-party symlink spelling", async () => {
		const linked = inMemorySkill(".agents/skills/code-gh", {
			canonicalPath: "/repo/skills/internal/code/code-gh",
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
				inMemorySkill("skills/internal/code/code-gh"),
				inMemorySkill(".agents/skills/code-gh", {
					canonicalPath: "/repo/skills/internal/code/code-gh",
				}),
			],
		});
		const result = await runner.run([
			"skill-exposure",
			"apply",
			"invoke-only",
			"skills/internal/code/code-gh",
			".agents/skills/code-gh",
			"--format",
			"json",
		]);
		expect(result.exit).toBe(2);
		expect(json(result)).toMatchObject({ status: "usageError" });
		expect(runner.gateway.appliedBatches).toHaveLength(0);
	});

	test("reports the consolidated settings operation exactly once", async () => {
		const changed = createRunner({
			skills: [inMemorySkill("skills/internal/skill-system/skill-management")],
		});
		const applied = await changed.run([
			"skill-exposure",
			"apply",
			"command-backed",
			"skills/internal/skill-system/skill-management",
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
		const dry = createRunner({
			skills: [inMemorySkill("skills/internal/skill-system/skill-management")],
		});
		const planned = await dry.run([
			"skill-exposure",
			"apply",
			"command-backed",
			"skills/internal/skill-system/skill-management",
			"--dry-run",
			"--format",
			"json",
		]);
		expect(json(planned)).toMatchObject({
			data: { sharedOperations: [{ type: "write-settings", outcome: "planned" }] },
		});
		const unchanged = createRunner({ skills: [inMemorySkill("skills/internal/code/code-gh")] });
		const skipped = await unchanged.run([
			"skill-exposure",
			"apply",
			"normal",
			"skills/internal/code/code-gh",
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
			skills: [inMemorySkill("skills/internal/code/code-gh")],
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
			"skills/internal/code/code-gh",
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
			skills: [inMemorySkill("skills/internal/code/code-gh", { skillMdText: "not frontmatter\n" })],
		});
		const frontmatterResult = await malformedFrontmatter.run([
			"skill-exposure",
			"check",
			"skills/internal/code/code-gh",
			"--format",
			"json",
		]);
		expect(frontmatterResult.exit).toBe(2);
		expect(json(frontmatterResult)).toMatchObject({
			status: "failure",
			errorType: "malformed-skill-frontmatter",
			data: { path: "skills/internal/code/code-gh/SKILL.md" },
		});
		for (const sidecarState of ["unexpected", "symlink"] as const) {
			const runner = createRunner({
				skills: [inMemorySkill("skills/internal/code/code-gh", { sidecarState })],
			});
			const result = await runner.run([
				"skill-exposure",
				"apply",
				"invoke-only",
				"skills/internal/code/code-gh",
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
					inMemorySkill("skills/internal/code/code-gh", {
						agentsParentState: "symlink",
						sidecarState: "missing",
					}),
				],
			});
			const result = await runner.run([
				"skill-exposure",
				command,
				"skills/internal/code/code-gh",
				"--format",
				"json",
			]);
			expect(result.exit).toBe(2);
			expect(json(result)).toMatchObject({
				status: "failure",
				errorType: "unsafe-managed-path",
				data: { path: "skills/internal/code/code-gh/agents" },
			});
		}
		const apply = createRunner({
			skills: [
				inMemorySkill("skills/internal/code/code-gh", {
					agentsParentState: "symlink",
					sidecarState: "missing",
				}),
			],
		});
		const result = await apply.run([
			"skill-exposure",
			"apply",
			"normal",
			"skills/internal/code/code-gh",
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
