import { lstat, mkdir, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

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
	projectManagedNpmStorage,
} from "../project-config/managed-extension-paths.ts";
import type { ManagedNpmStorage } from "../project-config/managed-extension-paths.ts";

export {
	gitExtensionSourceUnsupportedMessage,
	GIT_EXTENSION_SOURCE_UNSUPPORTED_REASON,
	parseExtensionSourceSpec,
} from "../project-config/extension-source-spec.ts";
export {
	managedNpmProjectRoot,
	managedNpmRoot,
	npmPackageRoot,
	projectManagedNpmStorage,
	userManagedNpmStorage,
} from "../project-config/managed-extension-paths.ts";
export type { ManagedNpmStorage } from "../project-config/managed-extension-paths.ts";
export type { ExtensionSourceSpec } from "../project-config/extension-source-spec.ts";

export type ResolvedExtensionModuleRoot =
	| {
			readonly spec: string;
			readonly sourceKind: "local";
			readonly moduleRoot: string;
	  }
	| {
			readonly spec: string;
			readonly sourceKind: "npm";
			readonly moduleRoot: string;
			/** Whether the package bytes were installed before this resolution began. */
			readonly wasInstalled: boolean;
			/** Whether the isolated package project existed before this resolution began. */
			readonly packageProjectExisted: boolean;
	  };

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
	isManagedNpmProjectPresent(request: {
		readonly storage: ManagedNpmStorage;
		readonly packageName: string;
	}): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>>;
	ensureManagedNpmProject(request: {
		readonly storage: ManagedNpmStorage;
		readonly packageName: string;
	}): Promise<Result<void, ExtensionAcquisitionDiagnostic>>;
	isNpmPackageInstalled(request: {
		readonly storage: ManagedNpmStorage;
		readonly packageName: string;
	}): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>>;
	removeManagedNpmPackage(request: {
		readonly storage: ManagedNpmStorage;
		readonly packageName: string;
	}): Promise<Result<ManagedNpmPackageRemovalResult, ExtensionAcquisitionDiagnostic>>;
	installNpmPackage(request: {
		readonly storage: ManagedNpmStorage;
		readonly rawSpec: string;
		readonly packageName: string;
		readonly version: string | undefined;
		readonly isPinned: boolean;
	}): Promise<Result<void, ExtensionAcquisitionDiagnostic>>;
}

export interface ResolveDeclaredExtensionModulesRequest {
	readonly projectRoot: string;
	/** Defaults to the established repository-local managed npm storage policy. */
	readonly managedNpmStorage?: ManagedNpmStorage;
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

	async isManagedNpmProjectPresent(request: {
		readonly storage: ManagedNpmStorage;
		readonly packageName: string;
	}): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>> {
		const resolved = resolveManagedNpmRequest(request);
		if (!resolved.ok)
			return managedNpmProjectFailure(request.storage.npmRoot, "inspect", resolved.error);
		try {
			return resultOk(await validateDirectoryChain(resolved.value.projectChain, true));
		} catch (error) {
			return managedNpmProjectFailure(
				resolved.value.npmProjectRoot,
				"inspect",
				formatErrorMessage(error),
			);
		}
	}

	async ensureManagedNpmProject(request: {
		readonly storage: ManagedNpmStorage;
		readonly packageName: string;
	}): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		const resolved = resolveManagedNpmRequest(request);
		if (!resolved.ok)
			return managedNpmProjectFailure(request.storage.npmRoot, "prepare", resolved.error);
		try {
			for (const path of resolved.value.projectChain) await ensureSafeDirectory(path);
			await ensureSafeManifest(resolved.value.projectManifest);
			await rm(resolved.value.packageLock, { force: true });
			return resultOk(undefined);
		} catch (error) {
			return managedNpmProjectFailure(
				resolved.value.npmProjectRoot,
				"prepare",
				formatErrorMessage(error),
			);
		}
	}

	async isNpmPackageInstalled(request: {
		readonly storage: ManagedNpmStorage;
		readonly packageName: string;
	}): Promise<Result<boolean, ExtensionAcquisitionDiagnostic>> {
		const resolved = resolveManagedNpmRequest(request);
		if (!resolved.ok)
			return managedNpmProjectFailure(request.storage.npmRoot, "inspect", resolved.error);
		try {
			if (!(await validateDirectoryChain(resolved.value.packageChain, true)))
				return resultOk(false);
			const manifest = await lstat(resolved.value.packageManifest);
			if (manifest.isSymbolicLink() || !manifest.isFile()) {
				throw new Error(`Unsafe managed npm package manifest: ${resolved.value.packageManifest}.`);
			}
			return resultOk(true);
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk(false);
			return managedNpmProjectFailure(
				resolved.value.packageRoot,
				"inspect package",
				formatErrorMessage(error),
			);
		}
	}

	async removeManagedNpmPackage(request: {
		readonly storage: ManagedNpmStorage;
		readonly packageName: string;
	}): Promise<Result<ManagedNpmPackageRemovalResult, ExtensionAcquisitionDiagnostic>> {
		const resolved = resolveManagedNpmRequest(request);
		if (!resolved.ok) return managedNpmRemovalFailure(request.storage.npmRoot, resolved.error);
		const paths = resolved.value.paths;
		const packageProject = resolved.value.npmProjectRoot;
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
		readonly storage: ManagedNpmStorage;
		readonly rawSpec: string;
		readonly packageName: string;
		readonly version: string | undefined;
		readonly isPinned: boolean;
	}): Promise<Result<void, ExtensionAcquisitionDiagnostic>> {
		const resolved = resolveManagedNpmRequest(request);
		if (!resolved.ok)
			return npmInstallFailure(request.rawSpec, request.storage.npmRoot, resolved.error);
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
			await validateDirectoryChain(resolved.value.projectChain, false);
			await validateSafeManifest(resolved.value.projectManifest);
			const result = await this.exec.exec(command, args, { cwd: resolved.value.npmProjectRoot });
			await rm(resolved.value.packageLock, { force: true });
			if (commandSucceeded(result)) {
				return resultOk(undefined);
			}
			const detail =
				result.type === "spawn-failed"
					? result.error
					: result.stderr === ""
						? result.stdout
						: result.stderr;
			return npmInstallFailure(request.rawSpec, resolved.value.npmProjectRoot, detail);
		} catch (error) {
			return npmInstallFailure(
				request.rawSpec,
				resolved.value.npmProjectRoot,
				formatErrorMessage(error),
			);
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
	const managedNpmStorage =
		request.managedNpmStorage ?? projectManagedNpmStorage(request.projectRoot);
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

		const managedPaths = managedNpmPackagePaths(managedNpmStorage, parsed.value.packageName);
		const npmProjectDir = managedPaths.npmProjectRoot;
		const packageRoot = managedPaths.packageRoot;
		const managedRequest = { storage: managedNpmStorage, packageName: parsed.value.packageName };
		const installed = await gateway.isNpmPackageInstalled(managedRequest);
		if (!installed.ok) {
			diagnostics.push(withSpec(installed.error, raw));
			continue;
		}
		if (request.mode === "preview") {
			if (installed.value) {
				roots.push({
					spec: raw,
					sourceKind: "npm",
					moduleRoot: packageRoot,
					wasInstalled: installed.value,
					packageProjectExisted: true,
				});
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
		const projectPresent = await gateway.isManagedNpmProjectPresent(managedRequest);
		if (!projectPresent.ok) {
			diagnostics.push(withSpec(projectPresent.error, raw));
			continue;
		}
		const shouldInstall =
			!installed.value || (!parsed.value.isPinned && request.npmAcquisition === "refresh-floating");
		if (shouldInstall) {
			const project = await gateway.ensureManagedNpmProject(managedRequest);
			if (!project.ok) {
				diagnostics.push(withSpec(project.error, raw));
				continue;
			}
			const install = await gateway.installNpmPackage({
				storage: managedNpmStorage,
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
			? await gateway.isNpmPackageInstalled(managedRequest)
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
		roots.push({
			spec: raw,
			sourceKind: "npm",
			moduleRoot: packageRoot,
			wasInstalled: installed.value,
			packageProjectExisted: projectPresent.value,
		});
	}
	return { roots: sortRoots(roots), diagnostics: sortDiagnostics(diagnostics) };
}

interface ResolvedManagedNpmRequest {
	readonly paths: ReturnType<typeof managedNpmPackagePaths>;
	readonly npmProjectRoot: string;
	readonly packageRoot: string;
	readonly projectManifest: string;
	readonly packageManifest: string;
	readonly packageLock: string;
	readonly projectChain: readonly string[];
	readonly packageChain: readonly string[];
}

type ManagedNpmResolution =
	| { readonly ok: true; readonly value: ResolvedManagedNpmRequest }
	| { readonly ok: false; readonly error: string };

function resolveManagedNpmRequest(request: {
	readonly storage: ManagedNpmStorage;
	readonly packageName: string;
}): ManagedNpmResolution {
	const parsed = parseExtensionSourceSpec("/", `npm:${request.packageName}`);
	if (
		!parsed.ok ||
		parsed.value.kind !== "npm" ||
		parsed.value.packageName !== request.packageName ||
		parsed.value.version !== undefined
	) {
		return { ok: false, error: `Invalid canonical npm package name: ${request.packageName}.` };
	}
	const { npmRoot, trustedAncestors } = request.storage;
	if (!isCanonicalAbsolutePath(npmRoot)) {
		return { ok: false, error: `Managed npm root must be an absolute canonical path: ${npmRoot}.` };
	}
	if (trustedAncestors.length === 0 || trustedAncestors.at(-1) !== npmRoot) {
		return {
			ok: false,
			error: "Managed npm trusted ancestors must be ordered and end at the npm root.",
		};
	}
	for (const [index, ancestor] of trustedAncestors.entries()) {
		if (!isCanonicalAbsolutePath(ancestor)) {
			return {
				ok: false,
				error: `Managed npm trusted ancestor must be absolute and canonical: ${ancestor}.`,
			};
		}
		const previous = trustedAncestors[index - 1];
		if (previous !== undefined && dirname(ancestor) !== previous) {
			return {
				ok: false,
				error: "Managed npm trusted ancestors must include every owned path component in order.",
			};
		}
	}
	const paths = managedNpmPackagePaths(request.storage, request.packageName);
	if (!isStrictlyBelow(npmRoot, paths.npmProjectRoot)) {
		return {
			ok: false,
			error: `Package name does not identify a project below the managed npm root: ${request.packageName}.`,
		};
	}
	if (!isStrictlyBelow(paths.npmProjectRoot, paths.packageRoot)) {
		return {
			ok: false,
			error: `Derived package root escapes its managed npm project: ${paths.packageRoot}.`,
		};
	}
	return {
		ok: true,
		value: {
			paths,
			npmProjectRoot: paths.npmProjectRoot,
			packageRoot: paths.packageRoot,
			projectManifest: join(paths.npmProjectRoot, "package.json"),
			packageManifest: join(paths.packageRoot, "package.json"),
			packageLock: join(paths.npmProjectRoot, "package-lock.json"),
			projectChain: paths.trustedAncestors,
			packageChain: [
				...paths.trustedAncestors,
				join(paths.npmProjectRoot, "node_modules"),
				...(request.packageName.startsWith("@")
					? [join(paths.npmProjectRoot, "node_modules", request.packageName.split("/")[0] ?? "")]
					: []),
				paths.packageRoot,
			],
		},
	};
}

function isCanonicalAbsolutePath(path: string): boolean {
	return isAbsolute(path) && resolve(path) === path;
}

function isStrictlyBelow(parent: string, child: string): boolean {
	const path = relative(parent, child);
	return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function validateDirectoryChain(
	paths: readonly string[],
	allowAbsent: boolean,
): Promise<boolean> {
	for (const path of paths) {
		try {
			const entry = await lstat(path);
			if (entry.isSymbolicLink() || !entry.isDirectory()) {
				throw new Error(`Unsafe managed npm non-directory or symbolic-link path: ${path}.`);
			}
		} catch (error) {
			if (allowAbsent && isNodeErrorCode(error, "ENOENT")) return false;
			throw error;
		}
	}
	return true;
}

async function ensureSafeDirectory(path: string): Promise<void> {
	try {
		const entry = await lstat(path);
		if (entry.isSymbolicLink() || !entry.isDirectory()) {
			throw new Error(`Unsafe managed npm non-directory or symbolic-link path: ${path}.`);
		}
		return;
	} catch (error) {
		if (!isNodeErrorCode(error, "ENOENT")) throw error;
	}
	try {
		await mkdir(path);
	} catch (error) {
		if (!isNodeErrorCode(error, "EEXIST")) throw error;
		const entry = await lstat(path);
		if (entry.isSymbolicLink() || !entry.isDirectory()) {
			throw new Error(`Unsafe managed npm non-directory or symbolic-link path: ${path}.`);
		}
	}
}

async function ensureSafeManifest(path: string): Promise<void> {
	try {
		await writeFile(path, `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`, {
			flag: "wx",
		});
	} catch (error) {
		if (!isNodeErrorCode(error, "EEXIST")) throw error;
		await validateSafeManifest(path);
	}
}

async function validateSafeManifest(path: string): Promise<void> {
	const entry = await lstat(path);
	if (entry.isSymbolicLink() || !entry.isFile()) {
		throw new Error(`Unsafe managed npm project manifest: ${path}.`);
	}
}

function managedNpmProjectFailure(
	path: string,
	operation: "inspect" | "inspect package" | "prepare",
	detail: string,
): Result<never, ExtensionAcquisitionDiagnostic> {
	const action = operation === "prepare" ? "prepare" : operation;
	return resultErr({
		code: "extension_acquisition_npm_project_failed",
		message: `Could not ${action} managed npm extension project ${path}: ${detail}`,
		path,
	});
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
	rawSpec: string,
	path: string,
	detail: string,
): Result<void, ExtensionAcquisitionDiagnostic> {
	return resultErr({
		code: "extension_acquisition_npm_install_failed",
		message: `npm install failed for declared extension ${rawSpec}: ${detail}`,
		spec: rawSpec,
		path,
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
