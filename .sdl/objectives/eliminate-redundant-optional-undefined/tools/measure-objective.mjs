#!/usr/bin/env node
import { createRequire } from "node:module";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const ts = require(path.resolve("ts/node_modules/typescript"));

const DEFAULT_SCOPES = ["ts"];
const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".turbo"]);

function usage() {
  return `Usage: node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs [options] [scope ...]

Measure the eliminate-redundant-optional-undefined Objective scorecard.

Scopes default to: ${DEFAULT_SCOPES.join(" ")}

Options:
  --format markdown|json   Output format (default: markdown)
  --json                   Alias for --format json
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

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "-h" || arg === "--help") {
      return { help: true, scopes, format, selfTest };
    }
    if (arg === "--self-test") {
      selfTest = true;
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

  return { help: false, scopes: scopes.length > 0 ? scopes : DEFAULT_SCOPES, format, selfTest };
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
  const matches = [];

  function visit(node) {
    if (isOptionalPropertyNode(node) && includesUndefinedType(node.type)) {
      matches.push(lineNumber(sourceFile, node));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
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

async function measure(scopes) {
  const filesByScope = await Promise.all(scopes.map((scope) => listFiles(scope)));
  const files = [...new Set(filesByScope.flat())].sort();
  const perFile = [];
  let optionalUndefinedProperties = 0;
  let undefinedChecks = 0;

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const sourceFile = parseSourceFile(file, text);
    const optionalLines = countOptionalUndefinedProperties(sourceFile);
    const checkLines = countUndefinedChecks(sourceFile);
    if (optionalLines.length > 0 || checkLines.length > 0) {
      perFile.push({
        path: path.relative(process.cwd(), file),
        optionalUndefinedProperties: optionalLines.length,
        optionalUndefinedPropertyLines: optionalLines,
        undefinedChecks: checkLines.length,
        undefinedCheckLines: checkLines,
      });
    }
    optionalUndefinedProperties += optionalLines.length;
    undefinedChecks += checkLines.length;
  }

  return {
    objective: "eliminate-redundant-optional-undefined",
    scopes,
    filesScanned: files.length,
    metrics: { optionalUndefinedProperties, undefinedChecks },
    perFile,
    caveats: [
      "Counts are raw Objective scorecard inputs, not semantic classification.",
      "Optional-undefined detection uses TypeScript AST property signatures/declarations with explicit undefined unions.",
      "Undefined-check detection uses TypeScript AST === undefined / !== undefined binary expressions, including temporary normalization code.",
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
    `| Typed optional-undefined properties | ${result.metrics.optionalUndefinedProperties} |`,
    `| Undefined-normalization/check lines | ${result.metrics.undefinedChecks} |`,
    "",
  ];

  if (result.perFile.length > 0) {
    lines.push("## Files with matches", "", "| File | Optional props | Undefined checks |", "| --- | ---: | ---: |");
    for (const file of result.perFile) {
      lines.push(`| ${file.path} | ${file.optionalUndefinedProperties} | ${file.undefinedChecks} |`);
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
  const optional = countOptionalUndefinedProperties(sourceFile).length;
  const checks = countUndefinedChecks(sourceFile).length;
  if (optional !== 3 || checks !== 2) {
    throw new Error(`self-test failed: expected optional=3 checks=2, got optional=${optional} checks=${checks}`);
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

  const result = await measure(args.scopes);
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
