#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import ts from "typescript";

const repoRoot = process.cwd();
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const skippedDirectoryNames = new Set([
  ".git",
  ".next",
  ".source",
  ".turbo",
  ".agents",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const BAN_AS_UNKNOWN_AS = "SDL_TS_BAN_AS_UNKNOWN_AS";
const BAN_IMPORT_ALIAS_FOR_FIRST_PARTY = "SDL_TS_BAN_IMPORT_ALIAS_FOR_FIRST_PARTY";
const BAN_EMPTY_INTERFACE_EXTENDS = "SDL_TS_BAN_EMPTY_INTERFACE_EXTENDS";

/** @type {Array<{ rule: string; path: string; line: number; column: number; text: string }>} */
const matches = [];

runAdversarialReview();
scanDirectory(repoRoot);

if (matches.length === 0) {
  console.log(
    "OK: TypeScript style guard found no banned double-casts, first-party import aliases, or empty interface-extension aliases.",
  );
  process.exit(0);
}

console.error("TypeScript style guard failed.");
console.error(`${BAN_AS_UNKNOWN_AS}: \`as unknown as\` double-casts are banned everywhere, including tests.`);
console.error(
  `${BAN_IMPORT_ALIAS_FOR_FIRST_PARTY}: \`as\` in first-party import declarations is banned; preserve source names for monorepo-owned symbols. Third-party import aliases are allowed when used consistently.`,
);
console.error(
  `${BAN_EMPTY_INTERFACE_EXTENDS}: empty \`interface X extends Y {}\` aliases are banned; use \`type X = Y\` or add real members.`,
);
console.error("");
for (const match of matches) {
  console.error(`${match.path}:${match.line}:${match.column}: ${match.rule}: ${match.text}`);
}
process.exit(1);

function scanDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirectoryNames.has(entry.name)) scanDirectory(join(directory, entry.name));
      continue;
    }

    if (!entry.isFile()) continue;
    const fullPath = join(directory, entry.name);
    if (!isTypeScriptSource(fullPath)) continue;

    const content = readFileSync(fullPath, "utf8");
    matches.push(...collectViolations(content, relative(repoRoot, fullPath)));
  }
}

function isTypeScriptSource(path) {
  return sourceExtensions.has(extname(path));
}

function collectViolations(content, path) {
  const sourceFile = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  /** @type {Array<{ rule: string; path: string; line: number; column: number; text: string }>} */
  const violations = [];

  function visit(node) {
    if (ts.isImportDeclaration(node) && isFirstPartyImportDeclaration(node)) {
      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings !== undefined) {
        if (ts.isNamespaceImport(namedBindings)) {
          violations.push(
            buildViolation(BAN_IMPORT_ALIAS_FOR_FIRST_PARTY, path, sourceFile, namedBindings),
          );
        } else {
          for (const element of namedBindings.elements) {
            if (element.propertyName !== undefined) {
              violations.push(
                buildViolation(BAN_IMPORT_ALIAS_FOR_FIRST_PARTY, path, sourceFile, element),
              );
            }
          }
        }
      }
    }

    if (ts.isInterfaceDeclaration(node) && node.members.length === 0 && hasExtendsClause(node)) {
      violations.push(buildViolation(BAN_EMPTY_INTERFACE_EXTENDS, path, sourceFile, node));
    }

    if (isAsUnknownAsExpression(node)) {
      violations.push(buildViolation(BAN_AS_UNKNOWN_AS, path, sourceFile, node));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function isFirstPartyImportDeclaration(node) {
  const specifier = moduleSpecifierText(node);
  if (specifier === undefined) return false;
  return isFirstPartyModuleSpecifier(specifier);
}

function moduleSpecifierText(node) {
  return ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
}

function isFirstPartyModuleSpecifier(specifier) {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("@sdl/") ||
    specifier === "sdlcc" ||
    specifier.startsWith("sdlcc/")
  );
}

function hasExtendsClause(node) {
  return node.heritageClauses?.some((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword) === true;
}

function isAsUnknownAsExpression(node) {
  if (!ts.isAsExpression(node)) return false;
  const innerExpression = unwrapParentheses(node.expression);
  return ts.isAsExpression(innerExpression) && innerExpression.type.kind === ts.SyntaxKind.UnknownKeyword;
}

function unwrapParentheses(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function buildViolation(rule, path, sourceFile, node) {
  const start = node.getStart(sourceFile);
  const position = sourceFile.getLineAndCharacterOfPosition(start);
  return {
    rule,
    path,
    line: position.line + 1,
    column: position.character + 1,
    text: singleLine(node.getText(sourceFile)),
  };
}

function singleLine(text) {
  return text.replace(/\s+/g, " ").trim();
}

function runAdversarialReview() {
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
    const actualRules = collectViolations(testCase.code, `adversarial/${testCase.name}.ts`).map(
      (violation) => violation.rule,
    );
    const expected = [...testCase.expectedRules].sort();
    const actual = [...actualRules].sort();
    if (expected.join("\n") !== actual.join("\n")) {
      console.error("TypeScript style guard adversarial review failed.");
      console.error(`Case: ${testCase.name}`);
      console.error(`Expected rules: ${expected.join(", ") || "(none)"}`);
      console.error(`Actual rules: ${actual.join(", ") || "(none)"}`);
      process.exit(2);
    }
  }
}
