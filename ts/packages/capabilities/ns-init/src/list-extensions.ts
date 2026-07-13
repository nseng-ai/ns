import { join } from "node:path";

import type { ClinkrExit } from "@nseng-ai/clinkr";
import { failure, ok } from "@nseng-ai/clinkr";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { renderTextTable } from "@nseng-ai/foundation/text-table";
import { parseNsTomlExtensions, parseNsTomlHarnesses } from "@nseng-ai/harness-artifacts/api";
import type {
	DeclaredExtensionDescriptor,
	DeclaredExtensionDescriptorDiagnostic,
} from "@nseng-ai/sdk/extensions/declared-descriptors";
import { classifyExtensionSourceLifecycle } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import type { ActivationFilesGateway } from "./activation-files.ts";
import type {
	ArtifactProvisioningStatusGateway,
	ArtifactProvisioningStatusSummary,
} from "./artifact-provisioning-status.ts";
import type { DeclaredExtensionsGateway } from "./declared-extensions.ts";
import { normalizeExtensionLifecycleDiagnostic } from "./extension-lifecycle-preflight.ts";

const extensionSourceKindSchema = z.enum(["npm", "local", "git", "unsupported"]);
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
	sourceSpec: z.string().describe("Exact source spec from ns.toml, in declaration order."),
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

export const listExtensionsRequestSchema = z.object({});

export const listExtensionsResultSchema = z.object({
	repoRoot: z.string(),
	configPath: z.string(),
	extensions: z.array(extensionListRowSchema),
});

export type ExtensionListDiagnostic = z.infer<typeof extensionListDiagnosticSchema>;
export type ExtensionListRow = z.infer<typeof extensionListRowSchema>;
export interface ListExtensionsRequest {
	readonly cwd: string;
}
export type ListExtensionsResult = z.infer<typeof listExtensionsResultSchema>;

export interface ExtensionListContext {
	readonly git: Pick<GitGateway, "optionalRepoRoot">;
	readonly files: Pick<ActivationFilesGateway, "readActivationFile">;
	readonly declaredExtensions: DeclaredExtensionsGateway;
	readonly artifactProvisioningStatus: ArtifactProvisioningStatusGateway;
}

interface MutableExtensionListRow {
	sourceSpec: string;
	sourceKind: ExtensionListRow["sourceKind"];
	packageName?: string;
	packageVersion?: string;
	moduleRoot?: string;
	acquisitionStatus: ExtensionListRow["acquisitionStatus"];
	artifactStatus: ExtensionListRow["artifactStatus"];
	artifactCount: number;
	affectedArtifactCount: number;
	diagnostics: ExtensionListDiagnostic[];
}

export async function listExtensions(
	context: ExtensionListContext,
	request: ListExtensionsRequest,
): Promise<ClinkrExit<ListExtensionsResult>> {
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
	const config = await context.files.readActivationFile({ repoRoot, file: "ns-toml" });
	if (config.type === "missing") return ok({ repoRoot, configPath, extensions: [] });
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
	const parsedHarnesses = parseNsTomlHarnesses(config.content, configPath);
	if (parsedHarnesses.type === "error") {
		return extensionListConfigFailure({ ...parsedHarnesses.error, path: configPath });
	}
	const sourceSpecs = parsedExtensions.type === "missing" ? [] : parsedExtensions.extensions;
	if (sourceSpecs.length === 0) return ok({ repoRoot, configPath, extensions: [] });

	const rows = sourceSpecs.map((sourceSpec) => createRowSkeleton(repoRoot, sourceSpec));
	const loaded = await context.declaredExtensions.load({ repoRoot, specs: sourceSpecs });
	attachDescriptorDiagnostics(rows, loaded.diagnostics);
	attachLoadedDescriptors(rows, loaded.descriptors);
	markRowsWithoutDescriptorEvidence(rows);

	const installedDescriptors = loaded.descriptors.filter((descriptor) =>
		rows.some((row) => row.sourceSpec === descriptor.spec && row.acquisitionStatus === "installed"),
	);
	if (parsedHarnesses.type === "missing") {
		for (const row of rows) {
			if (row.acquisitionStatus !== "installed") continue;
			row.artifactStatus = "unavailable";
			appendDiagnostic(row, {
				code: "harnesses-missing",
				message: "ns.toml does not configure project harnesses, so artifact status is unavailable.",
				path: configPath,
			});
		}
	} else if (installedDescriptors.length > 0) {
		const summaries = await context.artifactProvisioningStatus.inspect({
			repoRoot,
			descriptors: installedDescriptors,
			harnesses: parsedHarnesses.harnesses,
		});
		attachArtifactSummaries(rows, installedDescriptors, summaries);
	}

	return ok({ repoRoot, configPath, extensions: rows.map(finalizeRow) });
}

function createRowSkeleton(repoRoot: string, sourceSpec: string): MutableExtensionListRow {
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
			return { ...base, sourceKind: "npm", packageName: classification.source.packageName };
		case "supported-local":
			return { ...base, sourceKind: "local", moduleRoot: classification.source.path };
		case "unsupported-git":
			return { ...base, sourceKind: "git" };
		case "unsupported-other":
			return {
				...base,
				sourceKind: "unsupported",
				diagnostics: [
					{
						code: "extension-descriptor-source-unsupported",
						message: classification.message,
					},
				],
			};
		case "invalid-npm":
			return { ...base, sourceKind: "npm" };
	}
}

function attachDescriptorDiagnostics(
	rows: readonly MutableExtensionListRow[],
	diagnostics: readonly DeclaredExtensionDescriptorDiagnostic[],
): void {
	for (const diagnostic of diagnostics) {
		const affectedSpecs = new Set([diagnostic.spec, ...(diagnostic.relatedSpecs ?? [])]);
		const outward = normalizeExtensionListDiagnostic(diagnostic);
		for (const row of rows) {
			if (!affectedSpecs.has(row.sourceSpec)) continue;
			if (row.sourceKind === "unsupported" && row.diagnostics.length > 0) continue;
			row.acquisitionStatus =
				diagnostic.code === "extension_descriptor_package_missing" ? "missing" : "invalid";
			row.artifactStatus = "unavailable";
			appendDiagnostic(row, outward);
		}
	}
}

function attachLoadedDescriptors(
	rows: readonly MutableExtensionListRow[],
	descriptors: readonly DeclaredExtensionDescriptor[],
): void {
	for (const descriptor of descriptors) {
		const matchingRows = rows.filter((row) => row.sourceSpec === descriptor.spec);
		if (matchingRows.length !== 1) {
			for (const row of matchingRows) {
				appendDiagnostic(row, {
					code: "extension-descriptor-attribution-ambiguous",
					message: `Loaded descriptor facts for ${descriptor.spec} cannot be attributed to one declaration row.`,
				});
			}
			continue;
		}
		const row = matchingRows[0];
		if (row === undefined || row.diagnostics.length > 0) continue;
		row.acquisitionStatus = "installed";
		row.sourceKind = descriptor.sourceKind;
		row.packageName = descriptor.packageName;
		row.packageVersion = descriptor.version;
		row.moduleRoot = descriptor.moduleRoot;
		row.artifactStatus = "none";
	}
}

function markRowsWithoutDescriptorEvidence(rows: readonly MutableExtensionListRow[]): void {
	for (const row of rows) {
		if (row.acquisitionStatus !== "invalid" || row.diagnostics.length > 0) continue;
		appendDiagnostic(row, {
			code: "extension-descriptor-status-unavailable",
			message: `No descriptor or diagnostic was returned for declared extension ${row.sourceSpec}.`,
		});
	}
}

function attachArtifactSummaries(
	rows: readonly MutableExtensionListRow[],
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
				row.artifactStatus = "unavailable";
				appendDiagnostic(row, {
					code: "artifact-status-attribution-failed",
					message: `Expected exactly one artifact status summary for ${descriptor.moduleRoot}.`,
				});
			}
			continue;
		}
		const row = descriptorRows[0];
		const summary = matchingSummaries[0];
		if (row === undefined || summary === undefined) continue;
		row.artifactStatus = summary.artifactStatus;
		row.artifactCount = summary.artifactCount;
		row.affectedArtifactCount = summary.affectedArtifactCount;
		for (const diagnostic of summary.diagnostics) {
			appendDiagnostic(row, normalizeExtensionListDiagnostic(diagnostic));
		}
	}
}

function normalizeExtensionListDiagnostic(diagnostic: {
	readonly code: string;
	readonly message: string;
	readonly path?: string;
}): ExtensionListDiagnostic {
	const normalized = normalizeExtensionLifecycleDiagnostic(diagnostic);
	return {
		code: normalized.code,
		message: normalized.message,
		...(normalized.path === undefined ? {} : { path: normalized.path }),
	};
}

function appendDiagnostic(row: MutableExtensionListRow, diagnostic: ExtensionListDiagnostic): void {
	const isDuplicate = row.diagnostics.some(
		(existing) =>
			existing.code === diagnostic.code &&
			existing.message === diagnostic.message &&
			existing.path === diagnostic.path,
	);
	if (!isDuplicate) row.diagnostics.push({ ...diagnostic });
}

function extensionListConfigFailure(diagnostic: {
	readonly code: string;
	readonly message: string;
	readonly path: string;
}): ClinkrExit<ListExtensionsResult> {
	const normalized = normalizeExtensionListDiagnostic(diagnostic);
	return failure("ns-extension-list-config-invalid", normalized.message, {
		diagnostics: [normalized],
	});
}

function finalizeRow(row: MutableExtensionListRow): ExtensionListRow {
	return {
		sourceSpec: row.sourceSpec,
		sourceKind: row.sourceKind,
		...(row.packageName === undefined ? {} : { packageName: row.packageName }),
		...(row.packageVersion === undefined ? {} : { packageVersion: row.packageVersion }),
		...(row.moduleRoot === undefined ? {} : { moduleRoot: row.moduleRoot }),
		acquisitionStatus: row.acquisitionStatus,
		artifactStatus: row.artifactStatus,
		artifactCount: row.artifactCount,
		affectedArtifactCount: row.affectedArtifactCount,
		diagnostics: row.diagnostics.map((diagnostic) => ({ ...diagnostic })),
	};
}

export function renderListExtensionsHuman(result: ListExtensionsResult): string {
	if (result.extensions.length === 0) return "No extensions declared in ns.toml.";
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
