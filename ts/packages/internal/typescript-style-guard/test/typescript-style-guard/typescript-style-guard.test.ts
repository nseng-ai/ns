import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
	ADVISORY_OPTIONAL_UNDEFINED_PROPERTY,
	BAN_AS_UNKNOWN_AS,
	BAN_CAPABILITY_PRIVATE_PEER_IMPORT,
	BAN_EMPTY_INTERFACE_EXTENDS,
	BAN_EXPORTS_SUBPACKAGE_CONFORMANCE,
	BAN_EXTENSION_DEPENDENCY_CYCLE,
	BAN_IMPORT_ALIAS_FOR_FIRST_PARTY,
	BAN_INTERNAL_SPACE_ADMISSION,
	BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE,
	BAN_PACKAGE_TIER_LAYERING,
	BAN_RAW_PRODUCTION_TIMERS,
	BAN_SUBPACKAGE_DECLARATION_CONFORMANCE,
	BAN_TOPOLOGY_CIRCLE_CYCLE,
	BAN_TOPOLOGY_CIRCLE_LAYERING,
	BAN_SNAKE_CASE_CLI_MACHINE_VALUE,
	capabilityPackageNames,
	concreteCapabilityCommandSurfaces,
	deferredExtensionCycleComponents,
	deferredTopologyCircleCycles,
	extensionGraphPackageNames,
	type DeferredTopologyCircleCycle,
	type ManifestDependencyField,
	type PackageTier,
} from "@internal/typescript-style-guard/config";
import { collectExtensionDependencyCycleViolations } from "@internal/typescript-style-guard/dependency-graph";
import { collectExportsSubpackageConformanceViolations } from "@internal/typescript-style-guard/exports-subpackage-conformance";
import { findTypeScriptSourceFiles } from "@internal/typescript-style-guard/file-discovery";
import { collectInternalSpaceAdmissionViolations } from "@internal/typescript-style-guard/internal-space";
import {
	collectExportSubpaths,
	loadPackageMetadata,
	type PackageManifest,
	type PackageMetadata,
} from "@internal/typescript-style-guard/package-metadata";
import { collectOptionalUndefinedPropertyCandidates } from "@internal/typescript-style-guard/optional-undefined-audit";
import {
	collectViolations,
	type SourceRuleViolation,
} from "@internal/typescript-style-guard/source-rules";
import { collectPackageTierLayeringViolations } from "@internal/typescript-style-guard/tier-layering";
import { collectSubpackageDeclarationConformanceViolations } from "@internal/typescript-style-guard/subpackage-conformance";
import {
	collectTopologyCircleCycleComponents,
	collectTopologyCircleCycleViolations,
	collectTopologyCircleImportEdges,
	collectTopologyCircleLayeringViolations,
	discoverTopologyCircles,
	type TopologyCircleFact,
	type TopologyCircleSourceFile,
} from "@internal/typescript-style-guard/topology-circles";

const TEST_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(TEST_FILE), "../../../../../..");
const SOURCE_RULE_SHARD_TEST_TIMEOUT_MS = 15_000;

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
		name: ".ns/extensions",
		includes: (path) => isInDirectory(path, ".ns/extensions"),
	},
	{
		name: "docs-site",
		includes: (path) => isInDirectory(path, "docs-site"),
	},
	{
		name: "top-level TS configs and other source files",
		includes: (path) => !isInAnyDirectory(path, ["ts/packages", ".ns/extensions", "docs-site"]),
	},
];

describe("TypeScript style guard source rules", () => {
	const packageMetadataByName = loadPackageMetadata(REPO_ROOT);
	const cases: readonly SourceRuleCase[] = [
		{
			name: "first-party named import alias is rejected",
			code: 'import { Foo as Bar } from "@nseng-ai/core/primitives";',
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
			code: 'import {\n  type Foo as Bar,\n} from "@nseng-ai/core/primitives";',
			expectedRules: [BAN_IMPORT_ALIAS_FOR_FIRST_PARTY],
		},
		{
			name: "third-party named import alias is allowed",
			code: 'import { GeistdocsDocsLayout as PackageDocsLayout } from "@vercel/geistdocs/layout";',
			expectedRules: [],
		},
		{
			name: "capability peer api import is allowed",
			code: 'import { createHandoff } from "@nseng-ai/handoff/api";',
			path: "ts/packages/capabilities/ccc/src/core/peer.ts",
			expectedRules: [],
		},
		{
			name: "capability private src import is rejected",
			code: 'import { createHandoff } from "@nseng-ai/handoff/src/create.ts";',
			path: "ts/packages/capabilities/ccc/src/core/peer.ts",
			expectedRules: [BAN_CAPABILITY_PRIVATE_PEER_IMPORT],
		},
		{
			name: "capability undeclared subpath import is rejected",
			code: 'import { createHandoff } from "@nseng-ai/handoff/private-helper";',
			path: "ts/packages/capabilities/ccc/src/core/peer.ts",
			expectedRules: [BAN_CAPABILITY_PRIVATE_PEER_IMPORT],
		},
		{
			name: "capability gateway backend import is allowed for capabilities",
			code: 'import { RealGitGateway } from "@nseng-ai/capability-kit/git";',
			path: "ts/packages/capabilities/ccc/src/core/peer.ts",
			expectedRules: [],
		},
		{
			name: "capability-kit import is allowed for capabilities",
			code: 'import { createNsCliExecAdapter } from "@nseng-ai/capability-kit/git";',
			path: "ts/packages/capabilities/ccc/src/core/peer.ts",
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
			code: 'import { Foo } from "@nseng-ai/core/primitives";',
			expectedRules: [],
		},
		{
			name: "lower-layer source cannot import concrete capability packages",
			code: 'import { listObjectives } from "@nseng-ai/objective/api";',
			path: "ts/packages/kernel/src/example.ts",
			expectedRules: [BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE],
		},
		{
			name: "lower-layer source cannot encode concrete slash command surfaces",
			code: 'const command = "/ns:objective:list";',
			path: "ts/packages/infra/core/src/example.ts",
			expectedRules: [BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE],
		},
		{
			name: "lower-layer source cannot encode concrete ns command surfaces",
			code: 'const command = "ns slot checkout";',
			path: "ts/packages/capability-kit/src/example.ts",
			expectedRules: [BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE],
		},
		{
			name: "lower-layer source detects singular plan slash alias from descriptor data",
			code: 'const command = "/ns:plan:save";',
			path: "ts/packages/infra/brmem/src/example.ts",
			expectedRules: [BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE],
		},
		{
			name: "lower-layer source detects real lower-layer package paths through metadata",
			code: 'const command = "ns flow cp";',
			path: "ts/packages/kernel/src/example.ts",
			expectedRules: [BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE],
		},
		{
			name: "lower-layer source cannot import roaster without treating roaster as a capability",
			code: 'import { createRoasterClient } from "@nseng-ai/roaster/api";',
			path: "ts/packages/kernel/src/example.ts",
			expectedRules: [BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE],
		},
		{
			name: "capability tests may mention concrete capability command surfaces",
			code: 'const command = "/ns:objective:list";',
			path: "ts/packages/kernel/test/scenario/example.test.ts",
			expectedRules: [],
		},
		{
			name: "export alias is outside the import-as rule",
			code: 'export { Foo as Bar } from "@nseng-ai/core/primitives";',
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
		{
			name: "snake_case failure error type is rejected",
			code: 'failure("registry_check_failed", "message");',
			expectedRules: [BAN_SNAKE_CASE_CLI_MACHINE_VALUE],
		},
		{
			name: "kebab-case failure error type is allowed",
			code: 'failure("registry-check-failed", "message");',
			expectedRules: [],
		},
		{
			name: "snake_case errorType property value is rejected",
			code: 'const exit = new ClinkrFailure({ errorType: "branch_context_error", message });',
			expectedRules: [BAN_SNAKE_CASE_CLI_MACHINE_VALUE],
		},
		{
			name: "kebab-case errorType property value is allowed",
			code: 'const exit = { errorType: "branch-context-error", message };',
			expectedRules: [],
		},
		{
			name: "camelCase errorType property name is not itself a machine value",
			code: 'const exit = { errorType: "not-in-repo" };',
			expectedRules: [],
		},
		{
			name: "snake_case errorType union type declaration is not a runtime value",
			code: 'interface Err { errorType: "invalid_json" | "invalid_request"; }',
			expectedRules: [],
		},
		{
			name: "snake_case failure error type via member call is rejected",
			code: 'return clinkr.failure("pr_gateway_failure", "message");',
			expectedRules: [BAN_SNAKE_CASE_CLI_MACHINE_VALUE],
		},
		{
			name: "human-readable failure message is not flagged as a machine value",
			code: 'failure("invalid-request", "Two sources were provided at once");',
			expectedRules: [],
		},
		{
			name: "internal snake_case discriminant value is outside the focused guard",
			code: 'const result = { kind: "stash_failed", error };',
			expectedRules: [],
		},
		{
			name: "production setTimeout is rejected",
			code: "setTimeout(() => {}, 10);",
			path: "ts/packages/infra/example/src/timer.ts",
			expectedRules: [BAN_RAW_PRODUCTION_TIMERS],
		},
		{
			name: "production setInterval is rejected",
			code: "setInterval(() => {}, 10);",
			path: "ts/packages/infra/example/src/timer.ts",
			expectedRules: [BAN_RAW_PRODUCTION_TIMERS],
		},
		{
			name: "production clearTimeout is rejected",
			code: "clearTimeout(timer);",
			path: "ts/packages/infra/example/src/timer.ts",
			expectedRules: [BAN_RAW_PRODUCTION_TIMERS],
		},
		{
			name: "production clearInterval is rejected",
			code: "clearInterval(timer);",
			path: "ts/packages/infra/example/src/timer.ts",
			expectedRules: [BAN_RAW_PRODUCTION_TIMERS],
		},
		{
			name: "production globalThis raw timer is rejected",
			code: "globalThis.setTimeout(() => {}, 10);",
			path: "ts/packages/infra/example/src/timer.ts",
			expectedRules: [BAN_RAW_PRODUCTION_TIMERS],
		},
		{
			name: "production node timers promise import is rejected",
			code: 'import { setTimeout } from "node:timers/promises";',
			path: "ts/packages/infra/example/src/timer.ts",
			expectedRules: [BAN_RAW_PRODUCTION_TIMERS],
		},
		{
			name: "timer adapter raw timer is allowed",
			code: "setTimeout(() => {}, 10); clearTimeout(timer);",
			path: "ts/packages/infra/core/src/time/index.ts",
			expectedRules: [],
		},
		{
			name: "pi unref timer adapter raw interval is allowed",
			code: "setInterval(() => {}, 10); clearInterval(timer);",
			path: "ts/packages/hosts/pi/src/kit/shared/timers.ts",
			expectedRules: [],
		},
		{
			name: "test raw timer is allowed",
			code: "setTimeout(() => {}, 10);",
			path: "ts/packages/infra/core/test/runtime.test.ts",
			expectedRules: [],
		},
	];

	test("concrete capability command-surface descriptors match the capability package set", () => {
		expect(
			concreteCapabilityCommandSurfaces.filter(
				(surface) => !capabilityPackageNames.has(surface.packageName),
			),
		).toEqual([]);
		expect(capabilityPackageNames.has("@nseng-ai/roaster")).toBe(false);
	});

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
		SOURCE_RULE_SHARD_TEST_TIMEOUT_MS,
	);
});

describe("optional undefined property advisory audit", () => {
	const cases: readonly OptionalUndefinedAuditCase[] = [
		{
			name: "flags optional properties that also union undefined",
			code: "interface Context { extensions?: Record<string, unknown> | undefined; }",
			expectedProperties: ["extensions"],
			expectedHasOptionsInputName: false,
			expectedHasNull: false,
		},
		{
			name: "flags type literal members",
			code: "type Result = { value?: string | undefined };",
			expectedProperties: ["value"],
			expectedHasOptionsInputName: false,
			expectedHasNull: false,
		},
		{
			name: "does not flag optional-only properties",
			code: "interface Context { extensions?: Record<string, unknown>; }",
			expectedProperties: [],
			expectedHasOptionsInputName: false,
			expectedHasNull: false,
		},
		{
			name: "does not flag required properties whose value may be undefined",
			code: "interface State { extensions: Record<string, unknown> | undefined; }",
			expectedProperties: [],
			expectedHasOptionsInputName: false,
			expectedHasNull: false,
		},
		{
			name: "classifies options-style containers without allowing them as a hard rule",
			code: "interface Options { env?: NodeJS.ProcessEnv | undefined; }",
			expectedProperties: ["env"],
			expectedHasOptionsInputName: true,
			expectedHasNull: false,
		},
		{
			name: "reports null unions for extra remediation care",
			code: "interface Payload { body?: string | null | undefined; }",
			expectedProperties: ["body"],
			expectedHasOptionsInputName: false,
			expectedHasNull: true,
		},
	];

	test.each(cases)("$name", (testCase) => {
		const candidates = collectOptionalUndefinedPropertyCandidates(
			testCase.code,
			`adversarial/${testCase.name}.ts`,
		);

		expect(candidates.map((candidate) => candidate.rule)).toEqual(
			testCase.expectedProperties.map(() => ADVISORY_OPTIONAL_UNDEFINED_PROPERTY),
		);
		expect(candidates.map((candidate) => candidate.propertyName)).toEqual(
			testCase.expectedProperties,
		);
		if (candidates.length > 0) {
			expect(candidates.every((candidate) => candidate.hasOptionsInputName)).toBe(
				testCase.expectedHasOptionsInputName,
			);
			expect(candidates.every((candidate) => candidate.hasNull)).toBe(testCase.expectedHasNull);
		}
	});
});

describe("TypeScript style guard documentation references", () => {
	test("mutable guidance no longer points at the retired ts-guard target", () => {
		const checkedFiles = [
			".github/workflows/ci.yml",
			"docs/README.md",
			"docs/adr/README.md",
			"docs/pi/extension-command-checklist.md",
			"justfile",
			"skills/ns-typescript/SKILL.md",
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

describe("TypeScript style guard internal-space admission rules", () => {
	const cases: readonly InternalSpaceAdmissionCase[] = [
		{
			name: "rejects packages under internal with a non-internal scope",
			packages: [
				internalSpaceSyntheticPackage({
					name: "@nseng-ai/grill",
					packageDir: "ts/packages/internal/grill",
					privateValue: true,
				}),
			],
			expectedTextIncludes: "must use the @internal/ scope",
		},
		{
			name: "rejects internal-scope packages outside internal",
			packages: [
				internalSpaceSyntheticPackage({
					name: "@internal/pi-tools",
					packageDir: "ts/packages/misplaced/pi-tools",
					privateValue: true,
				}),
			],
			expectedTextIncludes: "must live under ts/packages/internal",
		},
		{
			name: "rejects non-private internal-scope packages",
			packages: [
				internalSpaceSyntheticPackage({
					name: "@internal/pi-tools",
					packageDir: "ts/packages/internal/pi-tools",
					privateValue: false,
				}),
			],
			expectedTextIncludes: "must be private",
		},
		{
			name: "rejects outside workspace dependents on internal-scope packages",
			packages: [
				internalSpaceSyntheticPackage({
					name: "@internal/pi-tools",
					packageDir: "ts/packages/internal/pi-tools",
					privateValue: true,
				}),
				internalSpaceSyntheticPackage({
					name: "@nseng-ai/ccc",
					packageDir: "ts/packages/capabilities/ccc",
					privateValue: true,
					dependencies: { "@internal/pi-tools": "workspace:*" },
				}),
			],
			expectedTextIncludes: "must not depend on internal-space package @internal/pi-tools",
		},
		{
			name: "allows private internal-scope packages under internal",
			packages: [
				internalSpaceSyntheticPackage({
					name: "@internal/pi-tools",
					packageDir: "ts/packages/internal/pi-tools",
					privateValue: true,
				}),
			],
			expectedViolation: false,
		},
	];

	test.each(cases)("$name", (testCase) => {
		const violations = collectInternalSpaceAdmissionViolations(
			buildInternalSpaceSyntheticMetadata(testCase.packages),
		);
		const actualHasViolation = violations.some(
			(violation) => violation.rule === BAN_INTERNAL_SPACE_ADMISSION,
		);

		expect(actualHasViolation).toBe(testCase.expectedViolation ?? true);
		const expectedTextIncludes = testCase.expectedTextIncludes;
		if (expectedTextIncludes !== undefined) {
			expect(violations.some((violation) => violation.text.includes(expectedTextIncludes))).toBe(
				true,
			);
		}
	});

	test("real repo package manifests satisfy internal-space admission policy", () => {
		const violations = collectInternalSpaceAdmissionViolations(loadPackageMetadata(REPO_ROOT));

		expect(formatViolations(violations)).toBe("");
	});
});

describe("TypeScript style guard package tier layering rules", () => {
	const syntheticPackages = new Set([
		"@internal/pi-tools/grill",
		"@internal/pi-tools/runner-subagents",
		"@nseng-ai/areg",
		"@nseng-ai/ccc",
		"@nseng-ai/capability-kit",
		"@nseng-ai/core",
		"@nseng-ai/handoff",
		"@nseng-ai/example-pi",
		"@nseng-ai/pi",
		"@nseng-ai/kernel",
		"@nseng-ai/slot",
	]);
	const baseTiers = new Map<string, SyntheticTier>([
		["@internal/pi-tools/grill", "internal-pi-tool"],
		["@internal/pi-tools/runner-subagents", "internal-pi-tool"],
		["@nseng-ai/areg", "standalone-tool"],
		["@nseng-ai/ccc", "capability"],
		["@nseng-ai/capability-kit", "capability-kit"],
		["@nseng-ai/core", "neutral-infra"],
		["@nseng-ai/handoff", "capability"],
		["@nseng-ai/example-pi", "capability-pi"],
		["@nseng-ai/pi", "host"],
		["@nseng-ai/kernel", "sdk"],
		["@nseng-ai/slot", "capability"],
	]);
	const cases: readonly TierLayeringCase[] = [
		{
			name: "missing tier is rejected",
			tiers: new Map([...baseTiers, ["@nseng-ai/ccc", undefined]]),
			expectedTextIncludes: "missing ns.tier",
		},
		{
			name: "unknown tier is rejected",
			tiers: new Map([...baseTiers, ["@nseng-ai/ccc", "mystery-tier"]]),
			expectedTextIncludes: "unknown ns.tier",
		},
		{
			name: "capability to host is rejected",
			edges: [{ from: "@nseng-ai/handoff", to: "@nseng-ai/pi" }],
			expectedTextIncludes: "capability-must-not-depend-on-host",
		},
		{
			name: "sdk to capability is rejected",
			edges: [{ from: "@nseng-ai/kernel", to: "@nseng-ai/handoff" }],
			expectedTextIncludes: "sdk-must-not-depend-on-capability",
		},
		{
			name: "retired sdk to slot capability debt is rejected",
			edges: [{ from: "@nseng-ai/kernel", to: "@nseng-ai/slot" }],
			expectedTextIncludes: "sdk-must-not-depend-on-capability",
		},
		{
			name: "capability to capability is allowed",
			edges: [{ from: "@nseng-ai/ccc", to: "@nseng-ai/handoff" }],
			expectedViolation: false,
		},
		{
			name: "capability pi to host is allowed",
			edges: [{ from: "@nseng-ai/example-pi", to: "@nseng-ai/pi" }],
			expectedViolation: false,
		},
		{
			name: "capability pi to capability is allowed",
			edges: [{ from: "@nseng-ai/example-pi", to: "@nseng-ai/handoff" }],
			expectedViolation: false,
		},
		{
			name: "capability to capability pi is rejected",
			edges: [{ from: "@nseng-ai/handoff", to: "@nseng-ai/example-pi" }],
			expectedTextIncludes: "capability-must-not-depend-on-capability-pi",
		},
		{
			name: "standalone tool to host is allowed",
			edges: [{ from: "@nseng-ai/areg", to: "@nseng-ai/pi" }],
			expectedViolation: false,
		},
		{
			name: "internal pi tool to host is allowed",
			edges: [{ from: "@internal/pi-tools/grill", to: "@nseng-ai/pi" }],
			expectedViolation: false,
		},
		{
			name: "internal pi tool to internal pi tool is allowed",
			edges: [{ from: "@internal/pi-tools/grill", to: "@internal/pi-tools/runner-subagents" }],
			expectedViolation: false,
		},
		{
			name: "internal pi tool to standalone tool is rejected",
			edges: [{ from: "@internal/pi-tools/grill", to: "@nseng-ai/areg" }],
			expectedTextIncludes: "internal-pi-tool-must-not-depend-on-standalone-tool",
		},
		{
			name: "standalone tool to internal pi tool is rejected",
			edges: [{ from: "@nseng-ai/areg", to: "@internal/pi-tools/grill" }],
			expectedTextIncludes: "standalone-tool-must-not-depend-on-internal-pi-tool",
		},
		{
			name: "capability to capability kit is allowed",
			edges: [{ from: "@nseng-ai/handoff", to: "@nseng-ai/capability-kit" }],
			expectedViolation: false,
		},
	];

	test.each(cases)("$name", (testCase) => {
		const violations = collectPackageTierLayeringViolations(
			buildSyntheticPackageMetadata(syntheticPackages, testCase.edges, testCase.tiers ?? baseTiers),
		);
		const actualHasViolation = violations.some(
			(violation) => violation.rule === BAN_PACKAGE_TIER_LAYERING,
		);

		expect(actualHasViolation).toBe(testCase.expectedViolation ?? true);
		const expectedTextIncludes = testCase.expectedTextIncludes;
		if (expectedTextIncludes !== undefined) {
			expect(violations.some((violation) => violation.text.includes(expectedTextIncludes))).toBe(
				true,
			);
		}
	});

	test("real repo package manifests satisfy declared tier policy through explicit debt allowlists", () => {
		const violations = collectPackageTierLayeringViolations(loadPackageMetadata(REPO_ROOT));

		expect(formatViolations(violations)).toBe("");
	});
});

describe("TypeScript style guard topology-circle layering rules", () => {
	const syntheticCircles: readonly TopologyCircleFact[] = [
		{
			id: "@nseng-ai/core",
			packageName: "@nseng-ai/core",
			component: ".",
			tier: "neutral-infra",
			path: "synthetic/core/src",
		},
		{
			id: "@nseng-ai/core/time",
			packageName: "@nseng-ai/core",
			component: "time",
			tier: "neutral-infra",
			path: "synthetic/core/src/time",
		},
		{
			id: "@nseng-ai/slot",
			packageName: "@nseng-ai/slot",
			component: ".",
			tier: "capability",
			path: "synthetic/slot/src",
		},
	];

	test("allows same-tier intra-package circle edges", () => {
		const violations = collectTopologyCircleLayeringViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName: new Map(),
			circles: syntheticCircles,
			files: [
				{
					path: "synthetic/core/src/time/index.ts",
					content: 'import { clock } from "@nseng-ai/core/clock";',
				},
			],
		});

		expect(violations).toEqual([]);
	});

	test("rejects forbidden layer edges between circles", () => {
		const violations = collectTopologyCircleLayeringViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName: new Map(),
			circles: syntheticCircles,
			files: [
				{
					path: "synthetic/core/src/time/index.ts",
					content: 'import { buildSlotCommandGroup } from "@nseng-ai/slot";',
				},
			],
		});

		expect(violations.map((violation) => violation.rule)).toEqual([BAN_TOPOLOGY_CIRCLE_LAYERING]);
		expect(violations[0]?.text).toContain("@nseng-ai/core/time (neutral-infra) -> @nseng-ai/slot");
	});

	test("relative imports crossing circle boundaries point at the import line", () => {
		const violations = collectTopologyCircleLayeringViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName: new Map(),
			circles: syntheticCircles,
			files: [
				{
					path: "synthetic/core/src/time/index.ts",
					content: 'import { slot } from "../../../slot/src/index.ts";\nslot();',
				},
				{
					path: "synthetic/slot/src/index.ts",
					content: "export function slot(): void {}",
				},
			],
		});

		expect(violations.map((violation) => violation.rule)).toEqual([BAN_TOPOLOGY_CIRCLE_LAYERING]);
		expect(violations[0]?.line).toBe(1);
		expect(violations[0]?.text).toContain("@nseng-ai/core/time");
	});

	test("discovers the core time pilot circle from the package manifest", () => {
		const packageMetadataByName = loadPackageMetadata(REPO_ROOT);
		const coreMetadata = packageMetadataByName.get("@nseng-ai/core");
		if (coreMetadata === undefined) throw new Error("Missing @nseng-ai/core package metadata");
		const circles = discoverTopologyCircles(REPO_ROOT, packageMetadataByName);
		const retiredTimePackageName = "@nseng-ai/" + "time";

		expect(coreMetadata.nsSubpackages).toContain("time");
		expect(circles.has("@nseng-ai/core/time")).toBe(true);
		expect(packageMetadataByName.has(retiredTimePackageName)).toBe(false);
	});

	test("does not auto-discover undeclared source directories as circles", () => {
		const circles = discoverTopologyCircles(REPO_ROOT, loadPackageMetadata(REPO_ROOT));

		expect(circles.has("@nseng-ai/aretro/operations")).toBe(false);
		expect(circles.has("@nseng-ai/aretro/payloads")).toBe(false);
		expect(circles.has("@nseng-ai/aretro/ns")).toBe(false);
		expect(circles.has("@nseng-ai/aretro/sessions")).toBe(false);
	});

	test("real repo source circle edges satisfy inherited tier layering", () => {
		const packageMetadataByName = loadPackageMetadata(REPO_ROOT);
		const importEdges = collectTopologyCircleImportEdges({
			repoRoot: REPO_ROOT,
			packageMetadataByName,
		});
		const violations = collectTopologyCircleLayeringViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName,
			importEdges,
		});

		expect(formatViolations(violations)).toBe("");
	});
});

describe("TypeScript style guard topology-circle cycle rules", () => {
	const cycleCircles: readonly TopologyCircleFact[] = [
		{
			id: "@nseng-ai/core/alpha",
			packageName: "@nseng-ai/core",
			component: "alpha",
			tier: "neutral-infra",
			path: "synthetic/core/src/alpha",
		},
		{
			id: "@nseng-ai/core/beta",
			packageName: "@nseng-ai/core",
			component: "beta",
			tier: "neutral-infra",
			path: "synthetic/core/src/beta",
		},
		{
			id: "@nseng-ai/core/gamma",
			packageName: "@nseng-ai/core",
			component: "gamma",
			tier: "neutral-infra",
			path: "synthetic/core/src/gamma",
		},
	];
	const alphaBetaDeferral: DeferredTopologyCircleCycle = {
		name: "alpha-beta",
		packageName: "@nseng-ai/core",
		circles: new Set(["alpha", "beta"]),
		reason: "synthetic test deferral",
	};

	test("rejects a two-circle import cycle with one violation per participating edge", () => {
		const violations = collectTopologyCircleCycleViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName: new Map(),
			circles: cycleCircles,
			files: twoCircleCycleFiles(),
			deferredCycles: [],
		});

		expect(violations.map((violation) => violation.rule)).toEqual([
			BAN_TOPOLOGY_CIRCLE_CYCLE,
			BAN_TOPOLOGY_CIRCLE_CYCLE,
		]);
		expect(formatViolations(violations)).toContain(
			"non-deferred subpackage circle cycle in @nseng-ai/core among alpha, beta",
		);
	});

	test("allows a cycle fully covered by a topology-circle deferral", () => {
		const violations = collectTopologyCircleCycleViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName: new Map(),
			circles: cycleCircles,
			files: twoCircleCycleFiles(),
			deferredCycles: [alphaBetaDeferral],
		});

		expect(violations).toEqual([]);
	});

	test("rejects a larger cycle when a deferral only partially overlaps", () => {
		const violations = collectTopologyCircleCycleViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName: new Map(),
			circles: cycleCircles,
			files: [
				{
					path: "synthetic/core/src/alpha/index.ts",
					content: 'import { beta } from "@nseng-ai/core/beta";\nbeta();',
				},
				{
					path: "synthetic/core/src/beta/index.ts",
					content: 'import { gamma } from "@nseng-ai/core/gamma";\ngamma();',
				},
				{
					path: "synthetic/core/src/gamma/index.ts",
					content: 'import { alpha } from "@nseng-ai/core/alpha";\nalpha();',
				},
			],
			deferredCycles: [alphaBetaDeferral],
		});

		expect(violations).toHaveLength(3);
		expect(formatViolations(violations)).toContain("alpha-beta");
	});

	test("allows acyclic one-way edges and same-circle self edges", () => {
		const violations = collectTopologyCircleCycleViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName: new Map(),
			circles: cycleCircles,
			files: [
				{
					path: "synthetic/core/src/alpha/index.ts",
					content:
						'import { beta } from "@nseng-ai/core/beta";\nimport { helper } from "./helper.ts";\nbeta();\nhelper();',
				},
				{
					path: "synthetic/core/src/alpha/helper.ts",
					content: "export function helper(): void {}",
				},
				{
					path: "synthetic/core/src/beta/index.ts",
					content: "export function beta(): void {}",
				},
			],
			deferredCycles: [],
		});

		expect(violations).toEqual([]);
	});

	test("real repo source circle layering and cycle checks share collected import edges", () => {
		const packageMetadataByName = loadPackageMetadata(REPO_ROOT);
		const importEdges = collectTopologyCircleImportEdges({
			repoRoot: REPO_ROOT,
			packageMetadataByName,
		});
		const layeringViolations = collectTopologyCircleLayeringViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName,
			importEdges,
		});
		const cycleViolations = collectTopologyCircleCycleViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName,
			importEdges,
		});

		expect(formatViolations([...layeringViolations, ...cycleViolations])).toBe("");
	});

	test("topology-circle cycle deferrals exactly match currently detected cycles", () => {
		const packageMetadataByName = loadPackageMetadata(REPO_ROOT);
		const importEdges = collectTopologyCircleImportEdges({
			repoRoot: REPO_ROOT,
			packageMetadataByName,
		});
		const actualCycles = collectTopologyCircleCycleComponents(importEdges);

		expect(
			deferredTopologyCircleCycles
				.map((deferredCycle) => {
					const actualCycle = actualCycles.find(
						(cycle) =>
							cycle.packageName === deferredCycle.packageName &&
							setsAreEqual(cycle.circles, deferredCycle.circles),
					);
					return actualCycle === undefined
						? `${deferredCycle.name}: no matching current topology circle cycle`
						: undefined;
				})
				.filter((message) => message !== undefined),
		).toEqual([]);
	});
});

describe("TypeScript style guard subpackage declaration conformance", () => {
	test("rejects a declared subpackage whose source directory is missing", () => {
		withTempRepo((repoRoot) => {
			writeSyntheticPackage(repoRoot, "synthetic/core", ["src/index.ts"]);
			const metadataByName = buildSyntheticSubpackageMetadata({
				packageDir: "synthetic/core",
				subpackages: ["time"],
				remainder: true,
			});

			const violations = collectSubpackageDeclarationConformanceViolations({
				repoRoot,
				packageMetadataByName: metadataByName,
			});

			expect(violations.map((violation) => violation.rule)).toEqual([
				BAN_SUBPACKAGE_DECLARATION_CONFORMANCE,
			]);
			expect(violations[0]?.text).toContain("src/time is not a directory");
		});
	});

	test("rejects unassociated source when no remainder is declared", () => {
		withTempRepo((repoRoot) => {
			writeSyntheticPackage(repoRoot, "synthetic/core", ["src/time/index.ts", "src/index.ts"]);
			const metadataByName = buildSyntheticSubpackageMetadata({
				packageDir: "synthetic/core",
				subpackages: ["time"],
				remainder: false,
			});

			const violations = collectSubpackageDeclarationConformanceViolations({
				repoRoot,
				packageMetadataByName: metadataByName,
			});

			expect(violations.map((violation) => violation.rule)).toEqual([
				BAN_SUBPACKAGE_DECLARATION_CONFORMANCE,
			]);
			expect(violations[0]?.path).toBe("synthetic/core/src/index.ts");
			expect(violations[0]?.text).toContain("without ns.remainder");
		});
	});

	test("allows unassociated source when a remainder is declared", () => {
		withTempRepo((repoRoot) => {
			writeSyntheticPackage(repoRoot, "synthetic/core", ["src/time/index.ts", "src/index.ts"]);
			const metadataByName = buildSyntheticSubpackageMetadata({
				packageDir: "synthetic/core",
				subpackages: ["time"],
				remainder: true,
			});

			const violations = collectSubpackageDeclarationConformanceViolations({
				repoRoot,
				packageMetadataByName: metadataByName,
			});

			expect(violations).toEqual([]);
		});
	});

	test("allows all source under declared subpackage directories without a remainder", () => {
		withTempRepo((repoRoot) => {
			writeSyntheticPackage(repoRoot, "synthetic/core", [
				"src/time/index.ts",
				"src/time/testing.ts",
			]);
			const metadataByName = buildSyntheticSubpackageMetadata({
				packageDir: "synthetic/core",
				subpackages: ["time"],
				remainder: false,
			});

			const violations = collectSubpackageDeclarationConformanceViolations({
				repoRoot,
				packageMetadataByName: metadataByName,
			});

			expect(violations).toEqual([]);
		});
	});

	test("real repo package declarations match their declared subpackage/remainder state", () => {
		const violations = collectSubpackageDeclarationConformanceViolations({
			repoRoot: REPO_ROOT,
			packageMetadataByName: loadPackageMetadata(REPO_ROOT),
		});

		expect(formatViolations(violations)).toBe("");
	});
});

describe("TypeScript style guard exports subpackage conformance", () => {
	test("rejects an exports target that escapes declared subpackages", () => {
		const metadataByName = buildSyntheticSubpackageMetadata({
			packageDir: "synthetic/core",
			subpackages: ["api", "runtime"],
			remainder: false,
			exports: {
				"./api": "./src/api/index.ts",
				"./leak": "./src/operations/leak.ts",
			},
		});

		const violations = collectExportsSubpackageConformanceViolations({
			packageMetadataByName: metadataByName,
		});

		expect(violations.map((violation) => violation.rule)).toEqual([
			BAN_EXPORTS_SUBPACKAGE_CONFORMANCE,
		]);
		expect(violations[0]?.path).toBe("synthetic/core/package.json");
		expect(violations[0]?.text).toContain("./src/operations/leak.ts");
		expect(violations[0]?.text).toContain("ns.subpackages");
	});

	test("rejects an escaping string leaf inside a conditions object", () => {
		const metadataByName = buildSyntheticSubpackageMetadata({
			packageDir: "synthetic/core",
			subpackages: ["api"],
			remainder: false,
			exports: {
				"./x": {
					types: "./src/api/x.d.ts",
					import: "./src/shared/x.ts",
				},
			},
		});

		const violations = collectExportsSubpackageConformanceViolations({
			packageMetadataByName: metadataByName,
		});

		expect(violations.map((violation) => violation.rule)).toEqual([
			BAN_EXPORTS_SUBPACKAGE_CONFORMANCE,
		]);
		expect(violations[0]?.text).toContain("./src/shared/x.ts");
	});

	test("rejects an escaping string leaf inside an exports fallback array", () => {
		const metadataByName = buildSyntheticSubpackageMetadata({
			packageDir: "synthetic/core",
			subpackages: ["api"],
			remainder: false,
			exports: {
				"./x": ["./src/api/x.ts", "./src/legacy/x.js"],
			},
		});

		const violations = collectExportsSubpackageConformanceViolations({
			packageMetadataByName: metadataByName,
		});

		expect(violations.map((violation) => violation.rule)).toEqual([
			BAN_EXPORTS_SUBPACKAGE_CONFORMANCE,
		]);
		expect(violations[0]?.text).toContain("./src/legacy/x.js");
	});

	test("allows targets that all resolve inside declared subpackages", () => {
		const metadataByName = buildSyntheticSubpackageMetadata({
			packageDir: "synthetic/core",
			subpackages: ["api", "commands", "land"],
			remainder: false,
			exports: {
				"./api": "./src/api/index.ts",
				"./commands/land": "./src/commands/land.ts",
				"./land/api": "./src/land/api.ts",
			},
		});

		const violations = collectExportsSubpackageConformanceViolations({
			packageMetadataByName: metadataByName,
		});

		expect(violations).toEqual([]);
	});

	test("allows escaping targets when a remainder is declared", () => {
		const metadataByName = buildSyntheticSubpackageMetadata({
			packageDir: "synthetic/core",
			subpackages: ["api"],
			remainder: true,
			exports: {
				"./leak": "./src/operations/leak.ts",
			},
		});

		const violations = collectExportsSubpackageConformanceViolations({
			packageMetadataByName: metadataByName,
		});

		expect(violations).toEqual([]);
	});

	test("real repo exports maps resolve inside declared subpackages", () => {
		const violations = collectExportsSubpackageConformanceViolations({
			packageMetadataByName: loadPackageMetadata(REPO_ROOT),
		});

		expect(formatViolations(violations)).toBe("");
	});
});

describe("TypeScript style guard extension dependency graph rules", () => {
	const syntheticPackages = new Set([
		"@nseng-ai/branch-context",
		"@nseng-ai/ccc",
		"@nseng-ai/pi",
		"@nseng-ai/kernel",
		"@nseng-ai/flow",
	]);
	const syntheticCapabilityKernelPiCycleEdges: readonly SyntheticEdge[] = [
		{ from: "@nseng-ai/flow", to: "@nseng-ai/pi" },
		{ from: "@nseng-ai/pi", to: "@nseng-ai/kernel" },
		{ from: "@nseng-ai/kernel", to: "@nseng-ai/flow" },
	];
	const cases: readonly DependencyGraphCase[] = [
		{
			name: "acyclic extension manifest graph is allowed",
			edges: [{ from: "@nseng-ai/pi", to: "@nseng-ai/ccc" }],
			shouldHaveCycle: false,
		},
		{
			name: "synthetic extension manifest cycle is rejected",
			edges: [
				{ from: "@nseng-ai/pi", to: "@nseng-ai/ccc" },
				{ from: "@nseng-ai/ccc", to: "@nseng-ai/pi" },
			],
			shouldHaveCycle: true,
			expectedTextIncludes: "dependencies.@nseng-ai/pi",
		},
		{
			name: "synthetic capability pi sdk manifest cycle is rejected",
			edges: syntheticCapabilityKernelPiCycleEdges,
			shouldHaveCycle: true,
			expectedTextIncludes: "dependencies.@nseng-ai/pi",
		},
		{
			name: "branch-context pi manifest cycle is rejected",
			edges: [
				{ from: "@nseng-ai/branch-context", to: "@nseng-ai/pi" },
				{ from: "@nseng-ai/pi", to: "@nseng-ai/branch-context" },
			],
			shouldHaveCycle: true,
			expectedTextIncludes: "dependencies.@nseng-ai/pi",
		},
		{
			name: "devDependencies-only cycle is ignored",
			edges: [
				{ from: "@nseng-ai/pi", to: "@nseng-ai/ccc", field: "devDependencies" },
				{ from: "@nseng-ai/ccc", to: "@nseng-ai/pi", field: "devDependencies" },
			],
			shouldHaveCycle: false,
		},
		{
			name: "field-aware manifest dependency diagnostics point at the participating field",
			metadataByName: buildFieldAwareDiagnosticMetadata(),
			shouldHaveCycle: true,
			expectedTextIncludes: "dependencies.@nseng-ai/ccc",
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

interface OptionalUndefinedAuditCase {
	readonly name: string;
	readonly code: string;
	readonly expectedProperties: readonly string[];
	readonly expectedHasOptionsInputName: boolean;
	readonly expectedHasNull: boolean;
}

type SyntheticDependencyField = ManifestDependencyField | "devDependencies";

interface SyntheticEdge {
	readonly from: string;
	readonly to: string;
	readonly field?: SyntheticDependencyField;
}

interface TierLayeringCase {
	readonly name: string;
	readonly edges?: readonly SyntheticEdge[];
	readonly tiers?: ReadonlyMap<string, SyntheticTier>;
	readonly expectedViolation?: boolean;
	readonly expectedTextIncludes?: string;
}

type SyntheticTier = PackageTier | string | undefined;

interface InternalSpaceAdmissionCase {
	readonly name: string;
	readonly packages: readonly InternalSpaceSyntheticPackage[];
	readonly expectedViolation?: boolean;
	readonly expectedTextIncludes?: string;
}

interface InternalSpaceSyntheticPackage {
	readonly name: string;
	readonly packageDir: string;
	readonly privateValue: boolean;
	readonly dependencies?: Record<string, string>;
}

interface DependencyGraphCase {
	readonly name: string;
	readonly edges?: readonly SyntheticEdge[];
	readonly metadataByName?: ReadonlyMap<string, PackageMetadata>;
	readonly shouldHaveCycle: boolean;
	readonly expectedTextIncludes?: string;
	readonly expectedLine?: number;
}

interface SyntheticSubpackageMetadataOptions {
	readonly packageDir: string;
	readonly subpackages: readonly string[];
	readonly remainder: boolean;
	readonly exports?: Record<string, unknown>;
}

function twoCircleCycleFiles(): readonly TopologyCircleSourceFile[] {
	return [
		{
			path: "synthetic/core/src/alpha/index.ts",
			content: 'import { beta } from "@nseng-ai/core/beta";\nbeta();',
		},
		{
			path: "synthetic/core/src/beta/index.ts",
			content: 'import { alpha } from "@nseng-ai/core/alpha";\nalpha();',
		},
	];
}

function setsAreEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
	return left.size === right.size && [...left].every((value) => right.has(value));
}

function withTempRepo(run: (repoRoot: string) => void): void {
	const repoRoot = mkdtempSync(join(tmpdir(), "ns-subpackage-guard-"));
	try {
		run(repoRoot);
	} finally {
		rmSync(repoRoot, { recursive: true, force: true });
	}
}

function writeSyntheticPackage(
	repoRoot: string,
	packageDir: string,
	sourcePaths: readonly string[],
): void {
	for (const sourcePath of sourcePaths) {
		const absolutePath = join(repoRoot, packageDir, sourcePath);
		mkdirSync(dirname(absolutePath), { recursive: true });
		writeFileSync(absolutePath, "export {};\n");
	}
	writeFileSync(join(repoRoot, packageDir, "package.json"), "{}\n");
}

function buildSyntheticSubpackageMetadata(
	options: SyntheticSubpackageMetadataOptions,
): Map<string, PackageMetadata> {
	const packageName = "@nseng-ai/core";
	const manifest: PackageManifest = {
		name: packageName,
		ns: {
			tier: "neutral-infra",
			subpackages: options.subpackages,
			...(options.remainder ? { remainder: true } : {}),
		},
		...(options.exports === undefined ? {} : { exports: options.exports }),
	};
	return new Map([
		[
			packageName,
			{
				name: packageName,
				packageDir: options.packageDir,
				packageJsonPath: `${options.packageDir}/package.json`,
				manifest,
				manifestContent: JSON.stringify(manifest, null, 2),
				nsTier: "neutral-infra",
				rawNsTier: "neutral-infra",
				nsSubpackages: options.subpackages,
				nsRemainder: options.remainder,
				exportSubpaths:
					options.exports === undefined ? new Set(["."]) : collectExportSubpaths(options.exports),
			},
		],
	]);
}

function buildInternalSpaceSyntheticMetadata(
	packages: readonly InternalSpaceSyntheticPackage[],
): Map<string, PackageMetadata> {
	return new Map(
		packages.map((syntheticPackage) => {
			const manifest: PackageManifest = {
				name: syntheticPackage.name,
				private: syntheticPackage.privateValue,
				dependencies: syntheticPackage.dependencies ?? {},
				ns: { tier: "internal-pi-tool" },
			};
			return [
				syntheticPackage.name,
				{
					name: syntheticPackage.name,
					packageDir: syntheticPackage.packageDir,
					packageJsonPath: `${syntheticPackage.packageDir}/package.json`,
					manifest,
					manifestContent: JSON.stringify(manifest, null, 2),
					nsTier: "internal-pi-tool",
					rawNsTier: "internal-pi-tool",
					nsSubpackages: [],
					nsRemainder: false,
					exportSubpaths: new Set(["."]),
				},
			];
		}),
	);
}

function internalSpaceSyntheticPackage(
	options: InternalSpaceSyntheticPackage,
): InternalSpaceSyntheticPackage {
	return options;
}

function buildSyntheticPackageMetadata(
	packageNames: ReadonlySet<string>,
	edges: readonly SyntheticEdge[] = [],
	tiersByPackage: ReadonlyMap<string, SyntheticTier> = new Map(),
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
		const rawNsTier = tiersByPackage.has(packageName)
			? tiersByPackage.get(packageName)
			: "capability";
		const manifest = buildSyntheticManifest(packageName, fields, rawNsTier);
		metadataByName.set(packageName, {
			name: packageName,
			packageDir: `synthetic/${packageName}`,
			packageJsonPath: `synthetic/${packageName}/package.json`,
			manifest,
			manifestContent: JSON.stringify(manifest, null, 2),
			nsTier: isSyntheticPackageTier(rawNsTier) ? rawNsTier : undefined,
			rawNsTier,
			nsSubpackages: [],
			nsRemainder: false,
			exportSubpaths: new Set(["."]),
		});
	}
	return metadataByName;
}

function buildFieldAwareDiagnosticMetadata(): Map<string, PackageMetadata> {
	const packageNames = new Set(["@nseng-ai/ccc", "@nseng-ai/pi"]);
	const metadataByName = buildSyntheticPackageMetadata(packageNames, [
		{ from: "@nseng-ai/pi", to: "@nseng-ai/ccc", field: "dependencies" },
		{ from: "@nseng-ai/ccc", to: "@nseng-ai/pi", field: "dependencies" },
	]);
	const piMetadata = metadataByName.get("@nseng-ai/pi");
	if (piMetadata === undefined) throw new Error("Missing synthetic @nseng-ai/pi metadata");
	const manifest: PackageManifest = {
		name: "@nseng-ai/pi",
		devDependencies: {
			"@nseng-ai/ccc": "workspace:*",
		},
		dependencies: {
			"@nseng-ai/ccc": "workspace:*",
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
	rawNsTier: SyntheticTier,
): PackageManifest {
	return {
		name: packageName,
		...(rawNsTier === undefined ? {} : { ns: { tier: rawNsTier } }),
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

function isSyntheticPackageTier(value: SyntheticTier): value is PackageTier {
	return (
		value === "capability" ||
		value === "capability-kit" ||
		value === "sdk" ||
		value === "neutral-infra" ||
		value === "host" ||
		value === "capability-pi" ||
		value === "standalone-tool" ||
		value === "internal-pi-tool" ||
		value === "internal-tool"
	);
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
