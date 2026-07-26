import { negative, ok } from "@nseng-ai/clinkr";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	extensionPointAcceptsValues,
	extensionPointCardinalityValues,
	loadPointCatalogWithDescriptors,
	nodeProjectConfigGateway,
	resolvePromptPointSource,
	type PointCatalog,
	type PointCatalogEntry,
	type PointCatalogInstallation,
	type ProjectConfigDiagnostic,
} from "../project-config/points.ts";
import { defineCommand, type NsCommand } from "../sdk/index.ts";

const knownPromptEnvOverride = {
	pointId: "flow.submit.pr-description",
	envVar: "NS_DEV_PR_DESCRIPTION_PROMPT",
} as const;

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
type PointSourceView = z.infer<typeof pointSourceSchema>;

const pointSummarySchema = z.object({
	id: z.string(),
	accepts: z.enum(extensionPointAcceptsValues),
	cardinality: z.enum(extensionPointCardinalityValues),
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

const extensionPointsRequestSchema = z.object({});
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

export const extensionPointsCommand: NsCommand<
	typeof extensionPointsRequestSchema,
	z.infer<typeof extensionPointsResultSchema>
> = defineCommand({
	name: "points",
	summary: "List defined ns points and their active sources.",
	description: "List defined ns points and their active sources.",
	schema: extensionPointsRequestSchema,
	resultSchema: extensionPointsResultSchema,
	handler: async (ctx) => ok(toPointsResult(await loadCatalog(ctx.cwd, ctx.env))),
	renderHuman: renderPointsHuman,
});

export const extensionPointCommand = defineCommand({
	name: "point",
	summary: "Show one ns point definition and its active source.",
	description: "Show one ns point definition and its active source.",
	schema: extensionPointDetailRequestSchema,
	positionals: { id: { position: 0 } },
	resultSchema: extensionPointDetailResultSchema,
	negativeSchema: missingPointDataSchema,
	handler: async (ctx, request) => {
		const catalog = await loadCatalog(ctx.cwd, ctx.env);
		const entry = catalog.entries.find((candidate) => candidate.definition.id === request.id);
		if (entry === undefined) {
			const data = missingPointDataSchema.parse({
				pointId: request.id,
				availablePointIds: catalog.entries.map((candidate) => candidate.definition.id),
				diagnostics: catalog.diagnostics,
			});
			return negative(`Point ${request.id} is not defined.`, data);
		}
		return ok(toPointDetailResult(catalog, entry));
	},
	renderHuman: (data) => renderPointDetailHuman(extensionPointDetailResultSchema.parse(data)),
});

async function loadCatalog(
	cwd: string,
	env: Record<string, string | undefined>,
): Promise<PointCatalog> {
	return await loadPointCatalogWithDescriptors({
		repoRoot: cwd,
		gateway: nodeProjectConfigGateway,
		env,
		promptEnvOverride: knownPromptEnvOverride,
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
		cardinality: entry.definition.cardinality,
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
		return pointSourceFromPromptSource(resolvePromptPointSource(catalog, entry.definition.id));
	}

	const installation = entry.installations.find(
		(candidate) => candidate.source === "ns.toml" && candidate.installation.accepts === "hook",
	);
	if (installation?.source === "ns.toml" && installation.installation.accepts === "hook") {
		return pointSourceFromHookCommands(installation.installation.commands);
	}
	return missingPointSource();
}

function toPointSource(installation: PointCatalogInstallation): z.infer<typeof pointSourceSchema> {
	if (installation.source === "env-prompt") {
		return envPointSource(installation.envVar, installation.path);
	}
	if (installation.source === "conventional-prompt") {
		return conventionalPointSource(installation.path);
	}
	if (installation.installation.accepts === "hook") {
		return pointSourceFromHookCommands(installation.installation.commands);
	}
	return repoPromptPointSource(installation.installation.path);
}

function pointSourceFromPromptSource(
	source: ReturnType<typeof resolvePromptPointSource>,
): z.infer<typeof pointSourceSchema> {
	switch (source.type) {
		case "env":
			return envPointSource(source.envVar, source.path);
		case "ns.toml":
			return repoPromptPointSource(source.path);
		case "conventional":
			return conventionalPointSource(source.path);
		case "default":
			return { source: "default", path: source.path, manifestPath: source.manifestPath };
		case "missing":
			return missingPointSource();
	}
}

function envPointSource(envVar: string, path: string): z.infer<typeof pointSourceSchema> {
	return { source: "env", envVar, path };
}

function repoPromptPointSource(path: string): z.infer<typeof pointSourceSchema> {
	return { source: "repo-prompt", path };
}

function pointSourceFromHookCommands(
	commands: readonly string[],
): z.infer<typeof pointSourceSchema> {
	return { source: "repo-hook", commands: [...commands] };
}

function conventionalPointSource(path: string): z.infer<typeof pointSourceSchema> {
	return { source: "conventional", path };
}

function missingPointSource(): z.infer<typeof pointSourceSchema> {
	return { source: "missing" };
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
			`- ${point.id} (${point.accepts}, ${point.cardinality}) — ${renderSource(point.activeSource)}`,
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
		`cardinality: ${point.cardinality}`,
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

function renderSource(source: PointSourceView): string {
	switch (source.source) {
		case "env":
			return `env ${source.envVar} -> ${source.path}`;
		case "repo-prompt":
			return `repo ns.toml -> ${source.path}`;
		case "repo-hook":
			return `repo ns.toml commands: ${source.commands.join(", ")}`;
		case "conventional":
			return `conventional ${source.path}`;
		case "default":
			return `default ${source.path}`;
		case "missing":
			return "missing";
	}
}

function renderDiagnostic(diagnostic: z.infer<typeof pointDiagnosticSchema>): string {
	return `- ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`;
}
