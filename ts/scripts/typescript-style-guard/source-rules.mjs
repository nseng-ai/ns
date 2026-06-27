import ts from "typescript";

import {
  BAN_AS_UNKNOWN_AS,
  BAN_CAPABILITY_PRIVATE_PEER_IMPORT,
  BAN_EMPTY_INTERFACE_EXTENDS,
  BAN_IMPORT_ALIAS_FOR_FIRST_PARTY,
  capabilityPackageNames,
  neutralPeerPackageNames,
} from "./config.mjs";
import {
  packageNameForPath,
  packageNameForSpecifier,
  packageSubpathForSpecifier,
} from "./package-metadata.mjs";

export function collectViolations(content, path, packageMetadataByName) {
  const sourceFile = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
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

    if (ts.isImportDeclaration(node) && isPrivateCapabilityPeerImport(node, path, packageMetadataByName)) {
      violations.push(buildViolation(BAN_CAPABILITY_PRIVATE_PEER_IMPORT, path, sourceFile, node.moduleSpecifier));
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

function isPrivateCapabilityPeerImport(node, path, packageMetadataByName) {
  const specifier = moduleSpecifierText(node);
  if (specifier === undefined) return false;

  const importerPackageName = packageNameForPath(path, packageMetadataByName);
  if (importerPackageName === undefined) return false;
  if (!capabilityPackageNames.has(importerPackageName)) return false;

  const importedPackageName = packageNameForSpecifier(specifier);
  if (importedPackageName === undefined) return false;
  if (importedPackageName === importerPackageName) return false;
  if (neutralPeerPackageNames.has(importedPackageName)) return false;
  if (importedPackageName === "@sdl/sdl") return false;
  if (!capabilityPackageNames.has(importedPackageName)) return false;

  const importedSubpath = packageSubpathForSpecifier(specifier, importedPackageName);
  if (importedSubpath === ".") return false;
  if (importedSubpath === "./api") return false;
  if (isPrivateCapabilitySubpath(importedSubpath)) return true;

  const importedPackageMetadata = packageMetadataByName.get(importedPackageName);
  if (importedPackageMetadata === undefined) return true;
  return !importedPackageMetadata.exportSubpaths.has(importedSubpath);
}

function isPrivateCapabilitySubpath(subpath) {
  return subpath.startsWith("./src/") || subpath === "./internal" || subpath.startsWith("./internal/");
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
