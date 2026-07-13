import { isAbsolute, relative } from "node:path";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import {
	prepareDeclaredArtifactActivation,
	type PreparedDeclaredArtifactActivation,
} from "@nseng-ai/harness-artifacts/api";

import type {
	ArtifactProvisioningDiagnostic,
	ArtifactProvisioningStatus,
	ArtifactProvisioningStatusGateway,
	ArtifactProvisioningStatusSummary,
	InspectArtifactProvisioningStatusParams,
} from "./artifact-provisioning-status.ts";
import { appendDiagnosticToCollection } from "./diagnostic-collection.ts";

interface MutableArtifactProvisioningStatusSummary {
	readonly moduleRoot: string;
	readonly packageName: string;
	artifactStatus: ArtifactProvisioningStatus;
	artifactCount: number;
	affectedArtifactCount: number;
	diagnostics: readonly ArtifactProvisioningDiagnostic[];
}

const STATUS_PRECEDENCE: Readonly<Record<ArtifactProvisioningStatus, number>> = {
	none: 0,
	provisioned: 1,
	"needs-reconcile": 2,
	conflicted: 3,
	unavailable: 4,
};

export class RealArtifactProvisioningStatusGateway implements ArtifactProvisioningStatusGateway {
	async inspect(
		params: InspectArtifactProvisioningStatusParams,
	): Promise<readonly ArtifactProvisioningStatusSummary[]> {
		const summaries = params.descriptors.map(
			(descriptor): MutableArtifactProvisioningStatusSummary => ({
				moduleRoot: descriptor.moduleRoot,
				packageName: descriptor.packageName,
				artifactStatus: "none",
				artifactCount: 0,
				affectedArtifactCount: 0,
				diagnostics: [],
			}),
		);
		try {
			const prepared = await prepareDeclaredArtifactActivation({
				projectRoot: params.repoRoot,
				modules: params.descriptors.map((descriptor) => ({
					moduleRoot: descriptor.moduleRoot,
					packageName: descriptor.packageName,
					version: descriptor.version,
					descriptor: descriptor.descriptor,
				})),
				selectedHarnesses: params.harnesses,
			});
			if (!prepared.ok) {
				markUnavailable(summaries, preparationFailureDiagnostic(prepared.error));
				return finalizedSummaries(summaries);
			}
			summarizePreparedActivation(summaries, prepared.value);
			return finalizedSummaries(summaries);
		} catch (error) {
			markUnavailable(summaries, {
				code: "artifact-status-inspection-failed",
				message: `Artifact provisioning status inspection failed: ${formatErrorMessage(error)}`,
			});
			return finalizedSummaries(summaries);
		}
	}
}

function summarizePreparedActivation(
	summaries: readonly MutableArtifactProvisioningStatusSummary[],
	prepared: PreparedDeclaredArtifactActivation,
): void {
	const byModuleRoot = groupBy(summaries, (summary) => summary.moduleRoot);
	const byPackageName = groupBy(summaries, (summary) => summary.packageName);

	for (const item of prepared.reconciliation.items) {
		if (item.type === "provision") {
			addTransition(
				byModuleRoot.get(item.pair.desired.sourceRoot) ?? [],
				item.action,
				item.pair.desired.artifact.id,
				item.pair.harness,
				item.conflictingFiles[0],
			);
			continue;
		}
		const replacementRoots =
			item.removal.reason === "same-target-replacement"
				? new Set(
						prepared.reconciliation.items.flatMap((candidate) =>
							candidate.type === "provision" &&
							candidate.pair.harness === item.removal.entry.harness &&
							candidate.provision.plan.targetArtifactPath === item.removal.entry.targetArtifactPath
								? [candidate.pair.desired.sourceRoot]
								: [],
						),
					)
				: new Set<string>();
		if (replacementRoots.size === 1) {
			// The matching provision transition represents this one observed target instance.
			continue;
		}
		if (replacementRoots.size > 1) {
			markAmbiguousAttribution(
				[...replacementRoots].flatMap((moduleRoot) => byModuleRoot.get(moduleRoot) ?? []),
				item.removal.entry.source.packageName,
				item.removal.manifestPath,
			);
			continue;
		}
		const packageSummaries = byPackageName.get(item.removal.entry.source.packageName) ?? [];
		const packageRoots = new Set(packageSummaries.map((summary) => summary.moduleRoot));
		if (packageRoots.size === 0) continue;
		if (packageRoots.size > 1) {
			markAmbiguousAttribution(
				packageSummaries,
				item.removal.entry.source.packageName,
				item.removal.manifestPath,
			);
			continue;
		}
		addTransition(
			packageSummaries,
			item.action,
			item.removal.entry.artifactId,
			item.removal.entry.harness,
			item.conflictingFiles[0],
		);
	}

	for (const desired of prepared.reconciliation.skippedDesired) {
		const targetSummaries = byModuleRoot.get(desired.sourceRoot) ?? [];
		addKnownInstances(targetSummaries, "conflicted", prepared.selectedHarnesses.length);
		for (const collision of prepared.skippedCollisions) {
			const matches =
				collision.kind === "id"
					? collision.value === desired.artifact.id
					: collision.value === desired.artifact.skillName;
			if (!matches) continue;
			for (const summary of targetSummaries) {
				appendDiagnostic(summary, {
					code: "artifact-collision",
					message: `Artifact ${collision.kind} collision for ${collision.value}: ${collision.packages.join(", ")}.`,
				});
			}
		}
	}

	for (const diagnostic of prepared.diagnostics) {
		const isCollisionDiagnostic =
			diagnostic.code === "module_artifact_duplicate_id" ||
			diagnostic.code === "module_artifact_duplicate_target_name";
		const attribution = summariesForDiagnostic({
			diagnostic,
			summaries,
			byModuleRoot,
			byPackageName,
			prepared,
			allowMultiple: isCollisionDiagnostic,
		});
		if (attribution.type === "ambiguous") {
			markUnavailable(attribution.summaries, {
				code: "artifact-attribution-ambiguous",
				message: `Artifact diagnostic ${normalizeDiagnosticCode(diagnostic.code)} could not be attributed to one extension module: ${diagnostic.message}`,
				...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
			});
			continue;
		}
		const outwardDiagnostic = {
			code: normalizeDiagnosticCode(diagnostic.code),
			message: diagnostic.message,
			...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
		};
		if (isCollisionDiagnostic) {
			for (const summary of attribution.summaries) {
				setStatus(summary, "conflicted");
				appendDiagnostic(summary, outwardDiagnostic);
			}
			continue;
		}
		markUnavailable(attribution.summaries, outwardDiagnostic);
	}
}

type DiagnosticAttribution =
	| {
			type: "attributed";
			readonly summaries: readonly MutableArtifactProvisioningStatusSummary[];
	  }
	| {
			type: "ambiguous";
			readonly summaries: readonly MutableArtifactProvisioningStatusSummary[];
	  };

function summariesForDiagnostic(options: {
	diagnostic: PreparedDeclaredArtifactActivation["diagnostics"][number];
	summaries: readonly MutableArtifactProvisioningStatusSummary[];
	byModuleRoot: ReadonlyMap<string, readonly MutableArtifactProvisioningStatusSummary[]>;
	byPackageName: ReadonlyMap<string, readonly MutableArtifactProvisioningStatusSummary[]>;
	prepared: PreparedDeclaredArtifactActivation;
	allowMultiple: boolean;
}): DiagnosticAttribution {
	const { diagnostic } = options;
	const diagnosticPath = diagnostic.path;
	if (diagnosticPath !== undefined) {
		const matchingRoots = new Set(
			options.summaries.flatMap((summary) =>
				isPathAtOrInsideRoot(diagnosticPath, summary.moduleRoot) ? [summary.moduleRoot] : [],
			),
		);
		if (matchingRoots.size > 0) {
			return diagnosticAttribution(
				[...matchingRoots].flatMap((moduleRoot) => options.byModuleRoot.get(moduleRoot) ?? []),
				options.allowMultiple,
			);
		}
	}
	if (diagnostic.artifactId !== undefined) {
		const matchingRoots = new Set([
			...options.prepared.reconciliation.items.flatMap((item) =>
				item.type === "provision" && item.pair.desired.artifact.id === diagnostic.artifactId
					? [item.pair.desired.sourceRoot]
					: [],
			),
			...options.prepared.reconciliation.skippedDesired.flatMap((desired) =>
				desired.artifact.id === diagnostic.artifactId ? [desired.sourceRoot] : [],
			),
		]);
		if (matchingRoots.size > 0) {
			return diagnosticAttribution(
				[...matchingRoots].flatMap((moduleRoot) => options.byModuleRoot.get(moduleRoot) ?? []),
				options.allowMultiple,
			);
		}
	}
	if (diagnostic.packageName !== undefined) {
		const packageSummaries = options.byPackageName.get(diagnostic.packageName) ?? [];
		if (packageSummaries.length > 0) {
			return diagnosticAttribution(packageSummaries, options.allowMultiple);
		}
	}
	return diagnosticAttribution(options.summaries, options.allowMultiple);
}

function diagnosticAttribution(
	summaries: readonly MutableArtifactProvisioningStatusSummary[],
	allowMultiple: boolean,
): DiagnosticAttribution {
	return summaries.length <= 1 || allowMultiple
		? { type: "attributed", summaries }
		: { type: "ambiguous", summaries };
}

function addTransition(
	summaries: readonly MutableArtifactProvisioningStatusSummary[],
	action: PreparedDeclaredArtifactActivation["reconciliation"]["items"][number]["action"],
	artifactId: string,
	harness: string,
	conflictPath: string | undefined,
): void {
	if (action === "unchanged") {
		addKnownInstances(summaries, "provisioned", 1, 0);
		return;
	}
	if (action === "conflicted") {
		addKnownInstances(summaries, "conflicted", 1);
		for (const summary of summaries) {
			appendDiagnostic(summary, {
				code: "artifact-local-conflict",
				message: `Artifact ${artifactId} conflicts with local files for ${harness}.`,
				...(conflictPath === undefined ? {} : { path: conflictPath }),
			});
		}
		return;
	}
	addKnownInstances(summaries, "needs-reconcile", 1);
}

function addKnownInstances(
	summaries: readonly MutableArtifactProvisioningStatusSummary[],
	status: ArtifactProvisioningStatus,
	artifactCount: number,
	affectedArtifactCount: number = artifactCount,
): void {
	for (const summary of summaries) {
		summary.artifactCount += artifactCount;
		summary.affectedArtifactCount += affectedArtifactCount;
		setStatus(summary, status);
	}
}

function markAmbiguousAttribution(
	summaries: readonly MutableArtifactProvisioningStatusSummary[],
	packageName: string,
	path: string,
): void {
	markUnavailable(summaries, {
		code: "artifact-attribution-ambiguous",
		message: `Artifact facts for duplicate package name ${packageName} cannot be attributed to one extension module.`,
		path,
	});
}

function markUnavailable(
	summaries: readonly MutableArtifactProvisioningStatusSummary[],
	diagnostic: ArtifactProvisioningDiagnostic,
): void {
	for (const summary of summaries) {
		setStatus(summary, "unavailable");
		appendDiagnostic(summary, diagnostic);
	}
}

function appendDiagnostic(
	summary: MutableArtifactProvisioningStatusSummary,
	diagnostic: ArtifactProvisioningDiagnostic,
): void {
	summary.diagnostics = appendDiagnosticToCollection(summary.diagnostics, diagnostic);
}

function setStatus(
	summary: MutableArtifactProvisioningStatusSummary,
	status: ArtifactProvisioningStatus,
): void {
	if (STATUS_PRECEDENCE[status] > STATUS_PRECEDENCE[summary.artifactStatus]) {
		summary.artifactStatus = status;
	}
}

function groupBy<T>(values: readonly T[], key: (value: T) => string): ReadonlyMap<string, T[]> {
	const grouped = new Map<string, T[]>();
	for (const value of values) {
		const group = grouped.get(key(value)) ?? [];
		group.push(value);
		grouped.set(key(value), group);
	}
	return grouped;
}

function isPathAtOrInsideRoot(path: string, root: string): boolean {
	if (path === root) return true;
	if (!isAbsolute(path) || !isAbsolute(root)) return false;
	const relativePath = relative(root, path);
	return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function normalizeDiagnosticCode(code: string): string {
	return code.replaceAll("_", "-");
}

function preparationFailureDiagnostic(error: {
	readonly code: string;
	readonly message: string;
	readonly details: object;
}): ArtifactProvisioningDiagnostic {
	const path =
		"path" in error.details && typeof error.details.path === "string"
			? error.details.path
			: "manifestPath" in error.details && typeof error.details.manifestPath === "string"
				? error.details.manifestPath
				: undefined;
	return {
		code: normalizeDiagnosticCode(error.code),
		message: error.message,
		...(path === undefined ? {} : { path }),
	};
}

function finalizedSummaries(
	summaries: readonly MutableArtifactProvisioningStatusSummary[],
): readonly ArtifactProvisioningStatusSummary[] {
	return summaries.map((summary) => ({
		moduleRoot: summary.moduleRoot,
		artifactStatus: summary.artifactStatus,
		artifactCount: summary.artifactCount,
		affectedArtifactCount: summary.affectedArtifactCount,
		diagnostics: summary.diagnostics.map((diagnostic) => ({ ...diagnostic })),
	}));
}
