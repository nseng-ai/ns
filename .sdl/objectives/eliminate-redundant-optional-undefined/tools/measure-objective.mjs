#!/usr/bin/env node
import { createRequire } from "node:module";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const ts = require(path.resolve("ts/node_modules/typescript"));

const DEFAULT_SCOPES = ["ts"];
// Keep this Objective-owned script self-contained while it remains under .sdl.
// Shared test-support discovery helpers are TypeScript modules with nearby guard-specific
// conventions; consolidate there only if this scorecard graduates to shared infrastructure.
const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".turbo"]);

function usage() {
  return `Usage: node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs [options] [scope ...]

Measure the eliminate-redundant-optional-undefined Objective scorecard.

Scopes default to: ${DEFAULT_SCOPES.join(" ")}

Options:
  --format markdown|json   Output format (default: markdown)
  --json                   Alias for --format json
  --include-marked         Count marked-preserve properties (lines tagged
                           optional-undefined-objective: preserve) in the
                           headline optional-undefined total (default: excluded)
  --self-test              Run built-in fixture tests
  -h, --help               Show this help

Metrics:
  1. typed optional-undefined property count: AST PropertySignature and
     PropertyDeclaration nodes with a ? token and explicit undefined union,
     e.g. foo?: string | undefined
  2. undefined-normalization/check count: AST binary expressions that compare
     a value with undefined using === or !==.

Known caveat: this is Objective-owned temporary tooling. It intentionally reports
raw, review-aiding counts; semantic classification still belongs in PR notes.
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

function parseSourceFile(fileName, text) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
}

function countOptionalUndefinedProperties(sourceFile) {
  // This Objective metric intentionally uses local AST predicates for now: it counts
  // property signatures and property declarations, then separates preserve-marked lines.
  // The existing TypeScript style-guard audit is advisory test support; reuse it only
  // after aligning those semantics with this scorecard's net/gross reporting needs.
  const matches = [];
  const markedMatches = [];

  function visit(node) {
    if (isOptionalPropertyNode(node) && includesUndefinedType(node.type)) {
      if (isMarkedPreserve(sourceFile, node)) {
        markedMatches.push(lineNumber(sourceFile, node));
      } else {
        matches.push(lineNumber(sourceFile, node));
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { matches, markedMatches };
}

function isMarkedPreserve(sourceFile, node) {
  const ranges = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart());
  if (ranges === undefined) {
    return false;
  }
  return ranges.some((range) => {
    const text = sourceFile.text.slice(range.pos, range.end);
    return text.includes("optional-undefined-objective") && text.includes("preserve");
  });
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

async function measure(scopes, includeMarked = false) {
  const filesByScope = await Promise.all(scopes.map((scope) => listFiles(scope)));
  const files = [...new Set(filesByScope.flat())].sort();
  const perFile = [];
  let netOptional = 0;
  let markedPreserve = 0;
  let undefinedChecks = 0;

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const sourceFile = parseSourceFile(file, text);
    const { matches: optionalLines, markedMatches: markedLines } = countOptionalUndefinedProperties(sourceFile);
    const checkLines = countUndefinedChecks(sourceFile);
    if (optionalLines.length > 0 || markedLines.length > 0 || checkLines.length > 0) {
      perFile.push({
        path: path.relative(process.cwd(), file),
        optionalUndefinedProperties: optionalLines.length,
        optionalUndefinedPropertyLines: optionalLines,
        markedPreserve: markedLines.length,
        markedPreserveLines: markedLines,
        undefinedChecks: checkLines.length,
        undefinedCheckLines: checkLines,
      });
    }
    netOptional += optionalLines.length;
    markedPreserve += markedLines.length;
    undefinedChecks += checkLines.length;
  }

  const optionalUndefinedProperties = includeMarked ? netOptional + markedPreserve : netOptional;

  return {
    objective: "eliminate-redundant-optional-undefined",
    scopes,
    includeMarked,
    filesScanned: files.length,
    metrics: { optionalUndefinedProperties, markedPreserve, undefinedChecks },
    perFile,
    caveats: [
      "Counts are raw Objective scorecard inputs, not semantic classification.",
      "Optional-undefined detection uses TypeScript AST property signatures/declarations with explicit undefined unions.",
      "Undefined-check detection uses TypeScript AST === undefined / !== undefined binary expressions, including temporary normalization code.",
      "Marked preserves (lines tagged optional-undefined-objective: preserve) are excluded from the net optional-undefined count unless --include-marked is passed.",
    ],
  };
}

function renderMarkdown(result) {
  const lines = [
    "# Optional-Undefined Objective Metrics",
    "",
    `Scope: ${result.scopes.join(", ")}`,
    `Files scanned: ${result.filesScanned}`,
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Typed optional-undefined properties${result.includeMarked ? " (gross)" : " (net)"} | ${result.metrics.optionalUndefinedProperties} |`,
    `| Marked preserves (excluded) | ${result.metrics.markedPreserve} |`,
    `| Undefined-normalization/check lines | ${result.metrics.undefinedChecks} |`,
    "",
  ];

  if (result.perFile.length > 0) {
    lines.push("## Files with matches", "", "| File | Optional props | Marked preserves | Undefined checks |", "| --- | ---: | ---: | ---: |");
    for (const file of result.perFile) {
      lines.push(`| ${file.path} | ${file.optionalUndefinedProperties} | ${file.markedPreserve} | ${file.undefinedChecks} |`);
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
  const { matches, markedMatches } = countOptionalUndefinedProperties(sourceFile);
  const optional = matches.length;
  const marked = markedMatches.length;
  const checks = countUndefinedChecks(sourceFile).length;
  if (optional !== 3 || marked !== 0 || checks !== 2) {
    throw new Error(`self-test failed: expected optional=3 marked=0 checks=2, got optional=${optional} marked=${marked} checks=${checks}`);
  }

  const markedFixture = `
interface Marked {
  // optional-undefined-objective: preserve (abort-signal) — AbortSignal forwarded to a gateway accepting present-undefined.
  readonly signal?: AbortSignal | undefined;
  // ordinary comment, not a marker
  remove?: string | undefined;
}
`;
  const markedSource = parseSourceFile("self-test-marked.ts", markedFixture);
  const markedResult = countOptionalUndefinedProperties(markedSource);
  if (markedResult.matches.length !== 1 || markedResult.markedMatches.length !== 1) {
    throw new Error(
      `self-test failed: expected net=1 marked=1, got net=${markedResult.matches.length} marked=${markedResult.markedMatches.length}`,
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
