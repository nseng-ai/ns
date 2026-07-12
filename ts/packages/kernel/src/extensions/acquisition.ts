import { lstat, mkdir, readdir, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import {
	commandSucceeded,
	NodeCommandExecApi,
	type CommandExecApi,
} from "@nseng-ai/foundation/exec";
import { errorCodeFromUnknown, formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

import {
	gitExtensionSourceUnsupportedMessage,
	parseExtensionSourceSpec,
} from "../project-config/extension-source-spec.ts";
import {
	managedNpmPackagePaths,
	managedNpmRoot,
} from "../project-config/managed-extension-paths.ts";

export {
	gitExtensionSourceUnsupportedMessage,
	GIT_EXTENSION_SOURCE_UNSUPPORTED_REASON,
	parseExtensionSourceSpec,
} from "../project-config/extension-source-spec.ts";
export {
	managedNpmProjectRoot,
	managedNpmRoot,
	npmPackageRoot,
} from "../project-config/managed-extension-paths.ts";
export type { ExtensionSourceSpec } from "../project-config/extension-source-spec.ts";

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
	"extension_acquisition_npm_remove_failed",
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

export interface ManagedNpmPackageRemovalResult {
	readonly status: "removed" | "already-absent";
	readonly path: string;
}

export interface ExtensionAcquisitionGateway {
	ensureManagedNpmProject(
		projectDir: string,
	): Promise<Result<void, ExtensionAcquisitionDiagnostic>>;
	isNpmPackageInstalled(
		packageRoot: string,
	): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>>;
	removeManagedNpmPackage(request: {
		readonly projectRoot: string;
		readonly packageName: string;
	}): Promise<Result<ManagedNpmPackageRemovalResult, ExtensionAcquisitionDiagnostic>>;
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
	/** Ensure is install-idempotent; refresh-floating is reserved for explicit update behavior. */
	readonly npmAcquisition?: "ensure" | "refresh-floating";
	readonly gateway?: ExtensionAcquisitionGateway;
}

export interface ResolveDeclaredExtensionModulesResult {
	readonly roots: readonly ResolvedExtensionModuleRoot[];
	readonly diagnostics: readonly ExtensionAcquisitionDiagnostic[];
}

export class RealExtensionAcquisitionGateway implements ExtensionAcquisitionGateway {
	private readonly exec: CommandExecApi;

	constructor(exec: CommandExecApi) {
		this.exec = exec;
	}

	async ensureManagedNpmProject(
		projectDir: string,
	): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
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
	}

	async isNpmPackageInstalled(
		packageRoot: string,
	): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>> {
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
	}

	async removeManagedNpmPackage(request: {
		readonly projectRoot: string;
		readonly packageName: string;
	}): Promise<Result<ManagedNpmPackageRemovalResult, ExtensionAcquisitionDiagnostic>> {
		const parsedPackage = parseExtensionSourceSpec(
			request.projectRoot,
			`npm:${request.packageName}`,
		);
		if (
			!parsedPackage.ok ||
			parsedPackage.value.kind !== "npm" ||
			parsedPackage.value.packageName !== request.packageName ||
			parsedPackage.value.version !== undefined
		) {
			return managedNpmRemovalFailure(
				managedNpmRoot(request.projectRoot),
				`Invalid canonical npm package name: ${request.packageName}.`,
			);
		}
		const paths = managedNpmPackagePaths(request.projectRoot, request.packageName);
		const npmRoot = paths.npmRoot;
		const packageProject = paths.npmProjectRoot;
		const relativeProject = relative(npmRoot, packageProject);
		if (
			relativeProject === "" ||
			relativeProject === ".." ||
			relativeProject.startsWith(`..${sep}`) ||
			isAbsolute(relativeProject)
		) {
			return managedNpmRemovalFailure(
				packageProject,
				`Package name does not identify a project below the managed npm root: ${request.packageName}.`,
			);
		}
		try {
			for (const ancestor of paths.trustedAncestors) {
				let entry;
				try {
					entry = await lstat(ancestor);
				} catch (error) {
					if (isNodeErrorCode(error, "ENOENT")) {
						return resultOk({ status: "already-absent", path: packageProject });
					}
					throw error;
				}
				if (entry.isSymbolicLink() || !entry.isDirectory()) {
					return managedNpmRemovalFailure(
						ancestor,
						`Refusing to remove managed npm package through an unsafe non-directory or symbolic-link path: ${ancestor}.`,
					);
				}
			}
			await rm(packageProject, { recursive: true });
			for (const ancestor of paths.pruningAncestors) {
				if ((await readdir(ancestor)).length > 0) break;
				await rmdir(ancestor);
			}
			return resultOk({ status: "removed", path: packageProject });
		} catch (error) {
			return managedNpmRemovalFailure(packageProject, formatErrorMessage(error));
		}
	}

	async installNpmPackage(request: {
		projectDir: string;
		rawSpec: string;
		packageName: string;
		version: string | undefined;
		isPinned: boolean;
	}): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		const packageRequest =
			request.version === undefined
				? request.packageName
				: `${request.packageName}@${request.version}`;
		const command = "npm";
		const args = [
			"install",
			"--no-save",
			"--package-lock=false",
			"--ignore-scripts",
			"--legacy-peer-deps",
			packageRequest,
		];
		try {
			const result = await this.exec.exec(command, args, { cwd: request.projectDir });
			await rm(join(request.projectDir, "package-lock.json"), { force: true });
			if (commandSucceeded(result)) {
				return resultOk(undefined);
			}
			const detail =
				result.type === "spawn-failed"
					? result.error
					: result.stderr === ""
						? result.stdout
						: result.stderr;
			return npmInstallFailure(request, detail);
		} catch (error) {
			return npmInstallFailure(request, formatErrorMessage(error));
		}
	}
}

export function createRealExtensionAcquisitionGateway(
	exec: CommandExecApi,
): ExtensionAcquisitionGateway {
	return new RealExtensionAcquisitionGateway(exec);
}

export const nodeExtensionAcquisitionGateway: ExtensionAcquisitionGateway =
	createRealExtensionAcquisitionGateway(new NodeCommandExecApi());

export async function resolveDeclaredExtensionModules(
	request: ResolveDeclaredExtensionModulesRequest,
): Promise<ResolveDeclaredExtensionModulesResult> {
	const gateway = request.gateway ?? nodeExtensionAcquisitionGateway;
	const selected = new Set(request.selectedSpecs ?? request.declaredSpecs);
	const specs = request.declaredSpecs.filter((spec) => selected.has(spec));
	const diagnostics: ExtensionAcquisitionDiagnostic[] = [];
	const roots: ResolvedExtensionModuleRoot[] = [];

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
				message: gitExtensionSourceUnsupportedMessage(raw),
				spec: raw,
			});
			continue;
		}

		const managedPaths = managedNpmPackagePaths(request.projectRoot, parsed.value.packageName);
		const npmProjectDir = managedPaths.npmProjectRoot;
		const packageRoot = managedPaths.packageRoot;
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
		const shouldInstall =
			!installed.value || (!parsed.value.isPinned && request.npmAcquisition === "refresh-floating");
		if (shouldInstall) {
			const project = await gateway.ensureManagedNpmProject(npmProjectDir);
			if (!project.ok) {
				diagnostics.push(withSpec(project.error, raw));
				continue;
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
		const installedAfter = shouldInstall
			? await gateway.isNpmPackageInstalled(packageRoot)
			: installed;
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

function managedNpmRemovalFailure(
	path: string,
	detail: string,
): Result<never, ExtensionAcquisitionDiagnostic> {
	return resultErr({
		code: "extension_acquisition_npm_remove_failed",
		message: `Could not remove managed npm extension package at ${path}: ${detail}`,
		path,
	});
}

function npmInstallFailure(
	request: { readonly projectDir: string; readonly rawSpec: string },
	detail: string,
): Result<void, ExtensionAcquisitionDiagnostic> {
	return resultErr({
		code: "extension_acquisition_npm_install_failed",
		message: `npm install failed for declared extension ${request.rawSpec}: ${detail}`,
		spec: request.rawSpec,
		path: request.projectDir,
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
