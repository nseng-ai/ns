import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { formatErrorMessage, formatZodIssue, optionalEntry } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

import type { HarnessArtifactEntry } from "./artifact-catalog.ts";
import {
	ALL_HARNESS_IDS,
	HARNESS_SCOPES,
	type HarnessPathContext,
	type HarnessScope,
} from "./harness-paths.ts";
import { sortStrings } from "./sort.ts";
import {
	buildInstallManifestData,
	buildInstallManifestEntry,
	buildProvisionPlan,
	classifyProvisionDecisions,
	contentHashForBytes,
	installManifestKey,
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
	sourceRoot: string;
	fs: HarnessArtifactFileSystemGateway;
}

export interface ApplyPreparedProvisionOptions {
	force: boolean;
}

export interface HarnessArtifactProvisionApplyResult extends HarnessArtifactProvisionPreview {
	manifest: InstallManifestData;
	writtenFiles: readonly string[];
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

export interface HarnessArtifactFileSystemGateway {
	listFiles(
		rootPath: string,
	): Promise<Result<readonly string[], HarnessArtifactFileSystemErrorInfo>>;
	readOptionalFile(
		path: string,
	): Promise<Result<OptionalFileState, HarnessArtifactFileSystemErrorInfo>>;
	writeFile(
		path: string,
		bytes: Uint8Array,
	): Promise<Result<void, HarnessArtifactFileSystemErrorInfo>>;
	readOptionalTextFile(
		path: string,
	): Promise<Result<OptionalTextFileState, HarnessArtifactFileSystemErrorInfo>>;
	writeTextFile(
		path: string,
		text: string,
	): Promise<Result<void, HarnessArtifactFileSystemErrorInfo>>;
}

export type OptionalFileState = { type: "missing" } | { type: "file"; bytes: Uint8Array };
export type OptionalTextFileState = { type: "missing" } | { type: "file"; text: string };

export interface HarnessArtifactFileSystemErrorInfo {
	code: "filesystem_error";
	message: string;
	details: { path: string; operation: "list" | "read" | "write" };
}

export type HarnessArtifactProvisionErrorInfo =
	| ProvisionPlanErrorInfo
	| ProvisionDecisionErrorInfo
	| HarnessArtifactFileSystemErrorInfo
	| {
			code: "invalid_install_manifest";
			message: string;
			details: { manifestPath: string };
	  };

const installManifestSourceSchema: z.ZodType<InstallManifestSourceData> = z.object({
	type: z.enum(["first-party", "npm-module"]),
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
	harness: z.enum(ALL_HARNESS_IDS),
	scope: z.enum(HARNESS_SCOPES),
	targetRoot: z.string(),
	targetArtifactPath: z.string(),
	source: installManifestSourceSchema,
	files: z.record(z.string(), installManifestFileSchema),
});

const installManifestSchema: z.ZodType<InstallManifestData> = z.object({
	version: z.literal(1),
	artifacts: z.record(z.string(), installManifestEntrySchema),
});

export const nodeHarnessArtifactFileSystemGateway: HarnessArtifactFileSystemGateway = {
	async listFiles(rootPath) {
		try {
			return resultOk(await listFiles(rootPath));
		} catch (error) {
			return resultErr(fileSystemError(rootPath, "list", error));
		}
	},
	async readOptionalFile(path) {
		try {
			return resultOk({ type: "file", bytes: await readFile(path) });
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk({ type: "missing" });
			return resultErr(fileSystemError(path, "read", error));
		}
	},
	async writeFile(path, bytes) {
		try {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, bytes);
			return resultOk(undefined);
		} catch (error) {
			return resultErr(fileSystemError(path, "write", error));
		}
	},
	async readOptionalTextFile(path) {
		try {
			return resultOk({ type: "file", text: await readFile(path, "utf8") });
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk({ type: "missing" });
			return resultErr(fileSystemError(path, "read", error));
		}
	},
	async writeTextFile(path, text) {
		try {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, text, "utf8");
			return resultOk(undefined);
		} catch (error) {
			return resultErr(fileSystemError(path, "write", error));
		}
	},
};

export async function previewHarnessArtifactProvision(
	request: HarnessArtifactProvisionRequest,
): Promise<Result<HarnessArtifactProvisionPreview, HarnessArtifactProvisionErrorInfo>> {
	const prepared = await prepareProvision(request);
	if (!prepared.ok) return prepared;
	return resultOk(previewFromPrepared(prepared.value));
}

export async function applyHarnessArtifactProvision(
	request: HarnessArtifactProvisionRequest,
): Promise<Result<HarnessArtifactProvisionApplyOutcome, HarnessArtifactProvisionErrorInfo>> {
	const prepared = await prepareProvision(request);
	if (!prepared.ok) return prepared;
	return applyPreparedProvision(prepared.value, { force: false });
}

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
		sourceFiles: sourceFiles.value,
	});
	if (!plan.ok) return plan;

	const manifestPath = installManifestPathForPlan(plan.value);
	const manifest = await readInstallManifest(fs, manifestPath);
	if (!manifest.ok) return manifest;
	const targetFacts = await collectTargetHashFacts({ fs, plan: plan.value });
	if (!targetFacts.ok) return targetFacts;
	const existingManifestEntry = manifest.value.artifacts[installManifestKey(plan.value)];
	const decisions = classifyProvisionDecisions({
		plan: plan.value,
		...optionalEntry("existingManifestEntry", existingManifestEntry),
		targetFacts: targetFacts.value,
	});
	if (!decisions.ok) return decisions;

	return resultOk({
		plan: plan.value,
		decisions: decisions.value,
		manifestPath,
		manifest: manifest.value,
		sourceRoot: request.sourceRoot,
		fs,
	});
}

export async function applyPreparedProvision(
	prepared: PreparedHarnessArtifactProvision,
	options: ApplyPreparedProvisionOptions,
): Promise<Result<HarnessArtifactProvisionApplyOutcome, HarnessArtifactProvisionErrorInfo>> {
	const conflicts = prepared.decisions.files.filter(
		(decision) => decision.type === "locally-edited-conflict",
	);
	if (conflicts.length > 0 && !options.force) {
		return resultOk({
			outcome: "conflicted",
			...previewFromPrepared(prepared),
			conflictingFiles: conflicts.map((decision) => decision.file.targetPath),
		});
	}

	const writtenFiles: string[] = [];
	for (const decision of prepared.decisions.files) {
		if (decision.type === "unchanged") continue;
		const sourcePath = join(prepared.sourceRoot, decision.file.sourcePath);
		const source = await readRequiredFile(prepared.fs, sourcePath);
		if (!source.ok) return source;
		const write = await prepared.fs.writeFile(decision.file.targetPath, source.value);
		if (!write.ok) return write;
		writtenFiles.push(decision.file.targetPath);
	}

	const manifest = updateManifest(prepared.manifest, prepared.plan);
	const writeManifest = await prepared.fs.writeTextFile(
		prepared.manifestPath,
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	if (!writeManifest.ok) return writeManifest;

	return resultOk({
		outcome: "applied",
		plan: prepared.plan,
		decisions: prepared.decisions,
		manifestPath: prepared.manifestPath,
		manifest,
		writtenFiles,
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

function previewFromPrepared(
	prepared: PreparedHarnessArtifactProvision,
): HarnessArtifactProvisionPreview {
	return {
		plan: prepared.plan,
		decisions: prepared.decisions,
		manifestPath: prepared.manifestPath,
	};
}

async function collectSourceFiles(input: {
	fs: HarnessArtifactFileSystemGateway;
	sourceRoot: string;
	sourceRelativePath: string;
}): Promise<Result<readonly ProvisionSourceFile[], HarnessArtifactProvisionErrorInfo>> {
	const sourceDirectory = join(input.sourceRoot, input.sourceRelativePath);
	const relativePaths = await input.fs.listFiles(sourceDirectory);
	if (!relativePaths.ok) return relativePaths;
	const sourceFiles: ProvisionSourceFile[] = [];
	for (const relativePath of relativePaths.value) {
		const sourcePath = join(sourceDirectory, relativePath);
		const source = await readRequiredFile(input.fs, sourcePath);
		if (!source.ok) return source;
		sourceFiles.push({ relativePath, contentHash: contentHashForBytes(source.value) });
	}
	return resultOk(sourceFiles);
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
	const facts: TargetFileHashFact[] = [];
	for (const file of input.plan.files) {
		const target = await input.fs.readOptionalFile(file.targetPath);
		if (!target.ok) return target;
		if (target.value.type === "missing") {
			facts.push({ type: "missing", targetPath: file.targetPath });
		} else {
			facts.push({
				type: "file",
				targetPath: file.targetPath,
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

async function listFiles(rootPath: string): Promise<readonly string[]> {
	return sortStrings(await walkFiles(rootPath, ""));
}

async function walkFiles(rootPath: string, relativePath: string): Promise<readonly string[]> {
	const directory = relativePath === "" ? rootPath : join(rootPath, relativePath);
	const entries = await readdir(directory, { withFileTypes: true });
	const output: string[] = [];
	for (const entry of entries) {
		const entryRelativePath = relativePath === "" ? entry.name : join(relativePath, entry.name);
		if (entry.isDirectory()) {
			output.push(...(await walkFiles(rootPath, entryRelativePath)));
		} else if (entry.isFile()) {
			output.push(entryRelativePath);
		} else {
			throw new Error(`Unsupported non-file source path: ${join(rootPath, entryRelativePath)}`);
		}
	}
	return output;
}

function fileSystemError(
	path: string,
	operation: HarnessArtifactFileSystemErrorInfo["details"]["operation"],
	error: unknown,
): HarnessArtifactFileSystemErrorInfo {
	return {
		code: "filesystem_error",
		message: `Filesystem ${operation} failed for ${path}: ${formatErrorMessage(error)}`,
		details: { path, operation },
	};
}

function isNodeErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
