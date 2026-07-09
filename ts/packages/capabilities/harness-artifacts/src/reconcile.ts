import { isAbsolute, join, resolve } from "node:path";

import {
	resolveDeclaredExtensionModules,
	type ExtensionAcquisitionDiagnostic,
	type ExtensionAcquisitionGateway,
} from "@nseng-ai/kernel/extensions/acquisition";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import { isUnsupportedNsTomlExtensionSpec } from "@nseng-ai/kernel/project-config/points";
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
	discoverExtensionModuleHarnessArtifacts,
	moduleArtifactDiscoveryDiagnosticSchema,
	type ExtensionDescriptorModuleLoader,
	type HarnessArtifactModuleDiscoveryGateway,
	type ModuleArtifactDiscoveryDiagnostic,
} from "./module-artifact-discovery.ts";
import { parseNsTomlExtensions, parseNsTomlHarnesses, type NsTomlErrorInfo } from "./ns-toml.ts";
import {
	applyPreparedProvision,
	conflictingFilesFromDecisions,
	INSTALL_MANIFEST_FILE_NAME,
	nodeHarnessArtifactFileSystemGateway,
	prepareProvision,
	readInstallManifestAtRoot,
	type HarnessArtifactFileSystemErrorInfo,
	type HarnessArtifactFileSystemGateway,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessArtifactProvisionPreview,
} from "./provision-apply.ts";
import {
	provisionIdentityKey,
	type InstallManifestData,
	type InstallManifestEntryData,
} from "./provision-plan.ts";
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
}): {
	pairs: readonly ReconcilePair[];
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
	for (const snapshot of input.manifests) {
		for (const entry of Object.values(snapshot.manifest.artifacts)) {
			const desired = desiredByManifestIdentity.get(manifestEntryDesiredIdentityKey(entry));
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
	isDryRun: boolean;
	shouldForce: boolean;
	extensionTarget?: string;
	fs?: HarnessArtifactFileSystemGateway;
	discoveryGateway?: HarnessArtifactModuleDiscoveryGateway;
	descriptorLoader?: ExtensionDescriptorModuleLoader;
	acquisitionGateway?: ExtensionAcquisitionGateway;
	acquisitionMode?: "preview" | "apply";
	firstPartySourceRoot?: string;
}

export const harnessSelectionStateSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("ns-toml"), harnesses: z.array(harnessIdSchema).readonly() }),
	z.object({ type: z.literal("missing") }),
]);
export type HarnessSelectionState = z.output<typeof harnessSelectionStateSchema>;

export const reconcileArtifactOutcomeSchema = z.object({
	action: z.enum(["installed", "refreshed", "unchanged", "conflicted", "skipped"]),
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
	conflictingFiles: z.array(z.string()).readonly(),
});
export type ReconcileArtifactOutcome = z.output<typeof reconcileArtifactOutcomeSchema>;

export const reconcileReportSchema = z.object({
	mode: z.enum(["dry-run", "applied"]),
	harnessSelection: harnessSelectionStateSchema,
	artifacts: z.array(reconcileArtifactOutcomeSchema).readonly(),
	orphans: z.array(orphanedManifestEntrySchema).readonly(),
	diagnostics: z.array(moduleArtifactDiscoveryDiagnosticSchema).readonly(),
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
	const acquisition = await resolveDeclaredExtensionModules({
		projectRoot: request.projectRoot,
		declaredSpecs: extensionSelection.value.declaredSpecs,
		selectedSpecs: extensionSelection.value.selectedSpecs,
		mode: request.acquisitionMode ?? (request.isDryRun ? "preview" : "apply"),
		...optionalEntry("gateway", request.acquisitionGateway),
	});
	const moduleDiscovery = await discoverExtensionModuleHarnessArtifacts({
		projectRoot: request.projectRoot,
		...optionalEntry("homeDir", request.homeDir),
		env: request.env,
		moduleRoots: acquisition.roots.map((root) => root.moduleRoot),
		includeDeclaredExtensions: false,
		gateway: discoveryGateway,
		...optionalEntry("descriptorLoader", request.descriptorLoader),
	});

	const desired = desiredHarnessArtifacts({
		moduleCatalogs: moduleDiscovery.catalogs,
		firstPartySourceRoot: request.firstPartySourceRoot,
		includeFirstPartyArtifacts: !extensionSelection.value.isTargeted,
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

	const plan = planHarnessArtifactReconcile({
		desired: desired.value,
		harnessSelection: selection.value.harnessSelection,
		manifests: manifests.value,
	});

	const artifacts: ReconcileArtifactOutcome[] = [];
	for (const desired of plan.skippedDesired) {
		artifacts.push(
			...skippedCollisionOutcomes({
				desired,
				skillRoots: skillRoots.value,
				harnesses: selection.value.harnessSelection,
			}),
		);
	}
	for (const pair of plan.pairs) {
		const prepared = await prepareProvision({
			artifact: pair.desired.artifact,
			harness: pair.harness,
			scope: pair.scope,
			context,
			sourceRoot: pair.desired.sourceRoot,
			sourceVersion: pair.desired.sourceVersion,
			fs,
		});
		if (!prepared.ok) return prepared;
		if (request.isDryRun) {
			artifacts.push(
				reconcileOutcomeFromProvision({
					pair,
					provision: prepared.value,
					writtenFiles: [],
					conflictingFiles: conflictingFilesFromDecisions(prepared.value.decisions),
				}),
			);
			continue;
		}

		const applied = await applyPreparedProvision(prepared.value, {
			shouldForce: request.shouldForce,
		});
		if (!applied.ok) return applied;
		if (applied.value.outcome === "conflicted") {
			artifacts.push(
				reconcileOutcomeFromProvision({
					pair,
					provision: applied.value,
					writtenFiles: [],
					conflictingFiles: applied.value.conflictingFiles,
				}),
			);
			continue;
		}
		artifacts.push(
			reconcileOutcomeFromProvision({
				pair,
				provision: applied.value,
				writtenFiles: applied.value.writtenFiles,
				conflictingFiles: [],
			}),
		);
	}

	return resultOk({
		mode: request.isDryRun ? "dry-run" : "applied",
		harnessSelection: selection.value.state,
		artifacts,
		orphans: plan.orphans,
		diagnostics: [
			...acquisition.diagnostics.map(acquisitionDiagnostic),
			...moduleDiscovery.diagnostics,
		],
		skippedCollisions: plan.skippedCollisions,
		isForceRequired: artifacts.some((artifact) => artifact.action === "conflicted"),
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
	includeFirstPartyArtifacts: boolean;
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
	includeFirstPartyArtifacts: boolean;
}): Result<readonly DesiredHarnessArtifact[], ReconcileErrorInfo> {
	if (!input.includeFirstPartyArtifacts) return resultOk([]);
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
	if (parsed.type === "error") {
		return resultErr({
			code: "invalid_ns_toml",
			message: parsed.error.message,
			details: { path: nsTomlPath, error: parsed.error },
		});
	}
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
		moduleRoots: readonly string[];
		isTargeted: boolean;
	},
	ReconcileErrorInfo
> {
	if (input.state.type === "missing") {
		if (input.target === undefined) {
			return resultOk({ declaredSpecs: [], selectedSpecs: [], moduleRoots: [], isTargeted: false });
		}
		return invalidTargetResult({
			target: input.target,
			projectRoot: input.projectRoot,
			declaredExtensions: [],
		});
	}
	const parsed = parseNsTomlExtensions(input.state.text, input.nsTomlPath);
	if (parsed.type === "error") {
		return resultErr({
			code: "invalid_ns_toml",
			message: parsed.error.message,
			details: { path: input.nsTomlPath, error: parsed.error },
		});
	}
	const declared = parsed.type === "ok" ? parsed.extensions : [];
	const declaredLocalSpecs = declared.filter((extension) => isLocalExtensionSpec(extension));
	const declaredLocalRoots = declaredLocalSpecs.map((extension) =>
		normalizeExtensionPath(input.projectRoot, extension),
	);
	const target = input.target;
	if (target === undefined) {
		return resultOk({
			declaredSpecs: declared,
			selectedSpecs: declared,
			moduleRoots: uniqueSortedPaths(declaredLocalRoots),
			isTargeted: false,
		});
	}
	const normalizedTarget = isLocalExtensionSpec(target)
		? normalizeExtensionPath(input.projectRoot, target)
		: target;
	const isDeclaredTarget = isLocalExtensionSpec(target)
		? declaredLocalRoots.includes(normalizedTarget)
		: declared.includes(target);
	if (!isDeclaredTarget) {
		return invalidTargetResult({
			target,
			projectRoot: input.projectRoot,
			declaredExtensions: declared,
		});
	}
	const selectedSpec = isLocalExtensionSpec(target)
		? declaredLocalSpecs[declaredLocalRoots.indexOf(normalizedTarget)]
		: target;
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
		moduleRoots: isLocalExtensionSpec(target) ? [normalizedTarget] : [],
		isTargeted: true,
	});
}

function acquisitionDiagnostic(
	diagnostic: ExtensionAcquisitionDiagnostic,
): ModuleArtifactDiscoveryDiagnostic {
	return {
		code: diagnostic.code,
		message: diagnostic.message,
		...optionalEntry("path", diagnostic.path ?? diagnostic.spec),
	};
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

function isLocalExtensionSpec(value: string): boolean {
	return !isUnsupportedNsTomlExtensionSpec(value);
}

function normalizeExtensionPath(projectRoot: string, value: string): string {
	return resolve(isAbsolute(value) ? value : join(projectRoot, value));
}

function uniqueSortedPaths(paths: readonly string[]): readonly string[] {
	return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
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

function classifyReconcileAction(input: {
	conflictingFiles: readonly string[];
	decisionsAreUnchanged: boolean;
	hasManifestEntry: boolean;
}): ReconcileArtifactOutcome["action"] {
	if (input.conflictingFiles.length > 0) return "conflicted";
	if (input.decisionsAreUnchanged && input.hasManifestEntry) return "unchanged";
	if (input.hasManifestEntry) return "refreshed";
	return "installed";
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
		action: classifyReconcileAction({
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
		conflictingFiles: [...input.conflictingFiles],
	};
}
