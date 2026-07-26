import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

export interface ClaimProjectFile {
	relativePath: string;
	contents: string;
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

function renderClaimPyproject(spec: ClaimProjectSpec): string {
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

function renderClaimInitPy(version: string): string {
	return `"""Claimed package name."""

__version__ = ${formatTomlString(version)}
`;
}

export function buildClaimProjectFiles(spec: ClaimProjectSpec): readonly ClaimProjectFile[] {
	return [
		{ relativePath: "pyproject.toml", contents: renderClaimPyproject(spec) },
		{
			relativePath: `src/${spec.moduleName}/__init__.py`,
			contents: renderClaimInitPy(spec.version),
		},
	];
}

function renderNpmPackageJson(spec: NpmClaimProjectSpec): string {
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

function renderNpmReadme(spec: NpmClaimProjectSpec): string {
	return `# ${spec.packageName}\n\nThis npm package name is claimed.\n`;
}

function renderNpmIndexJs(): string {
	return "// Claimed package name placeholder.\n";
}

export function buildNpmClaimProjectFiles(spec: NpmClaimProjectSpec): readonly ClaimProjectFile[] {
	return [
		{ relativePath: "package.json", contents: renderNpmPackageJson(spec) },
		{ relativePath: "README.md", contents: renderNpmReadme(spec) },
		{ relativePath: "index.js", contents: renderNpmIndexJs() },
	];
}

export function writeClaimFiles(projectDir: string, files: readonly ClaimProjectFile[]): void {
	for (const file of files) {
		const targetPath = join(projectDir, file.relativePath);
		if (existsSync(targetPath)) throw new Error(`claim project file already exists: ${targetPath}`);
	}
	for (const file of files) {
		const targetPath = join(projectDir, file.relativePath);
		mkdirSync(dirname(targetPath), { recursive: true });
		writeFileSync(targetPath, file.contents, "utf8");
	}
}

function formatTomlString(value: string): string {
	// packagechk only emits TOML basic strings for scalar fields; this is not a general TOML serializer.
	return JSON.stringify(value);
}
