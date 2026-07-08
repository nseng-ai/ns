import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { failure, negative, ok, usageError } from "@nseng-ai/clinkr";
import { formatErrorMessage, optionalEntries } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	extensionPointAcceptsValues,
	loadPointCatalogWithDescriptors,
	nodeProjectConfigGateway,
	pointSemanticsValues,
	resolvePromptPointSource,
	type PointCatalog,
	type PointCatalogEntry,
	type PointCatalogInstallation,
	type ProjectConfigDiagnostic,
} from "../project-config/points.ts";
import {
	appendDeclaredExtensionSpecToml,
	type NsTomlExtensionsAppendResult,
} from "../project-config/ns-toml-extensions-edit.ts";
import {
	directoryExists,
	fileExists,
	managedDescriptorPackageRoot,
	managedExtensionsNpmProjectRoot,
	resolveDescriptorExportPath,
} from "../project-config/descriptor-package.ts";
import { defineCommand, type ExecResult, type NsCommand } from "../sdk/index.ts";

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
	semantics: z.enum(pointSemanticsValues),
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

const extensionPointResultSchema = z.union([
	extensionPointDetailResultSchema,
	missingPointDataSchema,
]);

const installRequestSchema = z.object({
	source: z.string().min(1),
});

const installResultSchema = z.object({
	sourceSpec: z.string(),
	packageName: z.string(),
	packageVersion: z.string(),
	managedRoot: z.string(),
	nsTomlPath: z.string(),
	wasRecorded: z.boolean(),
});

const extensionPackageManifestSchema = z
	.object({
		name: z.string().min(1),
		version: z.string().min(1),
	})
	.passthrough();

type ExtensionPackageManifest = z.infer<typeof extensionPackageManifestSchema>;

const npmInstallArgs = [
	"install",
	"--no-save",
	"--package-lock=false",
	"--ignore-scripts",
	"--legacy-peer-deps",
] as const;

export const installCommand: NsCommand<
	typeof installRequestSchema,
	z.infer<typeof installResultSchema>
> = defineCommand({
	name: "install",
	summary: "Install a local ns extension package.",
	description:
		"Install a local ns extension package into managed storage and record the source spec in ns.toml.",
	schema: installRequestSchema,
	positionals: { source: { position: 0 } },
	resultSchema: installResultSchema,
	handler: async (ctx, request) => {
		const unsupported = unsupportedSourceSpec(request.source);
		if (unsupported !== undefined) {
			return usageError(
				`ns install currently supports local package directories only; ${unsupported} specs are planned but not supported in this slice.`,
				{
					sourceSpec: request.source,
					unsupportedType: unsupported,
					futureGrowthPath:
						"npm:, git:, and URL source specs can be added over this command contract later.",
				},
			);
		}
		const sourceDir = resolve(ctx.cwd, request.source);
		if (!directoryExists(sourceDir)) {
			return failure(
				"missing-source",
				`Extension source directory does not exist: ${request.source}.`,
				{
					sourceSpec: request.source,
					sourceDir,
				},
			);
		}
		const manifest = readExtensionPackageManifest(sourceDir);
		if (!manifest.ok) return manifest.exit;
		const exportValidation = validateDescriptorExportFile(sourceDir, manifest.manifest);
		if (!exportValidation.ok) return exportValidation.exit;
		const managedProjectRoot = managedExtensionsNpmProjectRoot(ctx.cwd);
		const managedPackageRoot = managedDescriptorPackageRoot(ctx.cwd, manifest.manifest.name);
		const managedProject = ensureManagedNpmProject(managedProjectRoot);
		if (!managedProject.ok) return managedProject.exit;
		const installResult = await ctx.exec("npm", [...npmInstallArgs, sourceDir], {
			cwd: managedProjectRoot,
		});
		if (
			installResult.code !== 0 ||
			installResult.killed ||
			installResult.startupError !== undefined
		) {
			return failure("npm-install-failed", "npm failed to install the extension package.", {
				sourceSpec: request.source,
				command: "npm",
				args: [...npmInstallArgs, sourceDir],
				cwd: managedProjectRoot,
				...execResultData(installResult),
			});
		}
		const record = recordInstalledExtensionSpec(ctx.cwd, request.source);
		if (!record.ok) return record.exit;
		return ok({
			sourceSpec: request.source,
			packageName: manifest.manifest.name,
			packageVersion: manifest.manifest.version,
			managedRoot: managedPackageRoot,
			nsTomlPath: record.nsTomlPath,
			wasRecorded: record.wasRecorded,
		});
	},
	renderHuman: renderInstallHuman,
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

export const extensionPointCommand: NsCommand<
	typeof extensionPointDetailRequestSchema,
	z.infer<typeof extensionPointResultSchema>
> = defineCommand({
	name: "point",
	summary: "Show one ns point definition and its active source.",
	description: "Show one ns point definition and its active source.",
	schema: extensionPointDetailRequestSchema,
	positionals: { id: { position: 0 } },
	resultSchema: extensionPointResultSchema,
	handler: async (ctx, request) => {
		const catalog = await loadCatalog(ctx.cwd, ctx.env);
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

function unsupportedSourceSpec(source: string): string | undefined {
	if (source.startsWith("npm:")) return "npm";
	if (source.startsWith("git:")) return "git";
	if (/^[a-z][a-z0-9+.-]*:/iu.test(source)) return "url";
	return undefined;
}

function readExtensionPackageManifest(
	sourceDir: string,
):
	| { ok: true; manifest: ExtensionPackageManifest }
	| { ok: false; exit: ReturnType<typeof failure> } {
	const packageJsonPath = join(sourceDir, "package.json");
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	} catch (error) {
		return {
			ok: false,
			exit: failure(
				"invalid-package-json",
				"Extension source must contain a readable package.json.",
				{
					packageJsonPath,
					message: formatErrorMessage(error),
				},
			),
		};
	}
	const manifest = extensionPackageManifestSchema.safeParse(parsed);
	if (!manifest.success) {
		return {
			ok: false,
			exit: failure(
				"invalid-package-json",
				"Extension package.json must contain string name and version fields.",
				{
					packageJsonPath,
					issues: manifest.error.issues.map((issue) => ({
						path: issue.path.join("."),
						message: issue.message,
					})),
				},
			),
		};
	}
	return { ok: true, manifest: manifest.data };
}

function validateDescriptorExportFile(
	sourceDir: string,
	manifest: ExtensionPackageManifest,
): { ok: true } | { ok: false; exit: ReturnType<typeof failure> } {
	const packageJsonPath = join(sourceDir, "package.json");
	const exportPath = resolveDescriptorExportPath(sourceDir, manifest);
	if (!exportPath.ok) {
		return {
			ok: false,
			exit: failure(
				"missing-descriptor-export",
				'Extension package must expose exports["./ns-extension"].',
				{
					packageJsonPath,
					reason: exportPath.reason,
					...(exportPath.target === undefined ? {} : { target: exportPath.target }),
				},
			),
		};
	}
	if (!fileExists(exportPath.path)) {
		return {
			ok: false,
			exit: failure(
				"missing-descriptor-export",
				"Extension descriptor export does not resolve to a file.",
				{
					packageJsonPath,
					target: exportPath.target,
					descriptorPath: exportPath.path,
				},
			),
		};
	}
	return { ok: true };
}

function ensureManagedNpmProject(
	managedProjectRoot: string,
): { ok: true } | { ok: false; exit: ReturnType<typeof failure> } {
	try {
		mkdirSync(managedProjectRoot, { recursive: true });
		const packageJsonPath = join(managedProjectRoot, "package.json");
		if (!existsSync(packageJsonPath)) {
			writeFileSync(
				packageJsonPath,
				`${JSON.stringify({ private: true, name: "ns-managed-extensions" }, null, "\t")}\n`,
			);
		}
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			exit: failure(
				"managed-root-unavailable",
				"Could not prepare managed extensions npm project.",
				{
					managedProjectRoot,
					message: formatErrorMessage(error),
				},
			),
		};
	}
}

function recordInstalledExtensionSpec(
	repoRoot: string,
	sourceSpec: string,
):
	| { ok: true; nsTomlPath: string; wasRecorded: boolean }
	| { ok: false; exit: ReturnType<typeof failure> } {
	const nsTomlPath = join(repoRoot, "ns.toml");
	let existing = "";
	try {
		if (existsSync(nsTomlPath)) existing = readFileSync(nsTomlPath, "utf8");
	} catch (error) {
		return {
			ok: false,
			exit: failure("ns-toml-read-failed", "Could not read ns.toml before recording extension.", {
				nsTomlPath,
				message: formatErrorMessage(error),
			}),
		};
	}
	const next = appendDeclaredExtensionSpecToml(existing, sourceSpec);
	if (!next.ok) return { ok: false, exit: nsTomlAppendFailure(nsTomlPath, next) };
	if (!next.wasAdded) return { ok: true, nsTomlPath, wasRecorded: false };
	try {
		mkdirSync(dirname(nsTomlPath), { recursive: true });
		writeFileSync(nsTomlPath, next.text);
		return { ok: true, nsTomlPath, wasRecorded: true };
	} catch (error) {
		return {
			ok: false,
			exit: failure("ns-toml-write-failed", "Could not write ns.toml after installing extension.", {
				nsTomlPath,
				message: formatErrorMessage(error),
			}),
		};
	}
}

function nsTomlAppendFailure(
	nsTomlPath: string,
	result: Exclude<NsTomlExtensionsAppendResult, { ok: true }>,
): ReturnType<typeof failure> {
	return failure(
		result.reason === "unsupported-format" ? "ns-toml-update-failed" : "ns-toml-parse-failed",
		result.reason === "unsupported-format"
			? result.message
			: `Could not parse ns.toml extensions before recording extension: ${result.message}`,
		{ nsTomlPath, reason: result.reason },
	);
}

function execResultData(result: ExecResult): Record<string, unknown> {
	return {
		exitCode: result.code,
		stdout: result.stdout,
		stderr: result.stderr,
		killed: result.killed,
		...(result.startupError === undefined ? {} : { startupError: result.startupError }),
	};
}

function renderInstallHuman(result: z.infer<typeof installResultSchema>): string {
	const recorded = result.wasRecorded ? "recorded" : "already recorded";
	return (
		[
			`Installed ${result.packageName}@${result.packageVersion}`,
			`source: ${result.sourceSpec}`,
			`managed root: ${result.managedRoot}`,
			`ns.toml: ${result.nsTomlPath} (${recorded})`,
		].join("\n") + "\n"
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
