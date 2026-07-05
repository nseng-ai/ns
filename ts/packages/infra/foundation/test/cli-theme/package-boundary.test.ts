import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fileForReport, literalSpecifiersOf, sourceFilesUnder } from "@nseng-ai/clinkr/testing";
import { describe, expect, test } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(TEST_DIR, "../..");
const SRC_DIR = resolve(PACKAGE_DIR, "src/cli-theme");

interface ImportOffender {
	file: string;
	specifier: string;
	reason: string;
}

function isForbiddenCapabilityImport(specifier: string): boolean {
	return (
		specifier.startsWith("@nseng-ai/ccc") ||
		specifier.startsWith("@nseng-ai/flow") ||
		specifier.startsWith("@nseng-ai/slots") ||
		specifier.startsWith("@nseng-ai/objectives")
	);
}

function sourceImportOffenders(): readonly ImportOffender[] {
	const offenders: ImportOffender[] = [];
	for (const file of sourceFilesUnder(SRC_DIR)) {
		const source = readFileSync(file, "utf8");
		for (const specifier of literalSpecifiersOf(source)) {
			if (specifier.startsWith("@nseng-ai/clinkr/")) {
				offenders.push({
					file: fileForReport(file),
					specifier,
					reason:
						"theme source may import only public @nseng-ai/clinkr root types, not Clinkr subpaths",
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
