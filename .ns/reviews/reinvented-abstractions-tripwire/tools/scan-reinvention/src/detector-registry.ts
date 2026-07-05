import type * as ts from "typescript";
import {
  forEachChild,
  isCallExpression,
  isIdentifier,
  isImportDeclaration,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isRegularExpressionLiteral,
  isStringLiteralLike,
} from "typescript";

import { moduleSpecifierText, sourceLocationFields } from "@nseng-ai/foundation/typescript-analysis";

import {
  manifestRefForKind,
  type CandidatePrecision,
  type ReinventionCandidate,
  type ReinventionKind,
  reinventionKinds,
} from "./output-schema.ts";

export interface DetectorContext {
  readonly file: string;
  readonly sourceFile: ts.SourceFile;
}

interface DetectorMetadata {
  readonly kind: ReinventionKind;
  readonly canonical: string;
  readonly import: string;
  readonly precision: CandidatePrecision;
}

interface Detector extends DetectorMetadata {
  detect(context: DetectorContext): ReinventionCandidate[];
}

export const detectorMetadata: ReadonlyArray<DetectorMetadata> = [
  {
    kind: "subprocess",
    canonical: "runCommand / NodeCommandExecApi / CommandExecApi",
    import: "@nseng-ai/foundation/exec / @nseng-ai/foundation/command",
    precision: "high",
  },
  {
    kind: "interactive-confirm",
    canonical: "confirmInteractiveOrUsageError",
    import: "@nseng-ai/clinkr",
    precision: "high",
  },
  {
    kind: "exact-optional-spread",
    canonical: "optionalEntry / optionalEntries",
    import: "@nseng-ai/foundation/primitives",
    precision: "medium",
  },
  {
    kind: "xdg-path",
    canonical: "requireNsStatePath / resolveNsXdgPath / resolveXdgHome",
    import: "@nseng-ai/foundation/xdg-path; @nseng-ai/capability-kit/xdg",
    precision: "medium",
  },
  {
    kind: "hand-rolled-table",
    canonical: "renderTextTable / displayWidth",
    import: "@nseng-ai/foundation/text-table or package renderer helpers",
    precision: "low",
  },
  {
    kind: "raw-git",
    canonical: "GitGateway",
    import: "@nseng-ai/git or capability-owned GitGateway",
    precision: "low",
  },
  {
    kind: "machine-envelope-literal",
    canonical: "toMachineEnvelope / usageErrorMachineEnvelope / envelopeJsonText; parseMachineEnvelopeData",
    import: "@nseng-ai/clinkr for builders; @nseng-ai/foundation/machine-envelope for parser",
    precision: "medium",
  },
  {
    kind: "command-failure-format",
    canonical: "formatCommandFailure / formatCommandResultFailure",
    import: "@nseng-ai/foundation/exec / @nseng-ai/foundation/command",
    precision: "high",
  },
  {
    kind: "escape-regex",
    canonical: "stripTerminalEscapes",
    import: "@nseng-ai/foundation/terminal-escapes or @nseng-ai/foundation/command re-export",
    precision: "medium",
  },
  {
    kind: "osc8-hyperlink",
    canonical: "safeTerminalHyperlink / terminalHyperlink / sanitizeTerminalHyperlinkUrl",
    import: "@nseng-ai/foundation/terminal-presentation",
    precision: "high",
  },
  {
    kind: "manual-truncation",
    canonical: "truncateTextHeadTail / truncateTextHead / tailText",
    import: "@nseng-ai/foundation/text-truncation; @nseng-ai/foundation/command",
    precision: "low",
  },
  {
    kind: "frontmatter-split",
    canonical: "splitMarkdownFrontmatter",
    import: "@nseng-ai/foundation/markdown-frontmatter",
    precision: "low",
  },
] as const;

const detectorByKind = new Map<ReinventionKind, Detector>();
for (const metadata of detectorMetadata) {
  detectorByKind.set(metadata.kind, { ...metadata, detect: detectorForKind(metadata) });
}

export function activeDetectorKinds(): readonly ReinventionKind[] {
  return reinventionKinds;
}

export function runDetectors(
  context: DetectorContext,
  kinds: readonly ReinventionKind[],
): ReinventionCandidate[] {
  const candidates: ReinventionCandidate[] = [];
  for (const kind of kinds) {
    const detector = detectorByKind.get(kind);
    if (detector === undefined) continue;
    candidates.push(...detector.detect(context));
  }
  return candidates;
}

export function isReinventionKind(value: string): value is ReinventionKind {
  return reinventionKinds.some((kind) => kind === value);
}

function detectorForKind(
  metadata: DetectorMetadata,
): (context: DetectorContext) => ReinventionCandidate[] {
  switch (metadata.kind) {
    case "subprocess":
      return (context) => detectSubprocess(context, metadata);
    case "interactive-confirm":
      return (context) => detectInteractiveConfirm(context, metadata);
    case "exact-optional-spread":
      return (context) =>
        detectSourceRegex({
          context,
          metadata,
          pattern: /\.\.\.\s*\([^?]+===\s*undefined\s*\?\s*\{\s*\}\s*:\s*\{/gu,
          matchedTell: "conditional exact-optional object spread",
        });
    case "xdg-path":
      return (context) => detectXdgPath(context, metadata);
    case "hand-rolled-table":
      return (context) => detectHandRolledTable(context, metadata);
    case "raw-git":
      return (context) =>
        detectSourceRegex({
          context,
          metadata,
          pattern: /(?:["']git["']|["']git\s+)/gu,
          matchedTell: "raw git command string",
        });
    case "machine-envelope-literal":
      return (context) => detectMachineEnvelopeLiteral(context, metadata);
    case "command-failure-format":
      return (context) =>
        detectSourceRegex({
          context,
          metadata,
          pattern: /formatCommandFailure|exit code|exited with status/gu,
          matchedTell: "command failure formatting",
        });
    case "escape-regex":
      return (context) => detectEscapeRegex(context, metadata);
    case "osc8-hyperlink":
      return (context) =>
        detectSourceRegex({
          context,
          metadata,
          pattern: /\]8;;|\\u001b\]8|\\x1b\]8/gu,
          matchedTell: "OSC-8 hyperlink marker",
        });
    case "manual-truncation":
      return (context) =>
        detectSourceRegex({
          context,
          metadata,
          pattern: /\.slice\([^\n]+(?:…|\.\.\.)/gu,
          matchedTell: "manual slice plus ellipsis truncation",
        });
    case "frontmatter-split":
      return (context) =>
        detectSourceRegex({
          context,
          metadata,
          pattern: /\.(?:split|indexOf)\(\s*["']---["']|^\s*\/\^?---/gmu,
          matchedTell: "manual frontmatter delimiter parsing",
        });
  }
}

function detectSubprocess(
  context: DetectorContext,
  metadata: DetectorMetadata,
): ReinventionCandidate[] {
  return visitForCandidates(context, metadata, (node) => {
    if (isImportDeclaration(node)) {
      const specifier = moduleSpecifierText(node);
      if (specifier === "node:child_process" || specifier === "child_process") {
        return "node:child_process import";
      }
    }
    if (isCallExpression(node)) {
      const first = node.arguments[0];
      if (first !== undefined && isStringLiteralLike(first)) {
        const callee = expressionText(node.expression);
        if ((callee === "require" || callee === "import") && isChildProcessSpecifier(first.text)) {
          return "dynamic child_process load";
        }
      }
    }
    return undefined;
  });
}

function detectInteractiveConfirm(
  context: DetectorContext,
  metadata: DetectorMetadata,
): ReinventionCandidate[] {
  return visitForCandidates(context, metadata, (node) => {
    if (isImportDeclaration(node)) {
      const specifier = moduleSpecifierText(node);
      if (
        specifier === "node:readline" ||
        specifier === "readline" ||
        specifier === "node:readline/promises"
      ) {
        return "readline import for interactive confirmation";
      }
    }
    if (
      isPropertyAccessExpression(node) &&
      node.getText(context.sourceFile) === "process.stdin.isTTY"
    ) {
      return "process.stdin.isTTY check";
    }
    return undefined;
  });
}

function detectXdgPath(
  context: DetectorContext,
  metadata: DetectorMetadata,
): ReinventionCandidate[] {
  return visitForCandidates(context, metadata, (node) => {
    if (isCallExpression(node) && expressionText(node.expression) === "os.homedir") {
      return "os.homedir path construction";
    }
    if (isPropertyAccessExpression(node)) {
      const text = node.getText(context.sourceFile);
      if (/process\.env\.(?:XDG_[A-Z_]+|HOME)$/u.test(text))
        return "direct XDG/HOME environment read";
    }
    if (
      isStringLiteralLike(node) &&
      (node.text.includes(".local/state") || node.text.includes(".config"))
    ) {
      return "literal XDG path segment";
    }
    return undefined;
  });
}

function detectHandRolledTable(
  context: DetectorContext,
  metadata: DetectorMetadata,
): ReinventionCandidate[] {
  const signals = detectSourceRegex({
    context,
    metadata,
    pattern:
      /pad(?:End|Start)|Math\.max\([^\n]+\.length|\.length\s*[),;]|["'`][─━-]{3,}["'`]\.repeat\(/gu,
    matchedTell: "table-width/layout signal",
  });
  return signals.length >= 2 ? [signals[0]].filter((candidate) => candidate !== undefined) : [];
}

function detectMachineEnvelopeLiteral(
  context: DetectorContext,
  metadata: DetectorMetadata,
): ReinventionCandidate[] {
  return visitForCandidates(context, metadata, (node) => {
    if (!isObjectLiteralExpression(node)) return undefined;
    const names = new Set<string>();
    for (const property of node.properties) {
      if (isPropertyAssignment(property)) {
        const name = propertyNameText(property.name);
        if (name !== undefined) names.add(name);
      }
    }
    return names.has("status") &&
      names.has("exitCode") &&
      (names.has("data") || names.has("message"))
      ? "machine envelope literal"
      : undefined;
  });
}

function detectEscapeRegex(
  context: DetectorContext,
  metadata: DetectorMetadata,
): ReinventionCandidate[] {
  return visitForCandidates(context, metadata, (node) => {
    if (isRegularExpressionLiteral(node) && /\\x1b|\\u001b|\\033/u.test(node.text)) {
      return "terminal escape regex literal";
    }
    if (isStringLiteralLike(node) && /\\x1b|\\u001b|\\033/u.test(node.text)) {
      return "terminal escape string literal";
    }
    return undefined;
  });
}

function visitForCandidates(
  context: DetectorContext,
  metadata: DetectorMetadata,
  match: (node: ts.Node) => string | undefined,
): ReinventionCandidate[] {
  const candidates: ReinventionCandidate[] = [];
  function visit(node: ts.Node): void {
    const matchedTell = match(node);
    if (matchedTell !== undefined) {
      candidates.push(buildCandidate({ context, metadata, node, matchedTell }));
    }
    forEachChild(node, visit);
  }
  visit(context.sourceFile);
  return candidates;
}

interface CandidateLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
}

interface DetectSourceRegexOptions {
  readonly context: DetectorContext;
  readonly metadata: DetectorMetadata;
  readonly pattern: RegExp;
  readonly matchedTell: string;
}

function detectSourceRegex(options: DetectSourceRegexOptions): ReinventionCandidate[] {
  const { context, metadata, pattern, matchedTell } = options;
  const source = context.sourceFile.getFullText();
  const candidates: ReinventionCandidate[] = [];
  for (const match of source.matchAll(pattern)) {
    const index = match.index;
    if (index === undefined) continue;
    const position = context.sourceFile.getLineAndCharacterOfPosition(index);
    candidates.push(
      buildCandidateRecord(metadata, matchedTell, {
        file: context.file,
        line: position.line + 1,
        column: position.character + 1,
        snippet: lineAt(source, position.line),
      }),
    );
  }
  return candidates;
}

interface BuildCandidateOptions {
  readonly context: DetectorContext;
  readonly metadata: DetectorMetadata;
  readonly node: ts.Node;
  readonly matchedTell: string;
}

function buildCandidate(options: BuildCandidateOptions): ReinventionCandidate {
  const { context, metadata, node, matchedTell } = options;
  const location = sourceLocationFields(context.file, context.sourceFile, node);
  return buildCandidateRecord(metadata, matchedTell, {
    file: location.path,
    line: location.line,
    column: location.column,
    snippet: location.text,
  });
}

function buildCandidateRecord(
  metadata: DetectorMetadata,
  matchedTell: string,
  location: CandidateLocation,
): ReinventionCandidate {
  return {
    kind: metadata.kind,
    manifestRef: manifestRefForKind(metadata.kind),
    canonical: metadata.canonical,
    import: metadata.import,
    file: location.file,
    line: location.line,
    column: location.column,
    snippet: location.snippet,
    matchedTell,
    isAddedLine: false,
    precision: metadata.precision,
  };
}

function expressionText(expression: ts.Expression): string {
  return expression.getText();
}

function isChildProcessSpecifier(value: string): boolean {
  return value === "node:child_process" || value === "child_process";
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (isIdentifier(name)) return name.text;
  if (isStringLiteralLike(name)) return name.text;
  return undefined;
}

function lineAt(source: string, zeroBasedLine: number): string {
  return source.split(/\r?\n/u)[zeroBasedLine]?.trim() ?? "";
}
