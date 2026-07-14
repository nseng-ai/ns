import { copyFile, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";

import { runCommand } from "@nseng-ai/foundation/exec";
import { z } from "zod";

import { parseDispatchProjectConfigToml } from "../api/project-config.ts";
import { verifyDispatchBuildOutput } from "./output-verifier.ts";
import type {
	DispatchProductionConfiguration,
	PreparedProductionSourceWorkspace,
	ProductionDeploymentContext,
	ProductionSourceWorkspaceGateway,
	VercelDeploymentLocator,
	VercelDeploymentRecord,
} from "./production-deployment.ts";

const projectMetadataSchema = z.looseObject({
	projectId: z.string().min(1),
	orgId: z.string().min(1),
	projectName: z.string().min(1),
});

const deployJsonSchema = z.looseObject({
	id: z.string().min(1).optional(),
	deploymentId: z.string().min(1).optional(),
	url: z.string().min(1).optional(),
	deploymentUrl: z.string().min(1).optional(),
});

const inspectJsonSchema = z.looseObject({
	id: z.string().min(1).optional(),
	deploymentId: z.string().min(1).optional(),
	url: z.string().min(1).optional(),
	deploymentUrl: z.string().min(1).optional(),
	readyState: z.string().optional(),
	status: z.string().optional(),
});

const healthPayloadSchema = z.strictObject({
	service: z.literal("ns-dispatch"),
	status: z.literal("ok"),
});

export const VERCEL_PRODUCTION_DEPLOY_ARGS = [
	"deploy",
	"--prebuilt",
	"--scope",
	"schrockns-projects",
	"--prod",
	"--yes",
	"--format=json",
] as const;

export const PRODUCTION_WORKSPACE_INSTALL_ARGS = [
	"pnpm",
	"--filter",
	"@nseng-ai/vercel...",
	"install",
	"--frozen-lockfile",
] as const;

export function productionWorkspaceInstallRoot(worktreeRoot: string): string {
	return join(worktreeRoot, "ts");
}

export function vercelInspectArgs(locator: string): readonly string[] {
	return ["inspect", locator, "--wait", "--timeout", "2m", "--format=json"];
}

export function isProductionHealthPayload(value: unknown): boolean {
	return healthPayloadSchema.safeParse(value).success;
}

export function redactProductionDiagnostic(value: string): string {
	return value
		.replaceAll(/https:\/\/[^\s/@:]+:[^\s/@]+@/gu, "https://[REDACTED]@")
		.replaceAll(/\b(Bearer\s+)[A-Za-z0-9._~-]+/giu, "$1[REDACTED]")
		.replaceAll(/\b(token|secret|password|private[_-]?key)\s*[=:]\s*[^\s,]+/giu, "$1=[REDACTED]");
}

export interface RealProductionDeploymentOptions {
	readonly repositoryRoot: string;
	readonly packageRoot: string;
	readonly writeDiagnostic: (message: string) => void;
}

/** Adapter-internal mechanics exposed only for fake-driven boundary tests. */
export interface ProductionWorkspaceAdapterOperations {
	createTemporaryParent(): Promise<string>;
	runCommand(
		commandName: string,
		args: readonly string[],
		cwd: string,
		diagnostic: (message: string) => void,
	): Promise<{ readonly ok: boolean; readonly stdout: string }>;
	makeDirectory(path: string): Promise<void>;
	copyFile(source: string, destination: string): Promise<void>;
	readText(path: string): Promise<string>;
	pathExists(path: string): Promise<boolean>;
	removeTree(path: string): Promise<void>;
	promoteBuildOutput(options: {
		readonly repositoryRoot: string;
		readonly packageRoot: string;
	}): ReturnType<typeof promoteDispatchBuildOutput>;
}

const realProductionWorkspaceOperations: ProductionWorkspaceAdapterOperations = {
	async createTemporaryParent() {
		return await mkdtemp(join(tmpdir(), "ns-vercel-production-"));
	},
	runCommand: command,
	async makeDirectory(path) {
		await mkdir(path, { recursive: true });
	},
	async copyFile(source, destination) {
		await copyFile(source, destination);
	},
	async readText(path) {
		return await readFile(path, "utf8");
	},
	pathExists,
	async removeTree(path) {
		await rm(path, { recursive: true, force: true });
	},
	promoteBuildOutput: promoteDispatchBuildOutput,
};

export function createRealProductionDeploymentContext(
	options: RealProductionDeploymentOptions,
): ProductionDeploymentContext {
	const { repositoryRoot, packageRoot, writeDiagnostic } = options;
	return {
		progress: writeDiagnostic,
		repository: {
			async inspectProductionSource() {
				const status = await command(
					"git",
					["status", "--porcelain=v1", "--untracked-files=all"],
					repositoryRoot,
					writeDiagnostic,
				);
				if (!status.ok) {
					return { ok: false as const, dirtyPaths: [], message: "Cannot inspect git status." };
				}
				const dirtyPaths = status.stdout
					.split("\n")
					.filter((line) => line.length > 3)
					.map((line) => line.slice(3));
				if (dirtyPaths.length > 0) {
					writeDiagnostic(`Dirty paths:\n${dirtyPaths.map((path) => `- ${path}`).join("\n")}`);
					return {
						ok: false as const,
						dirtyPaths,
						message: "Repository has uncommitted or untracked changes.",
					};
				}
				const sha = await command("git", ["rev-parse", "HEAD"], repositoryRoot, writeDiagnostic);
				if (!sha.ok || !/^[0-9a-f]{40}$/u.test(sha.stdout.trim())) {
					return {
						ok: false as const,
						dirtyPaths: [],
						message: "Cannot resolve the exact git commit.",
					};
				}
				return { ok: true as const, commitSha: sha.stdout.trim() };
			},
		},
		sourceWorkspaces: createProductionSourceWorkspaceGateway({
			repositoryRoot,
			packageRoot,
			writeDiagnostic,
		}),
		configuration: {
			async readProductionConfiguration(commitSha, packageProject) {
				try {
					const sourceConfiguration = await command(
						"git",
						["show", `${commitSha}:ns.toml`],
						repositoryRoot,
						writeDiagnostic,
					);
					if (!sourceConfiguration.ok) {
						return { ok: false as const, message: "Cannot read ns.toml from captured source." };
					}
					return {
						ok: true as const,
						value: await readProductionConfiguration(
							repositoryRoot,
							sourceConfiguration.stdout,
							packageProject,
						),
					};
				} catch (error) {
					return { ok: false as const, message: safeErrorMessage(error) };
				}
			},
		},
		deployments: {
			async deployPrebuiltProduction() {
				const result = await command(
					"vercel",
					VERCEL_PRODUCTION_DEPLOY_ARGS,
					repositoryRoot,
					writeDiagnostic,
				);
				const locator = parseVercelDeploymentLocator(result.stdout);
				if (result.ok) {
					return locator === undefined
						? { ok: false as const, message: "Vercel deploy returned malformed JSON." }
						: { ok: true as const, locator };
				}
				return {
					ok: false as const,
					message:
						"Vercel deploy failed; inspecting any returned locator before retry is required.",
					...(locator === undefined ? {} : { locator }),
				};
			},
			async inspectDeployment(locator) {
				const value =
					typeof locator === "string" ? locator : (locator.deploymentId ?? locator.deploymentUrl);
				if (value === undefined) {
					return { ok: false as const, message: "Deployment locator has no id or URL." };
				}
				const result = await command(
					"vercel",
					vercelInspectArgs(value),
					repositoryRoot,
					writeDiagnostic,
				);
				if (!result.ok) {
					return { ok: false as const, message: "Vercel deployment inspection failed." };
				}
				const parsed = parseVercelInspection(result.stdout);
				return parsed === undefined
					? { ok: false as const, message: "Vercel inspect returned malformed JSON." }
					: { ok: true as const, value: parsed };
			},
		},
	};
}

export function createProductionSourceWorkspaceGateway(
	options: RealProductionDeploymentOptions,
	operations: ProductionWorkspaceAdapterOperations = realProductionWorkspaceOperations,
): ProductionSourceWorkspaceGateway {
	return {
		async prepareSourceWorkspace(commitSha) {
			return await prepareDetachedSourceWorkspace({ ...options, commitSha }, operations);
		},
	};
}

interface PrepareDetachedSourceWorkspaceOptions extends RealProductionDeploymentOptions {
	readonly commitSha: string;
}

async function prepareDetachedSourceWorkspace(
	options: PrepareDetachedSourceWorkspaceOptions,
	operations: ProductionWorkspaceAdapterOperations,
): Promise<
	| { readonly ok: true; readonly workspace: PreparedProductionSourceWorkspace }
	| { readonly ok: false; readonly message: string }
> {
	const packageRelativePath = relative(options.repositoryRoot, options.packageRoot);
	if (
		packageRelativePath === "" ||
		packageRelativePath === ".." ||
		packageRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
		isAbsolute(packageRelativePath)
	) {
		return { ok: false, message: "Package root is not inside the production repository." };
	}
	let temporaryParent: string;
	try {
		temporaryParent = await operations.createTemporaryParent();
	} catch (error) {
		return {
			ok: false,
			message: `Cannot create temporary production workspace: ${safeErrorMessage(error)}`,
		};
	}
	const worktreeRoot = join(temporaryParent, "source");
	const isolatedPackageRoot = join(worktreeRoot, packageRelativePath);
	let isWorktreeAdded = false;
	try {
		const added = await operations.runCommand(
			"git",
			["worktree", "add", "--detach", worktreeRoot, options.commitSha],
			options.repositoryRoot,
			options.writeDiagnostic,
		);
		if (!added.ok) throw new Error("Cannot create detached production source worktree.");
		isWorktreeAdded = true;
		await provisionOperationalInputs(options.packageRoot, isolatedPackageRoot, operations);
		const installed = await operations.runCommand(
			"corepack",
			PRODUCTION_WORKSPACE_INSTALL_ARGS,
			productionWorkspaceInstallRoot(worktreeRoot),
			options.writeDiagnostic,
		);
		if (!installed.ok) throw new Error("Cannot install the locked production workspace graph.");
	} catch (error) {
		const cleanup = await disposeDetachedWorktree({
			repositoryRoot: options.repositoryRoot,
			worktreeRoot,
			temporaryParent,
			isWorktreeAdded,
			writeDiagnostic: options.writeDiagnostic,
			operations,
		});
		return {
			ok: false,
			message: `${safeErrorMessage(error)}${cleanup.ok ? "" : ` Cleanup also failed: ${cleanup.message}`}`,
		};
	}

	let isDisposed = false;
	return {
		ok: true,
		workspace: {
			async buildPackageDeployable() {
				const result = await operations.runCommand(
					"corepack",
					["pnpm", "run", "build:deployable"],
					isolatedPackageRoot,
					options.writeDiagnostic,
				);
				return result.ok
					? { ok: true as const }
					: { ok: false as const, message: "Detached package deployable build failed." };
			},
			async verifySourceAfterBuild() {
				const sha = await operations.runCommand(
					"git",
					["rev-parse", "HEAD"],
					worktreeRoot,
					options.writeDiagnostic,
				);
				if (!sha.ok || sha.stdout.trim() !== options.commitSha) {
					return { ok: false as const, message: "Detached source HEAD changed during build." };
				}
				const status = await operations.runCommand(
					"git",
					["status", "--porcelain=v1", "--untracked-files=all"],
					worktreeRoot,
					options.writeDiagnostic,
				);
				if (!status.ok) {
					return { ok: false as const, message: "Cannot revalidate detached source status." };
				}
				if (status.stdout.trim() !== "") {
					return { ok: false as const, message: "Detached source changed during build." };
				}
				return { ok: true as const };
			},
			async readPackageProjectIdentity() {
				try {
					const project = projectMetadataSchema.parse(
						JSON.parse(
							await operations.readText(join(isolatedPackageRoot, ".vercel/project.json")),
						) as unknown,
					);
					return {
						ok: true as const,
						value: {
							projectId: project.projectId,
							teamId: project.orgId,
							projectName: project.projectName,
						},
					};
				} catch (error) {
					return { ok: false as const, message: safeErrorMessage(error) };
				}
			},
			async promoteVerifiedBuildOutput() {
				return await operations.promoteBuildOutput({
					repositoryRoot: options.repositoryRoot,
					packageRoot: isolatedPackageRoot,
				});
			},
			async dispose() {
				if (isDisposed) return { ok: true as const };
				const result = await disposeDetachedWorktree({
					repositoryRoot: options.repositoryRoot,
					worktreeRoot,
					temporaryParent,
					isWorktreeAdded: true,
					writeDiagnostic: options.writeDiagnostic,
					operations,
				});
				if (result.ok) isDisposed = true;
				return result;
			},
		},
	};
}

async function provisionOperationalInputs(
	operatorPackageRoot: string,
	isolatedPackageRoot: string,
	operations: ProductionWorkspaceAdapterOperations,
): Promise<void> {
	await operations.makeDirectory(join(isolatedPackageRoot, ".vercel"));
	await operations.copyFile(
		join(operatorPackageRoot, ".vercel/project.json"),
		join(isolatedPackageRoot, ".vercel/project.json"),
	);
	const environmentPath = join(operatorPackageRoot, ".env.local");
	if (await operations.pathExists(environmentPath)) {
		await operations.copyFile(environmentPath, join(isolatedPackageRoot, ".env.local"));
	}
}

async function disposeDetachedWorktree(options: {
	readonly repositoryRoot: string;
	readonly worktreeRoot: string;
	readonly temporaryParent: string;
	readonly isWorktreeAdded: boolean;
	readonly writeDiagnostic: (message: string) => void;
	readonly operations: ProductionWorkspaceAdapterOperations;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> {
	if (options.isWorktreeAdded) {
		const removed = await options.operations.runCommand(
			"git",
			["worktree", "remove", "--force", options.worktreeRoot],
			options.repositoryRoot,
			options.writeDiagnostic,
		);
		if (!removed.ok) {
			return {
				ok: false,
				message: `Temporary production worktree cleanup failed at ${options.worktreeRoot}; remediate it before retrying.`,
			};
		}
	}
	try {
		await options.operations.removeTree(options.temporaryParent);
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			message: `Temporary production directory cleanup failed at ${options.temporaryParent}: ${safeErrorMessage(error)}`,
		};
	}
}

export function parseVercelDeploymentLocator(source: string): VercelDeploymentLocator | undefined {
	const parsed = parseJson(source, deployJsonSchema);
	if (parsed === undefined) return undefined;
	const deploymentId = parsed.id ?? parsed.deploymentId;
	const urlFields = [parsed.url, parsed.deploymentUrl].filter(
		(value): value is string => value !== undefined,
	);
	const parsedUrls = urlFields.map(parseVercelDeploymentUrl);
	if (parsedUrls.some((value) => value === undefined)) return undefined;
	const deploymentUrl = parsedUrls[0];
	if (deploymentId === undefined && deploymentUrl === undefined) return undefined;
	return {
		...(deploymentId === undefined ? {} : { deploymentId }),
		...(deploymentUrl === undefined ? {} : { deploymentUrl }),
	};
}

export function parseVercelInspection(source: string): VercelDeploymentRecord | undefined {
	const parsed = parseJson(source, inspectJsonSchema);
	if (parsed === undefined) return undefined;
	const deploymentId = parsed.id ?? parsed.deploymentId;
	const urlFields = [parsed.url, parsed.deploymentUrl].filter(
		(value): value is string => value !== undefined,
	);
	const parsedUrls = urlFields.map(parseVercelDeploymentUrl);
	if (parsedUrls.some((value) => value === undefined)) return undefined;
	const deploymentUrl = parsedUrls[0];
	if (deploymentId === undefined || deploymentUrl === undefined) return undefined;
	const state = (parsed.readyState ?? parsed.status ?? "").toLowerCase();
	return {
		deploymentId,
		deploymentUrl,
		status: state === "ready" ? "ready" : "not-ready",
	};
}

function parseVercelDeploymentUrl(value: string): string | undefined {
	if (value !== value.trim() || value.includes("\\")) return undefined;
	const hasExplicitScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);
	if (hasExplicitScheme && !/^https:\/\/[^/]/iu.test(value)) return undefined;
	if (!hasExplicitScheme && /[\s/@?#]/u.test(value)) return undefined;
	let parsed: URL;
	try {
		parsed = new URL(hasExplicitScheme ? value : `https://${value}`);
	} catch {
		return undefined;
	}
	if (
		parsed.protocol !== "https:" ||
		parsed.hostname === "" ||
		parsed.username !== "" ||
		parsed.password !== ""
	) {
		return undefined;
	}
	return parsed.href;
}

export async function verifyPublicProductionHealth(
	productionAlias: string,
): Promise<
	{ readonly ok: true; readonly url: string } | { readonly ok: false; readonly message: string }
> {
	const url = new URL("/api/health", productionAlias).href;
	try {
		const response = await fetch(url, { method: "GET", redirect: "error" });
		if (!response.ok) {
			return { ok: false, message: `Health endpoint returned HTTP ${response.status}.` };
		}
		const payload = healthPayloadSchema.safeParse(await response.json());
		return payload.success
			? { ok: true, url }
			: { ok: false, message: "Health endpoint returned an unexpected payload." };
	} catch (error) {
		return { ok: false, message: `Health request failed: ${safeErrorMessage(error)}` };
	}
}

async function readProductionConfiguration(
	repositoryRoot: string,
	sourceConfiguration: string,
	packageProject: DispatchProductionConfiguration["packageProject"],
): Promise<DispatchProductionConfiguration> {
	const repositoryProject = projectMetadataSchema.parse(
		JSON.parse(await readFile(join(repositoryRoot, ".vercel/project.json"), "utf8")) as unknown,
	);
	const dispatch = parseDispatchProjectConfigToml(sourceConfiguration, "ns.toml");
	if (dispatch.ok === false || dispatch.value.deploymentUrl === undefined) {
		throw new Error(
			dispatch.ok ? "ns.toml: dispatch deployment_url is required." : dispatch.error.message,
		);
	}
	return {
		packageProject,
		repositoryProject: {
			projectId: repositoryProject.projectId,
			teamId: repositoryProject.orgId,
			projectName: repositoryProject.projectName,
		},
		configuredProjectId: dispatch.value.vercelProjectId,
		configuredTeamId: dispatch.value.vercelTeamId,
		productionAlias: dispatch.value.deploymentUrl,
	};
}

export async function promoteDispatchBuildOutput(options: {
	readonly repositoryRoot: string;
	readonly packageRoot: string;
}) {
	const source = join(options.packageRoot, ".vercel/output");
	const destination = join(options.repositoryRoot, ".vercel/output");
	const staging = join(options.repositoryRoot, ".vercel/output.ns-promote-staging");
	const backup = join(options.repositoryRoot, ".vercel/output.ns-promote-backup");
	const verificationOptions = {
		apiSourceRoot: join(options.packageRoot, "api"),
		workflowsSourceRoot: join(options.packageRoot, "workflows"),
	};
	let isOldOutputBackedUp = false;
	let isStagedOutputInstalled = false;
	try {
		await assertSafeTransactionPath(source);
		await assertSafeTransactionPath(dirname(destination));
		const destinationExists = await pathExists(destination);
		const stagingExists = await pathExists(staging);
		const backupExists = await pathExists(backup);
		if (stagingExists || (backupExists && destinationExists)) {
			return {
				ok: false as const,
				phase: "promotion" as const,
				message:
					"Ambiguous prior promotion residue exists; preserve staging/backup and remediate manually.",
			};
		}
		if (backupExists) {
			await rename(backup, destination);
			return {
				ok: false as const,
				phase: "promotion" as const,
				message:
					"Restored the previous output from an interrupted promotion; rerun after inspection.",
			};
		}
		await mkdir(staging);
		await copyTree(source, staging);
		const staged = await verifyDispatchBuildOutput({ ...verificationOptions, outputRoot: staging });
		if (staged.ok === false) {
			await rm(staging, { recursive: true, force: true });
			return {
				ok: false as const,
				phase: "verification" as const,
				message: staged.problems.join(" "),
			};
		}
		if (destinationExists) {
			await rename(destination, backup);
			isOldOutputBackedUp = true;
		}
		await rename(staging, destination);
		isStagedOutputInstalled = true;
		const promoted = await verifyDispatchBuildOutput({
			...verificationOptions,
			outputRoot: destination,
		});
		if (promoted.ok === false || promoted.digest !== staged.digest) {
			throw new Error("Promoted output did not match the fully verified staging inventory.");
		}
		if (destinationExists) {
			await rm(backup, { recursive: true });
			isOldOutputBackedUp = false;
		}
		return { ok: true as const, artifactDigest: promoted.digest };
	} catch (error) {
		try {
			if (isStagedOutputInstalled) {
				await rm(destination, { recursive: true, force: true });
				isStagedOutputInstalled = false;
			}
			if (isOldOutputBackedUp) {
				await rename(backup, destination);
				isOldOutputBackedUp = false;
			}
			if (await pathExists(staging)) await rm(staging, { recursive: true, force: true });
		} catch (rollbackError) {
			return {
				ok: false as const,
				phase: "promotion" as const,
				message: `Promotion failed (${safeErrorMessage(error)}) and rollback failed (${safeErrorMessage(rollbackError)}); preserve transaction paths for remediation.`,
			};
		}
		return { ok: false as const, phase: "promotion" as const, message: safeErrorMessage(error) };
	}
}

async function assertSafeTransactionPath(path: string): Promise<void> {
	const status = await lstat(path);
	if (status.isSymbolicLink() || !status.isDirectory()) {
		throw new Error(`${path} is not a safe directory.`);
	}
}

async function copyTree(source: string, destination: string): Promise<void> {
	for (const entry of await readdir(source, { withFileTypes: true })) {
		const from = join(source, entry.name);
		const to = join(destination, entry.name);
		if (entry.isSymbolicLink()) {
			throw new Error(`Build Output contains symlink ${relative(source, from)}.`);
		}
		if (entry.isDirectory()) {
			await mkdir(to);
			await copyTree(from, to);
		} else if (entry.isFile()) await copyFile(from, to);
		else throw new Error(`Build Output contains unsupported path ${relative(source, from)}.`);
	}
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
		throw error;
	}
}

async function command(
	commandName: string,
	args: readonly string[],
	cwd: string,
	diagnostic: (message: string) => void,
) {
	const result = await runCommand(commandName, args, {
		cwd,
		env: process.env,
		onStdout: (text) => diagnostic(redactProductionDiagnostic(text.trimEnd())),
		onStderr: (text) => diagnostic(redactProductionDiagnostic(text.trimEnd())),
	});
	return { ok: result.type === "exited" && result.code === 0, stdout: result.stdout };
}

function parseJson<T>(source: string, schema: z.ZodType<T>): T | undefined {
	try {
		const parsed = schema.safeParse(JSON.parse(source) as unknown);
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

function safeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
}
