import { readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { skippedDirectoryNames, sourceExtensions } from "./config.ts";

export interface FileDiscoveryOptions {
	readonly root: string;
	readonly shouldIncludeFile: (file: DiscoveredFile) => boolean;
	readonly skippedDirectories?: ReadonlySet<string>;
}

export interface DiscoveredFile {
	readonly name: string;
	readonly path: string;
}

export interface SourceScanShard {
	readonly shardNumber: number;
	readonly totalShards: number;
	readonly paths: readonly string[];
}

export function findFilesUnder(options: FileDiscoveryOptions): readonly string[] {
	const paths: string[] = [];
	collectFilesUnder(options.root, options, paths);
	return paths.sort();
}

export function findTypeScriptSourceFiles(root: string): readonly string[] {
	return findFilesUnder({
		root,
		shouldIncludeFile: (file) => sourceExtensions.has(extname(file.path)),
	});
}

export function findPackageJsonFiles(root: string): readonly string[] {
	return findFilesUnder({
		root,
		shouldIncludeFile: (file) => file.name === "package.json",
	});
}

export function createSourceScanShards(
	root: string,
	shardCount: number,
): readonly SourceScanShard[] {
	const paths = findTypeScriptSourceFiles(root);
	if (paths.length === 0) throw new Error(`No TypeScript sources found under ${root}`);
	return createPathShards(paths, shardCount);
}

export function createPathShards(
	paths: readonly string[],
	shardCount: number,
): readonly SourceScanShard[] {
	const sortedPaths = [...paths].sort();
	const totalShards = Math.min(shardCount, sortedPaths.length);
	const shards: SourceScanShard[] = [];
	for (let shardIndex = 0; shardIndex < totalShards; shardIndex++) {
		shards.push({
			shardNumber: shardIndex + 1,
			totalShards,
			paths: sortedPaths.filter((_, pathIndex) => pathIndex % totalShards === shardIndex),
		});
	}
	return shards;
}

function collectFilesUnder(
	directory: string,
	options: FileDiscoveryOptions,
	paths: string[],
): void {
	const skippedDirectories = options.skippedDirectories ?? skippedDirectoryNames;
	const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
		left.name.localeCompare(right.name),
	);

	for (const entry of entries) {
		const fullPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!skippedDirectories.has(entry.name)) collectFilesUnder(fullPath, options, paths);
			continue;
		}

		if (!entry.isFile()) continue;
		if (options.shouldIncludeFile({ name: entry.name, path: fullPath })) paths.push(fullPath);
	}
}
