import { ok, negative } from "@nseng-ai/clinkr";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	loadPointCatalog,
	nodeProjectConfigGateway,
	resolvePromptPointSource,
	type PointCatalog,
	type PointCatalogEntry,
	type PointCatalogInstallation,
	type ProjectConfigDiagnostic,
} from "../project-config/points.ts";
import {
	nsExtensionPointAcceptsValues,
	nsExtensionPointSemanticsValues,
} from "../sdk/extension-manifest.ts";
import type { NsCommand } from "../sdk/index.ts";

const knownPromptEnvOverrides = [
	{ pointId: "flow.submit.pr-description", envVar: "NS_DEV_PR_DESCRIPTION_PROMPT" },
] as const;

const pointDiagnosticSchema = z.object({
	severity: z.enum(["error", "info"]),
	code: z.string(),
	message: z.string(),
	path: z.string().optional(),
});

const pointSourceSchema = z.union([
	z.object({ source: z.literal("env"), envVar: z.string(), path: z.string() }),
	z.object({ source: z.literal("repo-prompt"), path: z.string() }),
	z.object({ source: z.literal("repo-hook"), commands: z.array(z.string()) }),
	z.object({ source: z.literal("conventional"), path: z.string() }),
	z.object({ source: z.literal("default"), path: z.string(), manifestPath: z.string() }),
	z.object({ source: z.literal("missing") }),
]);

const pointSummarySchema = z.object({
	id: z.string(),
	accepts: z.enum(nsExtensionPointAcceptsValues),
	semantics: z.enum(nsExtensionPointSemanticsValues),
	description: z.string().optional(),
	manifestPath: z.string().optional(),
	defaultPath: z.string().optional(),
	activeSource: pointSourceSchema,
	installationCount: z.number().int().nonnegative(),
});

export const extensionPointsResultSchema = z.object({
	points: z.array(pointSummarySchema),
	diagnostics: z.array(pointDiagnosticSchema),
});

const extensionPointDetailRequestSchema = z.object({ id: z.string().min(1) });

const extensionPointDetailSchema = pointSummarySchema.extend({
	installations: z.array(pointSourceSchema),
});

export const extensionPointDetailResultSchema = z.object({
	point: extensionPointDetailSchema,
	diagnostics: z.array(pointDiagnosticSchema),
});

const missingPointDataSchema = z.object({
	pointId: z.string(),
	availablePointIds: z.array(z.string()),
	diagnostics: z.array(pointDiagnosticSchema),
});

const extensionPointResultSchema = z.union([
	extensionPointDetailResultSchema,
	missingPointDataSchema,
]);

export const extensionPointsCommand: NsCommand<
	z.ZodObject,
	z.infer<typeof extensionPointsResultSchema>
> = {
	name: "points",
	summary: "List defined ns points and their active sources.",
	description: "List defined ns points and their active sources.",
	schema: z.object({}),
	resultSchema: extensionPointsResultSchema,
	run: (ctx) => ok(toPointsResult(loadCatalog(ctx.cwd, ctx.env))),
	renderHuman: (data) => renderPointsHuman(extensionPointsResultSchema.parse(data)),
};

export const extensionPointCommand: NsCommand<
	typeof extensionPointDetailRequestSchema,
	z.infer<typeof extensionPointResultSchema>
> = {
	name: "point",
	summary: "Show one ns point definition and its active source.",
	description: "Show one ns point definition and its active source.",
	schema: extensionPointDetailRequestSchema,
	positionals: { id: { position: 0 } },
	resultSchema: extensionPointResultSchema,
	run: (ctx, request) => {
		const catalog = loadCatalog(ctx.cwd, ctx.env);
		const entry = catalog.entries.find((candidate) => candidate.definition.id === request.id);
		if (entry === undefined) {
			const data = missingPointDataSchema.parse({
				pointId: request.id,
				availablePointIds: catalog.entries.map((candidate) => candidate.definition.id),
				diagnostics: catalog.diagnostics,
			});
			return negative(`Point ${request.id} is not defined.`, { data });
		}
		return ok(toPointDetailResult(catalog, entry));
	},
	renderHuman: (data) => renderPointDetailHuman(extensionPointDetailResultSchema.parse(data)),
};

function loadCatalog(cwd: string, env: Record<string, string | undefined>): PointCatalog {
	return loadPointCatalog({
		repoRoot: cwd,
		gateway: nodeProjectConfigGateway,
		env,
		promptEnvOverrides: knownPromptEnvOverrides,
	});
}

function toPointsResult(catalog: PointCatalog): z.infer<typeof extensionPointsResultSchema> {
	return {
		points: catalog.entries.map((entry) => toPointSummary(catalog, entry)),
		diagnostics: [...catalog.diagnostics],
	};
}

function toPointDetailResult(
	catalog: PointCatalog,
	entry: PointCatalogEntry,
): z.infer<typeof extensionPointDetailResultSchema> {
	return {
		point: {
			...toPointSummary(catalog, entry),
			installations: entry.installations.map(toPointSource),
		},
		diagnostics: [...diagnosticsForPoint(catalog.diagnostics, entry.definition.id)],
	};
}

function toPointSummary(
	catalog: PointCatalog,
	entry: PointCatalogEntry,
): z.infer<typeof pointSummarySchema> {
	return {
		id: entry.definition.id,
		accepts: entry.definition.accepts,
		semantics: entry.definition.semantics,
		...optionalEntries({
			description: entry.definition.description,
			manifestPath: entry.definition.manifestPath,
			defaultPath: entry.definition.defaultPath,
		}),
		activeSource: activeSourceForEntry(catalog, entry),
		installationCount: entry.installations.length,
	};
}

function activeSourceForEntry(
	catalog: PointCatalog,
	entry: PointCatalogEntry,
): z.infer<typeof pointSourceSchema> {
	if (entry.definition.accepts === "prompt") {
		const source = resolvePromptPointSource(catalog, entry.definition.id);
		if (source.type === "env") return { source: "env", envVar: source.envVar, path: source.path };
		if (source.type === "ns.toml") return { source: "repo-prompt", path: source.path };
		if (source.type === "conventional") return { source: "conventional", path: source.path };
		if (source.type === "default") {
			return { source: "default", path: source.path, manifestPath: source.manifestPath };
		}
		return { source: "missing" };
	}

	const installation = entry.installations.find(
		(candidate) => candidate.source === "ns.toml" && candidate.installation.accepts === "hook",
	);
	if (installation?.source === "ns.toml" && installation.installation.accepts === "hook") {
		return { source: "repo-hook", commands: [...installation.installation.commands] };
	}
	return { source: "missing" };
}

function toPointSource(installation: PointCatalogInstallation): z.infer<typeof pointSourceSchema> {
	if (installation.source === "env-prompt") {
		return { source: "env", envVar: installation.envVar, path: installation.path };
	}
	if (installation.source === "conventional-prompt") {
		return { source: "conventional", path: installation.path };
	}
	if (installation.installation.accepts === "hook") {
		return { source: "repo-hook", commands: [...installation.installation.commands] };
	}
	return { source: "repo-prompt", path: installation.installation.path };
}

function diagnosticsForPoint(
	diagnostics: readonly ProjectConfigDiagnostic[],
	pointId: string,
): readonly ProjectConfigDiagnostic[] {
	return diagnostics.filter(
		(diagnostic) => diagnostic.path === pointId || diagnostic.path === `points.${pointId}`,
	);
}

function renderPointsHuman(result: z.infer<typeof extensionPointsResultSchema>): string {
	const lines = ["ns points:"];
	for (const point of result.points) {
		lines.push(
			`- ${point.id} (${point.accepts}, ${point.semantics}) — ${renderSource(point.activeSource)}`,
		);
	}
	appendDiagnosticsSection(lines, result.diagnostics, { leadingBlank: true });
	return `${lines.join("\n")}\n`;
}

function renderPointDetailHuman(result: z.infer<typeof extensionPointDetailResultSchema>): string {
	const point = result.point;
	const lines = [
		`${point.id}`,
		`accepts: ${point.accepts}`,
		`semantics: ${point.semantics}`,
		`active source: ${renderSource(point.activeSource)}`,
	];
	if (point.description !== undefined) lines.push(`description: ${point.description}`);
	if (point.manifestPath !== undefined) lines.push(`definition: ${point.manifestPath}`);
	if (point.defaultPath !== undefined) lines.push(`default: ${point.defaultPath}`);
	if (point.installations.length > 0) {
		lines.push(
			"installations:",
			...point.installations.map((source) => `- ${renderSource(source)}`),
		);
	}
	appendDiagnosticsSection(lines, result.diagnostics);
	return `${lines.join("\n")}\n`;
}

function appendDiagnosticsSection(
	lines: string[],
	diagnostics: readonly z.infer<typeof pointDiagnosticSchema>[],
	options: { leadingBlank?: boolean } = {},
): void {
	if (diagnostics.length === 0) return;
	if (options.leadingBlank === true) lines.push("");
	lines.push("diagnostics:", ...diagnostics.map(renderDiagnostic));
}

function renderSource(source: z.infer<typeof pointSourceSchema>): string {
	if (source.source === "env") return `env ${source.envVar} -> ${source.path}`;
	if (source.source === "repo-hook") return `repo ns.toml commands: ${source.commands.join(", ")}`;
	if (source.source === "repo-prompt") return `repo ns.toml -> ${source.path}`;
	if (source.source === "conventional") return `conventional ${source.path}`;
	if (source.source === "default") return `default ${source.path}`;
	return "missing";
}

function renderDiagnostic(diagnostic: z.infer<typeof pointDiagnosticSchema>): string {
	return `- ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`;
}
