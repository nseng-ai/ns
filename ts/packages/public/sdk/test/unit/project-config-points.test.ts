import { describe, expect, test } from "vitest";
import { z } from "zod";

import type { ExtensionDescriptor } from "../../src/sdk/descriptor.ts";
import {
	buildPointCatalog,
	loadPointCatalog,
	loadProjectConfig,
	parseProjectConfigToml,
	primaryProjectConfigDiagnostic,
	projectConfigErrorFromDiagnostics,
	resolvePromptPointSource,
	type PointDefinition,
	type ProjectConfigGateway,
	type ProjectConfigPathExistsResult,
	type ProjectConfigReadResult,
} from "../../src/project-config/points.ts";

const pointDefinitions = [
	{ id: "flow.submit.pre", accepts: "hook", cardinality: "many" },
	{ id: "flow.submit.pre.recovery", accepts: "prompt", cardinality: "one" },
	{ id: "flow.submit.pr-inventory", accepts: "prompt", cardinality: "one" },
] as const satisfies readonly PointDefinition[];

describe("project point config", () => {
	test("loads repo-root ns.toml through one gateway read and validates point installations", () => {
		const gateway = new InMemoryProjectConfigGateway({
			"ns.toml": `[points]
"flow.submit.pre" = ["just", "pnpm --dir ts run test"]
"flow.submit.pr-inventory" = ".ns/prompts/flow.submit.pr-inventory.md"
`,
		});

		const result = loadProjectConfig({ repoRoot: "/repo", gateway, pointDefinitions });

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.config.points).toEqual([
			{ pointId: "flow.submit.pre", accepts: "hook", commands: ["just", "pnpm --dir ts run test"] },
			{
				pointId: "flow.submit.pr-inventory",
				accepts: "prompt",
				path: ".ns/prompts/flow.submit.pr-inventory.md",
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
		const result = parseProjectConfigToml("[points\n", {
			pointsTable: { mode: "validate", pointDefinitions },
		});

		expect(result.ok).toBe(false);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: "ns_toml_invalid",
				causeMessage: expect.any(String),
				message: expect.stringContaining("ns.toml: Invalid TOML.\n"),
			}),
		]);
	});

	test("maps project config diagnostics to consumer error codes", () => {
		const invalidToml = projectConfigErrorFromDiagnostics(
			[
				{
					severity: "error",
					code: "ns_toml_invalid",
					message: "ns.toml: Invalid TOML.",
					causeMessage: "Expected key",
				},
			],
			{ invalidToml: "invalid-toml", defaultCode: "invalid-table", pathLabel: "ns.toml" },
		);
		expect(invalidToml).toMatchObject({
			code: "invalid-toml",
			message: "Invalid TOML in ns.toml: Expected key",
		});

		const invalidSettings = projectConfigErrorFromDiagnostics(
			[
				{
					severity: "error",
					code: "settings_table_invalid",
					path: "reviews.diff",
					message: "ns.toml: [reviews.diff] must be a TOML table.",
				},
			],
			{
				invalidToml: "invalid-toml",
				invalidSettingsByPath: { "reviews.diff": "invalid-table" },
				defaultCode: "invalid-toml",
			},
		);
		expect(invalidSettings).toMatchObject({
			code: "invalid-table",
			message: "ns.toml: [reviews.diff] must be a TOML table.",
		});
	});

	test("selects the first error diagnostic as the primary project config diagnostic", () => {
		const info = {
			severity: "info",
			code: "point_defined_uninstalled",
			message: "Point is not installed.",
		} as const;
		const error = {
			severity: "error",
			code: "settings_table_invalid",
			message: "Settings are invalid.",
		} as const;

		expect(primaryProjectConfigDiagnostic([info, error])).toBe(error);
		expect(primaryProjectConfigDiagnostic([info])).toBe(info);
		expect(primaryProjectConfigDiagnostic([])).toBeUndefined();
	});

	test("reports undefined points and values that do not match point kind", () => {
		const result = parseProjectConfigToml(
			`[points]
"flow.submit.pre" = "just"
"flow.submit.pr-inventory" = []
"other.submit.pre" = ["just"]
`,
			{ pointsTable: { mode: "validate", pointDefinitions } },
		);

		expect(result.ok).toBe(false);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"point_installation_invalid",
			"point_installation_invalid",
			"point_installation_undefined",
		]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.path)).toEqual([
			"points.flow.submit.pre",
			"points.flow.submit.pr-inventory",
			"points.other.submit.pre",
		]);
	});

	test("validates extension-declared settings schemas from the same parsed document", () => {
		const result = parseProjectConfigToml(
			`[points]
"flow.submit.pre" = ["just"]

[reviews.diff]
context_lines = 8
include_binary = false
`,
			{
				pointsTable: { mode: "validate", pointDefinitions },
				settingsSchemas: [
					{
						path: ["reviews", "diff"],
						schema: z.object({ context_lines: z.number().int(), include_binary: z.boolean() }),
					},
				],
			},
		);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.config.settings.get("reviews.diff")).toEqual({
			context_lines: 8,
			include_binary: false,
		});
	});

	test("can parse declared settings without point definitions", () => {
		const result = parseProjectConfigToml(
			`[points]
"flow.submit.pre" = ["just"]

[areg]
agents = ["codex"]
`,
			{
				pointsTable: { mode: "skip" },
				settingsSchemas: [
					{ path: ["areg"], schema: z.object({ agents: z.array(z.string().min(1)) }) },
				],
			},
		);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.config.points).toEqual([]);
		expect(result.config.settings.get("areg")).toEqual({ agents: ["codex"] });
	});

	test("reports declared settings schema failures", () => {
		const result = parseProjectConfigToml(
			`[reviews.diff]
context_lines = "wide"
`,
			{
				pointsTable: { mode: "validate", pointDefinitions },
				settingsSchemas: [
					{ path: ["reviews", "diff"], schema: z.object({ context_lines: z.number().int() }) },
				],
			},
		);

		expect(result.ok).toBe(false);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({ code: "settings_table_invalid", path: "reviews.diff" }),
		]);
	});

	test("computes the point catalog with config and conventional prompt installations", () => {
		const gateway = new InMemoryProjectConfigGateway({
			".ns/prompts/flow.submit.pr-inventory.md": "Prompt",
		});
		const catalog = buildPointCatalog({
			repoRoot: "/repo",
			gateway,
			pointDefinitions,
			config: {
				points: [{ pointId: "flow.submit.pre", accepts: "hook", commands: ["just"] }],
				settings: new Map(),
			},
		});

		expect(catalog.entries).toEqual([
			{
				definition: pointDefinitions[2],
				installations: [
					{
						source: "conventional-prompt",
						pointId: "flow.submit.pr-inventory",
						path: ".ns/prompts/flow.submit.pr-inventory.md",
					},
				],
			},
			{
				definition: pointDefinitions[0],
				installations: [
					{
						source: "ns.toml",
						installation: { pointId: "flow.submit.pre", accepts: "hook", commands: ["just"] },
					},
				],
			},
			{
				definition: pointDefinitions[1],
				installations: [],
			},
		]);
		expect(catalog.diagnostics).toEqual([
			expect.objectContaining({
				severity: "info",
				code: "point_installation_in_effect",
				path: "flow.submit.pr-inventory",
			}),
			expect.objectContaining({
				severity: "info",
				code: "point_defined_uninstalled",
				path: "flow.submit.pre.recovery",
			}),
		]);
	});

	test("prefers descriptor metadata over the built-in recovery mirror", () => {
		const descriptorPath = "/flow/src/ns/extension.ts";
		const descriptor = {
			description: "Flow extension",
			points: [
				{
					id: "flow.submit.pre.recovery",
					accepts: "prompt",
					cardinality: "one",
					default: "../submit/prompts/submit-check-recovery-default.md",
					description: "Canonical Flow recovery guidance.",
				},
			],
		} as const satisfies ExtensionDescriptor;
		const catalog = loadPointCatalog({
			repoRoot: "/repo",
			gateway: new InMemoryProjectConfigGateway({}),
			preferredDescriptors: [{ descriptor, descriptorPath }],
		});

		expect(
			catalog.entries.find((entry) => entry.definition.id === "flow.submit.pre.recovery")
				?.definition,
		).toEqual({
			id: "flow.submit.pre.recovery",
			accepts: "prompt",
			cardinality: "one",
			description: "Canonical Flow recovery guidance.",
			defaultPath: "../submit/prompts/submit-check-recovery-default.md",
			manifestPath: descriptorPath,
		});
		expect(resolvePromptPointSource(catalog, "flow.submit.pre.recovery")).toEqual({
			type: "default",
			pointId: "flow.submit.pre.recovery",
			path: "../submit/prompts/submit-check-recovery-default.md",
			manifestPath: descriptorPath,
		});
		expect(
			catalog.entries
				.filter((entry) => entry.definition.id !== "flow.submit.pre.recovery")
				.map((entry) => entry.definition.id),
		).toEqual(["branch-context.plans-write", "flow.submit.pr-inventory", "flow.submit.pre"]);
	});

	test("uses descriptor-owned PR-inventory default metadata", () => {
		const descriptorPath = "/flow/src/ns/extension.ts";
		const descriptor = {
			description: "Flow extension",
			points: [
				{
					id: "flow.submit.pr-inventory",
					accepts: "prompt",
					cardinality: "one",
					default: "../submit/prompts/pr-inventory-default.md",
					description: "Canonical Flow PR-inventory guidance.",
				},
			],
		} as const satisfies ExtensionDescriptor;
		const catalog = loadPointCatalog({
			repoRoot: "/repo",
			gateway: new InMemoryProjectConfigGateway({}),
			preferredDescriptors: [{ descriptor, descriptorPath }],
		});

		expect(
			catalog.entries.find((entry) => entry.definition.id === "flow.submit.pr-inventory")
				?.definition,
		).toEqual({
			id: "flow.submit.pr-inventory",
			accepts: "prompt",
			cardinality: "one",
			description: "Canonical Flow PR-inventory guidance.",
			defaultPath: "../submit/prompts/pr-inventory-default.md",
			manifestPath: descriptorPath,
		});
		expect(resolvePromptPointSource(catalog, "flow.submit.pr-inventory")).toEqual({
			type: "default",
			pointId: "flow.submit.pr-inventory",
			path: "../submit/prompts/pr-inventory-default.md",
			manifestPath: descriptorPath,
		});
		expect(
			catalog.entries
				.filter((entry) => entry.definition.id !== "flow.submit.pr-inventory")
				.map((entry) => entry.definition.id),
		).toEqual(["branch-context.plans-write", "flow.submit.pre", "flow.submit.pre.recovery"]);
	});

	test("keeps fallback PR-inventory metadata unresolved without descriptor provenance", () => {
		const catalog = loadPointCatalog({
			repoRoot: "/repo",
			gateway: new InMemoryProjectConfigGateway({}),
		});
		const definition = catalog.entries.find(
			(entry) => entry.definition.id === "flow.submit.pr-inventory",
		)?.definition;

		expect(definition).toEqual({
			id: "flow.submit.pr-inventory",
			accepts: "prompt",
			cardinality: "one",
			description: "Prompt for generating pull request inventories during flow submit.",
		});
		expect(definition).not.toHaveProperty("defaultPath");
		expect(definition).not.toHaveProperty("manifestPath");
		expect(resolvePromptPointSource(catalog, "flow.submit.pr-inventory")).toEqual({
			type: "missing",
			pointId: "flow.submit.pr-inventory",
		});
	});

	test("catalog reports prompt env overrides as source info and diagnostics", () => {
		const gateway = new InMemoryProjectConfigGateway({
			"ns.toml": `[points]
"flow.submit.pr-inventory" = ".ns/prompts/flow.submit.pr-inventory.md"
`,
		});

		const catalog = loadPointCatalog({
			repoRoot: "/repo",
			gateway,
			pointDefinitions,
			promptEnvOverride: {
				pointId: "flow.submit.pr-inventory",
				envVar: "NS_FLOW_PR_INVENTORY_PROMPT",
			},
			env: { NS_FLOW_PR_INVENTORY_PROMPT: "dev.md" },
		});

		expect(catalog.entries[0]?.installations).toEqual([
			{
				source: "env-prompt",
				pointId: "flow.submit.pr-inventory",
				envVar: "NS_FLOW_PR_INVENTORY_PROMPT",
				path: "dev.md",
			},
			{
				source: "ns.toml",
				installation: {
					pointId: "flow.submit.pr-inventory",
					accepts: "prompt",
					path: ".ns/prompts/flow.submit.pr-inventory.md",
				},
			},
		]);
		expect(resolvePromptPointSource(catalog, "flow.submit.pr-inventory")).toEqual({
			type: "env",
			pointId: "flow.submit.pr-inventory",
			envVar: "NS_FLOW_PR_INVENTORY_PROMPT",
			path: "dev.md",
		});
		expect(catalog.diagnostics).toEqual([
			expect.objectContaining({
				severity: "info",
				code: "point_prompt_env_override_in_effect",
				path: "flow.submit.pr-inventory",
			}),
			expect.objectContaining({
				severity: "info",
				code: "point_installation_in_effect",
				path: "flow.submit.pr-inventory",
			}),
			expect.objectContaining({
				severity: "info",
				code: "point_defined_uninstalled",
				path: "flow.submit.pre",
			}),
			expect.objectContaining({
				severity: "info",
				code: "point_defined_uninstalled",
				path: "flow.submit.pre.recovery",
			}),
		]);
	});

	test("catalog ignores the scalar prompt env override for other prompt points", () => {
		const catalog = buildPointCatalog({
			repoRoot: "/repo",
			gateway: { pathExists: () => ({ type: "missing" }) },
			pointDefinitions,
			config: { points: [], settings: new Map() },
			promptEnvOverride: { pointId: "other.prompt", envVar: "NS_FLOW_PR_INVENTORY_PROMPT" },
			env: { NS_FLOW_PR_INVENTORY_PROMPT: "dev.md" },
		});

		expect(resolvePromptPointSource(catalog, "flow.submit.pr-inventory")).toEqual({
			type: "missing",
			pointId: "flow.submit.pr-inventory",
		});
		expect(catalog.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
			"point_prompt_env_override_in_effect",
		);
	});

	test("catalog carries loader diagnostics for undefined installs and reports uninstalled definitions", () => {
		const gateway = new InMemoryProjectConfigGateway({
			"ns.toml": `[points]
"other.submit.pre" = ["just"]
`,
		});

		const catalog = loadPointCatalog({ repoRoot: "/repo", gateway, pointDefinitions });

		expect(catalog.entries.map((entry) => entry.definition.id)).toEqual([
			"flow.submit.pr-inventory",
			"flow.submit.pre",
			"flow.submit.pre.recovery",
		]);
		expect(catalog.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"point_installation_undefined",
			"point_defined_uninstalled",
			"point_defined_uninstalled",
			"point_defined_uninstalled",
		]);
	});
});

class InMemoryProjectConfigGateway implements ProjectConfigGateway {
	readonly #files: ReadonlyMap<string, string>;
	readonly reads: { repoRoot: string; relativePath: string }[] = [];

	constructor(files: Record<string, string>) {
		this.#files = new Map(Object.entries(files));
	}

	readTextFile(request: { repoRoot: string; relativePath: string }): ProjectConfigReadResult {
		this.reads.push(request);
		const text = this.#files.get(request.relativePath);
		return text === undefined ? { type: "missing" } : { type: "found", text };
	}

	pathExists(request: { repoRoot: string; relativePath: string }): ProjectConfigPathExistsResult {
		return this.#files.has(request.relativePath) ? { type: "present" } : { type: "missing" };
	}
}
