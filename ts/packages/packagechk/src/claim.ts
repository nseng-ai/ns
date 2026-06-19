import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MODULE_SEPARATOR_PATTERN = /[^A-Za-z0-9]+/g;

export interface ClaimProjectSpec {
	packageName: string;
	moduleName: string;
	description: string;
	version: string;
}

export interface NpmClaimProjectSpec {
	packageName: string;
	description: string;
	version: string;
	license: string;
}

export function moduleNameFromPackage(packageName: string): string {
	const moduleName = packageName
		.replaceAll(MODULE_SEPARATOR_PATTERN, "_")
		.replace(/^_+|_+$/g, "")
		.toLowerCase();
	if (moduleName === "") return "pkg";
	if (/^\d/.test(moduleName)) return `pkg_${moduleName}`;
	return moduleName;
}

export function renderClaimPyproject(spec: ClaimProjectSpec): string {
	const packagePath = `src/${spec.moduleName}`;
	return `[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = ${formatTomlString(spec.packageName)}
version = ${formatTomlString(spec.version)}
description = ${formatTomlString(spec.description)}
readme = {text = "This package name is claimed.", content-type = "text/plain"}
requires-python = ">=3.11"

[tool.hatch.build.targets.wheel]
packages = [${formatTomlString(packagePath)}]
`;
}

export function renderClaimInitPy(version: string): string {
	return `"""Claimed package name."""

__version__ = ${formatTomlString(version)}
`;
}

export function writeClaimProjectFiles(projectDir: string, spec: ClaimProjectSpec): void {
	const moduleDir = join(projectDir, "src", spec.moduleName);
	if (existsSync(moduleDir)) throw new Error(`module directory already exists: ${moduleDir}`);
	mkdirSync(moduleDir, { recursive: true });
	writeFileSync(join(projectDir, "pyproject.toml"), renderClaimPyproject(spec), "utf8");
	writeFileSync(join(moduleDir, "__init__.py"), renderClaimInitPy(spec.version), "utf8");
}

export function renderNpmPackageJson(spec: NpmClaimProjectSpec): string {
	return `${JSON.stringify(
		{
			name: spec.packageName,
			version: spec.version,
			description: spec.description,
			license: spec.license,
			main: "index.js",
			files: ["README.md", "index.js"],
		},
		null,
		2,
	)}\n`;
}

export function renderNpmReadme(spec: NpmClaimProjectSpec): string {
	return `# ${spec.packageName}\n\nThis npm package name is claimed.\n`;
}

export function renderNpmIndexJs(): string {
	return "// Claimed package name placeholder.\n";
}

export function writeNpmClaimProjectFiles(projectDir: string, spec: NpmClaimProjectSpec): void {
	const packageJsonPath = join(projectDir, "package.json");
	if (existsSync(packageJsonPath))
		throw new Error(`package.json already exists: ${packageJsonPath}`);
	writeFileSync(packageJsonPath, renderNpmPackageJson(spec), "utf8");
	writeFileSync(join(projectDir, "README.md"), renderNpmReadme(spec), "utf8");
	writeFileSync(join(projectDir, "index.js"), renderNpmIndexJs(), "utf8");
}

function formatTomlString(value: string): string {
	return JSON.stringify(value);
}
