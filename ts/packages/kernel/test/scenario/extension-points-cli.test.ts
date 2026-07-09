import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCliWithFakes, parseJsonOutput } from "./ns-cli-fakes.ts";

const fakeDefaults = {
	execResponses: () => [],
	textGenerationResults: () => [],
};

describe("ns extension point introspection", () => {
	test("lists point catalog for human readers", async () => {
		const cwd = await createPointProject();
		try {
			const run = runCli(["extension", "points"], cwd);

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("ns points:");
			expect(run.stdout.join("")).toContain(
				"flow.submit.pre (hook, additive) — repo ns.toml commands: just check",
			);
			expect(run.stdout.join("")).toContain(
				"flow.submit.pr-description (prompt, override) — env NS_DEV_PR_DESCRIPTION_PROMPT -> dev-prompt.md",
			);
			expect(run.stdout.join("")).toContain(
				"branch-context.plans-write (prompt, override) — conventional .ns/prompts/branch-context.plans-write.md",
			);
			expect(run.stdout.join("")).toContain("point_installation_undefined");
			expect(run.stderr.join("")).toBe("");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("lists point catalog as a stable machine envelope", async () => {
		const cwd = await createPointProject();
		try {
			const run = runCli(["extension", "points", "--format", "json"], cwd);

			expect(await run.exit).toBe(0);
			const envelope = parseJsonOutput(run);
			expect(envelope.status).toBe("ok");
			expect(envelope.exitCode).toBe(0);
			const data = envelope.data as {
				points: Array<{ id: string; activeSource: unknown }>;
				diagnostics: Array<{ code: string }>;
			};
			expect(data.points.map((point) => point.id)).toEqual([
				"branch-context.plans-write",
				"flow.submit.pr-description",
				"flow.submit.pre",
			]);
			expect(
				data.points.find((point) => point.id === "flow.submit.pr-description")?.activeSource,
			).toEqual({
				source: "env",
				envVar: "NS_DEV_PR_DESCRIPTION_PROMPT",
				path: "dev-prompt.md",
			});
			expect(
				data.diagnostics.some((diagnostic) => diagnostic.code === "point_installation_undefined"),
			).toBe(true);
			expect(run.stderr.join("")).toBe("");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("lists descriptor-declared point definitions from ns.toml extensions", async () => {
		const cwd = await createDescriptorPointProject();
		try {
			const run = runCli(["extension", "points", "--format", "json"], cwd);

			expect(await run.exit).toBe(0);
			const envelope = parseJsonOutput(run);
			expect(envelope.status).toBe("ok");
			const data = envelope.data as {
				points: Array<{
					id: string;
					semantics: string;
					activeSource: unknown;
					manifestPath?: string;
				}>;
			};
			expect(data.points).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: "descriptor.scan.pre",
						semantics: "additive",
						activeSource: { source: "repo-hook", commands: ["just descriptor"] },
					}),
					expect.objectContaining({
						id: "descriptor.prompt",
						semantics: "override",
						activeSource: expect.objectContaining({ source: "default" }),
					}),
				]),
			);
			expect(run.stderr.join("")).toBe("");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("shows one point detail", async () => {
		const cwd = await createPointProject();
		try {
			const run = runCli(["extension", "point", "flow.submit.pre", "--format", "json"], cwd);

			expect(await run.exit).toBe(0);
			const envelope = parseJsonOutput(run);
			expect(envelope.status).toBe("ok");
			const data = envelope.data as {
				point: { id: string; activeSource: unknown; installations: unknown[] };
			};
			expect(data.point.id).toBe("flow.submit.pre");
			expect(data.point.activeSource).toEqual({ source: "repo-hook", commands: ["just check"] });
			expect(data.point.installations).toEqual([{ source: "repo-hook", commands: ["just check"] }]);
			expect(run.stderr.join("")).toBe("");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("reports an undefined detail lookup as a negative machine envelope", async () => {
		const cwd = await createPointProject();
		try {
			const run = runCli(["extension", "point", "missing.point", "--format", "json"], cwd);

			expect(await run.exit).toBe(1);
			const envelope = parseJsonOutput(run);
			expect(envelope.status).toBe("negative");
			expect(envelope.message).toBe("Point missing.point is not defined.");
			const data = envelope.data as { pointId: string; availablePointIds: string[] };
			expect(data.pointId).toBe("missing.point");
			expect(data.availablePointIds).toContain("flow.submit.pre");
			expect(run.stderr.join("")).toBe("");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("exposes help, runtime, version, and json schema surfaces", async () => {
		const cwd = await createPointProject();
		try {
			const help = runCli(["extension", "points", "-h"], cwd);
			expect(await help.exit).toBe(0);
			expect(help.stdout.join("")).toContain("Usage: ns extension points");

			const runtime = runCli(["--runtime"], cwd);
			expect(await runtime.exit).toBe(0);
			expect(runtime.stdout.join("")).toContain("typescript");

			const version = runCli(["--version"], cwd);
			expect(await version.exit).toBe(0);
			expect(version.stdout.join("")).toMatch(/\d+\.\d+\.\d+/u);

			const schema = runCli(["extension", "points", "--json-schema"], cwd);
			expect(await schema.exit).toBe(0);
			expect(schema.stdout.join("")).toContain("activeSource");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

function runCli(args: readonly string[], cwd: string) {
	return runCliWithFakes(
		{
			args,
			cwd,
			env: { NS_DEV_PR_DESCRIPTION_PROMPT: "dev-prompt.md" },
			state: { exec: [], textGeneration: [] },
		},
		fakeDefaults,
	);
}

async function createDescriptorPointProject(): Promise<string> {
	const cwd = await mkdtemp(join(tmpdir(), "ns-descriptor-points-cli-"));
	writeJson(join(cwd, "extensions", "tools", "package.json"), {
		name: "tools",
		version: "1.0.0",
		exports: { "./ns-extension": "./src/ns/extension.ts" },
	});
	writeText(
		join(cwd, "extensions", "tools", "src", "ns", "extension.ts"),
		`
import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "tools",
	description: "Descriptor tools.",
	points: [
		{
			id: "descriptor.scan.pre",
			accepts: "hook",
			cardinality: "many",
			description: "Runs before descriptor scan.",
		},
		{
			id: "descriptor.prompt",
			accepts: "prompt",
			cardinality: "one",
			default: "./prompts/descriptor.md",
			description: "Descriptor prompt.",
		},
	],
});
`,
	);
	writeText(
		join(cwd, "ns.toml"),
		'extensions = ["./extensions/tools"]\n\n[points]\n"descriptor.scan.pre" = ["just descriptor"]\n',
	);
	return cwd;
}

async function createPointProject(): Promise<string> {
	const cwd = await mkdtemp(join(tmpdir(), "ns-extension-points-cli-"));
	writeJson(join(cwd, ".ns", "extensions", "flow", "package.json"), {
		ns: {
			group: "flow",
			commands: [],
			points: [
				{
					path: ["submit", "pre"],
					accepts: "hook",
					semantics: "additive",
					description: "Runs before submit.",
				},
				{
					path: ["submit", "pr-description"],
					accepts: "prompt",
					semantics: "override",
					default: "./prompts/pr-description.md",
					description: "PR description prompt.",
				},
			],
		},
	});
	writeJson(join(cwd, ".ns", "extensions", "branch-context", "package.json"), {
		ns: {
			group: "branch-context",
			commands: [],
			points: [
				{
					path: ["plans-write"],
					accepts: "prompt",
					semantics: "override",
					description: "Plan writing prompt.",
				},
			],
		},
	});
	writeJson(join(cwd, ".ns", "extensions", "tools", "package.json"), {
		ns: {
			group: "tools",
			commands: [],
			points: [
				{
					path: ["optional"],
					accepts: "prompt",
					semantics: "override",
					default: "./prompts/optional.md",
				},
				{ path: ["unused"], accepts: "hook", semantics: "additive" },
			],
		},
	});
	writeText(join(cwd, ".ns", "prompts", "branch-context.plans-write.md"), "Prompt\n");
	writeText(
		join(cwd, "ns.toml"),
		'[points]\n"flow.submit.pre" = ["just check"]\n"missing.point" = "ghost.md"\n',
	);
	return cwd;
}

function writeJson(path: string, value: unknown): void {
	writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path: string, value: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, value, "utf8");
}
