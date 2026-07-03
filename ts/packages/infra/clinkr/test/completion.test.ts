import { z } from "zod";
import { describe, expect, test } from "vitest";

import {
	ClinkrGroup,
	ok,
	renderClinkrCompletionScript,
	renderCompletionCandidatesNewline,
} from "../src/index.ts";
import { rawCommand } from "../src/raw/index.ts";

interface ProbeContext {
	calls: string[];
}

function candidateValues(group: ClinkrGroup<ProbeContext>, words: readonly string[]): string[] {
	return group.complete({ words }).candidates.map((candidate) => candidate.value);
}

async function asyncCandidateValues(
	group: ClinkrGroup<ProbeContext>,
	words: readonly string[],
	context: ProbeContext = { calls: [] },
): Promise<string[]> {
	const result = await group.completeAsync({ words }, { context });
	return result.candidates.map((candidate) => candidate.value);
}

function buildCompletionTree(): ClinkrGroup<ProbeContext> {
	const root = new ClinkrGroup<ProbeContext>({
		name: "probe",
		version: "1.2.3",
		runtimeInfo: () => "runtime: test\n",
	});
	root.command({
		name: "echo",
		summary: "Echo a request.",
		schema: z.object({
			name: z.string().describe("name to echo"),
			mode: z.enum(["fast", "slow"]).default("fast"),
			dryRun: z.boolean().default(false),
		}),
		handler: async (ctx, request) => {
			ctx.calls.push("echo");
			return ok(request);
		},
	});
	root.command(
		rawCommand({
			name: "raw",
			schema: z.object({ path: z.string() }),
			run: async (ctx) => {
				ctx.calls.push("raw");
				return 0;
			},
		}),
	);
	const sub = new ClinkrGroup<ProbeContext>({ name: "sub", description: "Visible subgroup." });
	sub.command({
		name: "inner",
		schema: z.object({ kind: z.enum(["one", "two"]) }),
		positionals: { kind: { position: 0 } },
		handler: async (ctx, request) => {
			ctx.calls.push(`inner:${request.kind}`);
			return ok(request);
		},
	});
	root.group(sub);
	const exec = new ClinkrGroup<ProbeContext>({ name: "exec", isHidden: true });
	exec.command({
		name: "resolve",
		schema: z.object({}),
		handler: async (ctx) => {
			ctx.calls.push("resolve");
			return ok({});
		},
	});
	root.group(exec);
	return root;
}

describe("clinkr static completion", () => {
	test("suggests visible commands and groups without invoking handlers", () => {
		const context: ProbeContext = { calls: [] };
		const group = buildCompletionTree();

		expect(group.complete({ words: [""] }).candidates).toEqual([
			{ value: "echo", type: "command", description: "Echo a request." },
			{ value: "raw", type: "command" },
			{ value: "sub", type: "command", description: "Visible subgroup." },
		]);
		expect(context.calls).toEqual([]);
	});

	test("omits hidden groups from suggestions but traverses explicit hidden paths", () => {
		const group = buildCompletionTree();

		expect(candidateValues(group, [""])).not.toContain("exec");
		expect(candidateValues(group, ["exec", ""])).toEqual(["resolve"]);
	});

	test("suggests command options, aliases, and rendered framework options", () => {
		const longValues = candidateValues(buildCompletionTree(), ["echo", "--"]);
		const allFlagValues = candidateValues(buildCompletionTree(), ["echo", "-"]);

		expect(longValues).toContain("--name");
		expect(longValues).toContain("--mode");
		expect(longValues).toContain("--dry-run");
		expect(longValues).toContain("--format");
		expect(longValues).not.toContain("--shell" + "-exit-code");
		expect(longValues).toContain("--json-schema");
		expect(longValues).toContain("--help");
		expect(allFlagValues).toContain("-h");
	});

	test("keeps rendered-only options off raw commands", () => {
		const values = candidateValues(buildCompletionTree(), ["raw", "--"]);

		expect(values).toContain("--json-schema");
		expect(values).not.toContain("--format");
		expect(values).not.toContain("--shell" + "-exit-code");
	});

	test("suggests root-only framework options only at the root", () => {
		const rootValues = candidateValues(buildCompletionTree(), ["--"]);
		const subgroupValues = candidateValues(buildCompletionTree(), ["sub", "--"]);

		expect(rootValues).toContain("--runtime");
		expect(rootValues).toContain("--version");
		expect(candidateValues(buildCompletionTree(), ["-"])).toContain("-V");
		expect(subgroupValues).not.toContain("--runtime");
		expect(subgroupValues).not.toContain("--version");
		expect(subgroupValues).not.toContain("-V");
	});

	test("suggests enum option values as separate tokens and equals completions", () => {
		const group = buildCompletionTree();

		expect(candidateValues(group, ["echo", "--mode", "s"])).toEqual(["slow"]);
		expect(candidateValues(group, ["echo", "--mode=f"])).toEqual(["--mode=fast"]);
		expect(candidateValues(group, ["echo", "--format", "m"])).toEqual(["markdown", "md"]);
	});

	test("suggests positional enum values", () => {
		const group = buildCompletionTree();

		expect(candidateValues(group, ["sub", "inner", "t"])).toEqual(["two"]);
	});

	test("does not offer positional values while completing a non-enum option value", () => {
		const group = new ClinkrGroup<ProbeContext>({ name: "probe" });
		group.command({
			name: "choose",
			schema: z.object({ name: z.string(), kind: z.enum(["one", "two"]) }),
			positionals: { kind: { position: 0 } },
			handler: async (_ctx, request) => ok(request),
		});

		expect(candidateValues(group, ["choose", "--name", "t"])).toEqual([]);
	});
});

describe("clinkr dynamic completion", () => {
	test("static-only async completion matches static completion", async () => {
		const group = buildCompletionTree();

		expect(await asyncCandidateValues(group, ["echo", "--"])).toEqual(
			candidateValues(group, ["echo", "--"]),
		);
	});

	test("appends dynamic candidates to static candidates and dedupes", async () => {
		const group = new ClinkrGroup<ProbeContext>({ name: "probe" });
		group.command({
			name: "choose",
			schema: z.object({ kind: z.enum(["one", "two"]), name: z.string().optional() }),
			positionals: { kind: { position: 0 }, name: { position: 1 } },
			completionProvider: () => [
				{ value: "one", type: "positional-value" },
				{ value: "three", type: "positional-value" },
			],
			handler: async (_ctx, request) => ok(request),
		});

		expect(await asyncCandidateValues(group, ["choose", ""])).toEqual(["one", "two", "three"]);
	});

	test("provider sees current token, previous words, command args, and positional index", async () => {
		const requests: unknown[] = [];
		const group = new ClinkrGroup<ProbeContext>({ name: "probe" });
		group.command({
			name: "checkout",
			schema: z.object({ branch: z.string(), base: z.string().optional(), new: z.boolean() }),
			positionals: { branch: { position: 0 }, base: { position: 1 } },
			options: { new: { short: "-b" } },
			completionProvider: (_ctx, request) => {
				requests.push(request);
				return [{ value: "main", type: "positional-value" }];
			},
			handler: async (_ctx, request) => ok(request),
		});

		expect(await asyncCandidateValues(group, ["checkout", "-b", "new-branch", "m"])).toEqual([
			"main",
		]);
		expect(requests).toMatchObject([
			{
				words: ["checkout", "-b", "new-branch", "m"],
				current: "m",
				previous: ["checkout", "-b", "new-branch"],
				args: ["-b", "new-branch"],
				positionalIndex: 1,
			},
		]);
	});

	test("sync completion remains static and provider is not a command handler", async () => {
		const context: ProbeContext = { calls: [] };
		const group = new ClinkrGroup<ProbeContext>({ name: "probe" });
		group.command({
			name: "choose",
			schema: z.object({ name: z.string().optional() }),
			positionals: { name: { position: 0 } },
			completionProvider: (ctx) => {
				ctx.calls.push("provider");
				return [{ value: "dynamic", type: "positional-value" }];
			},
			handler: async (ctx, request) => {
				ctx.calls.push("handler");
				return ok(request);
			},
		});

		expect(candidateValues(group, ["choose", ""])).toEqual([]);
		expect(await asyncCandidateValues(group, ["choose", ""], context)).toEqual(["dynamic"]);
		expect(context.calls).toEqual(["provider"]);
	});

	test("provider failure returns static candidates and reports the error", async () => {
		const errors: unknown[] = [];
		const group = new ClinkrGroup<ProbeContext>({ name: "probe" });
		group.command({
			name: "choose",
			schema: z.object({ kind: z.enum(["one", "two"]) }),
			positionals: { kind: { position: 0 } },
			completionProvider: () => {
				throw new Error("boom");
			},
			handler: async (_ctx, request) => ok(request),
		});

		const result = await group.completeAsync(
			{ words: ["choose", ""] },
			{ context: { calls: [] }, onDynamicCompletionError: (error) => errors.push(error) },
		);

		expect(result.candidates.map((candidate) => candidate.value)).toEqual(["one", "two"]);
		expect(errors).toHaveLength(1);
	});
});

describe("clinkr shell completion helpers", () => {
	test("renders newline candidate values without descriptions", () => {
		expect(
			renderCompletionCandidatesNewline({
				candidates: [
					{ value: "alpha", type: "command", description: "Alpha command." },
					{ value: "--beta", type: "option", description: "Beta option." },
				],
			}),
		).toBe("alpha\n--beta\n");
	});

	test("renders dynamic resolver setup scripts for supported shells", () => {
		const resolverCommand = ["completion", "exec", "resolve"];
		const bash = renderClinkrCompletionScript({
			commandName: "ji",
			shell: "bash",
			resolverCommand,
		});
		const zsh = renderClinkrCompletionScript({ commandName: "ji", shell: "zsh", resolverCommand });
		const fish = renderClinkrCompletionScript({
			commandName: "ji",
			shell: "fish",
			resolverCommand,
		});

		expect(bash).toContain("complete -F _ji_completion 'ji'");
		expect(bash).toContain("'ji' 'completion' 'exec' 'resolve' --");
		expect(zsh).toContain("compdef _ji_completion 'ji'");
		expect(zsh).toContain("'ji' 'completion' 'exec' 'resolve' --");
		expect(fish).toContain("complete -c 'ji'");
		expect(fish).toContain("'ji' 'completion' 'exec' 'resolve' --");
	});
});
