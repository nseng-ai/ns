// AST codemod for the package-scope sweep (ji -> ns): rewrites old-name
// module specifiers via span splicing (no printer, zero formatting churn).
//
// Mode A — string literals in module-specifier positions (import/export
// declarations, dynamic import() arguments, import-type nodes): all files.
// Mode B — any other specifier-shaped string literal (exact old package name,
// @ji/ scope prefix, jicc, or ./ji-style subpath): all files except
// EXCLUDED_FROM_MODE_B, whose old-name strings would need per-site judgment.
//
// Usage: node codemod.ts [--write]   (dry run by default; idempotent)

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type * as tsNamespace from "typescript";

import { renameSpecifier } from "./rename-map.ts";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TOOL_DIR, "..", "..", "..", "..", "..");
const requireFromWorkspace = createRequire(join(REPO_ROOT, "ts", "package.json"));
const ts: typeof tsNamespace = requireFromWorkspace("typescript");

// The consumer-instance directory is `.ji` before phase 1 (PR-4) lands and
// `.ns` after `git mv .ji .ns`. Prefer `.ns` when it exists so the same tool
// runs unchanged on landing day.
const CONSUMER_DIR = existsSync(join(REPO_ROOT, ".ns")) ? ".ns" : ".ji";

const SCAN_ROOTS = [
	"ts",
	".pi",
	`${CONSUMER_DIR}/reviews`,
	`${CONSUMER_DIR}/extensions`,
];

// The sdl->ji sweep excluded the typescript-style-guard / cli-runtime /
// cli-theme tests because their deliberate sdl-named fixtures needed per-site
// judgment. For ji->ns no such file survives review: every @ji/ or ./ji
// specifier-shaped string in those files is a genuine rename target, and the
// one hazard (NUL-joined "@ji/a\0@ji/b" config keys in
// ts/packages/infra/core/test/support/typescript-style-guard/config.ts) is
// rejected by the NUL guard in renameSpecifier and hand-edited instead
// (see hand-edits.md).
const EXCLUDED_FROM_MODE_B: readonly string[] = [];

type EditMode = "specifier" | "string";

interface Edit {
	readonly start: number;
	readonly end: number;
	readonly newText: string;
	readonly mode: EditMode;
}

function isModeBExcluded(repoRelativePath: string): boolean {
	return EXCLUDED_FROM_MODE_B.some((entry) =>
		entry.endsWith("/")
			? repoRelativePath.startsWith(entry)
			: repoRelativePath === entry
	);
}

function isSpecifierPosition(node: tsNamespace.StringLiteralLike): boolean {
	const parent = node.parent;
	if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) {
		return parent.moduleSpecifier === node;
	}
	if (ts.isCallExpression(parent)) {
		return parent.expression.kind === ts.SyntaxKind.ImportKeyword
			&& parent.arguments[0] === node;
	}
	if (ts.isLiteralTypeNode(parent)) {
		return ts.isImportTypeNode(parent.parent) && parent.parent.argument === parent;
	}
	return false;
}

function collectEdits(
	sourceFile: tsNamespace.SourceFile,
	content: string,
	modeBAllowed: boolean,
): Edit[] {
	const edits: Edit[] = [];
	function visit(node: tsNamespace.Node): void {
		if (ts.isStringLiteralLike(node)) {
			const mode: EditMode = isSpecifierPosition(node) ? "specifier" : "string";
			if (mode === "specifier" || modeBAllowed) {
				const start = node.getStart(sourceFile) + 1;
				const end = node.getEnd() - 1;
				// Skip literals whose raw source differs from their cooked text
				// (escape sequences): splicing cooked text would corrupt them.
				if (content.slice(start, end) === node.text) {
					const renamed = renameSpecifier(node.text);
					if (renamed !== undefined) {
						edits.push({ start, end, newText: renamed, mode });
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return edits;
}

function applyEdits(content: string, edits: readonly Edit[]): string {
	const ordered = [...edits].sort((a, b) => b.start - a.start);
	let result = content;
	for (const edit of ordered) {
		result = result.slice(0, edit.start) + edit.newText + result.slice(edit.end);
	}
	return result;
}

function walkFiles(directory: string, matches: (name: string) => boolean, files: string[]): void {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (entry.name !== "node_modules") {
				walkFiles(join(directory, entry.name), matches, files);
			}
		} else if (entry.isFile() && matches(entry.name)) {
			files.push(relative(REPO_ROOT, join(directory, entry.name)));
		}
	}
}

function listSourceFiles(): string[] {
	const files: string[] = [];
	for (const root of SCAN_ROOTS) {
		const absolute = join(REPO_ROOT, root);
		if (existsSync(absolute)) {
			walkFiles(absolute, (name) => /\.(ts|tsx|mts|cts)$/.test(name), files);
		}
	}
	return files.sort();
}

function main(): void {
	const write = process.argv.includes("--write");
	let filesChanged = 0;
	let specifierEdits = 0;
	let stringEdits = 0;
	const perFile: Array<{ path: string; edits: number }> = [];

	for (const repoRelativePath of listSourceFiles()) {
		const absolute = join(REPO_ROOT, repoRelativePath);
		const content = readFileSync(absolute, "utf8");
		const sourceFile = ts.createSourceFile(
			repoRelativePath,
			content,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);
		const edits = collectEdits(sourceFile, content, !isModeBExcluded(repoRelativePath));
		if (edits.length === 0) {
			continue;
		}
		filesChanged += 1;
		specifierEdits += edits.filter((edit) => edit.mode === "specifier").length;
		stringEdits += edits.filter((edit) => edit.mode === "string").length;
		perFile.push({ path: repoRelativePath, edits: edits.length });
		if (write) {
			writeFileSync(absolute, applyEdits(content, edits));
		}
	}

	perFile.sort((a, b) => b.edits - a.edits);
	console.log(
		`${write ? "APPLIED" : "DRY RUN"}: ${filesChanged} files, ${specifierEdits} specifier edits (mode A), ${stringEdits} string edits (mode B)`,
	);
	for (const row of perFile.slice(0, 20)) {
		console.log(`  ${String(row.edits).padStart(4)}  ${row.path}`);
	}
	if (perFile.length > 20) {
		console.log(`  ... and ${perFile.length - 20} more files`);
	}
}

main();
