#!/usr/bin/env node
import { createRequire } from "node:module";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const ts = require(path.resolve("ts/node_modules/typescript"));

const DEFAULT_SCOPES = ["ts"];
// Keep this Objective-owned script self-contained while it remains under .ns.
// Shared test-support discovery helpers are TypeScript modules with nearby guard-specific
// conventions; consolidate there only if this scorecard graduates to shared infrastructure.
const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".turbo"]);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLASSIFIED_PRESERVES_FILE = path.join(SCRIPT_DIR, "classified-preserves.json");

function usage() {
  return `Usage: node .ns/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs [options] [scope ...]

Measure the eliminate-redundant-optional-undefined Objective scorecard.

Scopes default to: ${DEFAULT_SCOPES.join(" ")}

Options:
  --format markdown|json   Output format (default: markdown)
  --json                   Alias for --format json
  --include-marked         Deprecated compatibility flag; legacy marker comments
                           are now reported as stale artifacts, not exclusions.
  --self-test              Run built-in fixture tests
  -h, --help               Show this help

Metrics:
  1. raw optional-undefined property count: AST PropertySignature and
     PropertyDeclaration nodes with a ? token and explicit undefined union,
     e.g. foo?: string | undefined. This raw count is preserved for historical
     comparability.
  2. classified preserve count: raw optional-undefined matches covered by
     explicit Objective metadata in tools/classified-preserves.json.
  3. actionable raw optional-undefined debt: raw optional-undefined matches
     minus metadata-matched classified preserves.
  4. typed explicit-undefined contract count: optional properties typed with
     ExplicitUndefined<Reason, T>.
  5. legacy preserve marker count: stale optional-undefined-objective preserve
     comments that should be migrated to typed contracts.
  6. undefined-normalization/check count: AST binary expressions that compare
     a value with undefined using === or !==.

Known caveat: this is Objective-owned temporary tooling. It intentionally reports
raw, review-aiding counts with additive metadata-backed classification.
`;
}

function parseArgs(argv) {
  const args = [...argv];
  const scopes = [];
  let format = "markdown";
  let selfTest = false;
  let includeMarked = false;

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "-h" || arg === "--help") {
      return { help: true, scopes, format, selfTest, includeMarked };
    }
    if (arg === "--self-test") {
      selfTest = true;
      continue;
    }
    if (arg === "--include-marked") {
      includeMarked = true;
      continue;
    }
    if (arg === "--json") {
      format = "json";
      continue;
    }
    if (arg === "--format") {
      const next = args.shift();
      if (next !== "markdown" && next !== "json") {
        throw new Error("--format must be markdown or json");
      }
      format = next;
      continue;
    }
    if (arg?.startsWith("--format=")) {
      const value = arg.slice("--format=".length);
      if (value !== "markdown" && value !== "json") {
        throw new Error("--format must be markdown or json");
      }
      format = value;
      continue;
    }
    if (arg?.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (arg !== undefined) {
      scopes.push(arg);
    }
  }

  return { help: false, scopes: scopes.length > 0 ? scopes : DEFAULT_SCOPES, format, selfTest, includeMarked };
}

async function listFiles(scope) {
  const absoluteScope = path.resolve(scope);
  const stat = await safeStat(absoluteScope);
  if (stat === undefined) {
    throw new Error(`Scope does not exist: ${scope}`);
  }
  if (stat.isFile()) {
    return TS_EXTENSIONS.has(path.extname(absoluteScope)) ? [absoluteScope] : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }

  const files = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(path.join(dir, entry.name));
        }
        continue;
      }
      if (entry.isFile()) {
        const file = path.join(dir, entry.name);
        if (TS_EXTENSIONS.has(path.extname(file))) {
          files.push(file);
        }
      }
    }
  }
  await walk(absoluteScope);
  return files.sort();
}

async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function loadClassifiedPreserveMetadata() {
  const text = await readFile(CLASSIFIED_PRESERVES_FILE, "utf8");
  const metadata = JSON.parse(text);
  if (!metadata || typeof metadata !== "object" || !Array.isArray(metadata.preserves)) {
    throw new Error(`Invalid classified preserve metadata: ${path.relative(process.cwd(), CLASSIFIED_PRESERVES_FILE)}`);
  }
  return metadata;
}

function parseSourceFile(fileName, text) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
}

function countOptionalUndefinedProperties(sourceFile) {
  // This Objective metric intentionally uses local AST predicates for now: it counts
  // property signatures and property declarations, then separates typed explicit-undefined
  // contracts from raw optional-undefined debt.
  // The existing TypeScript style-guard audit is advisory test support; reuse it only
  // after aligning those semantics with this scorecard's reporting needs.
  const matches = [];
  const typedExplicitUndefinedMatches = [];

  function visit(node) {
    if (isOptionalPropertyNode(node)) {
      if (isExplicitUndefinedType(node.type)) {
        typedExplicitUndefinedMatches.push(lineNumber(sourceFile, node));
      } else if (includesUndefinedType(node.type)) {
        matches.push(optionalUndefinedMatch(sourceFile, node));
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { matches, typedExplicitUndefinedMatches };
}

function optionalUndefinedMatch(sourceFile, node) {
  return {
    property: propertyName(node.name),
    line: lineNumber(sourceFile, node),
    declaration: node.getText(sourceFile),
  };
}

function propertyName(name) {
  if (name === undefined) {
    return "<unknown>";
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

function countLegacyPreserveMarkers(sourceFile) {
  const matches = [];
  const markerPattern = /optional-undefined-objective:\s*preserve/g;
  let match;
  while ((match = markerPattern.exec(sourceFile.text)) !== null) {
    matches.push(sourceFile.getLineAndCharacterOfPosition(match.index).line + 1);
  }
  return matches;
}

function isOptionalPropertyNode(node) {
  return (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) && node.questionToken !== undefined;
}

function includesUndefinedType(typeNode) {
  if (typeNode === undefined) {
    return false;
  }
  if (typeNode.kind === ts.SyntaxKind.UndefinedKeyword) {
    return true;
  }
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.some((child) => includesUndefinedType(child));
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return includesUndefinedType(typeNode.type);
  }
  return false;
}

function isExplicitUndefinedType(typeNode) {
  if (typeNode === undefined) {
    return false;
  }
  if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
    return typeNode.typeName.text === "ExplicitUndefined";
  }
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.some((child) => isExplicitUndefinedType(child));
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return isExplicitUndefinedType(typeNode.type);
  }
  return false;
}

function countUndefinedChecks(sourceFile) {
  const matches = [];

  function visit(node) {
    if (ts.isBinaryExpression(node) && isUndefinedComparison(node)) {
      matches.push(lineNumber(sourceFile, node));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return matches;
}

function isUndefinedComparison(node) {
  const operatorKind = node.operatorToken.kind;
  if (operatorKind !== ts.SyntaxKind.EqualsEqualsEqualsToken && operatorKind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) {
    return false;
  }
  return isUndefinedExpression(node.left) || isUndefinedExpression(node.right);
}

function isUndefinedExpression(node) {
  return node.kind === ts.SyntaxKind.Identifier && node.escapedText === "undefined";
}

function lineNumber(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function classifyOptionalUndefinedMatches(rawMatches, metadata) {
  const usedRawIndexes = new Set();
  const classifiedPreserves = [];
  const stalePreserves = [];

  for (const preserve of metadata.preserves) {
    const rawIndex = rawMatches.findIndex((match, index) => {
      return !usedRawIndexes.has(index)
        && match.path === preserve.path
        && match.property === preserve.property
        && match.declaration.includes(preserve.declarationContains);
    });

    if (rawIndex === -1) {
      stalePreserves.push({
        path: preserve.path,
        property: preserve.property,
        kind: preserve.kind,
        declarationContains: preserve.declarationContains,
        rationale: preserve.rationale,
      });
      continue;
    }

    usedRawIndexes.add(rawIndex);
    const rawMatch = rawMatches[rawIndex];
    classifiedPreserves.push({
      path: rawMatch.path,
      property: rawMatch.property,
      kind: preserve.kind,
      line: rawMatch.line,
      declarationContains: preserve.declarationContains,
      rationale: preserve.rationale,
    });
  }

  const actionableMatches = rawMatches.filter((_, index) => !usedRawIndexes.has(index)).map(({ path, property, line, declaration }) => ({
    path,
    property,
    line,
    declaration,
  }));

  return { classifiedPreserves, stalePreserves, actionableMatches };
}

async function measure(scopes, includeMarked = false) {
  const metadata = await loadClassifiedPreserveMetadata();
  const filesByScope = await Promise.all(scopes.map((scope) => listFiles(scope)));
  const files = [...new Set(filesByScope.flat())].sort();
  const perFile = [];
  const rawOptionalMatches = [];
  let optionalUndefinedProperties = 0;
  let typedExplicitUndefined = 0;
  let legacyPreserveMarkers = 0;
  let undefinedChecks = 0;

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const sourceFile = parseSourceFile(file, text);
    const { matches: optionalMatches, typedExplicitUndefinedMatches: typedLines } = countOptionalUndefinedProperties(sourceFile);
    const optionalLines = optionalMatches.map((match) => match.line);
    const relativePath = path.relative(process.cwd(), file);
    const legacyMarkerLines = countLegacyPreserveMarkers(sourceFile);
    const checkLines = countUndefinedChecks(sourceFile);
    for (const match of optionalMatches) {
      rawOptionalMatches.push({ path: relativePath, ...match });
    }
    if (optionalLines.length > 0 || typedLines.length > 0 || legacyMarkerLines.length > 0 || checkLines.length > 0) {
      perFile.push({
        path: relativePath,
        optionalUndefinedProperties: optionalLines.length,
        optionalUndefinedPropertyLines: optionalLines,
        typedExplicitUndefined: typedLines.length,
        typedExplicitUndefinedLines: typedLines,
        legacyPreserveMarkers: legacyMarkerLines.length,
        legacyPreserveMarkerLines: legacyMarkerLines,
        undefinedChecks: checkLines.length,
        undefinedCheckLines: checkLines,
      });
    }
    optionalUndefinedProperties += optionalLines.length;
    typedExplicitUndefined += typedLines.length;
    legacyPreserveMarkers += legacyMarkerLines.length;
    undefinedChecks += checkLines.length;
  }

  const classification = classifyOptionalUndefinedMatches(rawOptionalMatches, metadata);
  const perFileByPath = new Map(perFile.map((file) => [file.path, file]));
  for (const file of perFile) {
    file.classifiedPreserves = classification.classifiedPreserves.filter((preserve) => preserve.path === file.path).length;
    file.actionableOptionalUndefinedProperties = classification.actionableMatches.filter((match) => match.path === file.path).length;
  }
  for (const match of classification.actionableMatches) {
    if (!perFileByPath.has(match.path)) {
      perFile.push({
        path: match.path,
        optionalUndefinedProperties: 0,
        optionalUndefinedPropertyLines: [],
        typedExplicitUndefined: 0,
        typedExplicitUndefinedLines: [],
        legacyPreserveMarkers: 0,
        legacyPreserveMarkerLines: [],
        undefinedChecks: 0,
        undefinedCheckLines: [],
        classifiedPreserves: 0,
        actionableOptionalUndefinedProperties: 1,
      });
    }
  }

  return {
    objective: "eliminate-redundant-optional-undefined",
    scopes,
    includeMarked,
    filesScanned: files.length,
    preserveMetadataPath: path.relative(process.cwd(), CLASSIFIED_PRESERVES_FILE),
    metrics: {
      optionalUndefinedProperties,
      classifiedPreserves: classification.classifiedPreserves.length,
      actionableOptionalUndefinedProperties: optionalUndefinedProperties - classification.classifiedPreserves.length,
      typedExplicitUndefined,
      legacyPreserveMarkers,
      undefinedChecks,
    },
    classifiedPreserves: classification.classifiedPreserves,
    stalePreserves: classification.stalePreserves,
    actionableOptionalUndefinedMatches: classification.actionableMatches,
    perFile,
    caveats: [
      "Counts are raw Objective scorecard inputs with additive metadata-backed classification.",
      "Raw optional-undefined detection uses TypeScript AST property signatures/declarations with explicit undefined unions; the raw count remains unchanged for historical comparability.",
      "Classified preserves come from explicit Objective metadata and are matched by path, property, and declaration text.",
      "Actionable raw optional-undefined debt is the raw AST match count minus metadata-matched classified preserves.",
      "Typed explicit-undefined contracts use ExplicitUndefined<Reason, T> and are excluded from the net redundant optional-undefined count.",
      "Legacy optional-undefined-objective preserve comments are reported as migration leftovers and should be replaced by typed contracts.",
      "Undefined-check detection uses TypeScript AST === undefined / !== undefined binary expressions, including temporary normalization code.",
      ...(classification.stalePreserves.length > 0 ? ["One or more classified preserve metadata entries did not match a raw candidate and should be reclassified."] : []),
      ...(includeMarked ? ["--include-marked is deprecated and no longer changes the headline optional-undefined count."] : []),
    ],
  };
}

function renderMarkdown(result) {
  const lines = [
    "# Optional-Undefined Objective Metrics",
    "",
    `Scope: ${result.scopes.join(", ")}`,
    `Files scanned: ${result.filesScanned}`,
    `Preserve metadata: ${result.preserveMetadataPath}`,
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Raw optional-undefined properties (net debt) | ${result.metrics.optionalUndefinedProperties} |`,
    `| Classified preserves | ${result.metrics.classifiedPreserves} |`,
    `| Actionable raw optional-undefined debt | ${result.metrics.actionableOptionalUndefinedProperties} |`,
    `| Typed explicit-undefined contracts | ${result.metrics.typedExplicitUndefined} |`,
    `| Legacy preserve markers (stale) | ${result.metrics.legacyPreserveMarkers} |`,
    `| Undefined-normalization/check lines | ${result.metrics.undefinedChecks} |`,
    "",
  ];

  if (result.perFile.length > 0) {
    lines.push(
      "## Files with matches",
      "",
      "| File | Raw optional props | Classified preserves | Actionable raw | Typed contracts | Legacy markers | Undefined checks |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    );
    for (const file of result.perFile) {
      lines.push(
        `| ${file.path} | ${file.optionalUndefinedProperties} | ${file.classifiedPreserves ?? 0} | ${file.actionableOptionalUndefinedProperties ?? 0} | ${file.typedExplicitUndefined} | ${file.legacyPreserveMarkers} | ${file.undefinedChecks} |`,
      );
    }
    lines.push("");
  }

  if (result.classifiedPreserves.length > 0) {
    lines.push("## Classified preserves", "", "| File | Property | Kind | Line | Rationale |", "| --- | --- | --- | ---: | --- |");
    for (const preserve of result.classifiedPreserves) {
      lines.push(`| ${preserve.path} | ${preserve.property} | ${preserve.kind} | ${preserve.line} | ${preserve.rationale} |`);
    }
    lines.push("");
  }

  if (result.actionableOptionalUndefinedMatches.length > 0) {
    lines.push("## Actionable raw optional-undefined matches", "", "| File | Property | Line | Declaration |", "| --- | --- | ---: | --- |");
    for (const match of result.actionableOptionalUndefinedMatches) {
      lines.push(`| ${match.path} | ${match.property} | ${match.line} | ${markdownInlineCode(match.declaration)} |`);
    }
    lines.push("");
  }

  if (result.stalePreserves.length > 0) {
    lines.push("## Stale preserve metadata", "", "| File | Property | Kind | Declaration contains | Rationale |", "| --- | --- | --- | --- | --- |");
    for (const preserve of result.stalePreserves) {
      lines.push(
        `| ${preserve.path} | ${preserve.property} | ${preserve.kind} | ${markdownInlineCode(preserve.declarationContains)} | ${preserve.rationale} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Caveats", "");
  for (const caveat of result.caveats) {
    lines.push(`- ${caveat}`);
  }
  lines.push("");
  return lines.join("\n");
}

function markdownInlineCode(text) {
  return `\`${String(text).replaceAll("`", "\\`")}\``;
}

function runSelfTest() {
  const fixture = `
interface Example {
  keep?: string;
  remove?: string | undefined;
  readonly alsoRemove?: number | null | undefined;
  "quoted-key"?: boolean | undefined;
}
const value = input.value === undefined ? {} : { value: input.value };
if (other !== undefined) {
  result.other = other;
}
// ignored?: string | undefined;
/* blockIgnored?: string | undefined; */
`;
  const sourceFile = parseSourceFile("self-test.ts", fixture);
  const { matches, typedExplicitUndefinedMatches } = countOptionalUndefinedProperties(sourceFile);
  const optional = matches.length;
  const typed = typedExplicitUndefinedMatches.length;
  const legacy = countLegacyPreserveMarkers(sourceFile).length;
  const checks = countUndefinedChecks(sourceFile).length;
  if (optional !== 3 || typed !== 0 || legacy !== 0 || checks !== 2) {
    throw new Error(
      `self-test failed: expected optional=3 typed=0 legacy=0 checks=2, got optional=${optional} typed=${typed} legacy=${legacy} checks=${checks}`,
    );
  }

  const typedFixture = `
interface Typed {
  readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
  commands?: ExplicitUndefined<"overload-selector", never>;
  legacy?: string | undefined;
  // optional-undefined-objective: ${"preserve"} (abort-signal) — Legacy marker should be stale, not an exclusion.
  stillRaw?: AbortSignal | undefined;
}
`;
  const typedSource = parseSourceFile("self-test-typed.ts", typedFixture);
  const typedResult = countOptionalUndefinedProperties(typedSource);
  const typedLegacy = countLegacyPreserveMarkers(typedSource).length;
  if (typedResult.matches.length !== 2 || typedResult.typedExplicitUndefinedMatches.length !== 2 || typedLegacy !== 1) {
    throw new Error(
      `self-test failed: expected raw=2 typed=2 legacy=1, got raw=${typedResult.matches.length} typed=${typedResult.typedExplicitUndefinedMatches.length} legacy=${typedLegacy}`,
    );
  }

  const classification = classifyOptionalUndefinedMatches(
    [
      { path: "fixture.ts", property: "preserved", line: 2, declaration: "preserved?: undefined" },
      { path: "fixture.ts", property: "actionable", line: 3, declaration: "actionable?: string | undefined" },
    ],
    {
      preserves: [
        {
          path: "fixture.ts",
          property: "preserved",
          kind: "test-preserve",
          declarationContains: "preserved?: undefined",
          rationale: "fixture preserve",
        },
        {
          path: "fixture.ts",
          property: "stale",
          kind: "test-stale",
          declarationContains: "stale?: undefined",
          rationale: "fixture stale",
        },
      ],
    },
  );
  if (classification.classifiedPreserves.length !== 1 || classification.actionableMatches.length !== 1 || classification.stalePreserves.length !== 1) {
    throw new Error(
      `self-test failed: expected classified=1 actionable=1 stale=1, got classified=${classification.classifiedPreserves.length} actionable=${classification.actionableMatches.length} stale=${classification.stalePreserves.length}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (args.selfTest) {
    runSelfTest();
    process.stdout.write("self-test passed\n");
    return;
  }

  const result = await measure(args.scopes, args.includeMarked);
  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(renderMarkdown(result));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
