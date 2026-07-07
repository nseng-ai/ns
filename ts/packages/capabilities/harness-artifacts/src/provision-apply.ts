import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { formatErrorMessage, formatZodIssue } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

import type { HarnessArtifactEntry } from "./artifact-catalog.ts";
import type { HarnessPathContext, HarnessScope } from "./harness-paths.ts";
import { sortStrings } from "./sort.ts";
import {
	buildInstallManifestData,
	buildInstallManifestEntry,
	buildProvisionPlan,
	classifyProvisionDecisions,
	contentHashForText,
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

export interface ApplyHarnessArtifactProvisionRequest extends HarnessArtifactProvisionRequest {
	force?: boolean;
}

export interface HarnessArtifactProvisionPreview {
	plan: ProvisionPlan;
	decisions: ProvisionDecisionSet;
	manifestPath: string;
}

export interface HarnessArtifactProvisionApplyResult extends HarnessArtifactProvisionPreview {
	manifest: InstallManifestData;
	writtenFiles: readonly string[];
}

export interface HarnessArtifactFileSystemGateway {
	listTextFiles(
		rootPath: string,
	): Promise<Result<readonly string[], HarnessArtifactFileSystemErrorInfo>>;
	readOptionalTextFile(
		path: string,
	): Promise<Result<OptionalTextFileState, HarnessArtifactFileSystemErrorInfo>>;
	writeTextFile(
		path: string,
		text: string,
	): Promise<Result<void, HarnessArtifactFileSystemErrorInfo>>;
}

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
	  }
	| {
			code: "locally_edited_conflict";
			message: string;
			details: { manifestPath: string; conflictingFiles: readonly string[] };
	  };

const installManifestSourceSchema: z.ZodType<InstallManifestSourceData> = z.object({
	type: z.literal("first-party"),
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
	harness: z.enum(["claude-code", "codex", "pi"]),
	scope: z.enum(["project", "user"]),
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
	async listTextFiles(rootPath) {
		try {
			return resultOk(await listTextFiles(rootPath));
		} catch (error) {
			return resultErr(fileSystemError(rootPath, "list", error));
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
	const fs = request.fs ?? nodeHarnessArtifactFileSystemGateway;
	const prepared = await prepareProvision(request, fs);
	if (!prepared.ok) return prepared;
	return resultOk({
		plan: prepared.value.plan,
		decisions: prepared.value.decisions,
		manifestPath: prepared.value.manifestPath,
	});
}

export async function applyHarnessArtifactProvision(
	request: ApplyHarnessArtifactProvisionRequest,
): Promise<Result<HarnessArtifactProvisionApplyResult, HarnessArtifactProvisionErrorInfo>> {
	const fs = request.fs ?? nodeHarnessArtifactFileSystemGateway;
	const prepared = await prepareProvision(request, fs);
	if (!prepared.ok) return prepared;

	const conflicts = prepared.value.decisions.files.filter(
		(decision) => decision.type === "locally-edited-conflict",
	);
	if (conflicts.length > 0 && request.force !== true) {
		const conflictingFiles = conflicts.map((decision) => decision.file.targetPath);
		return resultErr({
			code: "locally_edited_conflict",
			message: `Refusing to provision ${prepared.value.plan.artifactId}; ${conflictingFiles.length} target file(s) have local edits. Re-run with force to overwrite them.`,
			details: { manifestPath: prepared.value.manifestPath, conflictingFiles },
		});
	}

	const writtenFiles: string[] = [];
	for (const decision of prepared.value.decisions.files) {
		if (decision.type === "unchanged") continue;
		const sourcePath = join(request.sourceRoot, decision.file.sourcePath);
		const source = await fs.readOptionalTextFile(sourcePath);
		if (!source.ok) return source;
		if (source.value.type === "missing") {
			return resultErr(fileSystemError(sourcePath, "read", new Error("Source file is missing.")));
		}
		const write = await fs.writeTextFile(decision.file.targetPath, source.value.text);
		if (!write.ok) return write;
		writtenFiles.push(decision.file.targetPath);
	}

	const manifest = updateManifest(prepared.value.manifest, prepared.value.plan);
	const writeManifest = await fs.writeTextFile(
		prepared.value.manifestPath,
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	if (!writeManifest.ok) return writeManifest;

	return resultOk({
		plan: prepared.value.plan,
		decisions: prepared.value.decisions,
		manifestPath: prepared.value.manifestPath,
		manifest,
		writtenFiles,
	});
}

export function installManifestPathForPlan(plan: ProvisionPlan): string {
	return join(plan.targetRoot, INSTALL_MANIFEST_FILE_NAME);
}

interface PreparedProvision {
	plan: ProvisionPlan;
	decisions: ProvisionDecisionSet;
	manifestPath: string;
	manifest: InstallManifestData;
}

async function prepareProvision(
	request: HarnessArtifactProvisionRequest,
	fs: HarnessArtifactFileSystemGateway,
): Promise<Result<PreparedProvision, HarnessArtifactProvisionErrorInfo>> {
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
		...(existingManifestEntry === undefined ? {} : { existingManifestEntry }),
		targetFacts: targetFacts.value,
	});
	if (!decisions.ok) return decisions;

	return resultOk({
		plan: plan.value,
		decisions: decisions.value,
		manifestPath,
		manifest: manifest.value,
	});
}

async function collectSourceFiles(input: {
	fs: HarnessArtifactFileSystemGateway;
	sourceRoot: string;
	sourceRelativePath: string;
}): Promise<Result<readonly ProvisionSourceFile[], HarnessArtifactProvisionErrorInfo>> {
	const sourceDirectory = join(input.sourceRoot, input.sourceRelativePath);
	const relativePaths = await input.fs.listTextFiles(sourceDirectory);
	if (!relativePaths.ok) return relativePaths;
	const sourceFiles: ProvisionSourceFile[] = [];
	for (const relativePath of relativePaths.value) {
		const sourcePath = join(sourceDirectory, relativePath);
		const source = await input.fs.readOptionalTextFile(sourcePath);
		if (!source.ok) return source;
		if (source.value.type === "missing") {
			return resultErr(fileSystemError(sourcePath, "read", new Error("Source file is missing.")));
		}
		sourceFiles.push({ relativePath, contentHash: contentHashForText(source.value.text) });
	}
	return resultOk(sourceFiles);
}

async function collectTargetHashFacts(input: {
	fs: HarnessArtifactFileSystemGateway;
	plan: ProvisionPlan;
}): Promise<Result<readonly TargetFileHashFact[], HarnessArtifactProvisionErrorInfo>> {
	const facts: TargetFileHashFact[] = [];
	for (const file of input.plan.files) {
		const target = await input.fs.readOptionalTextFile(file.targetPath);
		if (!target.ok) return target;
		if (target.value.type === "missing") {
			facts.push({ type: "missing", targetPath: file.targetPath });
		} else {
			facts.push({
				type: "file",
				targetPath: file.targetPath,
				contentHash: contentHashForText(target.value.text),
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

async function listTextFiles(rootPath: string): Promise<readonly string[]> {
	const output: string[] = [];
	await walkTextFiles(rootPath, "", output);
	return sortStrings(output);
}

async function walkTextFiles(
	rootPath: string,
	relativePath: string,
	output: string[],
): Promise<void> {
	const directory = relativePath === "" ? rootPath : join(rootPath, relativePath);
	const entries = await readdir(directory, { withFileTypes: true });
	for (const entry of entries) {
		const entryRelativePath = relativePath === "" ? entry.name : join(relativePath, entry.name);
		if (entry.isDirectory()) {
			await walkTextFiles(rootPath, entryRelativePath, output);
		} else if (entry.isFile()) {
			output.push(entryRelativePath);
		} else {
			throw new Error(`Unsupported non-file source path: ${join(rootPath, entryRelativePath)}`);
		}
	}
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
