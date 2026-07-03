import { z } from "zod";

import { describe, expect, test } from "vitest";

import type { SdlCliDeps } from "../../src/cli/index.ts";
import type {
	ExtensionCommandCandidate,
	SelectedSdlCommandLoadResult,
} from "../../src/extensions/registry.ts";
import { parseJsonOutput, runCliWithFakes, type RunWithFakesOptions } from "./sdl-cli-fakes.ts";
import type { SdlCommand, SdlExtensionApi } from "@sdl/kernel/sdk";

function runWithFakeRoasterExtension(options: RunWithFakesOptions) {
	const registry = fakeRoasterRegistry();
	const run = runCliWithFakes(
		{ ...options, extensionRegistry: registry },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
	return { ...run, registry };
}

describe("Roaster SDL command face", () => {
	test("top-level help discovers Roaster manifest metadata without loading selected code", async () => {
		const run = runWithFakeRoasterExtension({ args: ["--help"] });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("roaster");
		expect(help).toContain("Run configured Roaster reviews.");
		expect(help).not.toContain("--applicable");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual([]);
	});

	test("group help exposes nested Roaster commands without running backends", async () => {
		const run = runWithFakeRoasterExtension({ args: ["roaster", "review", "--help"] });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: ji roaster review");
		expect(help).toContain("list");
		expect(help).toContain("ls");
		expect(help).toContain("log");
		expect(help).toContain("run");
		expect(help).not.toContain("exec");
		expect(help).not.toContain("--applicable");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual([]);
	});

	test("selected Roaster help loads only the selected command schema", async () => {
		const run = runWithFakeRoasterExtension({ args: ["roaster", "review", "list", "--help"] });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: ji roaster review list");
		expect(help).toContain("--applicable");
		expect(help).toContain("--ci");
		expect(help).toContain("--base-ref");
		expect(help).toContain("gateway-injected");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual(["roaster/review/list"]);
	});

	test("selected Roaster command publishes its machine schema", async () => {
		const run = runWithFakeRoasterExtension({
			args: ["roaster", "review", "log", "--json-schema"],
		});

		expect(await run.exit).toBe(0);
		const schema = parseJsonOutput(run);
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual(["roaster/review/log"]);
	});

	test("hidden Roaster publish-findings publishes its machine schema", async () => {
		const run = runWithFakeRoasterExtension({
			args: ["roaster", "exec", "publish-findings", "--json-schema"],
		});

		expect(await run.exit, run.stderr.join("")).toBe(0);
		const schema = parseJsonOutput(run);
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual(["roaster/exec-publish-findings"]);
	});

	test("selected visible Roaster path routes parsed requests and the SDL API", async () => {
		const run = runWithFakeRoasterExtension({
			args: ["roaster", "review", "list", "--format", "json", "--ci", "--base-ref", "main"],
			cwd: "/workspace/project",
		});

		expect(await run.exit).toBe(0);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("ok");
		expect(envelope.exitCode).toBe(0);
		expect(envelope.data).toMatchObject({
			commandKey: "roaster/review/list",
			cwd: "/workspace/project",
			request: { ci: true, baseRef: "main" },
		});
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual(["roaster/review/list"]);
	});

	test("selected hidden Roaster path routes parsed requests and SDL stdin", async () => {
		const run = runWithFakeRoasterExtension({
			args: ["roaster", "exec", "publish-findings", "--pr-number", "47", "--format", "json"],
			state: { stdin: '{"status":"ok"}' },
		});

		expect(await run.exit, run.stderr.join("")).toBe(0);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("ok");
		expect(envelope.data).toMatchObject({
			commandKey: "roaster/exec-publish-findings",
			stdin: '{"status":"ok"}',
			request: { prNumber: 47 },
		});
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual(["roaster/exec-publish-findings"]);
	});
});

interface FakeRoasterRegistry {
	loadLog: string[];
	loadCommandCatalog: NonNullable<
		NonNullable<SdlCliDeps["extensionRegistry"]>["loadCommandCatalog"]
	>;
	loadSelectedCommand: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedSdlCommandLoadResult>;
}

interface FakeRoasterCommandSpec {
	readonly name: string;
	readonly description: string;
	readonly entryPath: string;
	readonly segments?: readonly string[];
	readonly command: SdlCommand;
}

const fakeRoasterCommandSpecs = [
	{
		name: "review-list",
		description: "List configured Roaster review definitions.",
		entryPath: "fake://roaster/src/commands/review-list.ts",
		segments: ["roaster", "review", "list"],
		command: fakeRoasterCommand({
			key: "roaster/review/list",
			name: "list",
			summary: "List configured Roaster review definitions.",
			description:
				"List configured Roaster review definitions through a gateway-injected fake command.",
			schema: z.object({
				applicable: z.boolean().optional(),
				ci: z.boolean().default(false),
				baseRef: z.string().optional(),
			}),
		}),
	},
	{
		name: "review-ls",
		description: "Alias for review list.",
		entryPath: "fake://roaster/src/commands/review-ls.ts",
		segments: ["roaster", "review", "ls"],
		command: fakeRoasterCommand({
			key: "roaster/review/ls",
			name: "ls",
			summary: "Alias for review list.",
			description: "Alias for the fake Roaster review list command.",
		}),
	},
	{
		name: "review-log",
		description: "List Roaster review logs for this branch.",
		entryPath: "fake://roaster/src/commands/review-log.ts",
		segments: ["roaster", "review", "log"],
		command: fakeRoasterCommand({
			key: "roaster/review/log",
			name: "log",
			summary: "List Roaster review logs for this branch.",
			description: "List fake Roaster review logs for this branch.",
			schema: z.object({ key: z.string().optional() }),
		}),
	},
	{
		name: "review-run",
		description: "Run a configured Roaster review over the current diff.",
		entryPath: "fake://roaster/src/commands/review-run.ts",
		segments: ["roaster", "review", "run"],
		command: fakeRoasterCommand({
			key: "roaster/review/run",
			name: "run",
			summary: "Run a configured Roaster review over the current diff.",
			description: "Run a fake Roaster review over the current diff.",
		}),
	},
	{
		name: "exec-record-findings",
		description: "Record same-session Roaster findings from stdin.",
		entryPath: "fake://roaster/src/commands/exec-record-findings.ts",
		command: fakeRoasterCommand({
			key: "roaster/exec-record-findings",
			name: "exec-record-findings",
			summary: "Record same-session Roaster findings from stdin.",
			description: "Record fake same-session Roaster findings from stdin.",
		}),
	},
	{
		name: "exec-publish-findings",
		description: "Publish Roaster findings to GitHub.",
		entryPath: "fake://roaster/src/commands/exec-publish-findings.ts",
		command: fakeRoasterCommand({
			key: "roaster/exec-publish-findings",
			name: "exec-publish-findings",
			summary: "Publish Roaster findings to GitHub.",
			description: "Publish fake Roaster findings to GitHub.",
			schema: z.object({
				prNumber: z.coerce.number().int().positive(),
			}),
		}),
	},
	{
		name: "roast-list",
		description: "List Roaster review-skill commands.",
		entryPath: "fake://roaster/src/commands/roast-list.ts",
		segments: ["roaster", "roast", "list"],
		command: fakeRoasterCommand({
			key: "roaster/roast/list",
			name: "list",
			summary: "List Roaster review-skill commands.",
			description: "List fake Roaster review-skill commands.",
		}),
	},
] as const satisfies readonly FakeRoasterCommandSpec[];

function fakeRoasterRegistry(): FakeRoasterRegistry {
	const loadLog: string[] = [];
	const candidates = fakeRoasterCommandSpecs.map(roasterCandidate);
	const candidatesByKey = new Map(
		candidates.map((candidate) => [candidateKey(candidate), candidate]),
	);
	return {
		loadLog,
		async loadCommandCatalog(_options) {
			return {
				candidates: candidatesByKey,
				commandInfos: candidates.map(({ group, name, segments, description, fullDescription }) => ({
					...(group === undefined ? {} : { group }),
					...(segments === undefined ? {} : { segments }),
					name,
					description,
					fullDescription,
				})),
				diagnostics: [],
			};
		},
		async loadSelectedCommand(candidate) {
			const key = candidateKey(candidate);
			loadLog.push(key);
			const spec = fakeRoasterCommandSpecs.find((entry) => roasterSpecKey(entry) === key);
			if (spec === undefined) {
				return {
					ok: false,
					diagnostic: {
						severity: "error",
						code: "extension_command_missing",
						message: `Missing fake Roaster command ${key}`,
						commandName: key,
					},
				};
			}
			return {
				ok: true,
				command: spec.command,
				source: candidate.source,
				path: candidate,
			};
		},
	};
}

function roasterCandidate(spec: FakeRoasterCommandSpec): ExtensionCommandCandidate {
	return {
		group: "roaster",
		...(spec.segments === undefined ? {} : { segments: spec.segments }),
		name: spec.name,
		description: spec.description,
		fullDescription: spec.description,
		groupDescription: "Run configured Roaster reviews.",
		source: { level: "project", label: "fake checked-in Roaster extension" },
		entryPath: spec.entryPath,
		kind: "package",
	};
}

function fakeRoasterCommand(options: {
	key: string;
	name: string;
	summary: string;
	description: string;
	schema?: z.ZodObject;
}): SdlCommand {
	return {
		name: options.name,
		summary: options.summary,
		description: options.description,
		schema: options.schema ?? z.object({}),
		resultSchema: z.object({
			commandKey: z.string(),
			cwd: z.string(),
			request: z.record(z.string(), z.unknown()),
			stdin: z.string(),
		}),
		async run(ctx, request) {
			return {
				type: "ok",
				data: {
					commandKey: options.key,
					cwd: ctx.cwd,
					request,
					stdin: await readStdin(ctx),
				},
			};
		},
	};
}

async function readStdin(ctx: SdlExtensionApi): Promise<string> {
	return await (ctx.stdin?.() ?? Promise.resolve(""));
}

function roasterSpecKey(spec: FakeRoasterCommandSpec): string {
	if (spec.segments !== undefined) return spec.segments.join("/");
	return `roaster/${spec.name}`;
}

function candidateKey(
	candidate: Pick<ExtensionCommandCandidate, "group" | "name" | "segments">,
): string {
	if (candidate.segments !== undefined) return candidate.segments.join("/");
	return candidate.group === undefined ? candidate.name : `${candidate.group}/${candidate.name}`;
}
