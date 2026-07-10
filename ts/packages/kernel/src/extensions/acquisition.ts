import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { runCommand } from "@nseng-ai/foundation/exec";
import { errorCodeFromUnknown, formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

export type ExtensionSourceSpec =
	| { kind: "local"; raw: string; path: string }
	| {
			kind: "npm";
			raw: string;
			packageName: string;
			version: string | undefined;
			isPinned: boolean;
	  }
	| { kind: "git"; raw: string };

export interface ResolvedExtensionModuleRoot {
	readonly spec: string;
	readonly sourceKind: "local" | "npm";
	readonly moduleRoot: string;
}

export interface ExtensionAcquisitionDiagnostic {
	readonly code: ExtensionAcquisitionDiagnosticCode;
	readonly message: string;
	readonly spec?: string;
	readonly path?: string;
}

export const EXTENSION_ACQUISITION_DIAGNOSTIC_CODES = [
	"extension_acquisition_invalid_npm_spec",
	"extension_acquisition_git_unsupported",
	"extension_acquisition_npm_project_failed",
	"extension_acquisition_npm_install_failed",
	"extension_acquisition_npm_missing_after_install",
	"extension_acquisition_preview_skipped",
] as const;

export type ExtensionAcquisitionDiagnosticCode =
	(typeof EXTENSION_ACQUISITION_DIAGNOSTIC_CODES)[number];

export const extensionAcquisitionDiagnosticSchema = z.object({
	code: z.enum(EXTENSION_ACQUISITION_DIAGNOSTIC_CODES),
	message: z.string(),
	spec: z.string().optional(),
	path: z.string().optional(),
});

export interface ExtensionAcquisitionGateway {
	ensureManagedNpmProject(
		projectDir: string,
	): Promise<Result<void, ExtensionAcquisitionDiagnostic>>;
	isNpmPackageInstalled(
		packageRoot: string,
	): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>>;
	installNpmPackage(request: {
		projectDir: string;
		rawSpec: string;
		packageName: string;
		version: string | undefined;
		isPinned: boolean;
	}): Promise<Result<void, ExtensionAcquisitionDiagnostic>>;
}

export interface ResolveDeclaredExtensionModulesRequest {
	readonly projectRoot: string;
	readonly declaredSpecs: readonly string[];
	readonly selectedSpecs?: readonly string[];
	readonly mode: "preview" | "apply";
	readonly gateway?: ExtensionAcquisitionGateway;
}

export interface ResolveDeclaredExtensionModulesResult {
	readonly roots: readonly ResolvedExtensionModuleRoot[];
	readonly diagnostics: readonly ExtensionAcquisitionDiagnostic[];
}

export const MANAGED_EXTENSIONS_ROOT = ".ns/managed-extensions";
export const MANAGED_NPM_PROJECT_RELATIVE_PATH = `${MANAGED_EXTENSIONS_ROOT}/npm`;

export const nodeExtensionAcquisitionGateway: ExtensionAcquisitionGateway = {
	async ensureManagedNpmProject(projectDir) {
		try {
			await mkdir(projectDir, { recursive: true });
			await writeFile(
				join(projectDir, "package.json"),
				`${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
				{ flag: "wx" },
			).catch((error: unknown) => {
				if (isNodeErrorCode(error, "EEXIST")) return;
				throw error;
			});
			await rm(join(projectDir, "package-lock.json"), { force: true });
			return resultOk(undefined);
		} catch (error) {
			return resultErr({
				code: "extension_acquisition_npm_project_failed",
				message: `Could not prepare managed npm extension project ${projectDir}: ${formatErrorMessage(error)}`,
				path: projectDir,
			});
		}
	},
	async isNpmPackageInstalled(packageRoot) {
		try {
			const packageJson = await stat(join(packageRoot, "package.json"));
			return resultOk(packageJson.isFile());
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk(false);
			return resultErr({
				code: "extension_acquisition_npm_project_failed",
				message: `Could not inspect managed npm package ${packageRoot}: ${formatErrorMessage(error)}`,
				path: packageRoot,
			});
		}
	},
	async installNpmPackage(request) {
		const packageRequest =
			request.version === undefined
				? request.packageName
				: `${request.packageName}@${request.version}`;
		const result = await runCommand(
			"npm",
			[
				"install",
				"--no-save",
				"--package-lock=false",
				"--ignore-scripts",
				"--legacy-peer-deps",
				packageRequest,
			],
			{ cwd: request.projectDir },
		);
		await rm(join(request.projectDir, "package-lock.json"), { force: true });
		if (result.type === "exited" && result.code === 0 && result.signal === null) {
			return resultOk(undefined);
		}
		return resultErr({
			code: "extension_acquisition_npm_install_failed",
			message: `npm install failed for declared extension ${request.rawSpec}: ${result.stderr || result.stdout}`,
			spec: request.rawSpec,
			path: request.projectDir,
		});
	},
};

export function parseExtensionSourceSpec(
	projectRoot: string,
	raw: string,
): Result<ExtensionSourceSpec, ExtensionAcquisitionDiagnostic> {
	if (raw.startsWith("npm:")) return parseNpmExtensionSourceSpec(raw);
	if (raw.startsWith("git:")) {
		return resultOk({ kind: "git", raw });
	}
	return resultOk({ kind: "local", raw, path: resolve(projectRoot, raw) });
}

export function npmPackageRoot(projectRoot: string, packageName: string): string {
	return join(projectRoot, MANAGED_NPM_PROJECT_RELATIVE_PATH, "node_modules", packageName);
}

export async function resolveDeclaredExtensionModules(
	request: ResolveDeclaredExtensionModulesRequest,
): Promise<ResolveDeclaredExtensionModulesResult> {
	const gateway = request.gateway ?? nodeExtensionAcquisitionGateway;
	const selected = new Set(request.selectedSpecs ?? request.declaredSpecs);
	const specs = request.declaredSpecs.filter((spec) => selected.has(spec));
	const diagnostics: ExtensionAcquisitionDiagnostic[] = [];
	const roots: ResolvedExtensionModuleRoot[] = [];
	const npmProjectDir = join(request.projectRoot, MANAGED_NPM_PROJECT_RELATIVE_PATH);
	let hasEnsuredNpmProject = false;

	for (const raw of specs) {
		const parsed = parseExtensionSourceSpec(request.projectRoot, raw);
		if (!parsed.ok) {
			diagnostics.push(parsed.error);
			continue;
		}
		if (parsed.value.kind === "local") {
			roots.push({ spec: raw, sourceKind: "local", moduleRoot: parsed.value.path });
			continue;
		}
		if (parsed.value.kind === "git") {
			diagnostics.push({
				code: "extension_acquisition_git_unsupported",
				message: `Git extension sources are reserved but unsupported in this slice: ${raw}.`,
				spec: raw,
			});
			continue;
		}

		const packageRoot = npmPackageRoot(request.projectRoot, parsed.value.packageName);
		const installed = await gateway.isNpmPackageInstalled(packageRoot);
		if (!installed.ok) {
			diagnostics.push(withSpec(installed.error, raw));
			continue;
		}
		if (request.mode === "preview") {
			if (installed.value) {
				roots.push({ spec: raw, sourceKind: "npm", moduleRoot: packageRoot });
			} else {
				diagnostics.push({
					code: "extension_acquisition_preview_skipped",
					message: `Dry-run would install declared npm extension ${raw} into ${npmProjectDir}.`,
					spec: raw,
					path: npmProjectDir,
				});
			}
			continue;
		}
		if (!parsed.value.isPinned || !installed.value) {
			if (!hasEnsuredNpmProject) {
				const project = await gateway.ensureManagedNpmProject(npmProjectDir);
				if (!project.ok) {
					diagnostics.push(withSpec(project.error, raw));
					continue;
				}
				hasEnsuredNpmProject = true;
			}
			const install = await gateway.installNpmPackage({
				projectDir: npmProjectDir,
				rawSpec: raw,
				packageName: parsed.value.packageName,
				version: parsed.value.version,
				isPinned: parsed.value.isPinned,
			});
			if (!install.ok) {
				diagnostics.push(withSpec(install.error, raw));
				continue;
			}
		}
		const installedAfter =
			parsed.value.isPinned && installed.value
				? installed
				: await gateway.isNpmPackageInstalled(packageRoot);
		if (!installedAfter.ok) {
			diagnostics.push(withSpec(installedAfter.error, raw));
			continue;
		}
		if (!installedAfter.value) {
			diagnostics.push({
				code: "extension_acquisition_npm_missing_after_install",
				message: `Declared npm extension ${raw} did not resolve to an installed package at ${packageRoot}.`,
				spec: raw,
				path: packageRoot,
			});
			continue;
		}
		roots.push({ spec: raw, sourceKind: "npm", moduleRoot: packageRoot });
	}
	return { roots: sortRoots(roots), diagnostics: sortDiagnostics(diagnostics) };
}

function parseNpmExtensionSourceSpec(
	raw: string,
): Result<ExtensionSourceSpec, ExtensionAcquisitionDiagnostic> {
	const body = raw.slice("npm:".length);
	if (body.trim() === "") return invalidNpmSpec(raw);
	const separator = npmVersionSeparatorIndex(body);
	const packageName = separator === -1 ? body : body.slice(0, separator);
	const version = separator === -1 ? undefined : body.slice(separator + 1);
	if (!isValidNpmPackageName(packageName) || version === "") return invalidNpmSpec(raw);
	return resultOk({
		kind: "npm",
		raw,
		packageName,
		version,
		isPinned: version !== undefined,
	});
}

function npmVersionSeparatorIndex(value: string): number {
	if (!value.startsWith("@")) return value.lastIndexOf("@");
	const slashIndex = value.indexOf("/");
	if (slashIndex === -1) return -1;
	return value.indexOf("@", slashIndex + 1);
}

function isValidNpmPackageName(value: string): boolean {
	if (value.includes(" ") || value.includes("\\") || value.includes("//")) return false;
	if (!value.startsWith("@")) return value.length > 0 && !value.includes("/");
	const slashIndex = value.indexOf("/");
	return (
		slashIndex > 1 && slashIndex < value.length - 1 && !value.slice(slashIndex + 1).includes("/")
	);
}

function invalidNpmSpec(raw: string): Result<never, ExtensionAcquisitionDiagnostic> {
	return resultErr({
		code: "extension_acquisition_invalid_npm_spec",
		message: `Invalid npm extension source spec: ${raw}. Expected npm:pkg, npm:pkg@version, npm:@scope/name, or npm:@scope/name@version.`,
		spec: raw,
	});
}

function withSpec(
	diagnostic: ExtensionAcquisitionDiagnostic,
	spec: string,
): ExtensionAcquisitionDiagnostic {
	return { ...diagnostic, spec: diagnostic.spec ?? spec };
}

function sortRoots(
	roots: readonly ResolvedExtensionModuleRoot[],
): readonly ResolvedExtensionModuleRoot[] {
	return sortByKey(roots, (root) => `${root.sourceKind}\0${root.moduleRoot}`);
}

function sortDiagnostics(
	diagnostics: readonly ExtensionAcquisitionDiagnostic[],
): readonly ExtensionAcquisitionDiagnostic[] {
	return sortByKey(
		diagnostics,
		(diagnostic) => `${diagnostic.spec ?? ""}\0${diagnostic.path ?? ""}\0${diagnostic.code}`,
	);
}

function sortByKey<T>(items: readonly T[], key: (item: T) => string): readonly T[] {
	return [...items].sort((left, right) => key(left).localeCompare(key(right)));
}

function isNodeErrorCode(error: unknown, code: string): boolean {
	return errorCodeFromUnknown(error) === code;
}
