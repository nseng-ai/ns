import { join } from "node:path";

import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import type { HarnessArtifactEntry } from "./artifact-catalog.ts";
import {
	fileSystemError,
	nodeHarnessArtifactFileSystemGateway,
	type HarnessArtifactFileSystemErrorInfo,
	type HarnessArtifactFileSystemGateway,
	type OptionalFileState,
	type OptionalTextFileState,
} from "./filesystem.ts";
import { type HarnessPathContext, type HarnessScope } from "./harness-paths.ts";
import {
	normalizeHarnessArtifactSafetyInspection,
	stalePreparation,
	unsafeManifestEntry,
	type HarnessArtifactProvisionErrorInfo,
} from "./provision-errors.ts";
import {
	installManifestPathForPlan,
	manifestEntriesEqual,
	manifestWithProvision,
	readInstallManifest,
	validateManifestEntryCoherence,
	writeInstallManifest,
	type InstallManifestData,
	type InstallManifestEntryData,
	type InstallManifestFileData,
} from "./provision-manifest.ts";
import {
	buildProvisionPlan,
	classifyProvisionDecisions,
	contentHashForBytes,
	installManifestKey,
	type ProvisionDecisionSet,
	type ProvisionPlan,
	type ProvisionSourceFile,
	type TargetFileHashFact,
} from "./provision-plan.ts";
import { collectTargetHashFactsForPaths, targetFactsEqual } from "./provision-state.ts";

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
	HarnessArtifactProvisionErrorInfo,
	OptionalFileState,
	OptionalTextFileState,
};

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
	const provisionSafety = normalizeHarnessArtifactSafetyInspection({
		inspection: await fs.inspectHarnessArtifactSafety({
			trustedBoundaryRoot,
			expectedTargetRoot: plan.value.targetRoot,
			targetPaths: [
				plan.value.targetArtifactPath,
				...plan.value.files.map((file) => file.targetPath),
				manifestPath,
			],
		}),
		manifestPath,
		installKey,
	});
	if (!provisionSafety.ok) return provisionSafety;
	const manifest = await readInstallManifest(fs, manifestPath);
	if (!manifest.ok) return manifest;
	const existingManifestEntry = manifest.value.artifacts[installKey];
	if (existingManifestEntry !== undefined) {
		const unsafePath = validateManifestEntryCoherence({
			key: installKey,
			entry: existingManifestEntry,
			expectedHarness: plan.value.harness,
			expectedScope: plan.value.scope,
			expectedTargetRoot: plan.value.targetRoot,
		});
		if (unsafePath !== undefined) return unsafeManifestEntry(manifestPath, installKey, unsafePath);
	}
	const targetFacts = await collectTargetHashFactsForPaths({
		fs,
		targetPaths: plan.value.files.map((file) => file.targetPath),
	});
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
		const safety = normalizeHarnessArtifactSafetyInspection({
			inspection: await fs.inspectHarnessArtifactSafety({
				trustedBoundaryRoot,
				expectedTargetRoot: plan.value.targetRoot,
				targetPaths: [
					plan.value.targetArtifactPath,
					...obsoleteFiles.map((file) => file.targetPath),
				],
			}),
			manifestPath,
			installKey,
		});
		if (!safety.ok) return safety;
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
	const conflictingFiles = provisionConflictingFiles(prepared);
	if (conflictingFiles.length > 0 && !options.shouldForce) {
		return resultOk({
			outcome: "conflicted",
			...previewFromPrepared(prepared),
			conflictingFiles,
		});
	}
	const currentManifest = await validatePreparedProvision(prepared);
	if (!currentManifest.ok) return currentManifest;
	const safety = normalizeHarnessArtifactSafetyInspection({
		inspection: await prepared.fs.inspectHarnessArtifactSafety({
			trustedBoundaryRoot: prepared.trustedBoundaryRoot,
			expectedTargetRoot: prepared.plan.targetRoot,
			targetPaths: [
				prepared.plan.targetArtifactPath,
				...prepared.plan.files.map((file) => file.targetPath),
				...prepared.obsoleteFiles.map((file) => file.targetPath),
				prepared.manifestPath,
			],
		}),
		manifestPath: prepared.manifestPath,
		installKey: installManifestKey(prepared.plan),
	});
	if (!safety.ok) return safety;

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

	const manifest = manifestWithProvision(currentManifest.value, prepared.plan);
	const writeManifest = await writeInstallManifest(prepared.fs, prepared.manifestPath, manifest);
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

export function provisionConflictingFiles(
	prepared: PreparedHarnessArtifactProvision,
): readonly string[] {
	return [
		...conflictingFilesFromDecisions(prepared.decisions),
		...prepared.obsoleteFiles.flatMap((file) => {
			const fact = prepared.obsoleteTargetFacts.find((item) => item.targetPath === file.targetPath);
			return fact?.type === "file" && fact.contentHash !== file.contentHash
				? [file.targetPath]
				: [];
		}),
	];
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
