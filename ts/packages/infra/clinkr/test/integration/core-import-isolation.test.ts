// Formal clinkr display import boundary: production core and non-display subpaths must stay display-free.
// The root export (`@sdl/clinkr`) plus `raw`, `completion`, and `testing` are non-display surfaces.
// SDL house-style display now lives outside Clinkr in `@sdl/core/cli-theme`; Clinkr's only display-adjacent
// production subpath is `@sdl/clinkr/stream`, the owner of `log-update`. This guard scans production
// source import/export literals directly so future re-exports, side-effect imports, and lazy imports
// cannot silently pull display bytes into non-display consumers.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { fileForReport, literalSpecifierUsesOf, sourceFilesUnder } from "@sdl/clinkr/testing";
import { describe, expect, test } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(TEST_DIR, "../..");
const PACKAGE_JSON = resolve(PACKAGE_DIR, "package.json");
const SRC_DIR = resolve(PACKAGE_DIR, "src");
const STREAM_DIR = resolve(SRC_DIR, "stream");

interface NonDisplayEntrypoint {
	label: string;
	exportPath: string;
	packageTarget: string;
	file: string;
}

interface DisplayDependencyRule {
	packageName: string;
	ownerDir: string;
	ownerLabel: string;
}

interface BoundaryOffender {
	file: string;
	specifier: string;
	reason: string;
}

const NON_DISPLAY_ENTRYPOINTS: readonly NonDisplayEntrypoint[] = [
	{
		label: "@sdl/clinkr",
		exportPath: ".",
		packageTarget: "./src/index.ts",
		file: resolve(SRC_DIR, "index.ts"),
	},
	{
		label: "@sdl/clinkr/completion",
		exportPath: "./completion",
		packageTarget: "./src/completion.ts",
		file: resolve(SRC_DIR, "completion.ts"),
	},
	{
		label: "@sdl/clinkr/raw",
		exportPath: "./raw",
		packageTarget: "./src/raw/index.ts",
		file: resolve(SRC_DIR, "raw/index.ts"),
	},
	{
		label: "@sdl/clinkr/testing",
		exportPath: "./testing",
		packageTarget: "./src/testing/index.ts",
		file: resolve(SRC_DIR, "testing/index.ts"),
	},
];

const DISPLAY_SUBPATHS = ["@sdl/core/cli-theme", "@sdl/clinkr/stream"];
const DISPLAY_DIRS = [STREAM_DIR];
const DISPLAY_DEPENDENCY_RULES: readonly DisplayDependencyRule[] = [
	{ packageName: "log-update", ownerDir: STREAM_DIR, ownerLabel: "src/stream/**" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPackageExports(): Record<string, string> {
	const packageJson: unknown = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
	if (!isRecord(packageJson) || !isRecord(packageJson.exports)) {
		throw new Error("clinkr package.json must define a string exports object");
	}
	const exports: Record<string, string> = {};
	for (const [key, value] of Object.entries(packageJson.exports)) {
		if (typeof value === "string") exports[key] = value;
	}
	return exports;
}

function isRelativeSpecifier(specifier: string): boolean {
	return (
		specifier === "." ||
		specifier === ".." ||
		specifier.startsWith("./") ||
		specifier.startsWith("../")
	);
}

function isPackageOrSubpathSpecifier(specifier: string, packageName: string): boolean {
	return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function isUnderDirectory(file: string, directory: string): boolean {
	return file === directory || file.startsWith(`${directory}${sep}`);
}

function isUnderDisplayDir(file: string): boolean {
	return DISPLAY_DIRS.some((directory) => isUnderDirectory(file, directory));
}

function resolveRelativeTsSourceFile(importingFile: string, specifier: string): string | undefined {
	const target = resolve(dirname(importingFile), specifier);
	const candidates =
		extname(target) === "" ? [`${target}.ts`, resolve(target, "index.ts")] : [target];
	return candidates.find((candidate) => candidate.endsWith(".ts") && isExistingFile(candidate));
}

function isExistingFile(file: string): boolean {
	return existsSync(file) && statSync(file).isFile();
}

function displaySubpathOffender(file: string, specifier: string): BoundaryOffender | undefined {
	const displaySubpath = DISPLAY_SUBPATHS.find((subpath) =>
		isPackageOrSubpathSpecifier(specifier, subpath),
	);
	if (displaySubpath === undefined) return undefined;
	return {
		file: fileForReport(file),
		specifier,
		reason: `non-display production graph must not import opt-in display subpath ${displaySubpath}`,
	};
}

function displayDependencyOffender(file: string, specifier: string): BoundaryOffender | undefined {
	const rule = DISPLAY_DEPENDENCY_RULES.find((candidate) =>
		isPackageOrSubpathSpecifier(specifier, candidate.packageName),
	);
	if (rule === undefined) return undefined;
	return {
		file: fileForReport(file),
		specifier,
		reason: `non-display production graph must not import display dependency ${rule.packageName}`,
	};
}

function relativeDisplayOffender(
	file: string,
	specifier: string,
	resolvedFile: string,
): BoundaryOffender | undefined {
	if (!isUnderDisplayDir(resolvedFile)) return undefined;
	return {
		file: fileForReport(file),
		specifier,
		reason: `non-display production graph must not import display source ${fileForReport(resolvedFile)}`,
	};
}

function nonDisplayGraphOffenders(entrypoint: string): readonly BoundaryOffender[] {
	const offenders: BoundaryOffender[] = [];
	const visited = new Set<string>();
	const queue = [entrypoint];
	while (queue.length > 0) {
		const file = queue.pop();
		if (file === undefined || visited.has(file)) continue;
		visited.add(file);
		const source = readFileSync(file, "utf8");
		for (const { specifier } of literalSpecifierUsesOf(source)) {
			const subpathOffender = displaySubpathOffender(file, specifier);
			if (subpathOffender !== undefined) offenders.push(subpathOffender);
			const dependencyOffender = displayDependencyOffender(file, specifier);
			if (dependencyOffender !== undefined) offenders.push(dependencyOffender);
			if (!isRelativeSpecifier(specifier)) continue;
			const resolvedFile = resolveRelativeTsSourceFile(file, specifier);
			if (resolvedFile === undefined) continue;
			const displayOffender = relativeDisplayOffender(file, specifier, resolvedFile);
			if (displayOffender !== undefined) {
				offenders.push(displayOffender);
				continue;
			}
			if (!visited.has(resolvedFile)) queue.push(resolvedFile);
		}
	}
	return offenders;
}

function productionDisplayDependencyOffenders(): readonly BoundaryOffender[] {
	const offenders: BoundaryOffender[] = [];
	for (const file of sourceFilesUnder(SRC_DIR)) {
		const source = readFileSync(file, "utf8");
		for (const { specifier } of literalSpecifierUsesOf(source)) {
			for (const rule of DISPLAY_DEPENDENCY_RULES) {
				if (!isPackageOrSubpathSpecifier(specifier, rule.packageName)) continue;
				if (isUnderDirectory(file, rule.ownerDir)) continue;
				offenders.push({
					file: fileForReport(file),
					specifier,
					reason: `${rule.packageName} is production-source importable only from ${rule.ownerLabel}`,
				});
			}
		}
	}
	return offenders;
}

function productionCliThemeImportOffenders(): readonly BoundaryOffender[] {
	const offenders: BoundaryOffender[] = [];
	for (const file of sourceFilesUnder(SRC_DIR)) {
		const source = readFileSync(file, "utf8");
		for (const { specifier } of literalSpecifierUsesOf(source)) {
			if (!isPackageOrSubpathSpecifier(specifier, "@sdl/core/cli-theme")) continue;
			offenders.push({
				file: fileForReport(file),
				specifier,
				reason: "Clinkr production source must not import the SDL CLI theme package",
			});
		}
	}
	return offenders;
}

describe("clinkr display import boundary", () => {
	test("literal scanner sees static imports, re-exports, side-effect imports, and dynamic imports", () => {
		const source = `
			import ansis from "ansis";
			import type { Caps } from "./caps.ts";
			import "@sdl/core/cli-theme";
			export { streamSink } from "@sdl/clinkr/stream";
			await import("log-update");
		`;

		expect(literalSpecifierUsesOf(source)).toEqual([
			{ specifier: "ansis", kind: "static-import" },
			{ specifier: "./caps.ts", kind: "static-import" },
			{ specifier: "@sdl/core/cli-theme", kind: "static-import" },
			{ specifier: "@sdl/clinkr/stream", kind: "re-export" },
			{ specifier: "log-update", kind: "dynamic-import" },
		]);
	});

	test("guarded non-display entrypoints still match package exports", () => {
		const packageExports = readPackageExports();
		for (const entrypoint of NON_DISPLAY_ENTRYPOINTS) {
			expect(packageExports[entrypoint.exportPath]).toBe(entrypoint.packageTarget);
			expect(isExistingFile(entrypoint.file)).toBe(true);
		}
		expect(packageExports["./theme"]).toBeUndefined();
		expect(packageExports["./stream"]).toBe("./src/stream/index.ts");
	});

	test("non-display public entrypoint graphs stay display-free", () => {
		const offenders = NON_DISPLAY_ENTRYPOINTS.flatMap((entrypoint) =>
			nonDisplayGraphOffenders(entrypoint.file).map((offender) => ({
				entrypoint: entrypoint.label,
				...offender,
			})),
		);

		expect(offenders).toEqual([]);
	});

	test("display dependencies are imported only from their owning production subpaths", () => {
		expect(productionDisplayDependencyOffenders()).toEqual([]);
	});

	test("clinkr production source does not import the SDL CLI theme package", () => {
		expect(productionCliThemeImportOffenders()).toEqual([]);
	});

	test("core barrel does not directly re-export display subpaths", () => {
		const coreEntrypoint = NON_DISPLAY_ENTRYPOINTS.find(
			(entrypoint) => entrypoint.exportPath === ".",
		);
		if (coreEntrypoint === undefined) throw new Error("missing clinkr core entrypoint guard");
		const directOffenders = literalSpecifierUsesOf(readFileSync(coreEntrypoint.file, "utf8"))
			.map(({ specifier }) => {
				if (!isRelativeSpecifier(specifier))
					return displaySubpathOffender(coreEntrypoint.file, specifier);
				const resolvedFile = resolveRelativeTsSourceFile(coreEntrypoint.file, specifier);
				return resolvedFile === undefined
					? undefined
					: relativeDisplayOffender(coreEntrypoint.file, specifier, resolvedFile);
			})
			.filter((offender): offender is BoundaryOffender => offender !== undefined);

		expect(directOffenders).toEqual([]);
	});
});
