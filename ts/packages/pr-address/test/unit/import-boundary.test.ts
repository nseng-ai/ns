import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { sourceFilesUnder, staticLocalSpecifiers } from "../support/source-files.ts";

const PACKAGE_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SOURCE_ROOT = resolve(PACKAGE_ROOT, "src");
const ENFORCED_SOURCE_ZONES = ["core", "app", "legacy"] as const;

type EnforcedSourceZone = (typeof ENFORCED_SOURCE_ZONES)[number];
type SourceZone = EnforcedSourceZone | "bootstrap_root" | "outside_source";

const ALLOWED_TARGET_ZONES: Record<EnforcedSourceZone, readonly SourceZone[]> = {
	core: ["core"],
	app: ["app", "core"],
	legacy: ["legacy", "core", "bootstrap_root"],
};

const SOURCE_ZONE_LABELS: Record<SourceZone, string> = {
	core: "src/core",
	app: "src/app",
	legacy: "src/legacy",
	bootstrap_root: "bootstrap root src/* and src/operation-schemas/**",
	outside_source: "outside ts/packages/pr-address/src",
};

interface BoundaryViolation {
	importer: string;
	specifier: string;
	targetZone: SourceZone;
	allowedZones: readonly SourceZone[];
}

describe("pr-address strangler import boundary", () => {
	test("creates the strangler zone directories", async () => {
		for (const zone of ENFORCED_SOURCE_ZONES) {
			const zonePath = resolve(SOURCE_ROOT, zone);
			expect((await stat(zonePath)).isDirectory(), `${relative(PACKAGE_ROOT, zonePath)} should exist as a directory`).toBe(true);
		}
	});

	test("zone files obey the pr-address strangler import boundary", async () => {
		const violations: BoundaryViolation[] = [];

		for (const sourceFile of await sourceFilesUnder(SOURCE_ROOT)) {
			if (!isEnforcedSourceZone(sourceZoneFor(sourceFile))) continue;

			const source = await readFile(sourceFile, "utf8");
			for (const specifier of staticLocalSpecifiers(source)) {
				const violation = boundaryViolationFor(sourceFile, specifier);
				if (violation !== undefined) violations.push(violation);
			}
		}

		expect(violations, formatBoundaryViolations(violations)).toHaveLength(0);
	});
});

function sourceZoneFor(filePath: string): SourceZone {
	const sourceRelativePath = relative(SOURCE_ROOT, filePath);
	if (!isWithinSourceRoot(sourceRelativePath)) return "outside_source";

	const firstSegment = sourceRelativePath.split(sep)[0];
	if (firstSegment === "core" || firstSegment === "app" || firstSegment === "legacy") return firstSegment;
	return "bootstrap_root";
}

function isWithinSourceRoot(sourceRelativePath: string): boolean {
	return sourceRelativePath === "" || (!sourceRelativePath.startsWith(`..${sep}`) && sourceRelativePath !== ".." && !isAbsolute(sourceRelativePath));
}

function isEnforcedSourceZone(zone: SourceZone): zone is EnforcedSourceZone {
	return zone === "core" || zone === "app" || zone === "legacy";
}

function boundaryViolationFor(importer: string, specifier: string): BoundaryViolation | undefined {
	const importerZone = sourceZoneFor(importer);
	if (!isEnforcedSourceZone(importerZone)) return undefined;

	const targetZone = sourceZoneFor(resolve(dirname(importer), specifier));
	const allowedZones = ALLOWED_TARGET_ZONES[importerZone];
	if (allowedZones.includes(targetZone)) return undefined;

	return { importer, specifier, targetZone, allowedZones };
}

function formatBoundaryViolations(violations: readonly BoundaryViolation[]): string {
	if (violations.length === 0) return "No pr-address strangler import-boundary violations found.";

	const formattedViolations = violations.map((violation) => {
		const allowedZones = violation.allowedZones.map((zone) => SOURCE_ZONE_LABELS[zone]).join(", ");
		return [
			`- ${relative(PACKAGE_ROOT, violation.importer)} imports ${JSON.stringify(violation.specifier)}`,
			`  resolved target zone: ${SOURCE_ZONE_LABELS[violation.targetZone]}`,
			`  allowed target zones: ${allowedZones}`,
		].join("\n");
	});

	return [
		"pr-address strangler import-boundary violations:",
		...formattedViolations,
		"",
		"Bootstrap policy: only files already under src/core, src/app, or src/legacy are policed.",
		"Root-level src/*.ts files and src/operation-schemas/** are bootstrap legacy until a future slice moves them.",
		"core may import only core; app may import app/core; legacy may import legacy/core/bootstrap-root, but never app.",
	].join("\n");
}
