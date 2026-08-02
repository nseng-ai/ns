import { join } from "node:path";

import type { ClinkrExit } from "@nseng-ai/clinkr/legacy";
import { failure, ok } from "@nseng-ai/clinkr/legacy";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { renderTextTable } from "@nseng-ai/foundation/text-table";
import { parseNsTomlExtensions, parseNsTomlSupportedHarnesses } from "../harness-artifacts/api.ts";
import type {
	DeclaredExtensionDescriptor,
	DeclaredExtensionDescriptorDiagnostic,
} from "@nseng-ai/sdk/extensions/declared-descriptors";
import { classifyExtensionSourceLifecycle } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import {
	extensionLifecycleScopeSchemaValues,
	prepareUserConfig,
	type UserExtensionLifecycleContext,
} from "./user-extension-lifecycle.ts";

import type { ActivationFilesGateway } from "./activation-files.ts";
import type {
	ArtifactProvisioningStatusGateway,
	ArtifactProvisioningStatusSummary,
} from "./artifact-provisioning-status.ts";
import type { DeclaredExtensionsGateway } from "./declared-extensions.ts";
import {
	appendDiagnosticToCollection,
	normalizeExtensionDiagnostic,
} from "./diagnostic-collection.ts";

const extensionSourceKindSchema = z.enum(["package", "npm", "local", "git", "unsupported"]);
const extensionAcquisitionStatusSchema = z.enum(["installed", "missing", "invalid"]);
const extensionArtifactStatusSchema = z.enum([
	"none",
	"provisioned",
	"needs-reconcile",
	"conflicted",
	"unavailable",
]);

export const extensionListDiagnosticSchema = z.object({
	code: z
		.string()
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
		.describe("Stable kebab-case diagnostic code."),
	message: z.string(),
	path: z.string().optional(),
});

export const extensionListRowSchema = z.object({
	sourceSpec: z.string().describe("Installed package identity or exact source spec from ns.toml."),
	sourceKind: extensionSourceKindSchema,
	packageName: z.string().optional(),
	packageVersion: z.string().optional(),
	moduleRoot: z.string().optional(),
	acquisitionStatus: extensionAcquisitionStatusSchema,
	artifactStatus: extensionArtifactStatusSchema,
	artifactCount: z
		.number()
		.int()
		.nonnegative()
		.describe("Observed artifact and harness instances."),
	affectedArtifactCount: z
		.number()
		.int()
		.nonnegative()
		.describe("Observed instances that are not unchanged; unavailable counts may be partial."),
	diagnostics: z.array(extensionListDiagnosticSchema),
});

export const userExtensionListRowSchema = z.object({
	sourceSpec: z.string(),
	sourceKind: extensionSourceKindSchema,
	packageName: z.string().optional(),
	packageVersion: z.string().optional(),
	moduleRoot: z.string().optional(),
	acquisitionStatus: extensionAcquisitionStatusSchema,
	commandAvailability: z.enum(["available", "unavailable"]),
	diagnostics: z.array(extensionListDiagnosticSchema),
});

export const listExtensionsRequestSchema = z.object({
	scope: z.enum(extensionLifecycleScopeSchemaValues).default("project"),
});

export const listExtensionsResultSchema = z.discriminatedUnion("scope", [
	z.object({
		scope: z.literal("project"),
		repoRoot: z.string(),
		configPath: z.string(),
		extensions: z.array(extensionListRowSchema),
	}),
	z.object({
		scope: z.literal("user"),
		configPath: z.string(),
		extensions: z.array(userExtensionListRowSchema),
	}),
]);

export type ExtensionListDiagnostic = z.infer<typeof extensionListDiagnosticSchema>;
export type ExtensionListRow = z.infer<typeof extensionListRowSchema>;
export type UserExtensionListRow = z.infer<typeof userExtensionListRowSchema>;
export type ListExtensionsRequest = z.input<typeof listExtensionsRequestSchema> & {
	readonly cwd: string;
};
export type ListExtensionsResult = z.infer<typeof listExtensionsResultSchema>;

export interface InstalledExtensionPackage {
	readonly packageName: string;
	readonly packageVersion?: string;
	readonly moduleRoot?: string;
}

export interface InstalledExtensionPackagesGateway {
	list(): readonly InstalledExtensionPackage[];
}

export interface ExtensionListContext extends UserExtensionLifecycleContext {
	readonly git: Pick<GitGateway, "optionalRepoRoot">;
	readonly files: Pick<ActivationFilesGateway, "readActivationFile">;
	readonly declaredExtensions: DeclaredExtensionsGateway;
	readonly artifactProvisioningStatus: ArtifactProvisioningStatusGateway;
	readonly installedExtensionPackages: InstalledExtensionPackagesGateway;
}

class ExtensionListRowAccumulator {
	private row: ExtensionListRow;

	constructor(row: ExtensionListRow) {
		this.row = {
			...row,
			diagnostics: row.diagnostics.map((diagnostic) => ({ ...diagnostic })),
		};
	}

	get sourceSpec(): string {
		return this.row.sourceSpec;
	}

	get sourceKind(): ExtensionListRow["sourceKind"] {
		return this.row.sourceKind;
	}

	get moduleRoot(): string | undefined {
		return this.row.moduleRoot;
	}

	get acquisitionStatus(): ExtensionListRow["acquisitionStatus"] {
		return this.row.acquisitionStatus;
	}

	get hasDiagnostics(): boolean {
		return this.row.diagnostics.length > 0;
	}

	addDiagnostic(diagnostic: ExtensionListDiagnostic): void {
		this.row = {
			...this.row,
			diagnostics: [...appendDiagnosticToCollection(this.row.diagnostics, diagnostic)],
		};
	}

	recordDescriptorDiagnostic(options: {
		readonly acquisitionStatus: "missing" | "invalid";
		readonly diagnostic: ExtensionListDiagnostic;
	}): void {
		this.row = {
			...this.row,
			acquisitionStatus: options.acquisitionStatus,
			artifactStatus: "unavailable",
		};
		this.addDiagnostic(options.diagnostic);
	}

	recordLoadedDescriptor(descriptor: DeclaredExtensionDescriptor): void {
		this.row = {
			...this.row,
			acquisitionStatus: "installed",
			sourceKind: descriptor.sourceKind,
			packageName: descriptor.packageName,
			packageVersion: descriptor.version,
			moduleRoot: descriptor.moduleRoot,
			artifactStatus: "none",
		};
	}

	markArtifactUnavailable(diagnostic: ExtensionListDiagnostic): void {
		this.row = { ...this.row, artifactStatus: "unavailable" };
		this.addDiagnostic(diagnostic);
	}

	recordArtifactSummary(summary: ArtifactProvisioningStatusSummary): void {
		this.row = {
			...this.row,
			artifactStatus: summary.artifactStatus,
			artifactCount: summary.artifactCount,
			affectedArtifactCount: summary.affectedArtifactCount,
		};
		for (const diagnostic of summary.diagnostics) {
			this.addDiagnostic(normalizeExtensionListDiagnostic(diagnostic));
		}
	}

	finalize(): ExtensionListRow {
		return {
			...this.row,
			diagnostics: this.row.diagnostics.map((diagnostic) => ({ ...diagnostic })),
		};
	}
}

export async function listExtensions(
	context: ExtensionListContext,
	request: ListExtensionsRequest,
): Promise<ClinkrExit<ListExtensionsResult>> {
	if (request.scope === "user") return listUserExtensions(context);
	const repository = await context.git.optionalRepoRoot({ cwd: request.cwd });
	if (repository.type === "missing") {
		return failure(
			"ns-extension-list-not-a-git-repo",
			`No git repository found at ${request.cwd}; run \`git init\` first.`,
			{
				diagnostics: [
					{
						code: "not-a-git-repo",
						message: `No git repository found at ${request.cwd}; run \`git init\` first.`,
						path: request.cwd,
					},
				],
			},
		);
	}
	if (repository.type === "error") {
		return failure("ns-extension-list-repository-failed", repository.error.message, {
			diagnostics: [normalizeExtensionListDiagnostic(repository.error)],
		});
	}

	const repoRoot = repository.value;
	const configPath = join(repoRoot, "ns.toml");
	const installedRows = context.installedExtensionPackages.list().map(createInstalledPackageRow);
	const config = await context.files.readActivationFile({ repoRoot, file: "ns-toml" });
	if (config.type === "missing") {
		return ok({ scope: "project", repoRoot, configPath, extensions: installedRows });
	}
	if (config.type === "not-file") {
		return extensionListConfigFailure({
			code: "ns-toml-not-file",
			message: `${configPath} exists but is not a file.`,
			path: configPath,
		});
	}
	if (config.type === "error") {
		return extensionListConfigFailure({ ...config.error, path: configPath });
	}

	const parsedExtensions = parseNsTomlExtensions(config.content, configPath);
	if (parsedExtensions.type === "error") {
		return extensionListConfigFailure({ ...parsedExtensions.error, path: configPath });
	}
	const parsedHarnesses = parseNsTomlSupportedHarnesses(config.content, configPath);
	if (parsedHarnesses.type === "error") {
		return extensionListConfigFailure({ ...parsedHarnesses.error, path: configPath });
	}
	const sourceSpecs = parsedExtensions.type === "missing" ? [] : parsedExtensions.extensions;
	if (sourceSpecs.length === 0) {
		return ok({ scope: "project", repoRoot, configPath, extensions: installedRows });
	}

	const declaredRows = sourceSpecs.map((sourceSpec) => createRowSkeleton(repoRoot, sourceSpec));
	const loaded = await context.declaredExtensions.load({ repoRoot, specs: sourceSpecs });
	attachDescriptorDiagnostics(declaredRows, loaded.diagnostics);
	attachLoadedDescriptors(declaredRows, loaded.descriptors);
	markRowsWithoutDescriptorEvidence(declaredRows);

	const declaredPackageNames = new Set(
		loaded.descriptors.map((descriptor) => descriptor.packageName),
	);
	const visibleInstalledRows = installedRows.filter(
		(row) => row.packageName === undefined || !declaredPackageNames.has(row.packageName),
	);
	const installedDescriptors = loaded.descriptors.filter((descriptor) =>
		declaredRows.some(
			(row) => row.sourceSpec === descriptor.spec && row.acquisitionStatus === "installed",
		),
	);
	if (parsedHarnesses.type === "missing") {
		for (const row of declaredRows) {
			if (row.acquisitionStatus !== "installed") continue;
			row.markArtifactUnavailable({
				code: "supported-harnesses-missing",
				message:
					"ns.toml does not configure repository supported harnesses, so artifact status is unavailable.",
				path: configPath,
			});
		}
	} else if (installedDescriptors.length > 0) {
		const summaries = await context.artifactProvisioningStatus.inspect({
			repoRoot,
			descriptors: installedDescriptors,
			harnesses: parsedHarnesses.harnesses,
		});
		attachArtifactSummaries(declaredRows, installedDescriptors, summaries);
	}

	return ok({
		scope: "project",
		repoRoot,
		configPath,
		extensions: [...visibleInstalledRows, ...declaredRows.map((row) => row.finalize())],
	});
}

function createInstalledPackageRow(installedPackage: InstalledExtensionPackage): ExtensionListRow {
	return {
		sourceSpec: installedPackage.packageName,
		sourceKind: "package",
		packageName: installedPackage.packageName,
		...optionalEntry("packageVersion", installedPackage.packageVersion),
		...optionalEntry("moduleRoot", installedPackage.moduleRoot),
		acquisitionStatus: "installed",
		artifactStatus: "none",
		artifactCount: 0,
		affectedArtifactCount: 0,
		diagnostics: [],
	};
}

function createRowSkeleton(repoRoot: string, sourceSpec: string): ExtensionListRowAccumulator {
	const classification = classifyExtensionSourceLifecycle(repoRoot, sourceSpec);
	const base = {
		sourceSpec,
		acquisitionStatus: "invalid" as const,
		artifactStatus: "unavailable" as const,
		artifactCount: 0,
		affectedArtifactCount: 0,
		diagnostics: [] as ExtensionListDiagnostic[],
	};
	switch (classification.type) {
		case "supported-npm":
			return new ExtensionListRowAccumulator({
				...base,
				sourceKind: "npm",
				packageName: classification.source.packageName,
			});
		case "supported-local":
			return new ExtensionListRowAccumulator({
				...base,
				sourceKind: "local",
				moduleRoot: classification.source.path,
			});
		case "unsupported-git":
			return new ExtensionListRowAccumulator({ ...base, sourceKind: "git" });
		case "unsupported-other":
			return new ExtensionListRowAccumulator({
				...base,
				sourceKind: "unsupported",
				diagnostics: [
					{
						code: "extension-descriptor-source-unsupported",
						message: classification.message,
					},
				],
			});
		case "invalid-npm":
			return new ExtensionListRowAccumulator({ ...base, sourceKind: "npm" });
	}
}

function attachDescriptorDiagnostics(
	rows: readonly ExtensionListRowAccumulator[],
	diagnostics: readonly DeclaredExtensionDescriptorDiagnostic[],
): void {
	for (const diagnostic of diagnostics) {
		const affectedSpecs = new Set([diagnostic.spec, ...(diagnostic.relatedSpecs ?? [])]);
		const outward = normalizeExtensionListDiagnostic(diagnostic);
		for (const row of rows) {
			if (!affectedSpecs.has(row.sourceSpec)) continue;
			if (row.sourceKind === "unsupported" && row.hasDiagnostics) continue;
			row.recordDescriptorDiagnostic({
				acquisitionStatus:
					diagnostic.code === "extension_descriptor_package_missing" ? "missing" : "invalid",
				diagnostic: outward,
			});
		}
	}
}

function attachLoadedDescriptors(
	rows: readonly ExtensionListRowAccumulator[],
	descriptors: readonly DeclaredExtensionDescriptor[],
): void {
	for (const descriptor of descriptors) {
		const matchingRows = rows.filter((row) => row.sourceSpec === descriptor.spec);
		if (matchingRows.length !== 1) {
			for (const row of matchingRows) {
				row.addDiagnostic({
					code: "extension-descriptor-attribution-ambiguous",
					message: `Loaded descriptor facts for ${descriptor.spec} cannot be attributed to one declaration row.`,
				});
			}
			continue;
		}
		const row = matchingRows[0];
		if (row === undefined || row.hasDiagnostics) continue;
		row.recordLoadedDescriptor(descriptor);
	}
}

function markRowsWithoutDescriptorEvidence(rows: readonly ExtensionListRowAccumulator[]): void {
	for (const row of rows) {
		if (row.acquisitionStatus !== "invalid" || row.hasDiagnostics) continue;
		row.addDiagnostic({
			code: "extension-descriptor-status-unavailable",
			message: `No descriptor or diagnostic was returned for declared extension ${row.sourceSpec}.`,
		});
	}
}

function attachArtifactSummaries(
	rows: readonly ExtensionListRowAccumulator[],
	descriptors: readonly DeclaredExtensionDescriptor[],
	summaries: readonly ArtifactProvisioningStatusSummary[],
): void {
	for (const descriptor of descriptors) {
		const descriptorRows = rows.filter(
			(row) =>
				row.sourceSpec === descriptor.spec &&
				row.moduleRoot === descriptor.moduleRoot &&
				row.acquisitionStatus === "installed",
		);
		const matchingSummaries = summaries.filter(
			(summary) => summary.moduleRoot === descriptor.moduleRoot,
		);
		if (descriptorRows.length !== 1 || matchingSummaries.length !== 1) {
			for (const row of descriptorRows) {
				row.markArtifactUnavailable({
					code: "artifact-status-attribution-failed",
					message: `Expected exactly one artifact status summary for ${descriptor.moduleRoot}.`,
				});
			}
			continue;
		}
		const row = descriptorRows[0];
		const summary = matchingSummaries[0];
		if (row === undefined || summary === undefined) continue;
		row.recordArtifactSummary(summary);
	}
}

function normalizeExtensionListDiagnostic(diagnostic: {
	readonly code: string;
	readonly message: string;
	readonly path?: string;
}): ExtensionListDiagnostic {
	const normalized = normalizeExtensionDiagnostic(diagnostic);
	return {
		code: normalized.code,
		message: normalized.message,
		...(normalized.path === undefined ? {} : { path: normalized.path }),
	};
}

function extensionListConfigFailure(
	diagnostic: {
		readonly code: string;
		readonly message: string;
		readonly path: string;
	},
	scope?: "user",
): ClinkrExit<ListExtensionsResult> {
	const normalized = normalizeExtensionListDiagnostic(diagnostic);
	return failure(
		scope === "user" ? "ns-extension-list-user-config-invalid" : "ns-extension-list-config-invalid",
		normalized.message,
		{
			...(scope === undefined ? {} : { scope }),
			diagnostics: [normalized],
		},
	);
}

async function listUserExtensions(
	context: ExtensionListContext,
): Promise<ClinkrExit<ListExtensionsResult>> {
	const prepared = await prepareUserConfig<ListExtensionsResult>(context, "list");
	if ("type" in prepared) return prepared;
	const parsed = parseNsTomlExtensions(prepared.content, prepared.configPath);
	if (parsed.type === "error")
		return extensionListConfigFailure({ ...parsed.error, path: prepared.configPath }, "user");
	const specs = parsed.type === "missing" ? [] : parsed.extensions;
	const loaded = await context.declaredExtensions.load({
		repoRoot: prepared.configDir,
		specs,
		localPathPolicy: "absolute-only",
		resolveNpmPackageRoot: () => undefined,
	});
	const rows: UserExtensionListRow[] = specs.map((sourceSpec) => {
		const classification = classifyExtensionSourceLifecycle(prepared.configDir, sourceSpec);
		const descriptor = loaded.descriptors.find((candidate) => candidate.spec === sourceSpec);
		const diagnostics = loaded.diagnostics
			.filter(
				(diagnostic) =>
					diagnostic.spec === sourceSpec || diagnostic.relatedSpecs?.includes(sourceSpec) === true,
			)
			.map(normalizeExtensionListDiagnostic);
		if (classification.type === "supported-npm") {
			return {
				sourceSpec,
				sourceKind: "npm",
				packageName: classification.source.packageName,
				acquisitionStatus: "missing",
				commandAvailability: "unavailable",
				diagnostics: [
					{
						code: "user-npm-managed-storage-unavailable",
						message: `User-scoped npm extension is unavailable until managed npm storage is implemented: ${sourceSpec}.`,
					},
				],
			};
		}
		if (descriptor !== undefined)
			return {
				sourceSpec,
				sourceKind: descriptor.sourceKind,
				packageName: descriptor.packageName,
				packageVersion: descriptor.version,
				moduleRoot: descriptor.moduleRoot,
				acquisitionStatus: "installed",
				commandAvailability: "available",
				diagnostics,
			};
		const sourceKind =
			classification.type === "supported-local"
				? "local"
				: classification.type === "unsupported-git"
					? "git"
					: classification.type === "invalid-npm"
						? "npm"
						: "unsupported";
		return {
			sourceSpec,
			sourceKind,
			acquisitionStatus: diagnostics.some(
				(diagnostic) => diagnostic.code === "extension-descriptor-package-missing",
			)
				? "missing"
				: "invalid",
			commandAvailability: "unavailable",
			diagnostics:
				diagnostics.length === 0
					? [
							{
								code: "extension-descriptor-status-unavailable",
								message: `No descriptor is available for ${sourceSpec}.`,
							},
						]
					: diagnostics,
		};
	});
	return ok({ scope: "user", configPath: prepared.configPath, extensions: rows });
}

export function renderListExtensionsHuman(result: ListExtensionsResult): string {
	if (result.extensions.length === 0) {
		return result.scope === "project"
			? "No extensions installed or declared in ns.toml."
			: "No user extensions declared in ns.toml.";
	}
	if (result.scope === "user") {
		const table = renderTextTable({
			columns: [
				{ header: "SOURCE" },
				{ header: "KIND" },
				{ header: "PACKAGE" },
				{ header: "COMMANDS" },
			],
			rows: result.extensions.map((row) => [
				row.sourceSpec,
				row.sourceKind,
				row.packageName ?? "-",
				row.commandAvailability,
			]),
		});
		const diagnostics = result.extensions.flatMap((row) =>
			row.diagnostics.map(
				(diagnostic) => `- ${row.sourceSpec}: [${diagnostic.code}] ${diagnostic.message}`,
			),
		);
		return `${table}${diagnostics.length === 0 ? "" : `\n\nDiagnostics:\n${diagnostics.join("\n")}`}\n\nUser scope controls command availability only; no project activation is inspected.`;
	}
	const table = renderTextTable({
		columns: [
			{ header: "SOURCE" },
			{ header: "KIND" },
			{ header: "PACKAGE" },
			{ header: "ACQUISITION" },
			{ header: "ARTIFACTS (AFFECTED/OBSERVED)" },
		],
		rows: result.extensions.map((row) => [
			row.sourceSpec,
			row.sourceKind,
			row.packageName === undefined
				? "-"
				: `${row.packageName}${row.packageVersion === undefined ? "" : `@${row.packageVersion}`}`,
			row.acquisitionStatus,
			`${row.artifactStatus} ${row.affectedArtifactCount}/${row.artifactCount}${row.artifactStatus === "unavailable" ? " (observed may be partial)" : ""}`,
		]),
	});
	const diagnostics = result.extensions.flatMap((row) =>
		row.diagnostics.map(
			(diagnostic) =>
				`- ${row.sourceSpec}: [${diagnostic.code}] ${diagnostic.message}${diagnostic.path === undefined ? "" : ` (${diagnostic.path})`}`,
		),
	);
	return diagnostics.length === 0 ? table : `${table}\n\nDiagnostics:\n${diagnostics.join("\n")}`;
}
