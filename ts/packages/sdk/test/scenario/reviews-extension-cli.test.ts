import { z } from "zod";

import { describe, expect, test } from "vitest";

import type { NsCliDeps } from "../../src/cli/index.ts";
import type {
	ExtensionCommandCandidate,
	SelectedNsCommandLoadResult,
} from "../../src/extensions/registry.ts";
import { parseJsonOutput, runCliWithFakes, type RunWithFakesOptions } from "./ns-cli-fakes.ts";
import { defineCommand, type NsCommand, type NsExtensionApi } from "@nseng-ai/sdk/sdk";

function runWithFakeReviewsExtension(options: RunWithFakesOptions) {
	const registry = fakeReviewsRegistry();
	const run = runCliWithFakes(
		{ ...options, extensionRegistry: registry },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
	return { ...run, registry };
}

describe("Reviews ns command face", () => {
	test("top-level help discovers Reviews manifest metadata without loading selected code", async () => {
		const run = runWithFakeReviewsExtension({ args: ["--help"] });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("reviews");
		expect(help).toContain("Run configured code reviews.");
		expect(help).not.toContain("--applicable");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual([]);
	});

	test("group help exposes flat Reviews commands without running backends", async () => {
		const run = runWithFakeReviewsExtension({ args: ["reviews", "--help"] });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: ns reviews");
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

	test("selected Reviews help loads only the selected command schema", async () => {
		const run = runWithFakeReviewsExtension({ args: ["reviews", "list", "--help"] });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: ns reviews list");
		expect(help).toContain("--applicable");
		expect(help).toContain("--ci");
		expect(help).toContain("--base-ref");
		expect(help).toContain("gateway-injected");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual(["reviews/list"]);
	});

	test("selected Reviews command publishes its machine schema", async () => {
		const run = runWithFakeReviewsExtension({
			args: ["reviews", "log", "--json-schema"],
		});

		expect(await run.exit).toBe(0);
		const schema = parseJsonOutput(run);
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual(["reviews/log"]);
	});

	test("hidden Reviews publish-findings publishes its machine schema", async () => {
		const run = runWithFakeReviewsExtension({
			args: ["reviews", "exec", "publish-findings", "--json-schema"],
		});

		expect(await run.exit, run.stderr.join("")).toBe(0);
		const schema = parseJsonOutput(run);
		expect(schema).toHaveProperty("inputJsonSchema");
		expect(schema).toHaveProperty("outputJsonSchema");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual(["reviews/exec/publish-findings"]);
	});

	test("selected visible Reviews path routes parsed requests and the ns API", async () => {
		const run = runWithFakeReviewsExtension({
			args: ["reviews", "list", "--format", "json", "--ci", "--base-ref", "main"],
			cwd: "/workspace/project",
		});

		expect(await run.exit).toBe(0);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("ok");
		expect(envelope.exitCode).toBe(0);
		expect(envelope.data).toMatchObject({
			commandKey: "reviews/list",
			cwd: "/workspace/project",
			request: { ci: true, baseRef: "main" },
		});
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual(["reviews/list"]);
	});

	test("selected hidden Reviews path routes parsed requests and ns stdin", async () => {
		const run = runWithFakeReviewsExtension({
			args: ["reviews", "exec", "publish-findings", "--pr-number", "47", "--format", "json"],
			state: { stdin: '{"status":"ok"}' },
		});

		expect(await run.exit, run.stderr.join("")).toBe(0);
		const envelope = parseJsonOutput(run);
		expect(envelope.status).toBe("ok");
		expect(envelope.data).toMatchObject({
			commandKey: "reviews/exec/publish-findings",
			stdin: '{"status":"ok"}',
			request: { prNumber: 47 },
		});
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
		expect(run.registry.loadLog).toEqual(["reviews/exec/publish-findings"]);
	});
});

interface FakeReviewsRegistry {
	loadLog: string[];
	loadCommandCatalog: NonNullable<
		NonNullable<NsCliDeps["extensionRegistry"]>["loadCommandCatalog"]
	>;
	loadSelectedCommand: (
		candidate: ExtensionCommandCandidate,
	) => Promise<SelectedNsCommandLoadResult>;
}

interface FakeReviewsCommandSpec {
	readonly name: string;
	readonly description: string;
	readonly entryPath: string;
	readonly segments?: readonly string[];
	readonly command: NsCommand;
}

const fakeReviewsCommandSpecs = [
	{
		name: "list",
		description: "List configured Reviews and generated review-skill metadata.",
		entryPath: "fake://reviews/src/commands/list.ts",
		segments: ["reviews", "list"],
		command: fakeReviewsCommand({
			key: "reviews/list",
			name: "list",
			summary: "List configured Reviews review definitions.",
			description:
				"List configured Reviews review definitions through a gateway-injected fake command.",
			schema: z.object({
				applicable: z.boolean().optional(),
				ci: z.boolean().default(false),
				baseRef: z.string().optional(),
			}),
		}),
	},
	{
		name: "ls",
		description: "Alias for reviews list.",
		entryPath: "fake://reviews/src/commands/ls.ts",
		segments: ["reviews", "ls"],
		command: fakeReviewsCommand({
			key: "reviews/ls",
			name: "ls",
			summary: "Alias for reviews list.",
			description: "Alias for the fake Reviews list command.",
		}),
	},
	{
		name: "log",
		description: "List Reviews review logs for this branch.",
		entryPath: "fake://reviews/src/commands/log.ts",
		segments: ["reviews", "log"],
		command: fakeReviewsCommand({
			key: "reviews/log",
			name: "log",
			summary: "List Reviews review logs for this branch.",
			description: "List fake Reviews review logs for this branch.",
			schema: z.object({ key: z.string().optional() }),
		}),
	},
	{
		name: "run",
		description: "Run a configured Reviews review over the current diff.",
		entryPath: "fake://reviews/src/commands/run.ts",
		segments: ["reviews", "run"],
		command: fakeReviewsCommand({
			key: "reviews/run",
			name: "run",
			summary: "Run a configured Reviews review over the current diff.",
			description: "Run a fake Reviews review over the current diff.",
		}),
	},
	{
		name: "record-findings",
		description: "Record same-session Reviews findings from stdin.",
		entryPath: "fake://reviews/src/commands/exec-record-findings.ts",
		segments: ["reviews", "exec", "record-findings"],
		command: fakeReviewsCommand({
			key: "reviews/exec/record-findings",
			name: "record-findings",
			summary: "Record same-session Reviews findings from stdin.",
			description: "Record fake same-session Reviews findings from stdin.",
		}),
	},
	{
		name: "publish-findings",
		description: "Publish Reviews findings to GitHub.",
		entryPath: "fake://reviews/src/commands/exec-publish-findings.ts",
		segments: ["reviews", "exec", "publish-findings"],
		command: fakeReviewsCommand({
			key: "reviews/exec/publish-findings",
			name: "publish-findings",
			summary: "Publish Reviews findings to GitHub.",
			description: "Publish fake Reviews findings to GitHub.",
			schema: z.object({
				prNumber: z.coerce.number().int().positive(),
			}),
		}),
	},
] as const satisfies readonly FakeReviewsCommandSpec[];

function fakeReviewsRegistry(): FakeReviewsRegistry {
	const loadLog: string[] = [];
	const candidates = fakeReviewsCommandSpecs.map(reviewsCandidate);
	const candidatesByKey = new Map(
		candidates.map((candidate) => [candidateKey(candidate), candidate]),
	);
	return {
		loadLog,
		async loadCommandCatalog(_options) {
			return {
				candidates: candidatesByKey,
				commandInfos: candidates.map(
					({ group, name, segments, description, fullDescription, hiddenAncestorKeys }) => ({
						...(group === undefined ? {} : { group }),
						...(segments === undefined ? {} : { segments }),
						...(hiddenAncestorKeys === undefined ? {} : { hiddenAncestorKeys }),
						name,
						description,
						fullDescription,
					}),
				),
				diagnostics: [],
			};
		},
		async loadSelectedCommand(candidate) {
			const key = candidateKey(candidate);
			loadLog.push(key);
			const spec = fakeReviewsCommandSpecs.find((entry) => reviewsSpecKey(entry) === key);
			if (spec === undefined) {
				return {
					ok: false,
					diagnostic: {
						severity: "error",
						code: "extension_command_missing",
						message: `Missing fake Reviews command ${key}`,
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

function reviewsCandidate(spec: FakeReviewsCommandSpec): ExtensionCommandCandidate {
	return {
		group: "reviews",
		...(spec.segments === undefined ? {} : { segments: spec.segments }),
		...(spec.segments?.[1] === "exec" ? { hiddenAncestorKeys: ["reviews/exec"] } : {}),
		name: spec.name,
		description: spec.description,
		fullDescription: spec.description,
		groupDescription: "Run configured code reviews.",
		source: { level: "project", label: "fake checked-in Reviews extension" },
		moduleReference: { type: "file", path: spec.entryPath },
		entryPath: spec.entryPath,
		hasStaticCommandInfo: true,
	};
}

function fakeReviewsCommand(options: {
	key: string;
	name: string;
	summary: string;
	description: string;
	schema?: z.ZodObject;
}): NsCommand {
	return defineCommand({
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
		handler: async (ctx, request) => ({
			type: "ok",
			data: {
				commandKey: options.key,
				cwd: ctx.cwd,
				request,
				stdin: await readStdin(ctx),
			},
		}),
	});
}

async function readStdin(ctx: NsExtensionApi): Promise<string> {
	return await (ctx.stdin?.() ?? Promise.resolve(""));
}

function reviewsSpecKey(spec: FakeReviewsCommandSpec): string {
	if (spec.segments !== undefined) return spec.segments.join("/");
	return `reviews/${spec.name}`;
}

function candidateKey(
	candidate: Pick<ExtensionCommandCandidate, "group" | "name" | "segments">,
): string {
	if (candidate.segments !== undefined) return candidate.segments.join("/");
	return candidate.group === undefined ? candidate.name : `${candidate.group}/${candidate.name}`;
}
