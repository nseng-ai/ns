import { z } from "zod";
import { describe, expect, test } from "vitest";

import { LegacyClinkrGroup, ok } from "../src/index.ts";
import { parseEnvelope, runForTest } from "../src/testing/index.ts";

interface ProbeContext {
	calls: string[];
}

function buildTree(): LegacyClinkrGroup<ProbeContext> {
	const root = new LegacyClinkrGroup<ProbeContext>({
		name: "root",
		description: "Root group.",
	});
	root.command({
		name: "top",
		schema: z.object({}),
		handler: async (ctx) => {
			ctx.calls.push("top");
			return ok({});
		},
	});
	const sub = new LegacyClinkrGroup<ProbeContext>({
		name: "sub",
		description: "Visible subgroup.",
	});
	sub.command({
		name: "inner",
		schema: z.object({ x: z.number() }),
		handler: async (ctx, request) => {
			ctx.calls.push(`inner:${request.x}`);
			return ok({ x: request.x });
		},
	});
	root.group(sub);
	const exec = new LegacyClinkrGroup<ProbeContext>({
		name: "exec",
		description: "Skill-invoked operations.",
		isHidden: true,
	});
	exec.command({
		name: "resolve",
		schema: z.object({}),
		handler: async (ctx) => {
			ctx.calls.push("resolve");
			return ok({ resolved: true });
		},
	});
	root.group(exec);
	return root;
}

describe("root group options", () => {
	function buildRootOptionsTree(): LegacyClinkrGroup<ProbeContext> {
		const root = new LegacyClinkrGroup<ProbeContext>({
			name: "root",
			version: "1.2.3",
			runtimeInfo: () => "runtime: test\n",
		});
		const sub = new LegacyClinkrGroup<ProbeContext>({ name: "sub" });
		sub.command({
			name: "inner",
			schema: z.object({}),
			handler: async (ctx) => {
				ctx.calls.push("inner");
				return ok({});
			},
		});
		root.group(sub);
		return root;
	}

	test("root version exits 0 and ignores trailing args", async () => {
		const group = buildRootOptionsTree();
		for (const argv of [["-V"], ["--version"], ["--version", "extra"]]) {
			const run = await runForTest(group, argv, { context: { calls: [] } });
			expect(run.exitCode).toBe(0);
			expect(run.stdout).toBe("1.2.3\n");
			expect(run.stderr).toBe("");
		}
	});

	test("root runtime exits 0 without adding a newline", async () => {
		const run = await runForTest(buildRootOptionsTree(), ["--runtime"], {
			context: { calls: [] },
		});
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("runtime: test\n");
		expect(run.stderr).toBe("");
	});

	test("root-only options do not appear in subgroup help", async () => {
		const run = await runForTest(buildRootOptionsTree(), ["sub", "--help"], {
			context: { calls: [] },
		});
		expect(run.exitCode).toBe(0);
		expect(run.stdout).not.toContain("--runtime");
		expect(run.stdout).not.toContain("--version");
		expect(run.stdout).not.toContain("-V");
	});
});

describe("default raw commands", () => {
	function buildDefaultTree(): LegacyClinkrGroup<ProbeContext> {
		const root = new LegacyClinkrGroup<ProbeContext>({
			name: "root",
			description: "Root group with a default action.",
			version: "1.2.3",
			runtimeInfo: () => "runtime: test\n",
		});
		root.defaultCommand({
			schema: z.object({
				name: z.string(),
				registry: z.array(z.string()).optional(),
				json: z.boolean().optional(),
			}),
			positionals: { name: { position: 0 } },
			isRawExit: true,
			run: async (ctx, request) => {
				ctx.calls.push(
					`default:${request.name}:${(request.registry ?? []).join(",")}:${request.json === true}`,
				);
				return 7;
			},
		});
		const sub = new LegacyClinkrGroup<ProbeContext>({ name: "sub" });
		sub.command({
			name: "inner",
			schema: z.object({}),
			handler: async (ctx) => {
				ctx.calls.push("inner");
				return ok({});
			},
		});
		root.group(sub);
		return root;
	}

	test("dispatches root positionals and options through a raw default command", async () => {
		const context: ProbeContext = { calls: [] };
		const run = await runForTest(
			buildDefaultTree(),
			["pkg", "--registry", "pypi", "--registry", "npm", "--json"],
			{ context },
		);

		expect(run.exitCode).toBe(7);
		expect(run.stdout).toBe("");
		expect(run.stderr).toBe("");
		expect(context.calls).toEqual(["default:pkg:pypi,npm:true"]);
	});

	test("root runtime and help still win over default parsing", async () => {
		const runtime = await runForTest(buildDefaultTree(), ["--runtime"], {
			context: { calls: [] },
		});
		expect(runtime).toMatchObject({ exitCode: 0, stdout: "runtime: test\n", stderr: "" });

		const help = await runForTest(buildDefaultTree(), ["--help"], { context: { calls: [] } });
		expect(help.exitCode).toBe(0);
		expect(help.stdout).toContain("Usage:");
		expect(help.stdout).toContain("Root group with a default action.");
		expect(help.stdout).toContain("--registry");
		expect(help.stdout).toContain("sub");
		expect(help.stderr).toBe("");
	});

	test("bare root with required default positional exits 2", async () => {
		const run = await runForTest(buildDefaultTree(), [], { context: { calls: [] } });

		expect(run.exitCode).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("name");
	});

	test("subcommands win over root default parsing", async () => {
		const context: ProbeContext = { calls: [] };
		const run = await runForTest(buildDefaultTree(), ["sub", "inner", "--format", "json"], {
			context,
		});

		expect(run.exitCode).toBe(0);
		expect(context.calls).toEqual(["inner"]);
		expect(parseEnvelope(run.stdout).data).toEqual({});
	});
});

describe("nested groups", () => {
	test("nested subgroup commands dispatch with parsed requests", async () => {
		const context: ProbeContext = { calls: [] };
		const run = await runForTest(buildTree(), ["sub", "inner", "--x", "1", "--format", "json"], {
			context,
		});
		expect(run.exitCode).toBe(0);
		expect(context.calls).toEqual(["inner:1"]);
		expect(parseEnvelope(run.stdout).data).toEqual({ x: 1 });
	});

	test("a bare group prints help to stdout and exits 0", async () => {
		const run = await runForTest(buildTree(), [], { context: { calls: [] } });
		expect(run.exitCode).toBe(0);
		expect(run.stderr).toBe("");
		expect(run.stdout).toContain("Usage:");
		expect(run.stdout).toContain("top");
	});

	test("a leaf command named ls blocks the bare list group alias", async () => {
		const context: ProbeContext = { calls: [] };
		const root = new LegacyClinkrGroup<ProbeContext>({ name: "root" });
		root.command({
			name: "ls",
			schema: z.object({}),
			handler: async (ctx) => {
				ctx.calls.push("ls");
				return ok({});
			},
		});
		root.group(new LegacyClinkrGroup<ProbeContext>({ name: "list" }));

		const run = await runForTest(root, ["ls"], { context });

		expect(run.exitCode).toBe(0);
		expect(context.calls).toEqual(["ls"]);
		expect(run.stdout).not.toContain("Usage:");
	});

	test("--help works at every level and exits 0", async () => {
		for (const argv of [["--help"], ["sub", "--help"], ["sub", "inner", "--help"]]) {
			const run = await runForTest(buildTree(), argv, { context: { calls: [] } });
			expect(run.exitCode).toBe(0);
			expect(run.stdout).toContain("Usage:");
			expect(run.stderr).toBe("");
		}
	});

	test("subgroups can render under a custom parent help section", async () => {
		const root = new LegacyClinkrGroup<ProbeContext>({ name: "root" });
		root.group(new LegacyClinkrGroup<ProbeContext>({ name: "built-in", helpGroup: "Built-ins:" }));
		root.group(
			new LegacyClinkrGroup<ProbeContext>({ name: "extension", helpGroup: "Extensions:" }),
		);

		const run = await runForTest(root, ["--help"], { context: { calls: [] } });

		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("Built-ins:\n  built-in");
		expect(run.stdout).toContain("Extensions:\n  extension");
		expect(run.stderr).toBe("");
	});

	test("commands can render under a custom parent help section", async () => {
		const root = new LegacyClinkrGroup<ProbeContext>({ name: "root" });
		root.command({
			name: "init",
			summary: "Activate root.",
			helpGroup: "Built-ins:",
			schema: z.object({}),
			handler: async () => ok({}),
		});

		const run = await runForTest(root, ["--help"], { context: { calls: [] } });

		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("Built-ins:\n  init");
		expect(run.stdout).not.toContain("\nCommands:\n  init");
		expect(run.stderr).toBe("");
	});
});

describe("hidden subgroups", () => {
	test("hidden subgroups are absent from parent help", async () => {
		const run = await runForTest(buildTree(), ["--help"], { context: { calls: [] } });
		expect(run.stdout).toContain("sub");
		expect(run.stdout).not.toContain("exec");
	});

	test("hidden subgroups stay invocable", async () => {
		const context: ProbeContext = { calls: [] };
		const run = await runForTest(buildTree(), ["exec", "resolve", "--format", "json"], {
			context,
		});
		expect(run.exitCode).toBe(0);
		expect(context.calls).toEqual(["resolve"]);
		expect(parseEnvelope(run.stdout).data).toEqual({ resolved: true });
	});
});
