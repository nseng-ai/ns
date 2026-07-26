import { isAbsolute, relative } from "node:path";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import {
	prepareDeclaredArtifactActivation,
	type PreparedDeclaredArtifactActivation,
} from "../harness-artifacts/api.ts";

import type {
	ArtifactProvisioningDiagnostic,
	ArtifactProvisioningStatus,
	ArtifactProvisioningStatusGateway,
	ArtifactProvisioningStatusSummary,
	InspectArtifactProvisioningStatusParams,
} from "./artifact-provisioning-status.ts";
import { appendDiagnosticToCollection } from "./diagnostic-collection.ts";

const STATUS_PRECEDENCE: Readonly<Record<ArtifactProvisioningStatus, number>> = {
	none: 0,
	provisioned: 1,
	"needs-reconcile": 2,
	conflicted: 3,
	unavailable: 4,
};

class ArtifactProvisioningStatusAccumulator {
	readonly moduleRoot: string;
	readonly packageName: string;
	private artifactStatus: ArtifactProvisioningStatus = "none";
	private artifactCount = 0;
	private affectedArtifactCount = 0;
	private diagnostics: readonly ArtifactProvisioningDiagnostic[] = [];

	constructor(options: { readonly moduleRoot: string; readonly packageName: string }) {
		this.moduleRoot = options.moduleRoot;
		this.packageName = options.packageName;
	}

	addKnownInstances(options: {
		readonly status: ArtifactProvisioningStatus;
		readonly artifactCount: number;
		readonly affectedArtifactCount: number;
	}): void {
		this.artifactCount += options.artifactCount;
		this.affectedArtifactCount += options.affectedArtifactCount;
		this.setStatus(options.status);
	}

	addDiagnostic(diagnostic: ArtifactProvisioningDiagnostic): void {
		this.diagnostics = appendDiagnosticToCollection(this.diagnostics, diagnostic);
	}

	markUnavailable(diagnostic: ArtifactProvisioningDiagnostic): void {
		this.setStatus("unavailable");
		this.addDiagnostic(diagnostic);
	}

	setStatus(status: ArtifactProvisioningStatus): void {
		if (STATUS_PRECEDENCE[status] > STATUS_PRECEDENCE[this.artifactStatus]) {
			this.artifactStatus = status;
		}
	}

	finalize(): ArtifactProvisioningStatusSummary {
		return {
			moduleRoot: this.moduleRoot,
			artifactStatus: this.artifactStatus,
			artifactCount: this.artifactCount,
			affectedArtifactCount: this.affectedArtifactCount,
			diagnostics: this.diagnostics.map((diagnostic) => ({ ...diagnostic })),
		};
	}
}

export class RealArtifactProvisioningStatusGateway implements ArtifactProvisioningStatusGateway {
	async inspect(
		params: InspectArtifactProvisioningStatusParams,
	): Promise<readonly ArtifactProvisioningStatusSummary[]> {
		const summaries = params.descriptors.map(
			(descriptor) =>
				new ArtifactProvisioningStatusAccumulator({
					moduleRoot: descriptor.moduleRoot,
					packageName: descriptor.packageName,
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
	summaries: readonly ArtifactProvisioningStatusAccumulator[],
	prepared: PreparedDeclaredArtifactActivation,
): void {
	const byModuleRoot = groupBy(summaries, (summary) => summary.moduleRoot);
	const byPackageName = groupBy(summaries, (summary) => summary.packageName);

	for (const item of prepared.reconciliation.items) {
		if (item.type === "provision") {
			const conflictPath = item.conflictingFiles[0];
			addTransition({
				summaries: byModuleRoot.get(item.pair.desired.sourceRoot) ?? [],
				action: item.action,
				artifactId: item.pair.desired.artifact.id,
				harness: item.pair.harness,
				...(conflictPath === undefined ? {} : { conflictPath }),
			});
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
		const conflictPath = item.conflictingFiles[0];
		addTransition({
			summaries: packageSummaries,
			action: item.action,
			artifactId: item.removal.entry.artifactId,
			harness: item.removal.entry.harness,
			...(conflictPath === undefined ? {} : { conflictPath }),
		});
	}

	for (const desired of prepared.reconciliation.skippedDesired) {
		const targetSummaries = byModuleRoot.get(desired.sourceRoot) ?? [];
		addKnownInstances({
			summaries: targetSummaries,
			status: "conflicted",
			artifactCount: prepared.selectedHarnesses.length,
		});
		for (const collision of prepared.skippedCollisions) {
			const matches =
				collision.kind === "id"
					? collision.value === desired.artifact.id
					: collision.value === desired.artifact.skillName;
			if (!matches) continue;
			for (const summary of targetSummaries) {
				summary.addDiagnostic({
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
			canAttributeMultipleSummaries: isCollisionDiagnostic,
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
				summary.setStatus("conflicted");
				summary.addDiagnostic(outwardDiagnostic);
			}
			continue;
		}
		markUnavailable(attribution.summaries, outwardDiagnostic);
	}
}

type DiagnosticAttribution =
	| {
			type: "attributed";
			readonly summaries: readonly ArtifactProvisioningStatusAccumulator[];
	  }
	| {
			type: "ambiguous";
			readonly summaries: readonly ArtifactProvisioningStatusAccumulator[];
	  };

function summariesForDiagnostic(options: {
	diagnostic: PreparedDeclaredArtifactActivation["diagnostics"][number];
	summaries: readonly ArtifactProvisioningStatusAccumulator[];
	byModuleRoot: ReadonlyMap<string, readonly ArtifactProvisioningStatusAccumulator[]>;
	byPackageName: ReadonlyMap<string, readonly ArtifactProvisioningStatusAccumulator[]>;
	prepared: PreparedDeclaredArtifactActivation;
	canAttributeMultipleSummaries: boolean;
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
				options.canAttributeMultipleSummaries,
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
				options.canAttributeMultipleSummaries,
			);
		}
	}
	if (diagnostic.packageName !== undefined) {
		const packageSummaries = options.byPackageName.get(diagnostic.packageName) ?? [];
		if (packageSummaries.length > 0) {
			return diagnosticAttribution(packageSummaries, options.canAttributeMultipleSummaries);
		}
	}
	return diagnosticAttribution(options.summaries, options.canAttributeMultipleSummaries);
}

function diagnosticAttribution(
	summaries: readonly ArtifactProvisioningStatusAccumulator[],
	canAttributeMultipleSummaries: boolean,
): DiagnosticAttribution {
	return summaries.length <= 1 || canAttributeMultipleSummaries
		? { type: "attributed", summaries }
		: { type: "ambiguous", summaries };
}

function addTransition(options: {
	readonly summaries: readonly ArtifactProvisioningStatusAccumulator[];
	readonly action: PreparedDeclaredArtifactActivation["reconciliation"]["items"][number]["action"];
	readonly artifactId: string;
	readonly harness: string;
	readonly conflictPath?: string;
}): void {
	const { summaries, action, artifactId, harness, conflictPath } = options;
	if (action === "unchanged") {
		addKnownInstances({
			summaries,
			status: "provisioned",
			artifactCount: 1,
			affectedArtifactCount: 0,
		});
		return;
	}
	if (action === "conflicted") {
		addKnownInstances({ summaries, status: "conflicted", artifactCount: 1 });
		for (const summary of summaries) {
			summary.addDiagnostic({
				code: "artifact-local-conflict",
				message: `Artifact ${artifactId} conflicts with local files for ${harness}.`,
				...(conflictPath === undefined ? {} : { path: conflictPath }),
			});
		}
		return;
	}
	addKnownInstances({ summaries, status: "needs-reconcile", artifactCount: 1 });
}

function addKnownInstances(options: {
	readonly summaries: readonly ArtifactProvisioningStatusAccumulator[];
	readonly status: ArtifactProvisioningStatus;
	readonly artifactCount: number;
	readonly affectedArtifactCount?: number;
}): void {
	const affectedArtifactCount = options.affectedArtifactCount ?? options.artifactCount;
	for (const summary of options.summaries) {
		summary.addKnownInstances({
			status: options.status,
			artifactCount: options.artifactCount,
			affectedArtifactCount,
		});
	}
}

function markAmbiguousAttribution(
	summaries: readonly ArtifactProvisioningStatusAccumulator[],
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
	summaries: readonly ArtifactProvisioningStatusAccumulator[],
	diagnostic: ArtifactProvisioningDiagnostic,
): void {
	for (const summary of summaries) {
		summary.markUnavailable(diagnostic);
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
	summaries: readonly ArtifactProvisioningStatusAccumulator[],
): readonly ArtifactProvisioningStatusSummary[] {
	return summaries.map((summary) => summary.finalize());
}
