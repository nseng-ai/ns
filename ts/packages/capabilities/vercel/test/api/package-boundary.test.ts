import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

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
			importSpecifiers(readPackageFile(file))
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
			for (const specifier of importSpecifiers(source)) {
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
			if (/["']gt["']/u.test(source)) {
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
		for (const specifier of importSpecifiers(readPackageFile(importer))) {
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

function importSpecifiers(source: string): readonly string[] {
	const specifiers: string[] = [];
	const patterns = [/(?:from\s*|import\s*\()\s*["']([^"']+)["']/gu, /import\s*["']([^"']+)["']/gu];
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) {
			const specifier = match[1];
			if (specifier !== undefined) specifiers.push(specifier);
		}
	}
	return specifiers;
}

function readPackageFile(file: string): string {
	return readFileSync(resolve(PACKAGE_ROOT, file), "utf8");
}
