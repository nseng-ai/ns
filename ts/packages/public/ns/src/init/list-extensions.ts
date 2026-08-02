import { join } from "node:path";

import type { CommandOutcome } from "@nseng-ai/clinkr/app";
import { failure, ok } from "@nseng-ai/clinkr/app";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { renderTextTable } from "@nseng-ai/foundation/text-table";
import {
	ALL_HARNESS_IDS,
	parseNsTomlExtensions,
	parseNsTomlSupportedHarnesses,
	type PreparedDeclaredArtifactActivation,
} from "../harness-artifacts/api.ts";
import type {
	DeclaredExtensionDescriptor,
	DeclaredExtensionDescriptorDiagnostic,
} from "@nseng-ai/sdk/extensions/declared-descriptors";
import {
	classifyExtensionSourceLifecycle,
	managedNpmPackagePaths,
} from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import {
	decideUserExtensionLifecycleGate,
	extensionLifecycleScopeSchemaValues,
	parseUserSupportedHarnessesFacts,
	prepareUserConfig,
	summarizeDormantUserContributions,
	type UserExtensionAvailabilityContext,
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
	bundledSkillCount: z.number().int().nonnegative(),
	artifactStatus: extensionArtifactStatusSchema,
	artifactCount: z.number().int().nonnegative(),
	affectedArtifactCount: z.number().int().nonnegative(),
	dormantContributions: z.object({
		instructionModuleCount: z.number().int().nonnegative(),
		consumerDirCount: z.number().int().nonnegative(),
	}),
	diagnostics: z.array(extensionListDiagnosticSchema),
});

export const listExtensionsRequestSchema = z.object({
	scope: z.enum(extensionLifecycleScopeSchemaValues).default("project"),
});

export const userExtensionLayerStatusSchema = z.object({
	enabled: z.boolean(),
	activeHarness: z.enum(ALL_HARNESS_IDS).optional(),
	reason: z.string().optional(),
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
		supportedHarnessesState: z.enum(["configured", "missing"]),
		configuredHarnesses: z.array(z.enum(ALL_HARNESS_IDS)).readonly(),
		userExtensionLayer: userExtensionLayerStatusSchema,
		orphanedArtifactCount: z
			.number()
			.int()
			.nonnegative()
			.describe("User-manifest artifacts owned by packages no longer declared."),
		harnessSetDriftNote: z.string(),
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

export interface ExtensionListContext
	extends UserExtensionLifecycleContext, UserExtensionAvailabilityContext {
	readonly git: Pick<GitGateway, "optionalRepoRoot">;
	readonly files: Pick<ActivationFilesGateway, "readActivationFile">;
	readonly declaredExtensions: DeclaredExtensionsGateway;
	readonly artifactProvisioningStatus: ArtifactProvisioningStatusGateway;
	readonly installedExtensionPackages: InstalledExtensionPackagesGateway;
	/** Host environment; the user-layer gate reads NS_HARNESS from it (ADR 0054). */
	readonly env?: Record<string, string | undefined>;
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
): Promise<CommandOutcome<ListExtensionsResult>> {
	if (request.scope === "user") return listUserExtensions(context, request);
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
): CommandOutcome<ListExtensionsResult> {
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

const HARNESS_SET_DRIFT_NOTE =
	"Editing supported_harnesses does not reconcile installed extensions immediately; each extension reconciles against the configured set on its next install, update, or uninstall.";

interface UserArtifactRowFacts {
	readonly artifactStatus: z.infer<typeof extensionArtifactStatusSchema>;
	readonly artifactCount: number;
	readonly affectedArtifactCount: number;
	readonly diagnostics: readonly ExtensionListDiagnostic[];
}

interface UserArtifactInspection {
	readonly byPackageName: ReadonlyMap<string, UserArtifactRowFacts>;
	readonly orphanedArtifactCount: number;
	readonly failure?: ExtensionListDiagnostic;
}

async function inspectUserArtifacts(options: {
	readonly context: ExtensionListContext;
	readonly cwd: string;
	readonly installedDescriptors: readonly DeclaredExtensionDescriptor[];
	readonly configuredHarnesses: Parameters<
		ExtensionListContext["userArtifacts"]["prepare"]
	>[0]["configuredHarnesses"];
}): Promise<UserArtifactInspection> {
	const prepared = await options.context.userArtifacts.prepare({
		cwd: options.cwd,
		descriptors: options.installedDescriptors,
		configuredHarnesses: options.configuredHarnesses,
		targetPackageNames: options.installedDescriptors.map((descriptor) => descriptor.packageName),
	});
	if (!prepared.ok) {
		return {
			byPackageName: new Map(),
			orphanedArtifactCount: 0,
			failure: normalizeExtensionListDiagnostic({
				code: prepared.error.code.replaceAll("_", "-"),
				message: prepared.error.message,
			}),
		};
	}
	return {
		byPackageName: summarizeUserArtifactRows(prepared.prepared),
		orphanedArtifactCount: prepared.prepared.reconciliation.orphans.length,
	};
}

function summarizeUserArtifactRows(
	prepared: PreparedDeclaredArtifactActivation,
): ReadonlyMap<string, UserArtifactRowFacts> {
	interface MutableFacts {
		artifactCount: number;
		affectedArtifactCount: number;
		hasConflict: boolean;
		diagnostics: ExtensionListDiagnostic[];
	}
	const byPackage = new Map<string, MutableFacts>();
	function facts(packageName: string): MutableFacts {
		const existing = byPackage.get(packageName);
		if (existing !== undefined) return existing;
		const created: MutableFacts = {
			artifactCount: 0,
			affectedArtifactCount: 0,
			hasConflict: false,
			diagnostics: [],
		};
		byPackage.set(packageName, created);
		return created;
	}
	for (const item of prepared.reconciliation.items) {
		const packageName =
			item.type === "remove"
				? item.removal.entry.source.packageName
				: item.pair.desired.artifact.source.packageName;
		const entry = facts(packageName);
		entry.artifactCount += 1;
		if (item.action !== "unchanged") entry.affectedArtifactCount += 1;
		if (item.conflictingFiles.length > 0) {
			entry.hasConflict = true;
			entry.diagnostics.push({
				code: "user-artifact-conflict",
				message: `Locally edited provisioned files block reconciliation: ${item.conflictingFiles.join(", ")}.`,
			});
		}
	}
	for (const collision of prepared.skippedCollisions) {
		for (const packageName of collision.packages) {
			const entry = facts(packageName);
			entry.hasConflict = true;
			entry.diagnostics.push({
				code: "user-artifact-collision",
				message: `Artifact ${collision.kind} collision for ${collision.value}: ${collision.packages.join(", ")}.`,
			});
		}
	}
	return new Map(
		[...byPackage.entries()].map(([packageName, entry]) => [
			packageName,
			{
				artifactStatus: entry.hasConflict
					? ("conflicted" as const)
					: entry.affectedArtifactCount > 0
						? ("needs-reconcile" as const)
						: entry.artifactCount > 0
							? ("provisioned" as const)
							: ("none" as const),
				artifactCount: entry.artifactCount,
				affectedArtifactCount: entry.affectedArtifactCount,
				diagnostics: entry.diagnostics,
			},
		]),
	);
}

async function listUserExtensions(
	context: ExtensionListContext,
	request: ListExtensionsRequest,
): Promise<CommandOutcome<ListExtensionsResult>> {
	const prepared = await prepareUserConfig<ListExtensionsResult>(context, "list");
	if ("status" in prepared) return prepared;
	const parsed = parseNsTomlExtensions(prepared.content, prepared.configPath);
	if (parsed.type === "error")
		return extensionListConfigFailure({ ...parsed.error, path: prepared.configPath }, "user");
	const supportedHarnesses = parseUserSupportedHarnessesFacts(
		prepared.content,
		prepared.configPath,
	);
	if (supportedHarnesses.type === "invalid")
		return extensionListConfigFailure(
			{ ...supportedHarnesses.error, path: prepared.configPath },
			"user",
		);
	const layerDecision = decideUserExtensionLifecycleGate({
		env: context.env,
		supportedHarnesses: supportedHarnesses,
	});
	const specs = parsed.type === "missing" ? [] : parsed.extensions;
	const loaded = await context.declaredExtensions.load({
		repoRoot: prepared.configDir,
		specs,
		localPathPolicy: "absolute-only",
		resolveNpmPackageRoot: (packageName) =>
			context.userManagedNpmStorage.type === "available"
				? managedNpmPackagePaths(context.userManagedNpmStorage.storage, packageName).packageRoot
				: undefined,
	});
	const availability = await context.userExtensionAvailability.evaluate({
		configDir: prepared.configDir,
		sourceSpecs: specs,
	});
	const installedDescriptors = loaded.descriptors.filter((descriptor) =>
		specs.includes(descriptor.spec),
	);
	const artifactInspection = await inspectUserArtifacts({
		context,
		cwd: request.cwd,
		installedDescriptors,
		configuredHarnesses: supportedHarnesses.harnesses,
	});
	const emptyArtifactFacts: UserArtifactRowFacts = {
		artifactStatus: artifactInspection.failure === undefined ? "none" : "unavailable",
		artifactCount: 0,
		affectedArtifactCount: 0,
		diagnostics: artifactInspection.failure === undefined ? [] : [artifactInspection.failure],
	};
	const rows: UserExtensionListRow[] = specs.map((sourceSpec) => {
		const classification = classifyExtensionSourceLifecycle(prepared.configDir, sourceSpec);
		const descriptor = loaded.descriptors.find((candidate) => candidate.spec === sourceSpec);
		const diagnostics = loaded.diagnostics
			.filter(
				(diagnostic) =>
					diagnostic.spec === sourceSpec || diagnostic.relatedSpecs?.includes(sourceSpec) === true,
			)
			.map(normalizeExtensionListDiagnostic);
		const unavailableArtifactFacts = {
			bundledSkillCount: 0,
			artifactStatus: "unavailable" as const,
			artifactCount: 0,
			affectedArtifactCount: 0,
			dormantContributions: { instructionModuleCount: 0, consumerDirCount: 0 },
		};
		if (
			classification.type === "supported-npm" &&
			context.userManagedNpmStorage.type === "unavailable"
		) {
			return {
				sourceSpec,
				sourceKind: "npm",
				packageName: classification.source.packageName,
				acquisitionStatus: "missing",
				commandAvailability: "unavailable",
				...unavailableArtifactFacts,
				diagnostics: [context.userManagedNpmStorage.diagnostic],
			};
		}
		const fact = availability.find((candidate) => candidate.sourceSpec === sourceSpec);
		if (descriptor !== undefined && fact !== undefined) {
			const artifactFacts =
				artifactInspection.failure !== undefined
					? { ...emptyArtifactFacts, artifactStatus: "unavailable" as const }
					: (artifactInspection.byPackageName.get(descriptor.packageName) ?? {
							...emptyArtifactFacts,
							artifactStatus: "none" as const,
						});
			return {
				sourceSpec,
				sourceKind: descriptor.sourceKind,
				packageName: fact.packageName ?? descriptor.packageName,
				packageVersion: descriptor.version,
				moduleRoot: descriptor.moduleRoot,
				acquisitionStatus: "installed",
				commandAvailability:
					fact.availability === "available" && layerDecision.enabled ? "available" : "unavailable",
				bundledSkillCount: descriptor.descriptor.bundledArtifacts?.length ?? 0,
				artifactStatus: artifactFacts.artifactStatus,
				artifactCount: artifactFacts.artifactCount,
				affectedArtifactCount: artifactFacts.affectedArtifactCount,
				dormantContributions: summarizeDormantUserContributions([descriptor]),
				diagnostics: [
					...diagnostics,
					...fact.diagnostics.map(normalizeExtensionListDiagnostic),
					...artifactFacts.diagnostics,
				],
			};
		}
		const sourceKind =
			classification.type === "supported-local"
				? "local"
				: classification.type === "supported-npm" || classification.type === "invalid-npm"
					? "npm"
					: classification.type === "unsupported-git"
						? "git"
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
			...unavailableArtifactFacts,
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
	return ok({
		scope: "user",
		configPath: prepared.configPath,
		supportedHarnessesState: supportedHarnesses.type,
		configuredHarnesses: [...supportedHarnesses.harnesses],
		userExtensionLayer: layerDecision.enabled
			? { enabled: true, activeHarness: layerDecision.activeHarness }
			: {
					enabled: false,
					reason: layerDecision.reason.type,
				},
		orphanedArtifactCount: artifactInspection.orphanedArtifactCount,
		harnessSetDriftNote: HARNESS_SET_DRIFT_NOTE,
		extensions: rows,
	});
}

export function renderListExtensionsHuman(result: ListExtensionsResult): string {
	if (result.scope === "project" && result.extensions.length === 0)
		return "No extensions installed or declared in ns.toml.";
	if (result.scope === "user") {
		const table =
			result.extensions.length === 0
				? "No user extensions declared in ns.toml."
				: renderTextTable({
						columns: [
							{ header: "SOURCE" },
							{ header: "KIND" },
							{ header: "PACKAGE" },
							{ header: "COMMANDS" },
							{ header: "SKILLS" },
							{ header: "ARTIFACTS (AFFECTED/OBSERVED)" },
						],
						rows: result.extensions.map((row) => [
							row.sourceSpec,
							row.sourceKind,
							row.packageName ?? "-",
							row.commandAvailability,
							String(row.bundledSkillCount),
							`${row.artifactStatus} ${row.affectedArtifactCount}/${row.artifactCount}`,
						]),
					});
		const layer = result.userExtensionLayer.enabled
			? `User extension layer: enabled for ${result.userExtensionLayer.activeHarness ?? "unknown"}.`
			: `User extension layer: disabled. ${result.userExtensionLayer.reason ?? ""}`.trimEnd();
		const harnesses =
			result.supportedHarnessesState === "configured"
				? `Configured harnesses: ${result.configuredHarnesses.join(", ")}.`
				: "Configured harnesses: none (supported_harnesses is not set).";
		const dormant = result.extensions.flatMap((row) =>
			row.dormantContributions.instructionModuleCount === 0 &&
			row.dormantContributions.consumerDirCount === 0
				? []
				: [
						`- ${row.sourceSpec}: ${row.dormantContributions.instructionModuleCount} instruction block(s), ${row.dormantContributions.consumerDirCount} consumer directory declaration(s) stay dormant at user scope.`,
					],
		);
		const orphaned =
			result.orphanedArtifactCount === 0
				? []
				: [
						`Drift: ${result.orphanedArtifactCount} user-manifest artifact(s) belong to packages that are no longer declared.`,
					];
		const diagnostics = result.extensions.flatMap((row) =>
			row.diagnostics.map(
				(diagnostic) => `- ${row.sourceSpec}: [${diagnostic.code}] ${diagnostic.message}`,
			),
		);
		return [
			table,
			"",
			layer,
			harnesses,
			...orphaned,
			result.harnessSetDriftNote,
			...(dormant.length === 0 ? [] : ["", "Dormant contributions:", ...dormant]),
			...(diagnostics.length === 0 ? [] : ["", "Diagnostics:", ...diagnostics]),
		].join("\n");
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
