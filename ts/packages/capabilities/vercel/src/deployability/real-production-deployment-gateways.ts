import { copyFile, lstat, mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { runCommand } from "@nseng-ai/foundation/exec";
import { z } from "zod";

import { parseDispatchProjectConfigToml } from "../api/project-config.ts";
import { verifyDispatchBuildOutput } from "./output-verifier.ts";
import type {
	DispatchProductionConfiguration,
	ProductionDeploymentContext,
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
				if (!status.ok)
					return { ok: false as const, dirtyPaths: [], message: "Cannot inspect git status." };
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
		build: {
			async buildPackageDeployable() {
				const result = await command(
					"corepack",
					["pnpm", "run", "build:deployable"],
					packageRoot,
					writeDiagnostic,
				);
				return result.ok
					? { ok: true as const }
					: { ok: false as const, message: "Package deployable build failed." };
			},
		},
		configuration: {
			async readProductionConfiguration() {
				try {
					return {
						ok: true as const,
						value: await readProductionConfiguration(repositoryRoot, packageRoot),
					};
				} catch (error) {
					return { ok: false as const, message: safeErrorMessage(error) };
				}
			},
		},
		artifacts: {
			async promoteVerifiedBuildOutput() {
				return await promoteDispatchBuildOutput({ repositoryRoot, packageRoot });
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
				if (value === undefined)
					return { ok: false as const, message: "Deployment locator has no id or URL." };
				const result = await command(
					"vercel",
					vercelInspectArgs(value),
					repositoryRoot,
					writeDiagnostic,
				);
				if (!result.ok)
					return { ok: false as const, message: "Vercel deployment inspection failed." };
				const parsed = parseVercelInspection(result.stdout);
				return parsed === undefined
					? { ok: false as const, message: "Vercel inspect returned malformed JSON." }
					: { ok: true as const, value: parsed };
			},
		},
	};
}

export function parseVercelDeploymentLocator(source: string): VercelDeploymentLocator | undefined {
	const parsed = parseJson(source, deployJsonSchema);
	if (parsed === undefined) return undefined;
	const deploymentId = parsed.id ?? parsed.deploymentId;
	const deploymentUrl = parsed.url ?? parsed.deploymentUrl;
	if (deploymentId === undefined && deploymentUrl === undefined) return undefined;
	return {
		...(deploymentId === undefined ? {} : { deploymentId }),
		...(deploymentUrl === undefined ? {} : { deploymentUrl: normalizeHttpsUrl(deploymentUrl) }),
	};
}

export function parseVercelInspection(source: string): VercelDeploymentRecord | undefined {
	const parsed = parseJson(source, inspectJsonSchema);
	if (parsed === undefined) return undefined;
	const deploymentId = parsed.id ?? parsed.deploymentId;
	const deploymentUrl = parsed.url ?? parsed.deploymentUrl;
	if (deploymentId === undefined || deploymentUrl === undefined) return undefined;
	const state = (parsed.readyState ?? parsed.status ?? "").toLowerCase();
	return {
		deploymentId,
		deploymentUrl: normalizeHttpsUrl(deploymentUrl),
		status: state === "ready" ? "ready" : "not-ready",
	};
}

export async function verifyPublicProductionHealth(
	productionAlias: string,
): Promise<
	{ readonly ok: true; readonly url: string } | { readonly ok: false; readonly message: string }
> {
	const url = new URL("/api/health", productionAlias).href;
	try {
		const response = await fetch(url, { method: "GET", redirect: "error" });
		if (!response.ok)
			return { ok: false, message: `Health endpoint returned HTTP ${response.status}.` };
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
	packageRoot: string,
): Promise<DispatchProductionConfiguration> {
	const packageProject = projectMetadataSchema.parse(
		JSON.parse(await readFile(join(packageRoot, ".vercel/project.json"), "utf8")) as unknown,
	);
	const repositoryProject = projectMetadataSchema.parse(
		JSON.parse(await readFile(join(repositoryRoot, ".vercel/project.json"), "utf8")) as unknown,
	);
	const dispatch = parseDispatchProjectConfigToml(
		await readFile(join(repositoryRoot, "ns.toml"), "utf8"),
		"ns.toml",
	);
	if (dispatch.ok === false || dispatch.value.deploymentUrl === undefined) {
		throw new Error(
			dispatch.ok ? "ns.toml: dispatch deployment_url is required." : dispatch.error.message,
		);
	}
	return {
		packageProject: {
			projectId: packageProject.projectId,
			teamId: packageProject.orgId,
			projectName: packageProject.projectName,
		},
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
	if (status.isSymbolicLink() || !status.isDirectory())
		throw new Error(`${path} is not a safe directory.`);
}

async function copyTree(source: string, destination: string): Promise<void> {
	for (const entry of await readdir(source, { withFileTypes: true })) {
		const from = join(source, entry.name);
		const to = join(destination, entry.name);
		if (entry.isSymbolicLink())
			throw new Error(`Build Output contains symlink ${relative(source, from)}.`);
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

function normalizeHttpsUrl(value: string): string {
	return value.startsWith("https://") ? value : `https://${value}`;
}
function safeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
}
