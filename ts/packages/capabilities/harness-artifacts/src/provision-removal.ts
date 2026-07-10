import { join, resolve } from "node:path";

import { resultOk, type Result } from "@nseng-ai/foundation/result";

import type { HarnessArtifactFileSystemGateway } from "./filesystem.ts";
import {
	normalizeHarnessArtifactSafetyInspection,
	stalePreparation,
	unsafeManifestEntry,
	type HarnessArtifactProvisionErrorInfo,
} from "./provision-errors.ts";
import {
	INSTALL_MANIFEST_FILE_NAME,
	manifestEntriesEqual,
	manifestWithoutEntry,
	readInstallManifest,
	validateManifestEntryCoherence,
	writeInstallManifest,
	type InstallManifestEntryData,
} from "./provision-manifest.ts";
import type { TargetFileHashFact } from "./provision-plan.ts";
import { collectTargetHashFactsForPaths, targetFactsEqual } from "./provision-state.ts";

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
			: validateManifestEntryCoherence({ ...input, expectedScope: "project" });
	if (unsafePath !== undefined) {
		return unsafeManifestEntry(input.manifestPath, input.key, unsafePath);
	}
	const files = Object.values(input.entry.files);
	const safety = normalizeHarnessArtifactSafetyInspection({
		inspection: await input.fs.inspectHarnessArtifactSafety({
			trustedBoundaryRoot: input.trustedBoundaryRoot,
			expectedTargetRoot: input.expectedTargetRoot,
			targetPaths: [input.entry.targetArtifactPath, ...files.map((file) => file.targetPath)],
		}),
		manifestPath: input.manifestPath,
		installKey: input.key,
	});
	if (!safety.ok) return safety;
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
	const safety = normalizeHarnessArtifactSafetyInspection({
		inspection: await prepared.fs.inspectHarnessArtifactSafety({
			trustedBoundaryRoot: prepared.trustedBoundaryRoot,
			expectedTargetRoot: prepared.entry.targetRoot,
			targetPaths: [
				prepared.entry.targetArtifactPath,
				...Object.values(prepared.entry.files).map((file) => file.targetPath),
			],
		}),
		manifestPath: prepared.manifestPath,
		installKey: prepared.key,
	});
	if (!safety.ok) return safety;
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
	const written = await writeInstallManifest(
		prepared.fs,
		prepared.manifestPath,
		manifestWithoutEntry(manifest.value, prepared.key),
	);
	if (!written.ok) return written;
	const removedDirectory = await prepared.fs.removeEmptyDirectory(
		prepared.entry.targetArtifactPath,
	);
	if (!removedDirectory.ok) return removedDirectory;
	return resultOk(removedFiles);
}
