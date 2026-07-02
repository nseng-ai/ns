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
	BAN_EXTENSION_DEPENDENCY_CYCLE,
	BAN_IMPORT_ALIAS_FOR_FIRST_PARTY,
	BAN_LOCAL_SPACE_ADMISSION,
	BAN_PACKAGE_TIER_LAYERING,
	BAN_RAW_PRODUCTION_TIMERS,
	BAN_SUBPACKAGE_DECLARATION_CONFORMANCE,
	BAN_TOPOLOGY_CIRCLE_CYCLE,
	BAN_TOPOLOGY_CIRCLE_LAYERING,
	BAN_SNAKE_CASE_CLI_MACHINE_VALUE,
	deferredExtensionCycleComponents,
	deferredTopologyCircleCycles,
	extensionGraphPackageNames,
	type DeferredTopologyCircleCycle,
	type ManifestDependencyField,
	type PackageTier,
} from "../support/typescript-style-guard/config.ts";
import {
	collectExtensionDependencyCycleViolations,
	findCycleComponents,
} from "../support/typescript-style-guard/dependency-graph.ts";
import { findTypeScriptSourceFiles } from "../support/typescript-style-guard/file-discovery.ts";
import { collectLocalSpaceAdmissionViolations } from "../support/typescript-style-guard/local-space.ts";
import {
	loadPackageMetadata,
	type PackageManifest,
	type PackageMetadata,
} from "../support/typescript-style-guard/package-metadata.ts";
import { collectOptionalUndefinedPropertyCandidates } from "../support/typescript-style-guard/optional-undefined-audit.ts";
import {
	collectViolations,
	type SourceRuleViolation,
} from "../support/typescript-style-guard/source-rules.ts";
import { collectPackageTierLayeringViolations } from "../support/typescript-style-guard/tier-layering.ts";
import { collectSubpackageDeclarationConformanceViolations } from "../support/typescript-style-guard/subpackage-conformance.ts";
import {
	collectTopologyCircleCycleViolations,
	collectTopologyCircleImportEdges,
	collectTopologyCircleLayeringViolations,
	discoverTopologyCircles,
	type TopologyCircleFact,
	type TopologyCircleImportEdge,
	type TopologyCircleSourceFile,
} from "../support/typescript-style-guard/topology-circles.ts";

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
			code: 'import { Foo as Bar } from "@sdl/core/primitives";',
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
			code: 'import {\n  type Foo as Bar,\n} from "@sdl/core/primitives";',
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
			path: "ts/packages/capabilities/ccc/src/core/peer.ts",
			expectedRules: [],
		},
		{
			name: "capability private src import is rejected",
			code: 'import { createHandoff } from "@sdl/handoff/src/create.ts";',
			path: "ts/packages/capabilities/ccc/src/core/peer.ts",
			expectedRules: [BAN_CAPABILITY_PRIVATE_PEER_IMPORT],
		},
		{
			name: "capability undeclared subpath import is rejected",
			code: 'import { createHandoff } from "@sdl/handoff/private-helper";',
			path: "ts/packages/capabilities/ccc/src/core/peer.ts",
			expectedRules: [BAN_CAPABILITY_PRIVATE_PEER_IMPORT],
		},
		{
			name: "capability gateway backend import is allowed for capabilities",
			code: 'import { RealGitGateway } from "@sdl/capability-kit/git";',
			path: "ts/packages/capabilities/ccc/src/core/peer.ts",
			expectedRules: [],
		},
		{
			name: "capability-kit import is allowed for capabilities",
			code: 'import { createSdlCliExecAdapter } from "@sdl/capability-kit/git";',
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
			code: 'import { Foo } from "@sdl/core/primitives";',
			expectedRules: [],
		},
		{
			name: "export alias is outside the import-as rule",
			code: 'export { Foo as Bar } from "@sdl/core/primitives";',
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

describe("TypeScript style guard local-space admission rules", () => {
	const cases: readonly LocalSpaceAdmissionCase[] = [
		{
			name: "rejects packages under local with a non-local scope",
			packages: [
				localSpaceSyntheticPackage({
					name: "@sdl/grill",
					packageDir: "ts/packages/local/grill",
					privateValue: true,
				}),
			],
			expectedTextIncludes: "must use the @sdl-local/ scope",
		},
		{
			name: "rejects sdl-local packages outside local",
			packages: [
				localSpaceSyntheticPackage({
					name: "@sdl-local/pi-tools",
					packageDir: "ts/packages/misplaced/pi-tools",
					privateValue: true,
				}),
			],
			expectedTextIncludes: "must live under ts/packages/local",
		},
		{
			name: "rejects non-private sdl-local packages",
			packages: [
				localSpaceSyntheticPackage({
					name: "@sdl-local/pi-tools",
					packageDir: "ts/packages/local/pi-tools",
					privateValue: false,
				}),
			],
			expectedTextIncludes: "must be private",
		},
		{
			name: "rejects outside workspace dependents on sdl-local packages",
			packages: [
				localSpaceSyntheticPackage({
					name: "@sdl-local/pi-tools",
					packageDir: "ts/packages/local/pi-tools",
					privateValue: true,
				}),
				localSpaceSyntheticPackage({
					name: "@sdl/ccc",
					packageDir: "ts/packages/capabilities/ccc",
					privateValue: true,
					dependencies: { "@sdl-local/pi-tools": "workspace:*" },
				}),
			],
			expectedTextIncludes: "must not depend on local-space package @sdl-local/pi-tools",
		},
		{
			name: "allows private sdl-local packages under local",
			packages: [
				localSpaceSyntheticPackage({
					name: "@sdl-local/pi-tools",
					packageDir: "ts/packages/local/pi-tools",
					privateValue: true,
				}),
			],
			expectedViolation: false,
		},
	];

	test.each(cases)("$name", (testCase) => {
		const violations = collectLocalSpaceAdmissionViolations(
			buildLocalSpaceSyntheticMetadata(testCase.packages),
		);
		const actualHasViolation = violations.some(
			(violation) => violation.rule === BAN_LOCAL_SPACE_ADMISSION,
		);

		expect(actualHasViolation).toBe(testCase.expectedViolation ?? true);
		const expectedTextIncludes = testCase.expectedTextIncludes;
		if (expectedTextIncludes !== undefined) {
			expect(violations.some((violation) => violation.text.includes(expectedTextIncludes))).toBe(
				true,
			);
		}
	});

	test("real repo package manifests satisfy local-space admission policy", () => {
		const violations = collectLocalSpaceAdmissionViolations(loadPackageMetadata(REPO_ROOT));

		expect(formatViolations(violations)).toBe("");
	});
});

describe("TypeScript style guard package tier layering rules", () => {
	const syntheticPackages = new Set([
		"@sdl-local/pi-tools/grill",
		"@sdl-local/pi-tools/runner-subagents",
		"@sdl/areg",
		"@sdl/ccc",
		"@sdl/capability-kit",
		"@sdl/core",
		"@sdl/handoff",
		"@sdl/example-pi",
		"@sdl/pi",
		"@sdl/kernel",
		"@sdl/slot",
	]);
	const baseTiers = new Map<string, SyntheticTier>([
		["@sdl-local/pi-tools/grill", "local-pi-tool"],
		["@sdl-local/pi-tools/runner-subagents", "local-pi-tool"],
		["@sdl/areg", "standalone-tool"],
		["@sdl/ccc", "capability"],
		["@sdl/capability-kit", "capability-kit"],
		["@sdl/core", "neutral-infra"],
		["@sdl/handoff", "capability"],
		["@sdl/example-pi", "capability-pi"],
		["@sdl/pi", "host"],
		["@sdl/kernel", "sdk"],
		["@sdl/slot", "capability"],
	]);
	const cases: readonly TierLayeringCase[] = [
		{
			name: "missing tier is rejected",
			tiers: new Map([...baseTiers, ["@sdl/ccc", undefined]]),
			expectedTextIncludes: "missing sdl.tier",
		},
		{
			name: "unknown tier is rejected",
			tiers: new Map([...baseTiers, ["@sdl/ccc", "mystery-tier"]]),
			expectedTextIncludes: "unknown sdl.tier",
		},
		{
			name: "capability to host is rejected",
			edges: [{ from: "@sdl/handoff", to: "@sdl/pi" }],
			expectedTextIncludes: "capability-must-not-depend-on-host",
		},
		{
			name: "sdk to capability is rejected",
			edges: [{ from: "@sdl/kernel", to: "@sdl/handoff" }],
			expectedTextIncludes: "sdk-must-not-depend-on-capability",
		},
		{
			name: "allowlisted sdk to capability debt is accepted",
			edges: [{ from: "@sdl/kernel", to: "@sdl/slot" }],
			expectedViolation: false,
		},
		{
			name: "capability to capability is allowed",
			edges: [{ from: "@sdl/ccc", to: "@sdl/handoff" }],
			expectedViolation: false,
		},
		{
			name: "capability pi to host is allowed",
			edges: [{ from: "@sdl/example-pi", to: "@sdl/pi" }],
			expectedViolation: false,
		},
		{
			name: "capability pi to capability is allowed",
			edges: [{ from: "@sdl/example-pi", to: "@sdl/handoff" }],
			expectedViolation: false,
		},
		{
			name: "capability to capability pi is rejected",
			edges: [{ from: "@sdl/handoff", to: "@sdl/example-pi" }],
			expectedTextIncludes: "capability-must-not-depend-on-capability-pi",
		},
		{
			name: "standalone tool to host is allowed",
			edges: [{ from: "@sdl/areg", to: "@sdl/pi" }],
			expectedViolation: false,
		},
		{
			name: "local pi tool to host is allowed",
			edges: [{ from: "@sdl-local/pi-tools/grill", to: "@sdl/pi" }],
			expectedViolation: false,
		},
		{
			name: "local pi tool to local pi tool is allowed",
			edges: [{ from: "@sdl-local/pi-tools/grill", to: "@sdl-local/pi-tools/runner-subagents" }],
			expectedViolation: false,
		},
		{
			name: "local pi tool to standalone tool is rejected",
			edges: [{ from: "@sdl-local/pi-tools/grill", to: "@sdl/areg" }],
			expectedTextIncludes: "local-pi-tool-must-not-depend-on-standalone-tool",
		},
		{
			name: "standalone tool to local pi tool is rejected",
			edges: [{ from: "@sdl/areg", to: "@sdl-local/pi-tools/grill" }],
			expectedTextIncludes: "standalone-tool-must-not-depend-on-local-pi-tool",
		},
		{
			name: "capability to capability kit is allowed",
			edges: [{ from: "@sdl/handoff", to: "@sdl/capability-kit" }],
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
			id: "@sdl/core",
			packageName: "@sdl/core",
			component: ".",
			tier: "neutral-infra",
			path: "synthetic/core/src",
		},
		{
			id: "@sdl/core/time",
			packageName: "@sdl/core",
			component: "time",
			tier: "neutral-infra",
			path: "synthetic/core/src/time",
		},
		{
			id: "@sdl/slot",
			packageName: "@sdl/slot",
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
					content: 'import { clock } from "@sdl/core/clock";',
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
					content: 'import { buildSlotCommandGroup } from "@sdl/slot";',
				},
			],
		});

		expect(violations.map((violation) => violation.rule)).toEqual([BAN_TOPOLOGY_CIRCLE_LAYERING]);
		expect(violations[0]?.text).toContain("@sdl/core/time (neutral-infra) -> @sdl/slot");
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
		expect(violations[0]?.text).toContain("@sdl/core/time");
	});

	test("discovers the core time pilot circle from the package manifest", () => {
		const packageMetadataByName = loadPackageMetadata(REPO_ROOT);
		const coreMetadata = packageMetadataByName.get("@sdl/core");
		if (coreMetadata === undefined) throw new Error("Missing @sdl/core package metadata");
		const circles = discoverTopologyCircles(REPO_ROOT, packageMetadataByName);
		const retiredTimePackageName = "@sdl/" + "time";

		expect(coreMetadata.sdlSubpackages).toContain("time");
		expect(circles.has("@sdl/core/time")).toBe(true);
		expect(packageMetadataByName.has(retiredTimePackageName)).toBe(false);
	});

	test("does not auto-discover undeclared source directories as circles", () => {
		const circles = discoverTopologyCircles(REPO_ROOT, loadPackageMetadata(REPO_ROOT));

		expect(circles.has("@sdl/aretro/operations")).toBe(false);
		expect(circles.has("@sdl/aretro/payloads")).toBe(false);
		expect(circles.has("@sdl/aretro/sdl")).toBe(false);
		expect(circles.has("@sdl/aretro/sessions")).toBe(false);
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
			id: "@sdl/core/alpha",
			packageName: "@sdl/core",
			component: "alpha",
			tier: "neutral-infra",
			path: "synthetic/core/src/alpha",
		},
		{
			id: "@sdl/core/beta",
			packageName: "@sdl/core",
			component: "beta",
			tier: "neutral-infra",
			path: "synthetic/core/src/beta",
		},
		{
			id: "@sdl/core/gamma",
			packageName: "@sdl/core",
			component: "gamma",
			tier: "neutral-infra",
			path: "synthetic/core/src/gamma",
		},
	];
	const alphaBetaDeferral: DeferredTopologyCircleCycle = {
		name: "alpha-beta",
		packageName: "@sdl/core",
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
			"non-deferred subpackage circle cycle in @sdl/core among alpha, beta",
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
					content: 'import { beta } from "@sdl/core/beta";\nbeta();',
				},
				{
					path: "synthetic/core/src/beta/index.ts",
					content: 'import { gamma } from "@sdl/core/gamma";\ngamma();',
				},
				{
					path: "synthetic/core/src/gamma/index.ts",
					content: 'import { alpha } from "@sdl/core/alpha";\nalpha();',
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
						'import { beta } from "@sdl/core/beta";\nimport { helper } from "./helper.ts";\nbeta();\nhelper();',
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
		const actualCycles = detectTopologyCircleCycleComponents(importEdges);

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
			expect(violations[0]?.text).toContain("without sdl.remainder");
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

describe("TypeScript style guard extension dependency graph rules", () => {
	const syntheticPackages = new Set([
		"@sdl/branch-context",
		"@sdl/ccc",
		"@sdl/pi",
		"@sdl/kernel",
		"sdl-flow",
	]);
	const syntheticCapabilityKernelPiCycleEdges: readonly SyntheticEdge[] = [
		{ from: "sdl-flow", to: "@sdl/pi" },
		{ from: "@sdl/pi", to: "@sdl/kernel" },
		{ from: "@sdl/kernel", to: "sdl-flow" },
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
			name: "synthetic capability pi sdk manifest cycle is rejected",
			edges: syntheticCapabilityKernelPiCycleEdges,
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

interface TopologyCircleCycleComponent {
	readonly packageName: string;
	readonly circles: ReadonlySet<string>;
}

interface TierLayeringCase {
	readonly name: string;
	readonly edges?: readonly SyntheticEdge[];
	readonly tiers?: ReadonlyMap<string, SyntheticTier>;
	readonly expectedViolation?: boolean;
	readonly expectedTextIncludes?: string;
}

type SyntheticTier = PackageTier | string | undefined;

interface LocalSpaceAdmissionCase {
	readonly name: string;
	readonly packages: readonly LocalSpaceSyntheticPackage[];
	readonly expectedViolation?: boolean;
	readonly expectedTextIncludes?: string;
}

interface LocalSpaceSyntheticPackage {
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
}

function twoCircleCycleFiles(): readonly TopologyCircleSourceFile[] {
	return [
		{
			path: "synthetic/core/src/alpha/index.ts",
			content: 'import { beta } from "@sdl/core/beta";\nbeta();',
		},
		{
			path: "synthetic/core/src/beta/index.ts",
			content: 'import { alpha } from "@sdl/core/alpha";\nalpha();',
		},
	];
}

function detectTopologyCircleCycleComponents(
	importEdges: readonly TopologyCircleImportEdge[],
): readonly TopologyCircleCycleComponent[] {
	const intraPackageEdges = importEdges.filter(
		(edge) => edge.from.packageName === edge.to.packageName && edge.from.id !== edge.to.id,
	);
	const edgesByPackage = new Map<string, TopologyCircleImportEdge[]>();
	for (const edge of intraPackageEdges) {
		const packageEdges = edgesByPackage.get(edge.from.packageName) ?? [];
		packageEdges.push(edge);
		edgesByPackage.set(edge.from.packageName, packageEdges);
	}

	const cycles: TopologyCircleCycleComponent[] = [];
	for (const [packageName, packageEdges] of edgesByPackage) {
		const circlesById = new Map<string, TopologyCircleFact>();
		for (const edge of packageEdges) {
			circlesById.set(edge.from.id, edge.from);
			circlesById.set(edge.to.id, edge.to);
		}
		const components = findCycleComponents(
			[...circlesById.keys()].sort(),
			packageEdges.map((edge) => ({ from: edge.from.id, to: edge.to.id })),
		);
		for (const component of components) {
			cycles.push({
				packageName,
				circles: new Set(
					component.map((circleId) => requiredCircleComponent(circlesById, circleId)),
				),
			});
		}
	}
	return cycles.sort((left, right) =>
		`${left.packageName}\0${[...left.circles].sort().join("\0")}`.localeCompare(
			`${right.packageName}\0${[...right.circles].sort().join("\0")}`,
		),
	);
}

function setsAreEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
	return left.size === right.size && [...left].every((value) => right.has(value));
}

function requiredCircleComponent(
	circlesById: ReadonlyMap<string, TopologyCircleFact>,
	circleId: string,
): string {
	const circle = circlesById.get(circleId);
	if (circle === undefined) throw new Error(`Missing topology circle ${circleId}`);
	return circle.component;
}

function withTempRepo(run: (repoRoot: string) => void): void {
	const repoRoot = mkdtempSync(join(tmpdir(), "sdl-subpackage-guard-"));
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
	const packageName = "@sdl/core";
	const manifest: PackageManifest = {
		name: packageName,
		sdl: {
			tier: "neutral-infra",
			subpackages: options.subpackages,
			...(options.remainder ? { remainder: true } : {}),
		},
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
				sdlTier: "neutral-infra",
				rawSdlTier: "neutral-infra",
				sdlSubpackages: options.subpackages,
				sdlRemainder: options.remainder,
				exportSubpaths: new Set(["."]),
			},
		],
	]);
}

function buildLocalSpaceSyntheticMetadata(
	packages: readonly LocalSpaceSyntheticPackage[],
): Map<string, PackageMetadata> {
	return new Map(
		packages.map((syntheticPackage) => {
			const manifest: PackageManifest = {
				name: syntheticPackage.name,
				private: syntheticPackage.privateValue,
				dependencies: syntheticPackage.dependencies ?? {},
				sdl: { tier: "local-pi-tool" },
			};
			return [
				syntheticPackage.name,
				{
					name: syntheticPackage.name,
					packageDir: syntheticPackage.packageDir,
					packageJsonPath: `${syntheticPackage.packageDir}/package.json`,
					manifest,
					manifestContent: JSON.stringify(manifest, null, 2),
					sdlTier: "local-pi-tool",
					rawSdlTier: "local-pi-tool",
					sdlSubpackages: [],
					sdlRemainder: false,
					exportSubpaths: new Set(["."]),
				},
			];
		}),
	);
}

function localSpaceSyntheticPackage(
	options: LocalSpaceSyntheticPackage,
): LocalSpaceSyntheticPackage {
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
		const rawSdlTier = tiersByPackage.has(packageName)
			? tiersByPackage.get(packageName)
			: "capability";
		const manifest = buildSyntheticManifest(packageName, fields, rawSdlTier);
		metadataByName.set(packageName, {
			name: packageName,
			packageDir: `synthetic/${packageName}`,
			packageJsonPath: `synthetic/${packageName}/package.json`,
			manifest,
			manifestContent: JSON.stringify(manifest, null, 2),
			sdlTier: isSyntheticPackageTier(rawSdlTier) ? rawSdlTier : undefined,
			rawSdlTier,
			sdlSubpackages: [],
			sdlRemainder: false,
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
	rawSdlTier: SyntheticTier,
): PackageManifest {
	return {
		name: packageName,
		...(rawSdlTier === undefined ? {} : { sdl: { tier: rawSdlTier } }),
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
		value === "local-pi-tool"
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
