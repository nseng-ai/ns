import { describe, expect, test } from "vitest";
import { z } from "zod";

import type { ExtensionDescriptor } from "../../src/sdk/descriptor.ts";
import {
	buildPointCatalog,
	loadEffectiveProjectConfig,
	loadPointCatalog,
	loadProjectConfig,
	mergeProjectConfigTomlDocuments,
	NS_LOCAL_TOML_FILE_NAME,
	NS_TOML_FILE_NAME,
	parseProjectConfigToml,
	parseProjectConfigTomlDocument,
	primaryProjectConfigDiagnostic,
	projectConfigErrorFromDiagnostics,
	resolvePromptPointSource,
	type PointDefinition,
	type ProjectConfigGateway,
	type ProjectConfigPathExistsResult,
	type ProjectConfigReadResult,
	type ProjectConfigTomlDocument,
} from "../../src/project-config/points.ts";

const pointDefinitions = [
	{ id: "flow.submit.pre", accepts: "hook", cardinality: "many" },
	{ id: "flow.submit.pre.recovery", accepts: "prompt", cardinality: "one" },
	{ id: "flow.submit.pr-description", accepts: "prompt", cardinality: "one" },
] as const satisfies readonly PointDefinition[];

const modelShortcutsSettingsSchema = {
	path: ["pi", "model-shortcuts"] as const,
	schema: z.object({ sonnet: z.string().regex(/^[^/]+\/[^/]+$/) }),
	invalidMessage: ({ pathLabel }: { pathLabel: string }) =>
		`${pathLabel}: [pi.model-shortcuts] is invalid.`,
};

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

	test("keeps loadProjectConfig explicitly base-only", () => {
		const gateway = new InMemoryProjectConfigGateway({
			[NS_TOML_FILE_NAME]: `[points]\n"flow.submit.pre" = ["base"]`,
			[NS_LOCAL_TOML_FILE_NAME]: `[points]\n"flow.submit.pre" = ["local"]`,
		});

		const result = loadProjectConfig({ repoRoot: "/repo", gateway, pointDefinitions });

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.config.points).toEqual([
			{ pointId: "flow.submit.pre", accepts: "hook", commands: ["base"] },
		]);
		expect(gateway.reads).toEqual([{ repoRoot: "/repo", relativePath: NS_TOML_FILE_NAME }]);
	});

	test("recursively merges tables while replacing arrays and scalar/table leaves", () => {
		const base = {
			nested: { kept: "base", replaced: { old: true }, scalar: "base" },
			array: ["base"],
			tableReplacedByScalar: { old: true },
		} satisfies ProjectConfigTomlDocument;
		const local = {
			nested: { added: "local", replaced: { fresh: true }, scalar: { now: "table" } },
			array: ["local"],
			tableReplacedByScalar: "local",
			scalarReplacedByTable: { now: "table" },
		} satisfies ProjectConfigTomlDocument;

		expect(mergeProjectConfigTomlDocuments(base, local)).toEqual({
			nested: {
				kept: "base",
				added: "local",
				replaced: { old: true, fresh: true },
				scalar: { now: "table" },
			},
			array: ["local"],
			tableReplacedByScalar: "local",
			scalarReplacedByTable: { now: "table" },
		});
		expect(mergeProjectConfigTomlDocuments({ leaf: "base" }, { leaf: { nested: true } })).toEqual({
			leaf: { nested: true },
		});
	});

	test("parses dotted and quoted TOML keys before merging", () => {
		const base = parseProjectConfigTomlDocument(
			`service.database.host = "base"\n["quoted.table"]\nkeep = true`,
		);
		const local = parseProjectConfigTomlDocument(
			`service.database.port = 5432\n["quoted.table"]\nadded = true`,
		);
		expect(base.ok).toBe(true);
		expect(local.ok).toBe(true);
		if (!base.ok || !local.ok) return;

		expect(mergeProjectConfigTomlDocuments(base.document, local.document)).toEqual({
			service: { database: { host: "base", port: 5432 } },
			"quoted.table": { keep: true, added: true },
		});
	});

	test.each([
		{ name: "neither", files: {}, expected: [] },
		{
			name: "base only",
			files: { [NS_TOML_FILE_NAME]: `[points]\n"flow.submit.pre" = ["base"]` },
			expected: ["base"],
		},
		{
			name: "local only",
			files: { [NS_LOCAL_TOML_FILE_NAME]: `[points]\n"flow.submit.pre" = ["local"]` },
			expected: ["local"],
		},
		{
			name: "both",
			files: {
				[NS_TOML_FILE_NAME]: `[points]\n"flow.submit.pre" = ["base"]`,
				[NS_LOCAL_TOML_FILE_NAME]: `[points]\n"flow.submit.pre" = ["local"]`,
			},
			expected: ["local"],
		},
	])("loads effective config with $name source combination", ({ files, expected }) => {
		const result = loadEffectiveProjectConfig({
			repoRoot: "/repo",
			gateway: new InMemoryProjectConfigGateway(files),
			pointDefinitions,
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(
			result.config.points.flatMap((point) => (point.accepts === "hook" ? point.commands : [])),
		).toEqual(expected);
	});

	test.each([NS_TOML_FILE_NAME, NS_LOCAL_TOML_FILE_NAME])(
		"reports malformed %s without returning partially merged config",
		(relativePath) => {
			const otherPath =
				relativePath === NS_TOML_FILE_NAME ? NS_LOCAL_TOML_FILE_NAME : NS_TOML_FILE_NAME;
			const result = loadEffectiveProjectConfig({
				repoRoot: "/repo",
				gateway: new InMemoryProjectConfigGateway({
					[relativePath]: "[broken",
					[otherPath]: `[points]\n"flow.submit.pre" = ["valid"]`,
				}),
				pointDefinitions,
			});

			expect(result.ok).toBe(false);
			expect(result).not.toHaveProperty("config");
			expect(result.diagnostics).toEqual([
				expect.objectContaining({
					code: "ns_toml_invalid",
					path: relativePath,
					message: expect.stringContaining(`${relativePath}: Invalid TOML.`),
				}),
			]);
		},
	);

	test.each([NS_TOML_FILE_NAME, NS_LOCAL_TOML_FILE_NAME])(
		"reports source-specific %s read errors without returning config",
		(relativePath) => {
			const gateway = new InMemoryProjectConfigGateway({}, { [relativePath]: "permission denied" });
			const result = loadEffectiveProjectConfig({ repoRoot: "/repo", gateway, pointDefinitions });

			expect(result.ok).toBe(false);
			expect(result).not.toHaveProperty("config");
			expect(result.diagnostics).toEqual([
				expect.objectContaining({
					code:
						relativePath === NS_TOML_FILE_NAME
							? "ns_toml_read_failed"
							: "ns_local_toml_read_failed",
					path: relativePath,
					message: `Failed to read ${relativePath}: permission denied`,
				}),
			]);
		},
	);

	test("attributes invalid local settings to their source file and schema path", () => {
		const result = loadEffectiveProjectConfig({
			repoRoot: "/repo",
			gateway: new InMemoryProjectConfigGateway({
				[NS_TOML_FILE_NAME]: `[pi.model-shortcuts]\nsonnet = "anthropic/base"`,
				[NS_LOCAL_TOML_FILE_NAME]: `[pi.model-shortcuts]\nsonnet = "unqualified"`,
			}),
			pointDefinitions,
			settingsSchemas: [modelShortcutsSettingsSchema],
		});

		expect(result.ok).toBe(false);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: "settings_table_invalid",
				path: "pi.model-shortcuts",
				message: `${NS_LOCAL_TOML_FILE_NAME}: [pi.model-shortcuts] is invalid.`,
			}),
		]);
	});

	test("attributes invalid base settings to ns.toml when local config is unrelated", () => {
		const result = loadEffectiveProjectConfig({
			repoRoot: "/repo",
			gateway: new InMemoryProjectConfigGateway({
				[NS_TOML_FILE_NAME]: `[pi.model-shortcuts]\nsonnet = "unqualified"`,
				[NS_LOCAL_TOML_FILE_NAME]: `[reviews]\nenabled = true`,
			}),
			pointDefinitions,
			settingsSchemas: [modelShortcutsSettingsSchema],
		});

		expect(result.ok).toBe(false);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				path: "pi.model-shortcuts",
				message: `${NS_TOML_FILE_NAME}: [pi.model-shortcuts] is invalid.`,
			}),
		]);
	});

	test("accepts a valid local setting that overrides an invalid base setting", () => {
		const result = loadEffectiveProjectConfig({
			repoRoot: "/repo",
			gateway: new InMemoryProjectConfigGateway({
				[NS_TOML_FILE_NAME]: `[pi.model-shortcuts]\nsonnet = "unqualified"`,
				[NS_LOCAL_TOML_FILE_NAME]: `[pi.model-shortcuts]\nsonnet = "anthropic/local"`,
			}),
			pointDefinitions,
			settingsSchemas: [modelShortcutsSettingsSchema],
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.config.settings.get("pi.model-shortcuts")).toEqual({
			sonnet: "anthropic/local",
		});
	});

	test("attributes invalid points to the source that supplies the effective table", () => {
		const result = loadEffectiveProjectConfig({
			repoRoot: "/repo",
			gateway: new InMemoryProjectConfigGateway({
				[NS_TOML_FILE_NAME]: `[points]\n"flow.submit.pre" = ["base"]`,
				[NS_LOCAL_TOML_FILE_NAME]: `[points]\n"flow.submit.pre" = "invalid"`,
			}),
			pointDefinitions,
		});

		expect(result.ok).toBe(false);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				path: "points.flow.submit.pre",
				message: expect.stringContaining(`${NS_LOCAL_TOML_FILE_NAME}:`),
			}),
		]);
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
				definition: pointDefinitions[2],
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
			{
				definition: pointDefinitions[1],
				installations: [],
			},
		]);
		expect(catalog.diagnostics).toEqual([
			expect.objectContaining({
				severity: "info",
				code: "point_installation_in_effect",
				path: "flow.submit.pr-description",
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
		).toEqual(["branch-context.plans-write", "flow.submit.pr-description", "flow.submit.pre"]);
	});

	test("uses descriptor-owned PR-description default metadata", () => {
		const descriptorPath = "/flow/src/ns/extension.ts";
		const descriptor = {
			description: "Flow extension",
			points: [
				{
					id: "flow.submit.pr-description",
					accepts: "prompt",
					cardinality: "one",
					default: "../submit/prompts/pr-description-default.md",
					description: "Canonical Flow PR-description guidance.",
				},
			],
		} as const satisfies ExtensionDescriptor;
		const catalog = loadPointCatalog({
			repoRoot: "/repo",
			gateway: new InMemoryProjectConfigGateway({}),
			preferredDescriptors: [{ descriptor, descriptorPath }],
		});

		expect(
			catalog.entries.find((entry) => entry.definition.id === "flow.submit.pr-description")
				?.definition,
		).toEqual({
			id: "flow.submit.pr-description",
			accepts: "prompt",
			cardinality: "one",
			description: "Canonical Flow PR-description guidance.",
			defaultPath: "../submit/prompts/pr-description-default.md",
			manifestPath: descriptorPath,
		});
		expect(resolvePromptPointSource(catalog, "flow.submit.pr-description")).toEqual({
			type: "default",
			pointId: "flow.submit.pr-description",
			path: "../submit/prompts/pr-description-default.md",
			manifestPath: descriptorPath,
		});
		expect(
			catalog.entries
				.filter((entry) => entry.definition.id !== "flow.submit.pr-description")
				.map((entry) => entry.definition.id),
		).toEqual(["branch-context.plans-write", "flow.submit.pre", "flow.submit.pre.recovery"]);
	});

	test("keeps fallback PR-description metadata unresolved without descriptor provenance", () => {
		const catalog = loadPointCatalog({
			repoRoot: "/repo",
			gateway: new InMemoryProjectConfigGateway({}),
		});
		const definition = catalog.entries.find(
			(entry) => entry.definition.id === "flow.submit.pr-description",
		)?.definition;

		expect(definition).toEqual({
			id: "flow.submit.pr-description",
			accepts: "prompt",
			cardinality: "one",
			description: "Prompt for generating pull request descriptions during flow submit.",
		});
		expect(definition).not.toHaveProperty("defaultPath");
		expect(definition).not.toHaveProperty("manifestPath");
		expect(resolvePromptPointSource(catalog, "flow.submit.pr-description")).toEqual({
			type: "missing",
			pointId: "flow.submit.pr-description",
		});
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
				code: "point_installation_in_effect",
				path: "flow.submit.pr-description",
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
	readonly #readErrors: ReadonlyMap<string, string>;
	readonly reads: { repoRoot: string; relativePath: string }[] = [];

	constructor(files: Record<string, string>, readErrors: Record<string, string> = {}) {
		this.#files = new Map(Object.entries(files));
		this.#readErrors = new Map(Object.entries(readErrors));
	}

	readTextFile(request: { repoRoot: string; relativePath: string }): ProjectConfigReadResult {
		this.reads.push(request);
		const error = this.#readErrors.get(request.relativePath);
		if (error !== undefined) return { type: "error", message: error };
		const text = this.#files.get(request.relativePath);
		return text === undefined ? { type: "missing" } : { type: "found", text };
	}

	pathExists(request: { repoRoot: string; relativePath: string }): ProjectConfigPathExistsResult {
		return this.#files.has(request.relativePath) ? { type: "present" } : { type: "missing" };
	}
}
