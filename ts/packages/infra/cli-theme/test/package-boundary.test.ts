import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(TEST_DIR, "..");
const SRC_DIR = resolve(PACKAGE_DIR, "src");

interface ImportOffender {
	file: string;
	specifier: string;
	reason: string;
}

function sourceFilesUnder(directory: string): readonly string[] {
	const files: string[] = [];
	const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
		left.name.localeCompare(right.name),
	);
	for (const entry of entries) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFilesUnder(path));
		if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path);
	}
	return files;
}

function literalSpecifiersOf(source: string): readonly string[] {
	const specifiers: string[] = [];
	const importFromPattern = /\bimport\s+(?:type\s+)?[^;]*?\s+from\s+["']([^"']+)["']/g;
	const sideEffectImportPattern = /\bimport\s+["']([^"']+)["']/g;
	const exportPattern = /\bexport\s+(?:type\s+)?[^;]*?\s+from\s+["']([^"']+)["']/g;
	for (const match of source.matchAll(importFromPattern)) {
		const specifier = match[1];
		if (specifier !== undefined) specifiers.push(specifier);
	}
	for (const match of source.matchAll(sideEffectImportPattern)) {
		const specifier = match[1];
		if (specifier !== undefined) specifiers.push(specifier);
	}
	for (const match of source.matchAll(exportPattern)) {
		const specifier = match[1];
		if (specifier !== undefined) specifiers.push(specifier);
	}
	return specifiers;
}

function fileForReport(file: string): string {
	return relative(process.cwd(), file) || file;
}

function isForbiddenCapabilityImport(specifier: string): boolean {
	return (
		specifier.startsWith("@sdl/ccc") ||
		specifier.startsWith("@sdl/flow") ||
		specifier.startsWith("@sdl/slot") ||
		specifier.startsWith("@sdl/objective") ||
		specifier.startsWith("sdl-flow")
	);
}

function sourceImportOffenders(): readonly ImportOffender[] {
	const offenders: ImportOffender[] = [];
	for (const file of sourceFilesUnder(SRC_DIR)) {
		const source = readFileSync(file, "utf8");
		for (const specifier of literalSpecifiersOf(source)) {
			if (specifier.startsWith("@sdl/clinkr/")) {
				offenders.push({
					file: fileForReport(file),
					specifier,
					reason: "theme source may import only public @sdl/clinkr root types, not Clinkr subpaths",
				});
			}
			if (specifier.includes("/src/")) {
				offenders.push({
					file: fileForReport(file),
					specifier,
					reason: "theme source must not deep-import another package's source tree",
				});
			}
			if (isForbiddenCapabilityImport(specifier)) {
				offenders.push({
					file: fileForReport(file),
					specifier,
					reason: "theme source must stay below capability/domain packages",
				});
			}
		}
	}
	return offenders;
}

describe("cli-theme package boundary", () => {
	test("source imports only neutral substrate", () => {
		expect(sourceImportOffenders()).toEqual([]);
	});

	test("source does not access process or command exit primitives", () => {
		const offenders = sourceFilesUnder(SRC_DIR).flatMap((file) => {
			const source = readFileSync(file, "utf8");
			const reasons: string[] = [];
			if (/\bprocess\s*\./.test(source)) reasons.push("process.*");
			if (
				/\b(exitCode|ClinkrExit|MachineEnvelope|usageError|failureMachineEnvelope)\b/.test(source)
			) {
				reasons.push("command exit primitive");
			}
			return reasons.map((reason) => ({ file: fileForReport(file), reason }));
		});

		expect(offenders).toEqual([]);
	});
});
