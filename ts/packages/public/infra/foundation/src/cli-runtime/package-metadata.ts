import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

export type CliRuntime = "typescript" | "bun";

export interface CliPackageMetadata {
	readonly packageName: string;
	readonly packagePath: string;
	readonly binName: string;
	readonly binPath: string;
	readonly version: string;
}

const packageJsonSchema = z.object({
	name: z.string(),
	version: z.string(),
	bin: z.record(z.string(), z.string()).optional(),
});

export function readCliPackageMetadata(metaUrl: string): CliPackageMetadata {
	const packageJsonPath = findNearestPackageJson(dirname(fileURLToPath(metaUrl)));
	let rawPackageJson: unknown;
	try {
		rawPackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	} catch (error) {
		throw new Error(`Unable to read CLI package metadata from ${packageJsonPath}`, {
			cause: error,
		});
	}
	const parsed = packageJsonSchema.safeParse(rawPackageJson);
	if (!parsed.success) {
		throw new Error(
			`Invalid CLI package metadata in ${packageJsonPath}: ${parsed.error.issues.map(formatZodIssue).join("; ")}`,
		);
	}
	const binEntries = Object.entries(parsed.data.bin ?? {});
	if (binEntries.length > 1) {
		throw new Error(
			`Invalid CLI package metadata in ${packageJsonPath}: expected at most one bin entry, found ${binEntries.length}`,
		);
	}
	const [binEntry] = binEntries;
	const [binName, binPath] =
		binEntry === undefined
			? [cliNameFromPackageName(parsed.data.name), "(no package bin)"]
			: [binEntry[0], normalizeBinPathForDisplay(binEntry[1])];
	return {
		packageName: parsed.data.name,
		packagePath: packagePathForDisplay(packageJsonPath),
		binName,
		binPath,
		version: parsed.data.version,
	};
}

export function createCliRuntimeInfo(
	runtime: CliRuntime,
	metadata: CliPackageMetadata,
): () => string {
	return () =>
		`runtime: ${runtime}\nentry_point: ${metadata.packageName} bin ${metadata.binName} -> ts/${metadata.packagePath}/${metadata.binPath}\n`;
}

function findNearestPackageJson(startDir: string): string {
	let candidate = startDir;
	while (true) {
		const packageJsonPath = resolve(candidate, "package.json");
		if (existsSync(packageJsonPath)) return packageJsonPath;
		const parent = dirname(candidate);
		if (parent === candidate) return resolve(startDir, "..", "package.json");
		candidate = parent;
	}
}

function packagePathForDisplay(packageJsonPath: string): string {
	const packageDir = dirname(packageJsonPath);
	let candidate = packageDir;
	while (basename(candidate) !== "packages") {
		const parent = dirname(candidate);
		if (parent === candidate) return `packages/${basename(packageDir)}`;
		candidate = parent;
	}
	return relative(dirname(candidate), packageDir);
}

function normalizeBinPathForDisplay(binPath: string): string {
	return binPath.startsWith("./") ? binPath.slice(2) : binPath;
}

function cliNameFromPackageName(packageName: string): string {
	return packageName.split("/").at(-1) ?? packageName;
}

function formatZodIssue(issue: z.core.$ZodIssue): string {
	const path = issue.path.length === 0 ? "(root)" : issue.path.join(".");
	return `${path}: ${issue.message}`;
}
