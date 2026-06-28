import {
  BAN_AS_UNKNOWN_AS,
  BAN_CAPABILITY_PRIVATE_PEER_IMPORT,
  BAN_EMPTY_INTERFACE_EXTENDS,
  BAN_EXTENSION_DEPENDENCY_CYCLE,
  BAN_IMPORT_ALIAS_FOR_FIRST_PARTY,
  deferredExtensionCycleComponents,
} from "./config.mjs";
import { collectExtensionDependencyCycleViolations } from "./dependency-graph.mjs";
import { collectViolations } from "./source-rules.mjs";

export function runAdversarialReview(packageMetadataByName) {
  runExtensionDependencyGraphAdversarialReview();

  const cases = [
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

  for (const testCase of cases) {
    const actualRules = collectViolations(
      testCase.code,
      testCase.path ?? `adversarial/${testCase.name}.ts`,
      packageMetadataByName,
    ).map((violation) => violation.rule);
    const expected = [...testCase.expectedRules].sort();
    const actual = [...actualRules].sort();
    if (expected.join("\n") !== actual.join("\n")) {
      reportAdversarialReviewFailure(testCase.name, expected, actual);
    }
  }
}

function runExtensionDependencyGraphAdversarialReview() {
  const syntheticPackages = new Set([
    "@sdl/autobranch",
    "@sdl/branch-context",
    "@sdl/ccc",
    "@sdl/pi",
    "@sdl/sdl",
  ]);
  const legacyDeferredCycleEdges = [
    { from: "@sdl/autobranch", to: "@sdl/pi" },
    { from: "@sdl/pi", to: "@sdl/sdl" },
    { from: "@sdl/sdl", to: "@sdl/autobranch" },
  ];
  const cases = [
    {
      name: "acyclic extension manifest graph is allowed",
      edges: [{ from: "@sdl/pi", to: "@sdl/ccc" }],
      expectedHasCycle: false,
    },
    {
      name: "synthetic extension manifest cycle is rejected",
      edges: [
        { from: "@sdl/pi", to: "@sdl/ccc" },
        { from: "@sdl/ccc", to: "@sdl/pi" },
      ],
      expectedHasCycle: true,
      expectedTextIncludes: "dependencies.@sdl/pi",
    },
    {
      name: "known deferred extension manifest SCC is allowed",
      edges: legacyDeferredCycleEdges,
      expectedHasCycle: false,
    },
    {
      name: "cycle wholly inside legacy deferred package set is allowed",
      edges: [
        { from: "@sdl/autobranch", to: "@sdl/pi" },
        { from: "@sdl/pi", to: "@sdl/autobranch" },
      ],
      expectedHasCycle: false,
    },
    {
      name: "branch-context pi manifest cycle is rejected",
      edges: [
        { from: "@sdl/branch-context", to: "@sdl/pi" },
        { from: "@sdl/pi", to: "@sdl/branch-context" },
      ],
      expectedHasCycle: true,
      expectedTextIncludes: "legacy-autobranch-pi-sdl-cycle",
    },
    {
      name: "branch-context expansion of deferred SCC is rejected",
      edges: [
        ...legacyDeferredCycleEdges,
        { from: "@sdl/pi", to: "@sdl/branch-context" },
        { from: "@sdl/branch-context", to: "@sdl/autobranch" },
      ],
      expectedHasCycle: true,
      expectedTextIncludes: "legacy-autobranch-pi-sdl-cycle",
    },
    {
      name: "devDependencies-only cycle is ignored",
      edges: [
        { from: "@sdl/pi", to: "@sdl/ccc", field: "devDependencies" },
        { from: "@sdl/ccc", to: "@sdl/pi", field: "devDependencies" },
      ],
      expectedHasCycle: false,
    },
    {
      name: "field-aware manifest dependency diagnostics point at the participating field",
      metadataByName: buildFieldAwareDiagnosticMetadata(),
      expectedHasCycle: true,
      expectedTextIncludes: "dependencies.@sdl/ccc",
      expectedLine: 7,
    },
  ];

  for (const testCase of cases) {
    const metadataByName = testCase.metadataByName ?? buildSyntheticPackageMetadata(syntheticPackages, testCase.edges);
    const violations = collectExtensionDependencyCycleViolations(
      metadataByName,
      syntheticPackages,
      deferredExtensionCycleComponents,
    );
    const actualRules = violations.map((violation) => violation.rule);
    const actualHasCycle = actualRules.includes(BAN_EXTENSION_DEPENDENCY_CYCLE);
    if (actualHasCycle !== testCase.expectedHasCycle) {
      const expected = testCase.expectedHasCycle ? [BAN_EXTENSION_DEPENDENCY_CYCLE] : [];
      const actual = [...new Set(actualRules)].sort();
      reportAdversarialReviewFailure(testCase.name, expected, actual);
    }
    if (testCase.expectedTextIncludes !== undefined && !violations.some((violation) => violation.text.includes(testCase.expectedTextIncludes))) {
      reportAdversarialReviewFailure(testCase.name, [`text includes ${testCase.expectedTextIncludes}`], violations.map((violation) => violation.text));
    }
    if (testCase.expectedLine !== undefined && !violations.some((violation) => violation.line === testCase.expectedLine)) {
      reportAdversarialReviewFailure(testCase.name, [`line ${testCase.expectedLine}`], violations.map((violation) => `line ${violation.line}`));
    }
  }
}

function buildSyntheticPackageMetadata(packageNames, edges = []) {
  const dependenciesByPackage = new Map(
    [...packageNames].map((packageName) => [
      packageName,
      {
        dependencies: {},
        optionalDependencies: {},
        peerDependencies: {},
        devDependencies: {},
      },
    ]),
  );
  for (const edge of edges) {
    const field = edge.field ?? "dependencies";
    dependenciesByPackage.get(edge.from)[field][edge.to] = "workspace:*";
  }

  const metadataByName = new Map();
  for (const packageName of [...packageNames].sort()) {
    const fields = dependenciesByPackage.get(packageName);
    const manifest = {
      name: packageName,
      ...(Object.keys(fields.devDependencies).length === 0 ? {} : { devDependencies: fields.devDependencies }),
      ...(Object.keys(fields.dependencies).length === 0 ? {} : { dependencies: fields.dependencies }),
      ...(Object.keys(fields.optionalDependencies).length === 0 ? {} : { optionalDependencies: fields.optionalDependencies }),
      ...(Object.keys(fields.peerDependencies).length === 0 ? {} : { peerDependencies: fields.peerDependencies }),
    };
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

function buildFieldAwareDiagnosticMetadata() {
  const packageNames = new Set(["@sdl/ccc", "@sdl/pi"]);
  const metadataByName = buildSyntheticPackageMetadata(packageNames, [
    { from: "@sdl/pi", to: "@sdl/ccc", field: "dependencies" },
    { from: "@sdl/ccc", to: "@sdl/pi", field: "dependencies" },
  ]);
  const piMetadata = metadataByName.get("@sdl/pi");
  const manifest = {
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

function reportAdversarialReviewFailure(caseName, expected, actual) {
  console.error("TypeScript style guard adversarial review failed.");
  console.error(`Case: ${caseName}`);
  console.error(`Expected rules: ${expected.join(", ") || "(none)"}`);
  console.error(`Actual rules: ${actual.join(", ") || "(none)"}`);
  process.exit(2);
}
