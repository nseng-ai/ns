import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createTempDirTracker } from "@nseng-ai/foundation/test-kit";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";

import {
	buildPointCatalog,
	discoverPointDefinitionsInRoot,
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
	{ id: "flow.submit.pre", accepts: "hook", semantics: "additive" },
	{ id: "flow.submit.pr-description", accepts: "prompt", semantics: "override" },
] as const satisfies readonly PointDefinition[];

const tempDirs = createTempDirTracker();

function writeFile(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

afterEach(async () => {
	await tempDirs.cleanup();
});

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
"flow.submit.pr-description" = []
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
			"points.flow.submit.pr-description",
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

	test("discovers point definitions from ns.points extension manifests", async () => {
		const root = await tempDirs.makeTempDir("ns-project-config-points-");
		writeFile(
			join(root, "flow", "package.json"),
			JSON.stringify({
				ns: {
					group: "flow",
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
							default: "./src/pr-description.md",
						},
					],
				},
			}),
		);

		const result = discoverPointDefinitionsInRoot(root);

		expect(result.diagnostics).toEqual([]);
		expect(result.pointDefinitions).toEqual([
			expect.objectContaining({
				id: "flow.submit.pre",
				accepts: "hook",
				semantics: "additive",
				description: "Runs before submit.",
			}),
			expect.objectContaining({
				id: "flow.submit.pr-description",
				accepts: "prompt",
				semantics: "override",
				defaultPath: "./src/pr-description.md",
			}),
		]);
	});

	test("reports malformed point manifest entries", async () => {
		const root = await tempDirs.makeTempDir("ns-project-config-points-");
		writeFile(
			join(root, "bad", "package.json"),
			JSON.stringify({
				ns: {
					group: "bad",
					points: [
						{ path: [], accepts: "hook", semantics: "additive" },
						{ path: ["prompt"], accepts: "prompt", semantics: "override", default: "../escape.md" },
					],
				},
			}),
		);

		const result = discoverPointDefinitionsInRoot(root);

		expect(result.pointDefinitions).toEqual([]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"extension_manifest_point_field_invalid",
			"extension_manifest_point_default_escapes",
		]);
	});

	test("computes the point catalog with config and conventional prompt installations", () => {
		const gateway = new InMemoryProjectConfigGateway({
			".ns/prompts/flow.submit.pr-description.md": "Prompt",
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
				definition: pointDefinitions[1],
				installations: [
					{
						source: "conventional-prompt",
						pointId: "flow.submit.pr-description",
						path: ".ns/prompts/flow.submit.pr-description.md",
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
		]);
		expect(catalog.diagnostics).toEqual([
			expect.objectContaining({
				severity: "info",
				code: "point_override_in_effect",
				path: "flow.submit.pr-description",
			}),
		]);
	});

	test("catalog reports prompt env overrides as source info and diagnostics", () => {
		const gateway = new InMemoryProjectConfigGateway({
			"ns.toml": `[points]
"flow.submit.pr-description" = ".ns/prompts/flow.submit.pr-description.md"
`,
		});

		const catalog = loadPointCatalog({
			repoRoot: "/repo",
			gateway,
			pointDefinitions,
			promptEnvOverride: {
				pointId: "flow.submit.pr-description",
				envVar: "NS_DEV_PR_DESCRIPTION_PROMPT",
			},
			env: { NS_DEV_PR_DESCRIPTION_PROMPT: "dev.md" },
		});

		expect(catalog.entries[0]?.installations).toEqual([
			{
				source: "env-prompt",
				pointId: "flow.submit.pr-description",
				envVar: "NS_DEV_PR_DESCRIPTION_PROMPT",
				path: "dev.md",
			},
			{
				source: "ns.toml",
				installation: {
					pointId: "flow.submit.pr-description",
					accepts: "prompt",
					path: ".ns/prompts/flow.submit.pr-description.md",
				},
			},
		]);
		expect(resolvePromptPointSource(catalog, "flow.submit.pr-description")).toEqual({
			type: "env",
			pointId: "flow.submit.pr-description",
			envVar: "NS_DEV_PR_DESCRIPTION_PROMPT",
			path: "dev.md",
		});
		expect(catalog.diagnostics).toEqual([
			expect.objectContaining({
				severity: "info",
				code: "point_prompt_env_override_in_effect",
				path: "flow.submit.pr-description",
			}),
			expect.objectContaining({
				severity: "info",
				code: "point_override_in_effect",
				path: "flow.submit.pr-description",
			}),
			expect.objectContaining({
				severity: "info",
				code: "point_defined_uninstalled",
				path: "flow.submit.pre",
			}),
		]);
	});

	test("catalog ignores the scalar prompt env override for other prompt points", () => {
		const catalog = buildPointCatalog({
			repoRoot: "/repo",
			gateway: { pathExists: () => ({ type: "missing" }) },
			pointDefinitions,
			config: { points: [], settings: new Map() },
			promptEnvOverride: { pointId: "other.prompt", envVar: "NS_DEV_PR_DESCRIPTION_PROMPT" },
			env: { NS_DEV_PR_DESCRIPTION_PROMPT: "dev.md" },
		});

		expect(resolvePromptPointSource(catalog, "flow.submit.pr-description")).toEqual({
			type: "missing",
			pointId: "flow.submit.pr-description",
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
			"flow.submit.pr-description",
			"flow.submit.pre",
		]);
		expect(catalog.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"point_installation_undefined",
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
