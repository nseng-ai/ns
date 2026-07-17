import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	forEachChild,
	isCallExpression,
	isExportDeclaration,
	isImportDeclaration,
	isNoSubstitutionTemplateLiteral,
	isStringLiteral,
	SyntaxKind,
	type Node,
	type SourceFile,
} from "typescript";
import { describe, expect, test } from "vitest";

import {
	moduleSpecifierText,
	parseTypeScriptSource,
} from "@nseng-ai/foundation/typescript-analysis";

const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWED_FLOW_IMPORTERS = new Set([
	"src/dispatch-client/context.ts",
	"src/dispatch-client/real-source-publication-gateways.ts",
]);
const PRODUCTION_ROOTS = ["api", "scripts", "src", "workflows"] as const;
const DEPLOYABLE_ROOTS = [
	...typescriptFilesAt("api"),
	...typescriptFilesAt("workflows"),
	"src/pi-runner/main.ts",
];

interface SourceImport {
	readonly importer: string;
	readonly specifier: string;
}

describe("dispatch package boundaries", () => {
	test("keeps package-shared config out of dispatch-client ownership", () => {
		const violations = productionTypescriptFiles().flatMap((file) =>
			importSpecifiers(file, readPackageFile(file))
				.filter((specifier) => specifier.includes(["dispatch-client", "project-config"].join("/")))
				.map((specifier) => `${file}: ${specifier}`),
		);

		expect(violations).toEqual([]);
		expect(existsSync(resolve(PACKAGE_ROOT, "src/config/project-config.ts"))).toBe(true);
	});

	test("allows only the curated Flow API at local dispatch composition", () => {
		const violations: string[] = [];
		for (const file of productionTypescriptFiles()) {
			const source = readPackageFile(file);
			for (const specifier of importSpecifiers(file, source)) {
				if (specifier.startsWith("@nseng-ai/flow")) {
					if (specifier !== "@nseng-ai/flow/api" || !ALLOWED_FLOW_IMPORTERS.has(file)) {
						violations.push(`${file}: forbidden Flow import ${specifier}`);
					}
				}
				if (
					specifier === "@nseng-ai/capability-kit/graphite" ||
					specifier.startsWith("@nseng-ai/capability-kit/graphite/")
				) {
					violations.push(`${file}: forbidden Graphite import ${specifier}`);
				}
			}
			if (hasExactGtLiteral(file, source)) {
				violations.push(`${file}: direct gt invocation is forbidden`);
			}
		}

		expect(violations).toEqual([]);
	});

	test("keeps Flow out of API, Workflow, and Sandbox deployable closure", () => {
		const closureImports = transitiveSourceImports(DEPLOYABLE_ROOTS);
		const flowImports = closureImports
			.filter(({ specifier }) => specifier.startsWith("@nseng-ai/flow"))
			.map(({ importer, specifier }) => `${importer}: ${specifier}`);

		expect(flowImports).toEqual([]);
	});

	test("inspects only real static and dynamic module specifiers", () => {
		const source = `
			// import "comment-only";
			/* export { value } from "also-comment-only"; */
			import "side-effect";
			import { value } from "static-import";
			export { value as renamed } from "static-export";
			void import("dynamic-double");
			void import('dynamic-single');
			void import(\`dynamic-template\`);
			void import(\`interpolated-\${value}\`);
		`;

		expect(importSpecifiers("fixture.ts", source)).toEqual([
			"side-effect",
			"static-import",
			"static-export",
			"dynamic-double",
			"dynamic-single",
			"dynamic-template",
		]);
	});

	test("detects exact executable gt literals without matching comments or other text", () => {
		expect(hasExactGtLiteral("double.ts", `run("gt");`)).toBe(true);
		expect(hasExactGtLiteral("single.ts", `run('gt');`)).toBe(true);
		expect(hasExactGtLiteral("template.ts", "run(`gt`);")).toBe(true);
		expect(
			hasExactGtLiteral("ignored.ts", `// run("gt");\nrun("gt submit");\nrun(\`gt \${command}\`);`),
		).toBe(false);
	});
});

function productionTypescriptFiles(): readonly string[] {
	return PRODUCTION_ROOTS.flatMap((root) => typescriptFilesUnder(root));
}

function typescriptFilesAt(directory: string): readonly string[] {
	return readdirSync(resolve(PACKAGE_ROOT, directory), { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
		.map((entry) => `${directory}/${entry.name}`)
		.sort();
}

function typescriptFilesUnder(directory: string): readonly string[] {
	const absoluteDirectory = resolve(PACKAGE_ROOT, directory);
	const files: string[] = [];
	for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
		const packagePath = `${directory}/${entry.name}`;
		if (entry.isDirectory()) {
			files.push(...typescriptFilesUnder(packagePath));
		} else if (entry.isFile() && entry.name.endsWith(".ts")) {
			files.push(packagePath);
		}
	}
	return files.sort();
}

function transitiveSourceImports(entrypoints: readonly string[]): readonly SourceImport[] {
	const imports: SourceImport[] = [];
	const pending = [...entrypoints];
	const visited = new Set<string>();
	while (pending.length > 0) {
		const importer = pending.pop();
		if (importer === undefined || visited.has(importer)) continue;
		visited.add(importer);
		for (const specifier of importSpecifiers(importer, readPackageFile(importer))) {
			imports.push({ importer, specifier });
			if (!specifier.startsWith(".")) continue;
			const target = relative(
				PACKAGE_ROOT,
				resolve(PACKAGE_ROOT, dirname(importer), specifier),
			).replaceAll("\\", "/");
			if (existsSync(resolve(PACKAGE_ROOT, target))) pending.push(target);
		}
	}
	return imports;
}

function importSpecifiers(path: string, source: string): readonly string[] {
	const sourceFile = parseTypeScriptSource(path, source);
	const specifiers: string[] = [];
	visitTypeScript(sourceFile, (node) => {
		if (isImportDeclaration(node) || isExportDeclaration(node)) {
			const specifier = moduleSpecifierText(node);
			if (specifier !== undefined) specifiers.push(specifier);
			return;
		}
		if (
			isCallExpression(node) &&
			node.expression.kind === SyntaxKind.ImportKeyword &&
			node.arguments.length === 1
		) {
			const argument = node.arguments[0];
			if (
				argument !== undefined &&
				(isStringLiteral(argument) || isNoSubstitutionTemplateLiteral(argument))
			) {
				specifiers.push(argument.text);
			}
		}
	});
	return specifiers;
}

function hasExactGtLiteral(path: string, source: string): boolean {
	const sourceFile = parseTypeScriptSource(path, source);
	let hasMatch = false;
	visitTypeScript(sourceFile, (node) => {
		if ((isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node)) && node.text === "gt") {
			hasMatch = true;
		}
	});
	return hasMatch;
}

function visitTypeScript(sourceFile: SourceFile, visitor: (node: Node) => void): void {
	function visit(node: Node): void {
		visitor(node);
		forEachChild(node, visit);
	}
	visit(sourceFile);
}

function readPackageFile(file: string): string {
	return readFileSync(resolve(PACKAGE_ROOT, file), "utf8");
}
