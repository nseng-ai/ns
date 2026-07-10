import { isAbsolute, join, resolve } from "node:path";

import {
	extensionAcquisitionDiagnosticSchema,
	parseExtensionSourceSpec,
	resolveDeclaredExtensionModules,
	type ExtensionAcquisitionGateway,
} from "@nseng-ai/kernel/extensions/acquisition";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import {
	declaredExtensionDescriptorDiagnosticSchema,
	loadDeclaredExtensionDescriptors,
	type DeclaredExtensionDescriptorGateway,
} from "@nseng-ai/kernel/extensions/declared-descriptors";
import { z } from "zod";

import { type SkillHarnessArtifactEntry } from "./artifact-catalog.ts";
import {
	listFirstPartySkillArtifacts,
	NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG,
} from "./first-party-catalog.ts";
import {
	FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE,
	FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION,
	firstPartySkillProvisionPathContext,
	resolveFirstPartyCatalogSourceRoot,
} from "./first-party-skill-provisioning.ts";
import {
	harnessArtifactSourceTypeSchema,
	harnessIdSchema,
	harnessScopeSchema,
} from "./harness-artifact-schemas.ts";
import {
	ALL_HARNESS_IDS,
	resolveHarnessSkillRoot,
	type HarnessId,
	type HarnessPathErrorInfo,
	type HarnessScope,
} from "./harness-paths.ts";
import {
	discoverDeclaredExtensionModuleHarnessArtifacts,
	moduleArtifactDiscoveryDiagnosticSchema,
	type HarnessArtifactModuleDiscoveryGateway,
} from "./module-artifact-discovery.ts";
import { parseNsTomlExtensions, parseNsTomlHarnesses, type NsTomlErrorInfo } from "./ns-toml.ts";
import {
	classifyProvisionAction,
	nodeHarnessArtifactFileSystemGateway,
	type HarnessArtifactFileSystemErrorInfo,
	type HarnessArtifactFileSystemGateway,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessArtifactProvisionPreview,
} from "./provision-apply.ts";
import {
	INSTALL_MANIFEST_FILE_NAME,
	readInstallManifestAtRoot,
	type InstallManifestData,
	type InstallManifestEntryData,
} from "./provision-manifest.ts";
import {
	appliedHarnessArtifactTransitionFileEffects,
	applyProjectHarnessArtifactTransitions,
	prepareProjectHarnessArtifactTransitions,
	type AppliedHarnessArtifactTransition,
} from "./project-harness-artifact-transitions.ts";
import { provisionIdentityKey } from "./provision-plan.ts";
import { sortStrings } from "./sort.ts";

export interface DesiredHarnessArtifact {
	artifact: SkillHarnessArtifactEntry;
	sourceRoot: string;
	sourceVersion: string;
}

export interface HarnessManifestSnapshot {
	harness: HarnessId;
	targetRoot: string;
	manifestPath: string;
	manifest: InstallManifestData;
}

export interface ReconcilePair {
	key: string;
	desired: DesiredHarnessArtifact;
	harness: HarnessId;
	scope: HarnessScope;
	origin: "declared" | "manifest";
	hasManifestEntry: boolean;
}

export type ReconcileDeletionAuthority =
	| { readonly type: "full"; readonly preserveRemovedSources: boolean }
	| { readonly type: "targeted"; readonly packageNames: readonly string[] };

export interface PlannedHarnessArtifactRemoval {
	readonly key: string;
	readonly snapshot: HarnessManifestSnapshot;
	readonly entry: InstallManifestEntryData;
	readonly reason: "removed-source" | "deselected-harness" | "same-target-replacement";
}

export const orphanedManifestEntrySchema = z.object({
	artifactId: z.string(),
	harness: harnessIdSchema,
	scope: harnessScopeSchema,
	targetRoot: z.string(),
	packageName: z.string(),
	sourceType: harnessArtifactSourceTypeSchema,
});
export type OrphanedManifestEntry = z.output<typeof orphanedManifestEntrySchema>;

export const skippedArtifactCollisionSchema = z.object({
	kind: z.enum(["id", "target-name"]),
	value: z.string(),
	packages: z.array(z.string()).readonly(),
});
export type SkippedArtifactCollision = z.output<typeof skippedArtifactCollisionSchema>;

export function planHarnessArtifactReconcile(input: {
	desired: readonly DesiredHarnessArtifact[];
	harnessSelection: readonly HarnessId[] | undefined;
	manifests: readonly HarnessManifestSnapshot[];
	deletionAuthority?: ReconcileDeletionAuthority;
}): {
	pairs: readonly ReconcilePair[];
	removals: readonly PlannedHarnessArtifactRemoval[];
	orphans: readonly OrphanedManifestEntry[];
	skippedDesired: readonly DesiredHarnessArtifact[];
	skippedCollisions: readonly SkippedArtifactCollision[];
} {
	const collisionPlan = planDesiredCollisionSkips(input.desired);

	const skippedDesiredIdentities = new Set(
		collisionPlan.skippedDesired.map((desired) => desiredManifestIdentityKey(desired)),
	);
	const desiredByManifestIdentity = new Map<string, DesiredHarnessArtifact>();
	for (const desired of input.desired) {
		desiredByManifestIdentity.set(desiredManifestIdentityKey(desired), desired);
	}

	const pairsByKey = new Map<string, ReconcilePair>();
	if (input.harnessSelection !== undefined) {
		for (const desired of collisionPlan.provisionableDesired) {
			for (const harness of input.harnessSelection) {
				const key = reconcilePairKey({
					harness,
					scope: "project",
					artifactId: desired.artifact.id,
				});
				pairsByKey.set(key, {
					key,
					desired,
					harness,
					scope: "project",
					origin: "declared",
					hasManifestEntry: manifestHasEntry(input.manifests, key),
				});
			}
		}
	}

	const orphans: OrphanedManifestEntry[] = [];
	const removals: PlannedHarnessArtifactRemoval[] = [];
	for (const snapshot of input.manifests) {
		for (const [manifestKey, entry] of Object.entries(snapshot.manifest.artifacts)) {
			const desired = desiredByManifestIdentity.get(manifestEntryDesiredIdentityKey(entry));
			const selectedHarness = input.harnessSelection?.includes(entry.harness) ?? false;
			const replacement = collisionPlan.provisionableDesired.find(
				(item) =>
					item.artifact.skillName === entry.provisionName &&
					manifestEntryDesiredIdentityKey(entry) !== desiredManifestIdentityKey(item),
			);
			const removalReason =
				replacement !== undefined && selectedHarness
					? "same-target-replacement"
					: desired !== undefined && !selectedHarness && input.harnessSelection !== undefined
						? "deselected-harness"
						: desired === undefined && hasRemovalAuthority(input.deletionAuthority, entry)
							? "removed-source"
							: undefined;
			if (removalReason !== undefined) {
				removals.push({ key: manifestKey, snapshot, entry, reason: removalReason });
				continue;
			}
			if (desired === undefined) {
				orphans.push({
					artifactId: entry.artifactId,
					harness: entry.harness,
					scope: entry.scope,
					targetRoot: entry.targetRoot,
					packageName: entry.source.packageName,
					sourceType: entry.source.type,
				});
				continue;
			}
			if (skippedDesiredIdentities.has(manifestEntryDesiredIdentityKey(entry))) continue;
			const key = reconcilePairKey({
				harness: entry.harness,
				scope: entry.scope,
				artifactId: entry.artifactId,
			});
			if (pairsByKey.has(key)) continue;
			pairsByKey.set(key, {
				key,
				desired,
				harness: entry.harness,
				scope: entry.scope,
				origin: "manifest",
				hasManifestEntry: true,
			});
		}
	}

	return {
		pairs: [...pairsByKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
		removals: removals.sort((left, right) => left.key.localeCompare(right.key)),
		orphans: orphans.sort((left, right) =>
			`${left.harness}\0${left.artifactId}`.localeCompare(`${right.harness}\0${right.artifactId}`),
		),
		skippedDesired: collisionPlan.skippedDesired,
		skippedCollisions: collisionPlan.skippedCollisions,
	};
}

export interface RunHarnessArtifactReconcileRequest {
	projectRoot: string;
	homeDir?: string;
	env: Record<string, string | undefined>;
	mode: "preview" | "check-force" | "apply";
	shouldForce: boolean;
	extensionTarget?: string;
	fs?: HarnessArtifactFileSystemGateway;
	discoveryGateway?: HarnessArtifactModuleDiscoveryGateway;
	descriptorGateway?: DeclaredExtensionDescriptorGateway;
	acquisitionGateway?: ExtensionAcquisitionGateway;
	firstPartySourceRoot?: string;
}

export const harnessSelectionStateSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("ns-toml"), harnesses: z.array(harnessIdSchema).readonly() }),
	z.object({ type: z.literal("missing") }),
]);
export type HarnessSelectionState = z.output<typeof harnessSelectionStateSchema>;

export const reconcileArtifactOutcomeSchema = z.object({
	action: z.enum(["installed", "refreshed", "unchanged", "conflicted", "skipped", "removed"]),
	artifactId: z.string(),
	skillName: z.string(),
	harness: harnessIdSchema,
	scope: harnessScopeSchema,
	origin: z.enum(["declared", "manifest"]),
	sourceType: harnessArtifactSourceTypeSchema,
	packageName: z.string(),
	targetArtifactPath: z.string(),
	manifestPath: z.string(),
	writtenFiles: z.array(z.string()).readonly(),
	removedFiles: z.array(z.string()).readonly(),
	conflictingFiles: z.array(z.string()).readonly(),
	removalReason: z
		.enum(["removed-source", "deselected-harness", "same-target-replacement", "obsolete-file"])
		.optional(),
});
export type ReconcileArtifactOutcome = z.output<typeof reconcileArtifactOutcomeSchema>;

export const reconcileDiagnosticSchema = z.union([
	moduleArtifactDiscoveryDiagnosticSchema,
	extensionAcquisitionDiagnosticSchema,
	declaredExtensionDescriptorDiagnosticSchema,
]);
export type ReconcileDiagnostic = z.output<typeof reconcileDiagnosticSchema>;

export const reconcileReportSchema = z.object({
	mode: z.enum(["dry-run", "applied"]),
	harnessSelection: harnessSelectionStateSchema,
	artifacts: z.array(reconcileArtifactOutcomeSchema).readonly(),
	orphans: z.array(orphanedManifestEntrySchema).readonly(),
	diagnostics: z.array(reconcileDiagnosticSchema).readonly(),
	skippedCollisions: z.array(skippedArtifactCollisionSchema).readonly(),
	isForceRequired: z.boolean(),
});
export type ReconcileReport = z.output<typeof reconcileReportSchema>;

export type ReconcileErrorInfo =
	| HarnessArtifactProvisionErrorInfo
	| HarnessArtifactFileSystemErrorInfo
	| HarnessPathErrorInfo
	| { code: "invalid_ns_toml"; message: string; details: { path: string; error: NsTomlErrorInfo } }
	| {
			code: "invalid_extension_target";
			message: string;
			details: { target: string; normalizedTarget: string; declaredExtensions: readonly string[] };
	  }
	| {
			code: "first_party_source_root_unavailable";
			message: string;
			details: { catalogId: string };
	  };

type PreparedReconcileArtifactItem =
	| { readonly type: "static"; readonly outcome: ReconcileArtifactOutcome }
	| {
			readonly type: "transition";
			readonly key: string;
			readonly outcome: ReconcileArtifactOutcome;
	  };

export async function runHarnessArtifactReconcile(
	request: RunHarnessArtifactReconcileRequest,
): Promise<Result<ReconcileReport, ReconcileErrorInfo>> {
	const fs = request.fs ?? nodeHarnessArtifactFileSystemGateway;
	const discoveryGateway = request.discoveryGateway ?? nodeHarnessArtifactFileSystemGateway;
	const nsTomlPath = join(request.projectRoot, "ns.toml");
	const nsToml = await fs.readOptionalTextFile(nsTomlPath);
	if (!nsToml.ok) return nsToml;
	const selection = parseHarnessSelection(nsToml.value, nsTomlPath);
	if (!selection.ok) return selection;
	const extensionSelection = parseExtensionSelection({
		state: nsToml.value,
		nsTomlPath,
		projectRoot: request.projectRoot,
		...optionalEntry("target", request.extensionTarget),
	});
	if (!extensionSelection.ok) return extensionSelection;
	const shouldApply = request.mode === "apply";
	// check-force runs real acquisition so the force-conflict check reflects
	// post-install artifacts for newly declared npm extensions; only artifact
	// writes stay dry in that mode.
	const shouldAcquire = request.mode !== "preview";
	const acquisition = await resolveDeclaredExtensionModules({
		projectRoot: request.projectRoot,
		declaredSpecs: extensionSelection.value.declaredSpecs,
		selectedSpecs: extensionSelection.value.selectedSpecs,
		mode: shouldAcquire ? "apply" : "preview",
		...optionalEntry("gateway", request.acquisitionGateway),
	});
	const loadedDescriptors = await loadDeclaredExtensionDescriptors({
		repoRoot: request.projectRoot,
		specs: acquisition.roots.map((root) => root.spec),
		...optionalEntry("gateway", request.descriptorGateway),
	});
	const moduleDiscovery = await discoverDeclaredExtensionModuleHarnessArtifacts({
		modules: loadedDescriptors.descriptors,
		gateway: discoveryGateway,
	});

	const desired = desiredHarnessArtifacts({
		moduleCatalogs: moduleDiscovery.catalogs,
		firstPartySourceRoot: request.firstPartySourceRoot,
		shouldIncludeFirstPartyArtifacts: !extensionSelection.value.isTargeted,
	});
	if (!desired.ok) return desired;

	const context = firstPartySkillProvisionPathContext({
		projectRoot: request.projectRoot,
		...optionalEntry("homeDir", request.homeDir),
		env: request.env,
	});
	const skillRoots = resolveProjectSkillRoots(context);
	if (!skillRoots.ok) return skillRoots;
	const manifests = await readProjectManifestSnapshots({ skillRoots: skillRoots.value, fs });
	if (!manifests.ok) return manifests;

	const projectTransitions = await prepareProjectHarnessArtifactTransitions({
		desired: desired.value,
		selectedHarnesses: selection.value.harnessSelection,
		manifests: manifests.value,
		pathContext: context,
		trustedRepoRoot: request.projectRoot,
		...(selection.value.harnessSelection === undefined
			? {}
			: {
					deletionAuthority: extensionSelection.value.isTargeted
						? {
								type: "targeted" as const,
								packageNames: loadedDescriptors.descriptors.map(
									(descriptor) => descriptor.packageName,
								),
							}
						: {
								type: "full" as const,
								preserveRemovedSources:
									acquisition.diagnostics.length > 0 || loadedDescriptors.diagnostics.length > 0,
							},
				}),
		conflictPolicy: { type: "force-capable", shouldForce: request.shouldForce },
		fs,
	});
	if (!projectTransitions.ok) return projectTransitions;
	const preparedItems: PreparedReconcileArtifactItem[] = [];
	for (const item of projectTransitions.value.items) {
		if (item.type !== "remove") continue;
		const outcome = removalOutcome(
			item.planned,
			[],
			item.conflictingFiles,
			item.conflictingFiles.length > 0 ? "conflicted" : "removed",
		);
		preparedItems.push(
			shouldApply && item.conflictingFiles.length === 0
				? { type: "transition", key: item.key, outcome }
				: { type: "static", outcome },
		);
	}
	for (const skipped of projectTransitions.value.skippedDesired) {
		preparedItems.push(
			...skippedCollisionOutcomes({
				desired: skipped,
				skillRoots: skillRoots.value,
				harnesses: selection.value.harnessSelection,
			}).map((outcome) => ({ type: "static" as const, outcome })),
		);
	}
	for (const item of projectTransitions.value.items) {
		if (item.type !== "provision") continue;
		const outcome = reconcileOutcomeFromProvision({
			pair: item.pair,
			provision: item.provision,
			writtenFiles: [],
			conflictingFiles: item.conflictingFiles,
		});
		preparedItems.push(
			shouldApply && item.action !== "unchanged"
				? { type: "transition", key: item.key, outcome }
				: { type: "static", outcome },
		);
	}
	const preparedArtifacts = preparedItems.map((item) => item.outcome);
	const isForceRequired = preparedArtifacts.some((artifact) => artifact.action === "conflicted");
	let artifacts: readonly ReconcileArtifactOutcome[] = preparedArtifacts;
	if (
		shouldApply &&
		!preparedArtifacts.some(
			(artifact) => artifact.action === "conflicted" && artifact.removalReason !== undefined,
		)
	) {
		const applied = await applyProjectHarnessArtifactTransitions(projectTransitions.value);
		if (!applied.ok) return applied;
		artifacts = completedReconcileOutcomes(preparedItems, applied.value.outcomes);
	}
	return resultOk({
		mode: shouldApply ? "applied" : "dry-run",
		harnessSelection: selection.value.state,
		artifacts,
		orphans: projectTransitions.value.orphans,
		diagnostics: [
			...acquisition.diagnostics,
			...loadedDescriptors.diagnostics,
			...moduleDiscovery.diagnostics,
		],
		skippedCollisions: projectTransitions.value.skippedCollisions,
		isForceRequired: isForceRequired && !request.shouldForce,
	});
}

function completedReconcileOutcomes(
	items: readonly PreparedReconcileArtifactItem[],
	outcomes: ReadonlyMap<string, AppliedHarnessArtifactTransition>,
): readonly ReconcileArtifactOutcome[] {
	return items.map((item) => {
		if (item.type === "static") return item.outcome;
		const applied = outcomes.get(item.key);
		if (applied === undefined) {
			throw new Error(`Applied harness artifact outcome is missing for ${item.key}.`);
		}
		const effects = appliedHarnessArtifactTransitionFileEffects(applied);
		if (applied.type === "remove") {
			return { ...item.outcome, removedFiles: [...effects.removedFiles] };
		}
		if (applied.outcome.outcome === "conflicted") {
			return {
				...item.outcome,
				conflictingFiles: [...effects.conflictingFiles],
			};
		}
		return {
			...item.outcome,
			action: item.outcome.action === "conflicted" ? "refreshed" : item.outcome.action,
			writtenFiles: [...effects.writtenFiles],
			removedFiles: [...effects.removedFiles],
			conflictingFiles: [...effects.conflictingFiles],
			...(effects.removedFiles.length === 0 ? {} : { removalReason: "obsolete-file" as const }),
		};
	});
}

function planDesiredCollisionSkips(desired: readonly DesiredHarnessArtifact[]): {
	provisionableDesired: readonly DesiredHarnessArtifact[];
	skippedDesired: readonly DesiredHarnessArtifact[];
	skippedCollisions: readonly SkippedArtifactCollision[];
} {
	const idCollisions = collisionsForKey(desired, (item) => item.artifact.id, "id");
	const targetNameCollisions = collisionsForKey(
		desired,
		(item) => item.artifact.skillName,
		"target-name",
	);
	const skipped = new Set([...idCollisions.skipped, ...targetNameCollisions.skipped]);
	const collisions = [...idCollisions.collisions, ...targetNameCollisions.collisions].sort(
		(left, right) => `${left.kind}\0${left.value}`.localeCompare(`${right.kind}\0${right.value}`),
	);
	return {
		provisionableDesired: desired.filter((item) => !skipped.has(item)),
		skippedDesired: desired.filter((item) => skipped.has(item)),
		skippedCollisions: collisions,
	};
}

function collisionsForKey(
	desired: readonly DesiredHarnessArtifact[],
	keyForItem: (item: DesiredHarnessArtifact) => string,
	kind: SkippedArtifactCollision["kind"],
): {
	collisions: readonly SkippedArtifactCollision[];
	skipped: readonly DesiredHarnessArtifact[];
} {
	const itemsByKey = new Map<string, DesiredHarnessArtifact[]>();
	for (const item of desired) {
		const key = keyForItem(item);
		const items = itemsByKey.get(key) ?? [];
		items.push(item);
		itemsByKey.set(key, items);
	}
	const collisions: SkippedArtifactCollision[] = [];
	const skipped: DesiredHarnessArtifact[] = [];
	for (const [value, items] of itemsByKey) {
		if (items.length < 2) continue;
		skipped.push(...items);
		collisions.push({
			kind,
			value,
			packages: sortStrings([...new Set(items.map((item) => item.artifact.source.packageName))]),
		});
	}
	return { collisions, skipped };
}

function desiredManifestIdentityKey(desired: DesiredHarnessArtifact): string {
	return [
		desired.artifact.id,
		desired.artifact.source.type,
		desired.artifact.source.packageName,
	].join("\0");
}

function manifestEntryDesiredIdentityKey(entry: InstallManifestEntryData): string {
	return [entry.artifactId, entry.source.type, entry.source.packageName].join("\0");
}

function reconcilePairKey(input: {
	harness: HarnessId;
	scope: HarnessScope;
	artifactId: string;
}): string {
	return provisionIdentityKey({ ...input, kind: "skill" });
}

function hasRemovalAuthority(
	authority: ReconcileDeletionAuthority | undefined,
	entry: InstallManifestEntryData,
): boolean {
	if (authority === undefined) return false;
	if (authority.type === "full") return !authority.preserveRemovedSources;
	return authority.packageNames.includes(entry.source.packageName);
}

function manifestHasEntry(manifests: readonly HarnessManifestSnapshot[], key: string): boolean {
	return manifests.some((snapshot) => snapshot.manifest.artifacts[key] !== undefined);
}

function desiredHarnessArtifacts(input: {
	moduleCatalogs: readonly {
		moduleRoot: string;
		version: string;
		artifacts: readonly SkillHarnessArtifactEntry[];
	}[];
	firstPartySourceRoot: string | undefined;
	shouldIncludeFirstPartyArtifacts: boolean;
}): Result<readonly DesiredHarnessArtifact[], ReconcileErrorInfo> {
	const firstPartyArtifacts = firstPartyDesiredArtifacts(input);
	if (!firstPartyArtifacts.ok) return firstPartyArtifacts;
	return resultOk([
		...firstPartyArtifacts.value,
		...input.moduleCatalogs.flatMap((catalog) =>
			catalog.artifacts.map((artifact) => ({
				artifact,
				sourceRoot: catalog.moduleRoot,
				sourceVersion: catalog.version,
			})),
		),
	]);
}

function firstPartyDesiredArtifacts(input: {
	firstPartySourceRoot: string | undefined;
	shouldIncludeFirstPartyArtifacts: boolean;
}): Result<readonly DesiredHarnessArtifact[], ReconcileErrorInfo> {
	if (!input.shouldIncludeFirstPartyArtifacts) return resultOk([]);
	const firstPartySourceRoot = input.firstPartySourceRoot ?? resolveFirstPartyCatalogSourceRoot();
	if (firstPartySourceRoot === undefined) {
		return resultErr({
			code: "first_party_source_root_unavailable",
			message: FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE,
			details: { catalogId: NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG.catalogId },
		});
	}
	return resultOk(
		listFirstPartySkillArtifacts().map((artifact) => ({
			artifact,
			sourceRoot: firstPartySourceRoot,
			sourceVersion: FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION,
		})),
	);
}

function parseHarnessSelection(
	state: { type: "missing" } | { type: "file"; text: string },
	nsTomlPath: string,
): Result<
	{ state: HarnessSelectionState; harnessSelection: readonly HarnessId[] | undefined },
	ReconcileErrorInfo
> {
	if (state.type === "missing") {
		return resultOk({ state: { type: "missing" }, harnessSelection: undefined });
	}
	const parsed = parseNsTomlHarnesses(state.text, nsTomlPath);
	if (parsed.type === "error") return invalidNsTomlResult(parsed.error, nsTomlPath);
	if (parsed.type === "missing") {
		return resultOk({ state: { type: "missing" }, harnessSelection: undefined });
	}
	return resultOk({
		state: { type: "ns-toml", harnesses: [...parsed.harnesses] },
		harnessSelection: parsed.harnesses,
	});
}

interface ResolvedProjectSkillRoot {
	rootPath: string;
	manifestPath: string;
}

function resolveProjectSkillRoots(
	context: ReturnType<typeof firstPartySkillProvisionPathContext>,
): Result<ReadonlyMap<HarnessId, ResolvedProjectSkillRoot>, ReconcileErrorInfo> {
	const roots = new Map<HarnessId, ResolvedProjectSkillRoot>();
	for (const harness of ALL_HARNESS_IDS) {
		const root = resolveHarnessSkillRoot({ harness, scope: "project", context });
		if (!root.ok) return root;
		roots.set(harness, {
			rootPath: root.value.rootPath,
			manifestPath: join(root.value.rootPath, INSTALL_MANIFEST_FILE_NAME),
		});
	}
	return resultOk(roots);
}

function parseExtensionSelection(input: {
	state: { type: "missing" } | { type: "file"; text: string };
	nsTomlPath: string;
	projectRoot: string;
	target?: string;
}): Result<
	{
		declaredSpecs: readonly string[];
		selectedSpecs: readonly string[];
		isTargeted: boolean;
	},
	ReconcileErrorInfo
> {
	if (input.state.type === "missing") {
		if (input.target === undefined)
			return resultOk({ declaredSpecs: [], selectedSpecs: [], isTargeted: false });
		return invalidTargetResult({
			target: input.target,
			projectRoot: input.projectRoot,
			declaredExtensions: [],
		});
	}
	const parsed = parseNsTomlExtensions(input.state.text, input.nsTomlPath);
	if (parsed.type === "error") return invalidNsTomlResult(parsed.error, input.nsTomlPath);
	const declared = parsed.type === "ok" ? parsed.extensions : [];
	const target = input.target;
	if (target === undefined) {
		return resultOk({
			declaredSpecs: declared,
			selectedSpecs: declared,
			isTargeted: false,
		});
	}
	const isTargetLocal = isLocalExtensionSpec(input.projectRoot, target);
	const normalizedTarget = normalizeExtensionPath(input.projectRoot, target);
	const selectedSpec = isTargetLocal
		? declared.find(
				(spec) =>
					isLocalExtensionSpec(input.projectRoot, spec) &&
					normalizeExtensionPath(input.projectRoot, spec) === normalizedTarget,
			)
		: declared.find((spec) => spec === target);
	if (selectedSpec === undefined) {
		return invalidTargetResult({
			target,
			projectRoot: input.projectRoot,
			declaredExtensions: declared,
		});
	}
	return resultOk({
		declaredSpecs: declared,
		selectedSpecs: [selectedSpec],
		isTargeted: true,
	});
}

function invalidTargetResult(input: {
	target: string;
	projectRoot: string;
	declaredExtensions: readonly string[];
}): Result<never, ReconcileErrorInfo> {
	const normalizedTarget = normalizeExtensionPath(input.projectRoot, input.target);
	return resultErr({
		code: "invalid_extension_target",
		message: `Extension target is not declared in ns.toml: ${input.target}. Add it to top-level extensions = [...] before running ns update --extensions ${input.target}.`,
		details: {
			target: input.target,
			normalizedTarget,
			declaredExtensions: [...input.declaredExtensions],
		},
	});
}

function invalidNsTomlResult(
	error: NsTomlErrorInfo,
	nsTomlPath: string,
): Result<never, ReconcileErrorInfo> {
	return resultErr({
		code: "invalid_ns_toml",
		message: error.message,
		details: { path: nsTomlPath, error },
	});
}

function isLocalExtensionSpec(projectRoot: string, value: string): boolean {
	const parsed = parseExtensionSourceSpec(projectRoot, value);
	return parsed.ok && parsed.value.kind === "local";
}

function normalizeExtensionPath(projectRoot: string, value: string): string {
	return resolve(isAbsolute(value) ? value : join(projectRoot, value));
}

async function readProjectManifestSnapshots(input: {
	skillRoots: ReadonlyMap<HarnessId, ResolvedProjectSkillRoot>;
	fs: HarnessArtifactFileSystemGateway;
}): Promise<Result<readonly HarnessManifestSnapshot[], ReconcileErrorInfo>> {
	const snapshots: HarnessManifestSnapshot[] = [];
	for (const [harness, root] of input.skillRoots) {
		const manifest = await readInstallManifestAtRoot({
			targetRoot: root.rootPath,
			fs: input.fs,
		});
		if (!manifest.ok) return manifest;
		if (Object.keys(manifest.value.artifacts).length === 0) continue;
		snapshots.push({
			harness,
			targetRoot: root.rootPath,
			manifestPath: root.manifestPath,
			manifest: manifest.value,
		});
	}
	return resultOk(snapshots);
}

function skippedCollisionOutcomes(input: {
	desired: DesiredHarnessArtifact;
	skillRoots: ReadonlyMap<HarnessId, ResolvedProjectSkillRoot>;
	harnesses: readonly HarnessId[] | undefined;
}): readonly ReconcileArtifactOutcome[] {
	const harnesses = input.harnesses ?? [];
	return harnesses.flatMap((harness) => {
		const root = input.skillRoots.get(harness);
		if (root === undefined) return [];
		const targetArtifactPath = join(root.rootPath, input.desired.artifact.skillName);
		return [
			{
				action: "skipped" as const,
				artifactId: input.desired.artifact.id,
				skillName: input.desired.artifact.skillName,
				harness,
				scope: "project" as const,
				origin: "declared" as const,
				sourceType: input.desired.artifact.source.type,
				packageName: input.desired.artifact.source.packageName,
				targetArtifactPath,
				manifestPath: root.manifestPath,
				writtenFiles: [],
				removedFiles: [],
				conflictingFiles: [],
			},
		];
	});
}

function reconcileOutcomeFromProvision(input: {
	pair: ReconcilePair;
	provision: HarnessArtifactProvisionPreview;
	writtenFiles: readonly string[];
	conflictingFiles: readonly string[];
}): ReconcileArtifactOutcome {
	return {
		action: classifyProvisionAction({
			conflictingFiles: input.conflictingFiles,
			decisionsAreUnchanged: input.provision.decisions.files.every(
				(decision) => decision.type === "unchanged",
			),
			hasManifestEntry: input.pair.hasManifestEntry,
		}),
		artifactId: input.pair.desired.artifact.id,
		skillName: input.pair.desired.artifact.skillName,
		harness: input.pair.harness,
		scope: input.pair.scope,
		origin: input.pair.origin,
		sourceType: input.pair.desired.artifact.source.type,
		packageName: input.pair.desired.artifact.source.packageName,
		targetArtifactPath: input.provision.plan.targetArtifactPath,
		manifestPath: input.provision.manifestPath,
		writtenFiles: [...input.writtenFiles],
		removedFiles: [],
		conflictingFiles: [...input.conflictingFiles],
	};
}

function removalOutcome(
	removal: PlannedHarnessArtifactRemoval,
	removedFiles: readonly string[],
	conflictingFiles: readonly string[],
	action: "removed" | "conflicted",
): ReconcileArtifactOutcome {
	return {
		action,
		artifactId: removal.entry.artifactId,
		skillName: removal.entry.provisionName,
		harness: removal.entry.harness,
		scope: removal.entry.scope,
		origin: "manifest",
		sourceType: removal.entry.source.type,
		packageName: removal.entry.source.packageName,
		targetArtifactPath: removal.entry.targetArtifactPath,
		manifestPath: removal.snapshot.manifestPath,
		writtenFiles: [],
		removedFiles: [...removedFiles],
		conflictingFiles: [...conflictingFiles],
		removalReason: removal.reason,
	};
}
