import { isAbsolute, join, normalize, resolve } from "node:path";

import {
	formatErrorMessage,
	formatZodIssue,
	isPathInside,
	optionalEntry,
} from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

import type { HarnessArtifactEntry } from "./artifact-catalog.ts";
import {
	harnessArtifactSourceTypeSchema,
	harnessIdSchema,
	harnessScopeSchema,
} from "./harness-artifact-schemas.ts";
import { type HarnessPathContext, type HarnessScope } from "./harness-paths.ts";
import {
	fileSystemError,
	nodeHarnessArtifactFileSystemGateway,
	type HarnessArtifactFileSystemErrorInfo,
	type HarnessArtifactFileSystemGateway,
	type OptionalFileState,
	type OptionalTextFileState,
} from "./filesystem.ts";
import {
	buildInstallManifestData,
	buildInstallManifestEntry,
	buildProvisionPlan,
	classifyProvisionDecisions,
	contentHashForBytes,
	installManifestKey,
	provisionIdentityKey,
	type InstallManifestData,
	type InstallManifestEntryData,
	type InstallManifestFileData,
	type InstallManifestSourceData,
	type ProvisionDecisionErrorInfo,
	type ProvisionDecisionSet,
	type ProvisionPlan,
	type ProvisionPlanErrorInfo,
	type ProvisionSourceFile,
	type TargetFileHashFact,
} from "./provision-plan.ts";

export const INSTALL_MANIFEST_FILE_NAME = ".ns-harness-artifacts-manifest.json";

export interface HarnessArtifactProvisionRequest {
	artifact: HarnessArtifactEntry;
	harness: string;
	scope: HarnessScope;
	context: HarnessPathContext;
	sourceRoot: string;
	sourceVersion: string;
	fs?: HarnessArtifactFileSystemGateway;
}

export interface HarnessArtifactProvisionPreview {
	plan: ProvisionPlan;
	decisions: ProvisionDecisionSet;
	manifestPath: string;
}

export interface PreparedHarnessArtifactProvision extends HarnessArtifactProvisionPreview {
	manifest: InstallManifestData;
	expectedManifestEntry: InstallManifestEntryData | undefined;
	trustedBoundaryRoot: string;
	sourceRoot: string;
	sourceBytes: ReadonlyMap<string, Uint8Array>;
	targetFacts: readonly TargetFileHashFact[];
	obsoleteTargetFacts: readonly TargetFileHashFact[];
	obsoleteFiles: readonly InstallManifestFileData[];
	fs: HarnessArtifactFileSystemGateway;
}

export interface ApplyPreparedProvisionOptions {
	shouldForce: boolean;
}

export interface HarnessArtifactProvisionApplyResult extends HarnessArtifactProvisionPreview {
	manifest: InstallManifestData;
	writtenFiles: readonly string[];
	removedFiles: readonly string[];
}

export interface HarnessArtifactProvisionAppliedOutcome extends HarnessArtifactProvisionApplyResult {
	outcome: "applied";
}

export interface HarnessArtifactProvisionConflictOutcome extends HarnessArtifactProvisionPreview {
	outcome: "conflicted";
	conflictingFiles: readonly string[];
}

export type HarnessArtifactProvisionApplyOutcome =
	| HarnessArtifactProvisionAppliedOutcome
	| HarnessArtifactProvisionConflictOutcome;

export type {
	HarnessArtifactFileSystemErrorInfo,
	HarnessArtifactFileSystemGateway,
	OptionalFileState,
	OptionalTextFileState,
};

export type HarnessArtifactProvisionErrorInfo =
	| ProvisionPlanErrorInfo
	| ProvisionDecisionErrorInfo
	| HarnessArtifactFileSystemErrorInfo
	| {
			code: "invalid_install_manifest";
			message: string;
			details: { manifestPath: string };
	  }
	| {
			code: "stale_prepared_reconciliation";
			message: string;
			details: { kind: "source" | "target" | "manifest"; path: string; installKey: string };
	  }
	| {
			code: "unsafe_manifest_entry";
			message: string;
			details: { manifestPath: string; installKey: string; path: string };
	  };

const installManifestSourceSchema: z.ZodType<InstallManifestSourceData> = z.object({
	type: harnessArtifactSourceTypeSchema,
	packageName: z.string(),
	relativePath: z.string(),
	version: z.string(),
});

const installManifestFileSchema: z.ZodType<InstallManifestFileData> = z.object({
	sourcePath: z.string(),
	targetPath: z.string(),
	contentHash: z.string(),
});

const installManifestEntrySchema: z.ZodType<InstallManifestEntryData> = z.object({
	artifactId: z.string(),
	kind: z.literal("skill"),
	provisionName: z.string(),
	harness: harnessIdSchema,
	scope: harnessScopeSchema,
	targetRoot: z.string(),
	targetArtifactPath: z.string(),
	source: installManifestSourceSchema,
	files: z.record(z.string(), installManifestFileSchema),
});

const installManifestSchema: z.ZodType<InstallManifestData> = z.object({
	version: z.literal(1),
	artifacts: z.record(z.string(), installManifestEntrySchema),
});

export { nodeHarnessArtifactFileSystemGateway };

export async function prepareProvision(
	request: HarnessArtifactProvisionRequest,
): Promise<Result<PreparedHarnessArtifactProvision, HarnessArtifactProvisionErrorInfo>> {
	const fs = request.fs ?? nodeHarnessArtifactFileSystemGateway;
	const sourceFiles = await collectSourceFiles({
		fs,
		sourceRoot: request.sourceRoot,
		sourceRelativePath: request.artifact.source.relativePath,
	});
	if (!sourceFiles.ok) return sourceFiles;

	const plan = buildProvisionPlan({
		artifact: request.artifact,
		harness: request.harness,
		scope: request.scope,
		context: request.context,
		sourceVersion: request.sourceVersion,
		sourceFiles: sourceFiles.value.files,
	});
	if (!plan.ok) return plan;

	const manifestPath = installManifestPathForPlan(plan.value);
	const installKey = installManifestKey(plan.value);
	const trustedBoundaryRoot = trustedBoundaryRootForProvision({
		plan: plan.value,
		context: request.context,
	});
	const provisionSafety = await fs.inspectHarnessArtifactProvisionSafety({
		trustedBoundaryRoot,
		expectedTargetRoot: plan.value.targetRoot,
		targetPaths: [
			plan.value.targetArtifactPath,
			...plan.value.files.map((file) => file.targetPath),
			manifestPath,
		],
	});
	if (!provisionSafety.ok) return provisionSafety;
	if (provisionSafety.value.unsafePath !== undefined) {
		return unsafeManifestEntry(manifestPath, installKey, provisionSafety.value.unsafePath);
	}
	const manifest = await readInstallManifest(fs, manifestPath);
	if (!manifest.ok) return manifest;
	const existingManifestEntry = manifest.value.artifacts[installKey];
	if (existingManifestEntry !== undefined) {
		const unsafePath = validateRemovalEntry({
			key: installKey,
			entry: existingManifestEntry,
			expectedHarness: plan.value.harness,
			expectedScope: plan.value.scope,
			expectedTargetRoot: plan.value.targetRoot,
		});
		if (unsafePath !== undefined) {
			return unsafeManifestEntry(manifestPath, installKey, unsafePath);
		}
	}
	const targetFacts = await collectTargetHashFacts({ fs, plan: plan.value });
	if (!targetFacts.ok) return targetFacts;
	const decisions = classifyProvisionDecisions({
		plan: plan.value,
		...optionalEntry("existingManifestEntry", existingManifestEntry),
		targetFacts: targetFacts.value,
	});
	if (!decisions.ok) return decisions;

	const obsoleteFiles = Object.entries(existingManifestEntry?.files ?? {})
		.filter(
			([relativePath]) => !plan.value.files.some((file) => file.relativePath === relativePath),
		)
		.map(([, file]) => file);
	if (obsoleteFiles.length > 0) {
		const safety = await fs.inspectHarnessArtifactProvisionSafety({
			trustedBoundaryRoot,
			expectedTargetRoot: plan.value.targetRoot,
			targetPaths: [plan.value.targetArtifactPath, ...obsoleteFiles.map((file) => file.targetPath)],
		});
		if (!safety.ok) return safety;
		if (safety.value.unsafePath !== undefined) {
			return unsafeManifestEntry(manifestPath, installKey, safety.value.unsafePath);
		}
	}
	const obsoleteTargetFacts = await collectTargetHashFactsForPaths({
		fs,
		targetPaths: obsoleteFiles.map((file) => file.targetPath),
	});
	if (!obsoleteTargetFacts.ok) return obsoleteTargetFacts;
	return resultOk({
		plan: plan.value,
		decisions: decisions.value,
		manifestPath,
		manifest: manifest.value,
		expectedManifestEntry: existingManifestEntry,
		trustedBoundaryRoot,
		sourceRoot: request.sourceRoot,
		sourceBytes: sourceFiles.value.bytesBySourcePath,
		targetFacts: targetFacts.value,
		obsoleteTargetFacts: obsoleteTargetFacts.value,
		obsoleteFiles,
		fs,
	});
}

function trustedBoundaryRootForProvision(input: {
	plan: ProvisionPlan;
	context: HarnessPathContext;
}): string {
	if (input.plan.scope === "project") return input.context.projectRoot;
	const claudeConfigDir = input.context.env?.CLAUDE_CONFIG_DIR;
	if (
		input.plan.harness === "claude-code" &&
		claudeConfigDir !== undefined &&
		claudeConfigDir.trim() !== ""
	) {
		return claudeConfigDir;
	}
	if (input.context.homeDir !== undefined && input.context.homeDir.trim() !== "") {
		return input.context.homeDir;
	}
	throw new Error("User-scope harness artifact safety requires a trusted home directory.");
}

export function conflictingFilesFromDecisions(decisions: ProvisionDecisionSet): readonly string[] {
	return decisions.files
		.filter((decision) => decision.type === "locally-edited-conflict")
		.map((decision) => decision.file.targetPath);
}

export type ProvisionApplyAction = "installed" | "refreshed" | "unchanged" | "conflicted";

export function classifyProvisionAction(input: {
	conflictingFiles: readonly string[];
	decisionsAreUnchanged: boolean;
	hasManifestEntry: boolean;
}): ProvisionApplyAction {
	if (input.conflictingFiles.length > 0) return "conflicted";
	if (input.decisionsAreUnchanged && input.hasManifestEntry) return "unchanged";
	if (input.hasManifestEntry) return "refreshed";
	return "installed";
}

export async function applyPreparedProvision(
	prepared: PreparedHarnessArtifactProvision,
	options: ApplyPreparedProvisionOptions,
): Promise<Result<HarnessArtifactProvisionApplyOutcome, HarnessArtifactProvisionErrorInfo>> {
	const conflictingFiles = [
		...conflictingFilesFromDecisions(prepared.decisions),
		...obsoleteConflictingFiles(prepared),
	];
	if (conflictingFiles.length > 0 && !options.shouldForce) {
		return resultOk({
			outcome: "conflicted",
			...previewFromPrepared(prepared),
			conflictingFiles,
		});
	}
	const currentManifest = await validatePreparedProvision(prepared);
	if (!currentManifest.ok) return currentManifest;
	const safety = await prepared.fs.inspectHarnessArtifactProvisionSafety({
		trustedBoundaryRoot: prepared.trustedBoundaryRoot,
		expectedTargetRoot: prepared.plan.targetRoot,
		targetPaths: [
			prepared.plan.targetArtifactPath,
			...prepared.plan.files.map((file) => file.targetPath),
			...prepared.obsoleteFiles.map((file) => file.targetPath),
			prepared.manifestPath,
		],
	});
	if (!safety.ok) return safety;
	if (safety.value.unsafePath !== undefined) {
		return unsafeManifestEntry(
			prepared.manifestPath,
			installManifestKey(prepared.plan),
			safety.value.unsafePath,
		);
	}

	const removedFiles: string[] = [];
	for (const file of prepared.obsoleteFiles) {
		const fact = prepared.obsoleteTargetFacts.find((item) => item.targetPath === file.targetPath);
		if (fact?.type !== "file") continue;
		const removed = await prepared.fs.removeFile(file.targetPath);
		if (!removed.ok) return removed;
		removedFiles.push(file.targetPath);
	}
	const writtenFiles: string[] = [];
	for (const decision of prepared.decisions.files) {
		if (decision.type === "unchanged") continue;
		const source = prepared.sourceBytes.get(decision.file.sourcePath);
		if (source === undefined) {
			throw new Error(`Prepared source bytes are missing for ${decision.file.sourcePath}.`);
		}
		const write = await prepared.fs.writeFile(decision.file.targetPath, source);
		if (!write.ok) return write;
		writtenFiles.push(decision.file.targetPath);
	}

	const manifest = updateManifest(currentManifest.value, prepared.plan);
	const writeManifest = await prepared.fs.writeTextFile(
		prepared.manifestPath,
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	if (!writeManifest.ok) return writeManifest;
	if (prepared.obsoleteFiles.length > 0) {
		const removeDirectory = await prepared.fs.removeEmptyDirectory(
			prepared.plan.targetArtifactPath,
		);
		if (!removeDirectory.ok) return removeDirectory;
	}

	return resultOk({
		outcome: "applied",
		plan: prepared.plan,
		decisions: prepared.decisions,
		manifestPath: prepared.manifestPath,
		manifest,
		writtenFiles,
		removedFiles,
	});
}

export type PreparedHarnessArtifactTransition =
	| { readonly type: "remove"; readonly removal: PreparedHarnessArtifactRemoval }
	| { readonly type: "provision"; readonly provision: PreparedHarnessArtifactProvision };

export interface PreparedProvisionReconciliation {
	readonly transitions: readonly PreparedHarnessArtifactTransition[];
	readonly shouldForce: boolean;
}

export type AppliedHarnessArtifactTransition =
	| { readonly type: "remove"; readonly removedFiles: readonly string[] }
	| { readonly type: "provision"; readonly outcome: HarnessArtifactProvisionApplyOutcome };

export interface AppliedProvisionReconciliation {
	readonly outcomes: readonly AppliedHarnessArtifactTransition[];
}

export type HarnessArtifactProvisionReconciliationErrorInfo = HarnessArtifactProvisionErrorInfo & {
	readonly completedTransitions: readonly AppliedHarnessArtifactTransition[];
};

/** Apply one ordered reconciliation while rereading each transition's immediate state. */
export async function applyPreparedProvisionReconciliation(
	prepared: PreparedProvisionReconciliation,
): Promise<
	Result<AppliedProvisionReconciliation, HarnessArtifactProvisionReconciliationErrorInfo>
> {
	const outcomes: AppliedHarnessArtifactTransition[] = [];
	const removedPaths = new Set<string>();
	const removedKeys = new Set<string>();
	for (const transition of prepared.transitions) {
		if (transition.type === "remove") {
			const removed = await applyPreparedHarnessArtifactRemoval(transition.removal);
			if (!removed.ok) {
				return resultErr({ ...removed.error, completedTransitions: [...outcomes] });
			}
			for (const file of Object.values(transition.removal.entry.files)) {
				removedPaths.add(file.targetPath);
			}
			removedKeys.add(transition.removal.key);
			outcomes.push({ type: "remove", removedFiles: removed.value });
			continue;
		}
		const provision = accountForPriorAggregateRemovals(
			transition.provision,
			removedPaths,
			removedKeys,
		);
		const applied = await applyPreparedProvision(provision, {
			shouldForce: prepared.shouldForce,
		});
		if (!applied.ok) {
			return resultErr({ ...applied.error, completedTransitions: [...outcomes] });
		}
		outcomes.push({ type: "provision", outcome: applied.value });
	}
	return resultOk({ outcomes });
}

function accountForPriorAggregateRemovals(
	provision: PreparedHarnessArtifactProvision,
	removedPaths: ReadonlySet<string>,
	removedKeys: ReadonlySet<string>,
): PreparedHarnessArtifactProvision {
	const affectedPaths = new Set(
		provision.targetFacts
			.filter((fact) => removedPaths.has(fact.targetPath))
			.map((fact) => fact.targetPath),
	);
	if (affectedPaths.size === 0 && !removedKeys.has(installManifestKey(provision.plan))) {
		return provision;
	}
	return {
		...provision,
		expectedManifestEntry: removedKeys.has(installManifestKey(provision.plan))
			? undefined
			: provision.expectedManifestEntry,
		targetFacts: provision.targetFacts.map((fact) =>
			affectedPaths.has(fact.targetPath)
				? { type: "missing" as const, targetPath: fact.targetPath }
				: fact,
		),
		decisions: {
			...provision.decisions,
			files: provision.decisions.files.map((decision) =>
				affectedPaths.has(decision.file.targetPath)
					? { type: "fresh-write" as const, file: decision.file }
					: decision,
			),
		},
	};
}

async function validatePreparedProvision(
	prepared: PreparedHarnessArtifactProvision,
): Promise<Result<InstallManifestData, HarnessArtifactProvisionErrorInfo>> {
	const installKey = installManifestKey(prepared.plan);
	for (const [sourcePath, expectedBytes] of prepared.sourceBytes) {
		const source = await readRequiredFile(prepared.fs, join(prepared.sourceRoot, sourcePath));
		if (!source.ok) return source;
		if (contentHashForBytes(source.value) !== contentHashForBytes(expectedBytes)) {
			return stalePreparation("source", join(prepared.sourceRoot, sourcePath), installKey);
		}
	}
	const expectedFacts = [...prepared.targetFacts, ...prepared.obsoleteTargetFacts];
	const currentFacts = await collectTargetHashFactsForPaths({
		fs: prepared.fs,
		targetPaths: expectedFacts.map((fact) => fact.targetPath),
	});
	if (!currentFacts.ok) return currentFacts;
	for (const expected of expectedFacts) {
		const current = currentFacts.value.find((fact) => fact.targetPath === expected.targetPath);
		if (current === undefined || !targetFactsEqual(expected, current)) {
			return stalePreparation("target", expected.targetPath, installKey);
		}
	}
	const manifest = await readInstallManifest(prepared.fs, prepared.manifestPath);
	if (!manifest.ok) return manifest;
	if (!manifestEntriesEqual(manifest.value.artifacts[installKey], prepared.expectedManifestEntry)) {
		return stalePreparation("manifest", prepared.manifestPath, installKey);
	}
	return manifest;
}

function stalePreparation(
	kind: "source" | "target" | "manifest",
	path: string,
	installKey: string,
): Result<never, HarnessArtifactProvisionErrorInfo> {
	return resultErr({
		code: "stale_prepared_reconciliation",
		message: `Prepared harness artifact ${installKey} is stale because its ${kind} state changed at ${path}.`,
		details: { kind, path, installKey },
	});
}

function targetFactsEqual(left: TargetFileHashFact, right: TargetFileHashFact): boolean {
	return (
		left.type === right.type &&
		(left.type === "missing" || (right.type === "file" && left.contentHash === right.contentHash))
	);
}

function manifestEntriesEqual(
	left: InstallManifestEntryData | undefined,
	right: InstallManifestEntryData | undefined,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function obsoleteConflictingFiles(prepared: PreparedHarnessArtifactProvision): readonly string[] {
	return prepared.obsoleteFiles.flatMap((file) => {
		const fact = prepared.obsoleteTargetFacts.find((item) => item.targetPath === file.targetPath);
		return fact?.type === "file" && fact.contentHash !== file.contentHash ? [file.targetPath] : [];
	});
}

export type HarnessArtifactRemovalReason =
	| "removed-source"
	| "deselected-harness"
	| "obsolete-file"
	| "same-target-replacement";

export interface PreparedHarnessArtifactRemoval {
	readonly key: string;
	readonly reason: HarnessArtifactRemovalReason;
	readonly entry: InstallManifestEntryData;
	readonly manifestPath: string;
	readonly expectedManifestEntry: InstallManifestEntryData;
	readonly trustedBoundaryRoot: string;
	readonly targetFacts: readonly TargetFileHashFact[];
	readonly conflictingFiles: readonly string[];
	readonly fs: HarnessArtifactFileSystemGateway;
}

export async function prepareHarnessArtifactRemoval(input: {
	key: string;
	reason: HarnessArtifactRemovalReason;
	entry: InstallManifestEntryData;
	expectedHarness: string;
	expectedTargetRoot: string;
	trustedBoundaryRoot: string;
	manifestPath: string;
	fs: HarnessArtifactFileSystemGateway;
}): Promise<Result<PreparedHarnessArtifactRemoval, HarnessArtifactProvisionErrorInfo>> {
	const unsafePath =
		resolve(input.manifestPath) !==
		resolve(join(input.expectedTargetRoot, INSTALL_MANIFEST_FILE_NAME))
			? input.manifestPath
			: validateRemovalEntry({ ...input, expectedScope: "project" });
	if (unsafePath !== undefined) {
		return unsafeManifestEntry(input.manifestPath, input.key, unsafePath);
	}
	const files = Object.values(input.entry.files);
	const safety = await input.fs.inspectHarnessArtifactRemovalSafety({
		trustedBoundaryRoot: input.trustedBoundaryRoot,
		expectedTargetRoot: input.expectedTargetRoot,
		targetPaths: [input.entry.targetArtifactPath, ...files.map((file) => file.targetPath)],
	});
	if (!safety.ok) return safety;
	if (safety.value.unsafePath !== undefined) {
		return unsafeManifestEntry(input.manifestPath, input.key, safety.value.unsafePath);
	}
	const targetFacts = await collectTargetHashFactsForPaths({
		fs: input.fs,
		targetPaths: files.map((file) => file.targetPath),
	});
	if (!targetFacts.ok) return targetFacts;
	const conflictingFiles = files.flatMap((file) => {
		const fact = targetFacts.value.find((item) => item.targetPath === file.targetPath);
		return fact?.type === "file" && fact.contentHash !== file.contentHash ? [file.targetPath] : [];
	});
	return resultOk({
		...input,
		expectedManifestEntry: input.entry,
		targetFacts: targetFacts.value,
		conflictingFiles,
	});
}

export async function applyPreparedHarnessArtifactRemoval(
	prepared: PreparedHarnessArtifactRemoval,
): Promise<Result<readonly string[], HarnessArtifactProvisionErrorInfo>> {
	const manifest = await readInstallManifest(prepared.fs, prepared.manifestPath);
	if (!manifest.ok) return manifest;
	if (
		!manifestEntriesEqual(manifest.value.artifacts[prepared.key], prepared.expectedManifestEntry)
	) {
		return stalePreparation("manifest", prepared.manifestPath, prepared.key);
	}
	const safety = await prepared.fs.inspectHarnessArtifactRemovalSafety({
		trustedBoundaryRoot: prepared.trustedBoundaryRoot,
		expectedTargetRoot: prepared.entry.targetRoot,
		targetPaths: [
			prepared.entry.targetArtifactPath,
			...Object.values(prepared.entry.files).map((file) => file.targetPath),
		],
	});
	if (!safety.ok) return safety;
	if (safety.value.unsafePath !== undefined) {
		return unsafeManifestEntry(prepared.manifestPath, prepared.key, safety.value.unsafePath);
	}
	const currentFacts = await collectTargetHashFactsForPaths({
		fs: prepared.fs,
		targetPaths: prepared.targetFacts.map((fact) => fact.targetPath),
	});
	if (!currentFacts.ok) return currentFacts;
	for (const expected of prepared.targetFacts) {
		const current = currentFacts.value.find((fact) => fact.targetPath === expected.targetPath);
		if (current === undefined || !targetFactsEqual(expected, current)) {
			return stalePreparation("target", expected.targetPath, prepared.key);
		}
	}
	if (prepared.conflictingFiles.length > 0) {
		return stalePreparation(
			"target",
			prepared.conflictingFiles[0] ?? prepared.entry.targetArtifactPath,
			prepared.key,
		);
	}
	const removedFiles: string[] = [];
	for (const file of Object.values(prepared.entry.files)) {
		const fact = prepared.targetFacts.find((item) => item.targetPath === file.targetPath);
		if (fact?.type !== "file") continue;
		const removed = await prepared.fs.removeFile(file.targetPath);
		if (!removed.ok) return removed;
		removedFiles.push(file.targetPath);
	}
	const nextManifest = buildInstallManifestData(
		Object.entries(manifest.value.artifacts)
			.filter(([key]) => key !== prepared.key)
			.map(([, entry]) => entry),
	);
	const written = await prepared.fs.writeTextFile(
		prepared.manifestPath,
		`${JSON.stringify(nextManifest, null, 2)}\n`,
	);
	if (!written.ok) return written;
	const removedDirectory = await prepared.fs.removeEmptyDirectory(
		prepared.entry.targetArtifactPath,
	);
	if (!removedDirectory.ok) return removedDirectory;
	return resultOk(removedFiles);
}

function validateRemovalEntry(input: {
	key: string;
	entry: InstallManifestEntryData;
	expectedHarness: string;
	expectedScope: HarnessScope;
	expectedTargetRoot: string;
}): string | undefined {
	const entry = input.entry;
	if (input.key !== provisionIdentityKey(entry)) return input.key;
	if (entry.harness !== input.expectedHarness || entry.scope !== input.expectedScope) {
		return entry.targetRoot;
	}
	if (resolve(entry.targetRoot) !== resolve(input.expectedTargetRoot)) return entry.targetRoot;
	if (
		!isAbsolute(entry.targetArtifactPath) ||
		resolve(entry.targetArtifactPath) !== resolve(join(entry.targetRoot, entry.provisionName)) ||
		!isPathInside(entry.targetRoot, entry.targetArtifactPath)
	) {
		return entry.targetArtifactPath;
	}
	for (const [relativePath, file] of Object.entries(entry.files)) {
		if (
			isAbsolute(relativePath) ||
			isAbsolute(file.sourcePath) ||
			normalize(join(entry.source.relativePath, relativePath)) !== normalize(file.sourcePath) ||
			resolve(entry.targetArtifactPath, relativePath) !== resolve(file.targetPath) ||
			!isPathInside(entry.targetArtifactPath, file.targetPath)
		) {
			return file.targetPath;
		}
	}
	return undefined;
}

function unsafeManifestEntry(
	manifestPath: string,
	installKey: string,
	path: string,
): Result<never, HarnessArtifactProvisionErrorInfo> {
	return resultErr({
		code: "unsafe_manifest_entry",
		message: `Install manifest entry ${installKey} is not coherent with its harness root: ${path}.`,
		details: { manifestPath, installKey, path },
	});
}

export function installManifestPathForPlan(plan: ProvisionPlan): string {
	return join(plan.targetRoot, INSTALL_MANIFEST_FILE_NAME);
}

export async function readInstallManifestAtRoot(options: {
	targetRoot: string;
	fs?: HarnessArtifactFileSystemGateway;
}): Promise<Result<InstallManifestData, HarnessArtifactProvisionErrorInfo>> {
	const fs = options.fs ?? nodeHarnessArtifactFileSystemGateway;
	return readInstallManifest(fs, join(options.targetRoot, INSTALL_MANIFEST_FILE_NAME));
}

export function previewFromPrepared(
	prepared: PreparedHarnessArtifactProvision,
): HarnessArtifactProvisionPreview {
	return {
		plan: prepared.plan,
		decisions: prepared.decisions,
		manifestPath: prepared.manifestPath,
	};
}

interface CollectedSourceFiles {
	readonly files: readonly ProvisionSourceFile[];
	readonly bytesBySourcePath: ReadonlyMap<string, Uint8Array>;
}

async function collectSourceFiles(input: {
	fs: HarnessArtifactFileSystemGateway;
	sourceRoot: string;
	sourceRelativePath: string;
}): Promise<Result<CollectedSourceFiles, HarnessArtifactProvisionErrorInfo>> {
	const sourceDirectory = join(input.sourceRoot, input.sourceRelativePath);
	const relativePaths = await input.fs.listFiles(sourceDirectory);
	if (!relativePaths.ok) return relativePaths;
	const sourceFiles: ProvisionSourceFile[] = [];
	const bytesBySourcePath = new Map<string, Uint8Array>();
	for (const relativePath of relativePaths.value) {
		const sourcePath = join(sourceDirectory, relativePath);
		const source = await readRequiredFile(input.fs, sourcePath);
		if (!source.ok) return source;
		const bytes = Uint8Array.from(source.value);
		sourceFiles.push({ relativePath, contentHash: contentHashForBytes(bytes) });
		bytesBySourcePath.set(join(input.sourceRelativePath, relativePath), bytes);
	}
	return resultOk({ files: sourceFiles, bytesBySourcePath });
}

async function readRequiredFile(
	fs: HarnessArtifactFileSystemGateway,
	path: string,
): Promise<Result<Uint8Array, HarnessArtifactProvisionErrorInfo>> {
	const source = await fs.readOptionalFile(path);
	if (!source.ok) return source;
	if (source.value.type === "missing") {
		return resultErr(fileSystemError(path, "read", new Error("Source file is missing.")));
	}
	return resultOk(source.value.bytes);
}

async function collectTargetHashFacts(input: {
	fs: HarnessArtifactFileSystemGateway;
	plan: ProvisionPlan;
}): Promise<Result<readonly TargetFileHashFact[], HarnessArtifactProvisionErrorInfo>> {
	return collectTargetHashFactsForPaths({
		fs: input.fs,
		targetPaths: input.plan.files.map((file) => file.targetPath),
	});
}

async function collectTargetHashFactsForPaths(input: {
	fs: HarnessArtifactFileSystemGateway;
	targetPaths: readonly string[];
}): Promise<Result<readonly TargetFileHashFact[], HarnessArtifactProvisionErrorInfo>> {
	const facts: TargetFileHashFact[] = [];
	for (const targetPath of input.targetPaths) {
		const target = await input.fs.readOptionalFile(targetPath);
		if (!target.ok) return target;
		if (target.value.type === "missing") facts.push({ type: "missing", targetPath });
		else {
			facts.push({
				type: "file",
				targetPath,
				contentHash: contentHashForBytes(target.value.bytes),
			});
		}
	}
	return resultOk(facts);
}

async function readInstallManifest(
	fs: HarnessArtifactFileSystemGateway,
	manifestPath: string,
): Promise<Result<InstallManifestData, HarnessArtifactProvisionErrorInfo>> {
	const manifest = await fs.readOptionalTextFile(manifestPath);
	if (!manifest.ok) return manifest;
	if (manifest.value.type === "missing") return resultOk({ version: 1, artifacts: {} });
	let data: unknown;
	try {
		data = JSON.parse(manifest.value.text);
	} catch (error) {
		return resultErr({
			code: "invalid_install_manifest",
			message: `Install manifest at ${manifestPath} is not valid JSON: ${formatErrorMessage(error)}`,
			details: { manifestPath },
		});
	}
	const parsed = installManifestSchema.safeParse(data);
	if (!parsed.success) {
		return resultErr({
			code: "invalid_install_manifest",
			message: `Install manifest at ${manifestPath} is invalid: ${formatZodIssue(
				parsed.error.issues[0],
				{ rootPath: "$", pathPrefix: "$.", fallback: "invalid install manifest" },
			)}`,
			details: { manifestPath },
		});
	}
	return resultOk(parsed.data);
}

function updateManifest(manifest: InstallManifestData, plan: ProvisionPlan): InstallManifestData {
	const nextEntry = buildInstallManifestEntry(plan);
	const nextKey = installManifestKey(plan);
	const entries = Object.entries(manifest.artifacts)
		.filter(([key]) => key !== nextKey)
		.map(([, entry]) => entry);
	return buildInstallManifestData([...entries, nextEntry]);
}
