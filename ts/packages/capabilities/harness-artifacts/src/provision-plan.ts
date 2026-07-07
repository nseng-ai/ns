import { join } from "node:path";

import { optionalEntry, sha256Digest } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";

import {
	artifactProvisionName,
	type HarnessArtifactEntry,
	type FirstPartyHarnessArtifactSource,
} from "./artifact-catalog.ts";
import {
	resolveHarnessArtifactPath,
	type HarnessId,
	type HarnessPathContext,
	type HarnessScope,
} from "./harness-paths.ts";
import { sortStrings } from "./sort.ts";

export type ProvisionableHarnessArtifactEntry = Extract<HarnessArtifactEntry, { kind: "skill" }>;

export interface ProvisionSourceFile {
	relativePath: string;
	contentHash: string;
}

export interface BuildProvisionPlanInput {
	artifact: HarnessArtifactEntry;
	harness: string;
	scope: HarnessScope;
	context: HarnessPathContext;
	sourceVersion: string;
	sourceFiles: readonly ProvisionSourceFile[];
}

export interface ProvisionSourceProvenance {
	type: "first-party";
	packageName: string;
	relativePath: string;
	version: string;
}

export interface ProvisionPlanFile {
	relativePath: string;
	sourcePath: string;
	targetPath: string;
	contentHash: string;
}

export interface ProvisionPlan {
	artifactId: string;
	kind: "skill";
	provisionName: string;
	harness: HarnessId;
	scope: HarnessScope;
	targetRoot: string;
	targetArtifactPath: string;
	source: ProvisionSourceProvenance;
	files: readonly ProvisionPlanFile[];
}

export type ProvisionPlanErrorInfo =
	| {
			code: "unsupported_artifact_kind";
			message: string;
			details: { kind: HarnessArtifactEntry["kind"]; artifactId: string };
	  }
	| {
			code: "duplicate_source_file";
			message: string;
			details: { relativePath: string };
	  }
	| {
			code: "unknown_harness";
			message: string;
			details: { input: string };
	  };

export interface InstallManifestFileData {
	sourcePath: string;
	targetPath: string;
	contentHash: string;
}

export type InstallManifestSourceData = ProvisionSourceProvenance;

export interface InstallManifestEntryData {
	artifactId: string;
	kind: "skill";
	provisionName: string;
	harness: HarnessId;
	scope: HarnessScope;
	targetRoot: string;
	targetArtifactPath: string;
	source: InstallManifestSourceData;
	files: Record<string, InstallManifestFileData>;
}

export interface InstallManifestData {
	version: 1;
	artifacts: Record<string, InstallManifestEntryData>;
}

export type TargetFileHashFact =
	| { type: "missing"; targetPath: string }
	| { type: "file"; targetPath: string; contentHash: string };

export type ProvisionFileDecisionType = "fresh-write" | "unchanged" | "locally-edited-conflict";

export interface ProvisionFileDecision {
	type: ProvisionFileDecisionType;
	file: ProvisionPlanFile;
	currentHash?: string;
	manifestHash?: string;
}

export interface ProvisionDecisionSet {
	files: readonly ProvisionFileDecision[];
	shouldForce: boolean;
}

export type ProvisionDecisionErrorInfo =
	| {
			code: "duplicate_target_hash_fact";
			message: string;
			details: { targetPath: string };
	  }
	| {
			code: "target_hash_fact_missing";
			message: string;
			details: { targetPath: string };
	  }
	| {
			code: "manifest_entry_mismatch";
			message: string;
			details: { installKey: string };
	  };

export function contentHashForText(text: string): string {
	return sha256Digest(text);
}

export function buildProvisionPlan(
	input: BuildProvisionPlanInput,
): Result<ProvisionPlan, ProvisionPlanErrorInfo> {
	if (input.artifact.kind !== "skill") {
		return resultErr({
			code: "unsupported_artifact_kind",
			message: `Only skill harness artifacts can be provisioned by this steelthread planner; ${input.artifact.kind} is model-only for now.`,
			details: { kind: input.artifact.kind, artifactId: input.artifact.id },
		});
	}

	const resolvedPath = resolveHarnessArtifactPath({
		harness: input.harness,
		scope: input.scope,
		kind: input.artifact.kind,
		artifactName: artifactProvisionName(input.artifact),
		context: input.context,
	});
	if (!resolvedPath.ok) {
		if (resolvedPath.error.code === "unknown_harness") return resultErr(resolvedPath.error);
		return resultErr({
			code: "unsupported_artifact_kind",
			message: resolvedPath.error.message,
			details: { kind: input.artifact.kind, artifactId: input.artifact.id },
		});
	}

	const sortedRelativePaths = sortStrings(input.sourceFiles.map((file) => file.relativePath));
	const seenRelativePaths = new Set<string>();
	const files: ProvisionPlanFile[] = [];
	for (const relativePath of sortedRelativePaths) {
		if (seenRelativePaths.has(relativePath)) {
			return resultErr({
				code: "duplicate_source_file",
				message: `Provision source file ${JSON.stringify(relativePath)} appears more than once.`,
				details: { relativePath },
			});
		}
		seenRelativePaths.add(relativePath);
		const sourceFile = input.sourceFiles.find((file) => file.relativePath === relativePath);
		if (sourceFile === undefined) continue;
		files.push({
			relativePath,
			sourcePath: join(input.artifact.source.relativePath, relativePath),
			targetPath: join(resolvedPath.value.artifactPath, relativePath),
			contentHash: sourceFile.contentHash,
		});
	}

	return resultOk({
		artifactId: input.artifact.id,
		kind: input.artifact.kind,
		provisionName: input.artifact.skillName,
		harness: resolvedPath.value.harness,
		scope: input.scope,
		targetRoot: resolvedPath.value.rootPath,
		targetArtifactPath: resolvedPath.value.artifactPath,
		source: sourceProvenance(input.artifact.source, input.sourceVersion),
		files,
	});
}

export function installManifestKey(plan: ProvisionPlan): string {
	return provisionIdentityKey(plan);
}

export function buildInstallManifestEntry(plan: ProvisionPlan): InstallManifestEntryData {
	const files: Record<string, InstallManifestFileData> = {};
	for (const file of plan.files) {
		files[file.relativePath] = {
			sourcePath: file.sourcePath,
			targetPath: file.targetPath,
			contentHash: file.contentHash,
		};
	}
	return {
		artifactId: plan.artifactId,
		kind: plan.kind,
		provisionName: plan.provisionName,
		harness: plan.harness,
		scope: plan.scope,
		targetRoot: plan.targetRoot,
		targetArtifactPath: plan.targetArtifactPath,
		source: plan.source,
		files,
	};
}

export function buildInstallManifestData(
	entries: readonly InstallManifestEntryData[],
): InstallManifestData {
	const artifacts: Record<string, InstallManifestEntryData> = {};
	const sortedEntries = [...entries].sort((left, right) =>
		manifestEntryKey(left).localeCompare(manifestEntryKey(right)),
	);
	for (const entry of sortedEntries) {
		artifacts[manifestEntryKey(entry)] = entry;
	}
	return { version: 1, artifacts };
}

export function classifyProvisionDecisions(input: {
	plan: ProvisionPlan;
	existingManifestEntry?: InstallManifestEntryData;
	targetFacts: readonly TargetFileHashFact[];
}): Result<ProvisionDecisionSet, ProvisionDecisionErrorInfo> {
	if (
		input.existingManifestEntry !== undefined &&
		!manifestEntryMatchesPlan(input.existingManifestEntry, input.plan)
	) {
		return resultErr({
			code: "manifest_entry_mismatch",
			message: `Install manifest entry does not match plan ${installManifestKey(input.plan)}.`,
			details: { installKey: installManifestKey(input.plan) },
		});
	}

	const facts = new Map<string, TargetFileHashFact>();
	for (const fact of input.targetFacts) {
		if (facts.has(fact.targetPath)) {
			return resultErr({
				code: "duplicate_target_hash_fact",
				message: `Target hash fact for ${JSON.stringify(fact.targetPath)} appears more than once.`,
				details: { targetPath: fact.targetPath },
			});
		}
		facts.set(fact.targetPath, fact);
	}

	const decisions: ProvisionFileDecision[] = [];
	for (const file of input.plan.files) {
		const fact = facts.get(file.targetPath);
		if (fact === undefined) {
			return resultErr({
				code: "target_hash_fact_missing",
				message: `No target hash fact was supplied for ${JSON.stringify(file.targetPath)}.`,
				details: { targetPath: file.targetPath },
			});
		}
		const manifestHash = input.existingManifestEntry?.files[file.relativePath]?.contentHash;
		decisions.push(classifyProvisionFile({ file, fact, manifestHash }));
	}

	return resultOk({
		files: decisions,
		shouldForce: decisions.some((decision) => decision.type === "locally-edited-conflict"),
	});
}

function sourceProvenance(
	source: FirstPartyHarnessArtifactSource,
	version: string,
): ProvisionSourceProvenance {
	return {
		type: source.type,
		packageName: source.packageName,
		relativePath: source.relativePath,
		version,
	};
}

function manifestEntryKey(entry: InstallManifestEntryData): string {
	return provisionIdentityKey(entry);
}

function provisionIdentityKey(
	identity: Pick<ProvisionPlan, "artifactId" | "harness" | "kind" | "scope">,
): string {
	return `${identity.harness}:${identity.scope}:${identity.kind}:${identity.artifactId}`;
}

function manifestEntryMatchesPlan(entry: InstallManifestEntryData, plan: ProvisionPlan): boolean {
	return (
		entry.artifactId === plan.artifactId &&
		entry.kind === plan.kind &&
		entry.provisionName === plan.provisionName &&
		entry.harness === plan.harness &&
		entry.scope === plan.scope &&
		entry.targetRoot === plan.targetRoot &&
		entry.targetArtifactPath === plan.targetArtifactPath
	);
}

function classifyProvisionFile(input: {
	file: ProvisionPlanFile;
	fact: TargetFileHashFact;
	manifestHash: string | undefined;
}): ProvisionFileDecision {
	if (input.fact.type === "missing") return { type: "fresh-write", file: input.file };
	if (input.fact.contentHash === input.file.contentHash) {
		return provisionFileDecisionWithHash({
			type: "unchanged",
			file: input.file,
			currentHash: input.fact.contentHash,
			manifestHash: input.manifestHash,
		});
	}
	if (input.manifestHash !== undefined && input.fact.contentHash === input.manifestHash) {
		return {
			type: "fresh-write",
			file: input.file,
			currentHash: input.fact.contentHash,
			manifestHash: input.manifestHash,
		};
	}
	return provisionFileDecisionWithHash({
		type: "locally-edited-conflict",
		file: input.file,
		currentHash: input.fact.contentHash,
		manifestHash: input.manifestHash,
	});
}

function provisionFileDecisionWithHash(input: {
	type: Extract<ProvisionFileDecisionType, "unchanged" | "locally-edited-conflict">;
	file: ProvisionPlanFile;
	currentHash: string;
	manifestHash: string | undefined;
}): ProvisionFileDecision {
	return {
		type: input.type,
		file: input.file,
		currentHash: input.currentHash,
		...optionalEntry("manifestHash", input.manifestHash),
	};
}
