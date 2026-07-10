import { resultOk, type Result } from "@nseng-ai/foundation/result";

import type { SkillHarnessArtifactEntry } from "./artifact-catalog.ts";
import type {
	HarnessArtifactFileSystemGateway,
	HarnessArtifactModuleDiscoveryGateway,
} from "./filesystem.ts";
import type { HarnessId, HarnessPathContext } from "./harness-paths.ts";
import {
	discoverDeclaredExtensionModuleHarnessArtifacts,
	type DeclaredExtensionModuleArtifactFacts,
	type ModuleArtifactDiscoveryDiagnostic,
} from "./module-artifact-discovery.ts";
import {
	classifyProvisionAction,
	conflictingFilesFromDecisions,
	createPreparedProvisionBatchApplier,
	nodeHarnessArtifactFileSystemGateway,
	prepareProvision,
	type HarnessArtifactProvisionErrorInfo,
	type PreparedHarnessArtifactProvision,
} from "./provision-apply.ts";
import { installManifestKey, provisionIdentityKey } from "./provision-plan.ts";
import {
	planHarnessArtifactReconcile,
	type DesiredHarnessArtifact,
	type SkippedArtifactCollision,
} from "./reconcile.ts";

export const DECLARED_ARTIFACT_ACTIVATION_ACTIONS = [
	"installed",
	"refreshed",
	"unchanged",
	"conflicted",
] as const;

export type DeclaredArtifactActivationAction =
	(typeof DECLARED_ARTIFACT_ACTIVATION_ACTIONS)[number];

export interface PreparedDeclaredArtifactActivationItem {
	readonly key: string;
	readonly artifact: SkillHarnessArtifactEntry;
	readonly harness: HarnessId;
	readonly action: DeclaredArtifactActivationAction;
	readonly provision: PreparedHarnessArtifactProvision;
}

export interface PreparedDeclaredArtifactActivation {
	readonly modules: readonly DeclaredExtensionModuleArtifactFacts[];
	readonly selectedHarnesses: readonly HarnessId[];
	readonly diagnostics: readonly ModuleArtifactDiscoveryDiagnostic[];
	readonly skippedCollisions: readonly SkippedArtifactCollision[];
	readonly artifacts: readonly PreparedDeclaredArtifactActivationItem[];
}

export interface PrepareDeclaredArtifactActivationRequest {
	readonly projectRoot: string;
	readonly modules: readonly DeclaredExtensionModuleArtifactFacts[];
	readonly selectedHarnesses: readonly HarnessId[];
	readonly fs?: HarnessArtifactFileSystemGateway;
	readonly discoveryGateway?: HarnessArtifactModuleDiscoveryGateway;
}

export interface DeclaredArtifactActivationOutcome {
	readonly key: string;
	readonly action: DeclaredArtifactActivationAction;
	readonly artifactId: string;
	readonly skillName: string;
	readonly harness: HarnessId;
	readonly targetArtifactPath: string;
	readonly manifestPath: string;
	readonly writtenFiles: readonly string[];
	readonly conflictingFiles: readonly string[];
}

export type ApplyPreparedDeclaredArtifactActivationResult =
	| { readonly ok: true; readonly completed: readonly DeclaredArtifactActivationOutcome[] }
	| {
			readonly ok: false;
			readonly error: HarnessArtifactProvisionErrorInfo;
			readonly completed: readonly DeclaredArtifactActivationOutcome[];
	  };

/** Prepare only the supplied declared descriptors for project-scope activation. */
export async function prepareDeclaredArtifactActivation(
	request: PrepareDeclaredArtifactActivationRequest,
): Promise<Result<PreparedDeclaredArtifactActivation, HarnessArtifactProvisionErrorInfo>> {
	const fs = request.fs ?? nodeHarnessArtifactFileSystemGateway;
	const discovery = await discoverDeclaredExtensionModuleHarnessArtifacts({
		modules: request.modules,
		gateway: request.discoveryGateway ?? nodeHarnessArtifactFileSystemGateway,
	});
	const desired = discovery.catalogs.flatMap((catalog) =>
		catalog.artifacts.map(
			(artifact): DesiredHarnessArtifact => ({
				artifact,
				sourceRoot: catalog.moduleRoot,
				sourceVersion: catalog.version,
			}),
		),
	);
	const selectedHarnesses = [...new Set(request.selectedHarnesses)].sort((left, right) =>
		left.localeCompare(right),
	);
	const reconcilePlan = planHarnessArtifactReconcile({
		desired,
		harnessSelection: selectedHarnesses,
		manifests: [],
	});
	const context: HarnessPathContext = { projectRoot: request.projectRoot };
	const artifacts: PreparedDeclaredArtifactActivationItem[] = [];
	for (const pair of reconcilePlan.pairs) {
		const provision = await prepareProvision({
			artifact: pair.desired.artifact,
			harness: pair.harness,
			scope: "project",
			context,
			sourceRoot: pair.desired.sourceRoot,
			sourceVersion: pair.desired.sourceVersion,
			fs,
		});
		if (!provision.ok) return provision;
		const isAlreadyInstalled = hasManifestEntry(provision.value);
		const conflictingFiles = conflictingFilesFromDecisions(provision.value.decisions);
		artifacts.push({
			key: provisionIdentityKey(provision.value.plan),
			artifact: pair.desired.artifact,
			harness: pair.harness,
			action: classifyProvisionAction({
				conflictingFiles,
				decisionsAreUnchanged: provision.value.decisions.files.every(
					(decision) => decision.type === "unchanged",
				),
				hasManifestEntry: isAlreadyInstalled,
			}),
			provision: provision.value,
		});
	}
	return resultOk({
		modules: [...request.modules].sort((left, right) =>
			left.moduleRoot.localeCompare(right.moduleRoot),
		),
		selectedHarnesses,
		diagnostics: discovery.diagnostics,
		skippedCollisions: reconcilePlan.skippedCollisions,
		artifacts,
	});
}

/** Apply a prepared activation in identity-key order without reconciling absent manifest entries. */
export async function applyPreparedDeclaredArtifactActivation(
	prepared: PreparedDeclaredArtifactActivation,
): Promise<ApplyPreparedDeclaredArtifactActivationResult> {
	const completed: DeclaredArtifactActivationOutcome[] = [];
	const applier = createPreparedProvisionBatchApplier({ shouldForce: false });
	for (const item of prepared.artifacts) {
		if (item.action === "unchanged") {
			completed.push(outcome(item, "unchanged", [], []));
			continue;
		}
		const applied = await applier.apply(item.provision);
		if (!applied.ok) return { ok: false, error: applied.error, completed };
		if (applied.value.outcome === "conflicted") {
			completed.push(outcome(item, "conflicted", [], applied.value.conflictingFiles));
			continue;
		}
		completed.push(outcome(item, item.action, applied.value.writtenFiles, []));
	}
	return { ok: true, completed };
}

function hasManifestEntry(provision: PreparedHarnessArtifactProvision): boolean {
	return provision.manifest.artifacts[installManifestKey(provision.plan)] !== undefined;
}

function outcome(
	item: PreparedDeclaredArtifactActivationItem,
	action: DeclaredArtifactActivationAction,
	writtenFiles: readonly string[],
	conflictingFiles: readonly string[],
): DeclaredArtifactActivationOutcome {
	return {
		key: item.key,
		action,
		artifactId: item.artifact.id,
		skillName: item.artifact.skillName,
		harness: item.harness,
		targetArtifactPath: item.provision.plan.targetArtifactPath,
		manifestPath: item.provision.manifestPath,
		writtenFiles: [...writtenFiles],
		conflictingFiles: [...conflictingFiles],
	};
}
