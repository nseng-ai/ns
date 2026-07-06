import { describe, expect, test } from "vitest";
import { z } from "zod";

import {
	loadProjectConfig,
	parseProjectConfigToml,
	type PointDefinition,
	type ProjectConfigGateway,
	type ProjectConfigReadResult,
} from "../../src/project-config/points.ts";

const pointDefinitions = [
	{ id: "flow.submit.pre", accepts: "hook", semantics: "additive" },
	{ id: "flow.submit.pr-description", accepts: "prompt", semantics: "override" },
] as const satisfies readonly PointDefinition[];

describe("project point config", () => {
	test("loads repo-root ns.toml through one gateway read and validates point installations", () => {
		const gateway = new InMemoryProjectConfigGateway({
			"ns.toml": `[points]
"flow.submit.pre" = ["just", "pnpm --dir ts run test"]
"flow.submit.pr-description" = ".ns/prompts/flow.submit.pr-description.md"
`,
		});

		const result = loadProjectConfig({ repoRoot: "/repo", gateway, pointDefinitions });

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.config.points).toEqual([
			{ pointId: "flow.submit.pre", accepts: "hook", commands: ["just", "pnpm --dir ts run test"] },
			{
				pointId: "flow.submit.pr-description",
				accepts: "prompt",
				path: ".ns/prompts/flow.submit.pr-description.md",
			},
		]);
		expect(gateway.reads).toEqual([{ repoRoot: "/repo", relativePath: "ns.toml" }]);
	});

	test("missing ns.toml loads as empty config", () => {
		const gateway = new InMemoryProjectConfigGateway({});

		const result = loadProjectConfig({ repoRoot: "/repo", gateway, pointDefinitions });

		expect(result).toEqual({
			ok: true,
			config: { points: [], settings: new Map() },
			diagnostics: [],
		});
	});

	test("reports TOML parse failures and does not validate partial config", () => {
		const result = parseProjectConfigToml("[points\n", { pointDefinitions });

		expect(result.ok).toBe(false);
		expect(result.diagnostics).toEqual([expect.objectContaining({ code: "ns_toml_invalid" })]);
	});

	test("reports undefined points and values that do not match point kind", () => {
		const result = parseProjectConfigToml(
			`[points]
"flow.submit.pre" = "just"
"flow.submit.pr-description" = []
"other.submit.pre" = ["just"]
`,
			{ pointDefinitions },
		);

		expect(result.ok).toBe(false);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"point_installation_invalid",
			"point_installation_invalid",
			"point_installation_undefined",
		]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
			"points.flow.submit.pre",
			"points.flow.submit.pr-description",
			"points.other.submit.pre",
		]);
	});

	test("validates extension-declared settings schemas from the same parsed document", () => {
		const result = parseProjectConfigToml(
			`[points]
"flow.submit.pre" = ["just"]

[roaster.diff]
context_lines = 8
include_binary = false
`,
			{
				pointDefinitions,
				settingsSchemas: [
					{
						path: ["roaster", "diff"],
						schema: z.object({ context_lines: z.number().int(), include_binary: z.boolean() }),
					},
				],
			},
		);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.config.settings.get("roaster.diff")).toEqual({
			context_lines: 8,
			include_binary: false,
		});
	});

	test("reports declared settings schema failures", () => {
		const result = parseProjectConfigToml(
			`[roaster.diff]
context_lines = "wide"
`,
			{
				pointDefinitions,
				settingsSchemas: [
					{ path: ["roaster", "diff"], schema: z.object({ context_lines: z.number().int() }) },
				],
			},
		);

		expect(result.ok).toBe(false);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({ code: "settings_table_invalid", path: "roaster.diff" }),
		]);
	});
});

class InMemoryProjectConfigGateway implements ProjectConfigGateway {
	readonly #files: ReadonlyMap<string, string>;
	readonly reads: { repoRoot: string; relativePath: "ns.toml" }[] = [];

	constructor(files: Record<string, string>) {
		this.#files = new Map(Object.entries(files));
	}

	readTextFile(request: { repoRoot: string; relativePath: "ns.toml" }): ProjectConfigReadResult {
		this.reads.push(request);
		const text = this.#files.get(request.relativePath);
		return text === undefined ? { type: "missing" } : { type: "found", text };
	}
}
