import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
	BAN_AS_UNKNOWN_AS,
	BAN_CAPABILITY_PRIVATE_PEER_IMPORT,
	BAN_EMPTY_INTERFACE_EXTENDS,
	BAN_EXTENSION_DEPENDENCY_CYCLE,
	BAN_IMPORT_ALIAS_FOR_FIRST_PARTY,
	deferredExtensionCycleComponents,
	extensionGraphPackageNames,
	type ManifestDependencyField,
} from "../support/typescript-style-guard/config.ts";
import { collectExtensionDependencyCycleViolations } from "../support/typescript-style-guard/dependency-graph.ts";
import { findTypeScriptSourceFiles } from "../support/typescript-style-guard/file-discovery.ts";
import {
	loadPackageMetadata,
	type PackageManifest,
	type PackageMetadata,
} from "../support/typescript-style-guard/package-metadata.ts";
import {
	collectViolations,
	type SourceRuleViolation,
} from "../support/typescript-style-guard/source-rules.ts";

const TEST_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(TEST_FILE), "../../../../../..");
const sourceRuleShards: readonly SourceRuleShard[] = [
	{
		name: "ts/packages/hosts",
		includes: (path) => isInDirectory(path, "ts/packages/hosts"),
	},
	{
		name: "ts/packages/infra",
		includes: (path) => isInDirectory(path, "ts/packages/infra"),
	},
	{
		name: "ts/packages/capabilities",
		includes: (path) => isInDirectory(path, "ts/packages/capabilities"),
	},
	{
		name: "other ts/packages",
		includes: (path) =>
			isInDirectory(path, "ts/packages") &&
			!isInAnyDirectory(path, [
				"ts/packages/hosts",
				"ts/packages/infra",
				"ts/packages/capabilities",
			]),
	},
	{
		name: ".sdl/extensions",
		includes: (path) => isInDirectory(path, ".sdl/extensions"),
	},
	{
		name: "docs-site",
		includes: (path) => isInDirectory(path, "docs-site"),
	},
	{
		name: "top-level TS configs and other source files",
		includes: (path) => !isInAnyDirectory(path, ["ts/packages", ".sdl/extensions", "docs-site"]),
	},
];

describe("TypeScript style guard source rules", () => {
	const packageMetadataByName = loadPackageMetadata(REPO_ROOT);
	const cases: readonly SourceRuleCase[] = [
		{
			name: "first-party named import alias is rejected",
			code: 'import { Foo as Bar } from "@sdl/core";',
			expectedRules: [BAN_IMPORT_ALIAS_FOR_FIRST_PARTY],
		},
		{
			name: "relative namespace import is rejected",
			code: 'import * as sdkModule from "./sdk.ts";',
			expectedRules: [BAN_IMPORT_ALIAS_FOR_FIRST_PARTY],
		},
		{
			name: "docs-site path alias import alias is rejected",
			code: 'import { config as geistdocsConfig } from "@/lib/geistdocs/config";',
			expectedRules: [BAN_IMPORT_ALIAS_FOR_FIRST_PARTY],
		},
		{
			name: "multiline first-party type import alias is rejected",
			code: 'import {\n  type Foo as Bar,\n} from "@sdl/core";',
			expectedRules: [BAN_IMPORT_ALIAS_FOR_FIRST_PARTY],
		},
		{
			name: "third-party named import alias is allowed",
			code: 'import { GeistdocsDocsLayout as PackageDocsLayout } from "@vercel/geistdocs/layout";',
			expectedRules: [],
		},
		{
			name: "capability peer api import is allowed",
			code: 'import { createHandoff } from "@sdl/handoff/api";',
			path: "ts/packages/ccc/src/peer.ts",
			expectedRules: [],
		},
		{
			name: "capability private src import is rejected",
			code: 'import { createHandoff } from "@sdl/handoff/src/create.ts";',
			path: "ts/packages/ccc/src/peer.ts",
			expectedRules: [BAN_CAPABILITY_PRIVATE_PEER_IMPORT],
		},
		{
			name: "capability undeclared subpath import is rejected",
			code: 'import { createHandoff } from "@sdl/handoff/private-helper";',
			path: "ts/packages/ccc/src/peer.ts",
			expectedRules: [BAN_CAPABILITY_PRIVATE_PEER_IMPORT],
		},
		{
			name: "neutral infra import is allowed for capabilities",
			code: 'import { RealGitGateway } from "@sdl/core/git";',
			path: "ts/packages/ccc/src/peer.ts",
			expectedRules: [],
		},
		{
			name: "capability-kit import is allowed for capabilities",
			code: 'import { createSdlGitGateway } from "@sdl/capability-kit";',
			path: "ts/packages/ccc/src/peer.ts",
			expectedRules: [],
		},
		{
			name: "node namespace import is allowed",
			code: 'import * as path from "node:path";',
			expectedRules: [],
		},
		{
			name: "third-party local alias workaround is advisory-only",
			code: 'import { Foo } from "pkg";\nconst Bar = Foo;',
			expectedRules: [],
		},
		{
			name: "ordinary imported binding use is allowed",
			code: 'import { Foo } from "pkg";\nconst value = Foo();',
			expectedRules: [],
		},
		{
			name: "empty interface extension alias is rejected",
			code: "interface Child extends Parent {}",
			expectedRules: [BAN_EMPTY_INTERFACE_EXTENDS],
		},
		{
			name: "multiline empty interface extension alias is rejected",
			code: "interface Child extends Parent {\n  // comments are not members\n}",
			expectedRules: [BAN_EMPTY_INTERFACE_EXTENDS],
		},
		{
			name: "double-cast through unknown is rejected",
			code: "const value = input as unknown as Output;",
			expectedRules: [BAN_AS_UNKNOWN_AS],
		},
		{
			name: "parenthesized double-cast through unknown is rejected",
			code: "const value = (input as unknown) as Output;",
			expectedRules: [BAN_AS_UNKNOWN_AS],
		},
		{
			name: "ordinary first-party named import is allowed",
			code: 'import { Foo } from "@sdl/core";',
			expectedRules: [],
		},
		{
			name: "export alias is outside the import-as rule",
			code: 'export { Foo as Bar } from "@sdl/core";',
			expectedRules: [],
		},
		{
			name: "non-empty interface extension is allowed",
			code: "interface Child extends Parent {\n  readonly id: string;\n}",
			expectedRules: [],
		},
		{
			name: "type alias replacement is allowed",
			code: "type Child = Parent;",
			expectedRules: [],
		},
		{
			name: "prose mentions do not trigger syntax rules",
			code: 'const text = "import { Foo as Bar } from pkg; interface Child extends Parent {}";',
			expectedRules: [],
		},
	];

	test.each(cases)("$name", (testCase) => {
		const actualRules = collectViolations(
			testCase.code,
			testCase.path ?? `adversarial/${testCase.name}.ts`,
			packageMetadataByName,
		).map((violation) => violation.rule);

		expect([...actualRules].sort()).toEqual([...testCase.expectedRules].sort());
	});

	const repoSourcePaths = collectTypeScriptSourcePaths(REPO_ROOT);

	test("real repo TypeScript source shards cover every source exactly once", () => {
		expect(formatShardCoverageErrors(repoSourcePaths, sourceRuleShards)).toEqual([]);
	});

	test.each(sourceRuleShards)(
		"real repo TypeScript sources in $name satisfy style/import guard rules",
		(shard) => {
			const violations: SourceRuleViolation[] = [];
			for (const path of repoSourcePaths) {
				if (!shard.includes(path)) continue;
				const content = readFileSync(join(REPO_ROOT, path), "utf8");
				violations.push(...collectViolations(content, path, packageMetadataByName));
			}

			expect(formatViolations(violations)).toBe("");
		},
	);
});

describe("TypeScript style guard documentation references", () => {
	test("mutable guidance no longer points at the retired ts-guard target", () => {
		const checkedFiles = [
			".github/workflows/ci.yml",
			"docs/README.md",
			"docs/adr/README.md",
			"docs/pi/extension-command-checklist.md",
			"justfile",
			"skills/sdl-typescript/SKILL.md",
		];

		const offenders = checkedFiles.filter((path) => {
			const content = readFileSync(join(REPO_ROOT, path), "utf8");
			return content.includes("ts-guard") || content.includes("guard-typescript-style");
		});

		expect(offenders).toEqual([]);
	});

	test("historical ADR text is preserved instead of rewritten for guard target migrations", () => {
		const adr = readFileSync(
			join(REPO_ROOT, "docs/adr/0009-extension-layering-and-peer-dependencies.md"),
			"utf8",
		);

		expect(adr).toContain("define curated subpaths, and `just ts-guard` rejects");
		expect(adr).toContain("topological cycle analysis in `just ts-guard` enforces this invariant");
	});
});

describe("TypeScript style guard extension dependency graph rules", () => {
	const syntheticPackages = new Set([
		"@sdl/autobranch",
		"@sdl/branch-context",
		"@sdl/ccc",
		"@sdl/pi",
		"@sdl/sdl",
	]);
	const legacyDeferredCycleEdges: readonly SyntheticEdge[] = [
		{ from: "@sdl/autobranch", to: "@sdl/pi" },
		{ from: "@sdl/pi", to: "@sdl/sdl" },
		{ from: "@sdl/sdl", to: "@sdl/autobranch" },
	];
	const cases: readonly DependencyGraphCase[] = [
		{
			name: "acyclic extension manifest graph is allowed",
			edges: [{ from: "@sdl/pi", to: "@sdl/ccc" }],
			shouldHaveCycle: false,
		},
		{
			name: "synthetic extension manifest cycle is rejected",
			edges: [
				{ from: "@sdl/pi", to: "@sdl/ccc" },
				{ from: "@sdl/ccc", to: "@sdl/pi" },
			],
			shouldHaveCycle: true,
			expectedTextIncludes: "dependencies.@sdl/pi",
		},
		{
			name: "former autobranch pi sdl manifest cycle is rejected",
			edges: legacyDeferredCycleEdges,
			shouldHaveCycle: true,
			expectedTextIncludes: "dependencies.@sdl/pi",
		},
		{
			name: "branch-context pi manifest cycle is rejected",
			edges: [
				{ from: "@sdl/branch-context", to: "@sdl/pi" },
				{ from: "@sdl/pi", to: "@sdl/branch-context" },
			],
			shouldHaveCycle: true,
			expectedTextIncludes: "dependencies.@sdl/pi",
		},
		{
			name: "devDependencies-only cycle is ignored",
			edges: [
				{ from: "@sdl/pi", to: "@sdl/ccc", field: "devDependencies" },
				{ from: "@sdl/ccc", to: "@sdl/pi", field: "devDependencies" },
			],
			shouldHaveCycle: false,
		},
		{
			name: "field-aware manifest dependency diagnostics point at the participating field",
			metadataByName: buildFieldAwareDiagnosticMetadata(),
			shouldHaveCycle: true,
			expectedTextIncludes: "dependencies.@sdl/ccc",
			expectedLine: 7,
		},
	];

	test.each(cases)("$name", (testCase) => {
		const metadataByName =
			testCase.metadataByName ?? buildSyntheticPackageMetadata(syntheticPackages, testCase.edges);
		const violations = collectExtensionDependencyCycleViolations(
			metadataByName,
			syntheticPackages,
			deferredExtensionCycleComponents,
		);
		const actualRules = violations.map((violation) => violation.rule);
		const actualHasCycle = actualRules.includes(BAN_EXTENSION_DEPENDENCY_CYCLE);

		expect(actualHasCycle).toBe(testCase.shouldHaveCycle);
		const expectedTextIncludes = testCase.expectedTextIncludes;
		if (expectedTextIncludes !== undefined) {
			expect(violations.some((violation) => violation.text.includes(expectedTextIncludes))).toBe(
				true,
			);
		}
		if (testCase.expectedLine !== undefined) {
			expect(violations.some((violation) => violation.line === testCase.expectedLine)).toBe(true);
		}
	});

	test("real repo extension package manifests have no cycles", () => {
		const violations = collectExtensionDependencyCycleViolations(
			loadPackageMetadata(REPO_ROOT),
			extensionGraphPackageNames,
			deferredExtensionCycleComponents,
		);

		expect(formatViolations(violations)).toBe("");
	});
});

interface SourceRuleCase {
	readonly name: string;
	readonly code: string;
	readonly path?: string;
	readonly expectedRules: readonly string[];
}

interface SourceRuleShard {
	readonly name: string;
	readonly includes: (path: string) => boolean;
}

type SyntheticDependencyField = ManifestDependencyField | "devDependencies";

interface SyntheticEdge {
	readonly from: string;
	readonly to: string;
	readonly field?: SyntheticDependencyField;
}

interface DependencyGraphCase {
	readonly name: string;
	readonly edges?: readonly SyntheticEdge[];
	readonly metadataByName?: ReadonlyMap<string, PackageMetadata>;
	readonly shouldHaveCycle: boolean;
	readonly expectedTextIncludes?: string;
	readonly expectedLine?: number;
}

function buildSyntheticPackageMetadata(
	packageNames: ReadonlySet<string>,
	edges: readonly SyntheticEdge[] = [],
): Map<string, PackageMetadata> {
	const dependenciesByPackage = new Map<string, SyntheticDependencyFields>();
	for (const packageName of packageNames)
		dependenciesByPackage.set(packageName, emptySyntheticDependencyFields());

	for (const edge of edges) {
		const field = edge.field ?? "dependencies";
		const dependencies = dependenciesByPackage.get(edge.from);
		if (dependencies === undefined) throw new Error(`Unknown synthetic package ${edge.from}`);
		dependencies[field][edge.to] = "workspace:*";
	}

	const metadataByName = new Map<string, PackageMetadata>();
	for (const packageName of [...packageNames].sort()) {
		const fields = dependenciesByPackage.get(packageName);
		if (fields === undefined) throw new Error(`Unknown synthetic package ${packageName}`);
		const manifest = buildSyntheticManifest(packageName, fields);
		metadataByName.set(packageName, {
			name: packageName,
			packageDir: `synthetic/${packageName}`,
			packageJsonPath: `synthetic/${packageName}/package.json`,
			manifest,
			manifestContent: JSON.stringify(manifest, null, 2),
			exportSubpaths: new Set(["."]),
		});
	}
	return metadataByName;
}

function buildFieldAwareDiagnosticMetadata(): Map<string, PackageMetadata> {
	const packageNames = new Set(["@sdl/ccc", "@sdl/pi"]);
	const metadataByName = buildSyntheticPackageMetadata(packageNames, [
		{ from: "@sdl/pi", to: "@sdl/ccc", field: "dependencies" },
		{ from: "@sdl/ccc", to: "@sdl/pi", field: "dependencies" },
	]);
	const piMetadata = metadataByName.get("@sdl/pi");
	if (piMetadata === undefined) throw new Error("Missing synthetic @sdl/pi metadata");
	const manifest: PackageManifest = {
		name: "@sdl/pi",
		devDependencies: {
			"@sdl/ccc": "workspace:*",
		},
		dependencies: {
			"@sdl/ccc": "workspace:*",
		},
	};
	piMetadata.manifest = manifest;
	piMetadata.manifestContent = JSON.stringify(manifest, null, 2);
	return metadataByName;
}

type SyntheticDependencyFields = Record<SyntheticDependencyField, Record<string, string>>;

function emptySyntheticDependencyFields(): SyntheticDependencyFields {
	return {
		dependencies: {},
		optionalDependencies: {},
		peerDependencies: {},
		devDependencies: {},
	};
}

function buildSyntheticManifest(
	packageName: string,
	fields: SyntheticDependencyFields,
): PackageManifest {
	return {
		name: packageName,
		...(Object.keys(fields.devDependencies).length === 0
			? {}
			: { devDependencies: fields.devDependencies }),
		...(Object.keys(fields.dependencies).length === 0 ? {} : { dependencies: fields.dependencies }),
		...(Object.keys(fields.optionalDependencies).length === 0
			? {}
			: { optionalDependencies: fields.optionalDependencies }),
		...(Object.keys(fields.peerDependencies).length === 0
			? {}
			: { peerDependencies: fields.peerDependencies }),
	};
}

function collectTypeScriptSourcePaths(root: string): readonly string[] {
	return findTypeScriptSourceFiles(root)
		.map((path) => relative(root, path))
		.sort();
}

function formatShardCoverageErrors(
	paths: readonly string[],
	shards: readonly SourceRuleShard[],
): readonly string[] {
	const errors: string[] = [];
	const assignedCountsByShard = new Map(shards.map((shard) => [shard.name, 0]));
	for (const path of paths) {
		const matchingShards = shards.filter((shard) => shard.includes(path));
		if (matchingShards.length === 0) {
			errors.push(`${path}: not assigned to a TypeScript source shard`);
			continue;
		}
		if (matchingShards.length > 1) {
			errors.push(
				`${path}: assigned to multiple TypeScript source shards (${matchingShards
					.map((shard) => shard.name)
					.join(", ")})`,
			);
		}
		for (const shard of matchingShards)
			assignedCountsByShard.set(shard.name, (assignedCountsByShard.get(shard.name) ?? 0) + 1);
	}

	for (const [shardName, count] of assignedCountsByShard) {
		if (count === 0) errors.push(`${shardName}: TypeScript source shard is empty`);
	}
	return errors.sort();
}

function isInAnyDirectory(path: string, directories: readonly string[]): boolean {
	return directories.some((directory) => isInDirectory(path, directory));
}

function isInDirectory(path: string, directory: string): boolean {
	return path === directory || path.startsWith(`${directory}/`);
}

function formatViolations(violations: readonly SourceRuleViolation[]): string {
	return violations
		.map(
			(violation) =>
				`${violation.path}:${violation.line}:${violation.column}: ${violation.rule}: ${violation.text}`,
		)
		.sort()
		.join("\n");
}
