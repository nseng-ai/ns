import { join } from "node:path";

import { formatErrorMessage, formatZodIssue } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

import {
	nodeHarnessArtifactFileSystemGateway,
	type HarnessArtifactFileSystemGateway,
} from "./filesystem.ts";
import {
	harnessArtifactSourceTypeSchema,
	harnessIdSchema,
	harnessScopeSchema,
} from "./harness-artifact-schemas.ts";
import type { HarnessArtifactProvisionErrorInfo } from "./provision-errors.ts";
import {
	installManifestKey,
	provisionIdentityKey,
	type ProvisionPlan,
	type ProvisionSourceProvenance,
} from "./provision-plan.ts";

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
	harness: ProvisionPlan["harness"];
	scope: ProvisionPlan["scope"];
	targetRoot: string;
	targetArtifactPath: string;
	source: InstallManifestSourceData;
	files: Record<string, InstallManifestFileData>;
}

export interface InstallManifestData {
	version: 1;
	artifacts: Record<string, InstallManifestEntryData>;
}

export const INSTALL_MANIFEST_FILE_NAME = ".ns-harness-artifacts-manifest.json";

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

export async function readInstallManifest(
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

export async function writeInstallManifest(
	fs: HarnessArtifactFileSystemGateway,
	manifestPath: string,
	manifest: InstallManifestData,
): Promise<Result<void, HarnessArtifactProvisionErrorInfo>> {
	return fs.writeTextFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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
		provisionIdentityKey(left).localeCompare(provisionIdentityKey(right)),
	);
	for (const entry of sortedEntries) {
		artifacts[provisionIdentityKey(entry)] = entry;
	}
	return { version: 1, artifacts };
}

export function manifestEntriesEqual(
	left: InstallManifestEntryData | undefined,
	right: InstallManifestEntryData | undefined,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function manifestWithProvision(
	manifest: InstallManifestData,
	plan: ProvisionPlan,
): InstallManifestData {
	const nextEntry = buildInstallManifestEntry(plan);
	const nextKey = installManifestKey(plan);
	const entries = Object.entries(manifest.artifacts)
		.filter(([key]) => key !== nextKey)
		.map(([, entry]) => entry);
	return buildInstallManifestData([...entries, nextEntry]);
}

export function manifestWithoutEntry(
	manifest: InstallManifestData,
	keyToRemove: string,
): InstallManifestData {
	return buildInstallManifestData(
		Object.entries(manifest.artifacts)
			.filter(([key]) => key !== keyToRemove)
			.map(([, entry]) => entry),
	);
}
