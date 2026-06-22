import { z } from "zod";
import { describe, expect, test } from "vitest";

import { ClinkrGroup, ok } from "../src/index.ts";
import { rawCommand } from "../src/raw/index.ts";

interface ProbeContext {
	calls: string[];
}

function candidateValues(group: ClinkrGroup<ProbeContext>, words: readonly string[]): string[] {
	return group.complete({ words }).candidates.map((candidate) => candidate.value);
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
		expect(longValues).toContain("--shell-exit-code");
		expect(longValues).toContain("--json-schema");
		expect(longValues).toContain("--help");
		expect(allFlagValues).toContain("-h");
	});

	test("keeps rendered-only options off raw commands", () => {
		const values = candidateValues(buildCompletionTree(), ["raw", "--"]);

		expect(values).toContain("--json-schema");
		expect(values).not.toContain("--format");
		expect(values).not.toContain("--shell-exit-code");
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
