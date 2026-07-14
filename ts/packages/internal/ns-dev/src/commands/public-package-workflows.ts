import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { failure, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import { formatErrorMessage, isRecord } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { FileSystemGateway, NsDevCliContext } from "../context.ts";
import { catalogVersion } from "../public-packages/catalog-version.ts";
import { isMissingPackageResult, snippet } from "../public-packages/helpers.ts";
import { copyTree } from "../public-packages/files.ts";
import {
	assertCoordinatedVersion,
	assertPlausibleNpmVersion,
	buildPublishManifest,
	buildPublishPlan,
	firstBatchPackages,
	intendedPublicPackages,
	loadPublicPackageContext,
	preparePublishRoot,
	publicPublishOrder,
	repoRoot,
	workspaceRoot,
	type PackageManifest,
	type PublicPackageContext,
	type PublishPlanEntry,
} from "../public-packages/package-set.ts";
import {
	copyPublishExtras,
	filesWithPublishExtras,
	publishExtrasManifestMetadata,
	validatePublishExtras,
} from "../public-packages/publish-extras.ts";
import { renderCliShim } from "../public-packages/render-cli-shim.ts";
import { sdkFoldEntries } from "../public-packages/sdk-public-subpaths.ts";
import { createSystemReleaseCliContext } from "../release-public-package-set-cli.ts";
import {
	compareRegistryMetadata,
	parseCandidateReport,
	parseNpmViewJson,
	type CandidateHashEvidence,
} from "../release/verify-public-package-set-core.ts";
import {
	commandSummarySchema,
	runTrackedCommand,
	trackedCommandFailureExit,
	type CommandSummary,
} from "../shared.ts";

const versionSchema = z.string().describe("Concrete npm package version.");
const MAX_VERIFY_DELAYS_MS = [
	10_000, 20_000, 30_000, 60_000, 120_000, 120_000, 120_000, 120_000, 120_000,
] as const;

export const bumpPublicPackageVersionRequestSchema = z.object({ version: versionSchema });
export const bumpPublicPackageVersionResultSchema = z.object({
	version: z.string(),
	changedPackages: z.array(z.string()),
	commands: z.array(commandSummarySchema),
});
export async function runBumpPublicPackageVersion(
	context: NsDevCliContext,
	request: z.output<typeof bumpPublicPackageVersionRequestSchema>,
): Promise<ClinkrExit<z.output<typeof bumpPublicPackageVersionResultSchema>>> {
	try {
		assertPlausibleNpmVersion(request.version);
		const packages = await loadPublicPackageContext(context.fs);
		const changedPackages: string[] = [];
		for (const packageName of intendedPublicPackages) {
			const entry = packages.manifestByName.get(packageName);
			if (entry === undefined)
				throw new Error(`Intended public package is missing: ${packageName}`);
			if (entry.manifest.version === request.version) continue;
			await context.fs.writeText(
				entry.path,
				`${JSON.stringify({ ...entry.manifest, version: request.version }, null, "\t")}\n`,
			);
			changedPackages.push(packageName);
		}
		const command = await runTrackedCommand(context, {
			command: "corepack",
			args: [
				"pnpm@11.8.0",
				"--config.verify-deps-before-run=false",
				"--dir",
				workspaceRoot,
				"install",
				"--lockfile-only",
			],
			cwd: repoRoot,
		});
		if (command.type === "failed") return trackedCommandFailureExit(command);
		return ok({ version: request.version, changedPackages, commands: [command.summary] });
	} catch (error: unknown) {
		return workflowFailure("version-bump-failed", error);
	}
}

export const prepareSourcePublishPackageRequestSchema = z.object({
	packageRoot: z.string().optional().describe("Package root; defaults to the current directory."),
});
export const prepareSourcePublishPackageResultSchema = z.object({
	packageName: z.string(),
	publishRoot: z.string(),
});
export async function runPrepareSourcePublishPackage(
	context: NsDevCliContext,
	request: z.output<typeof prepareSourcePublishPackageRequestSchema>,
): Promise<ClinkrExit<z.output<typeof prepareSourcePublishPackageResultSchema>>> {
	try {
		const packageRoot = resolve(request.packageRoot ?? context.cwd);
		const publishRoot = resolve(packageRoot, "dist", "publish");
		const sourceManifest = decodeManifest(
			await readJson(context.fs, resolve(packageRoot, "package.json")),
		);
		assertSourcePackageCanPublish(sourceManifest);
		const packages = await loadPublicPackageContext(context.fs);
		const extras = await validatePublishExtras(
			{
				manifest: sourceManifest,
				sourceRoot: repoRoot,
				publishRoot,
			},
			context.fs,
		);
		await context.fs.rmrf(publishRoot);
		await context.fs.mkdirp(publishRoot);
		await copyTree(context.fs, resolve(packageRoot, "src"), resolve(publishRoot, "src"));
		await rewriteSdkImports(context.fs, resolve(publishRoot, "src"));
		if (await context.fs.exists(resolve(packageRoot, "README.md")))
			await context.fs.copyFile(
				resolve(packageRoot, "README.md"),
				resolve(publishRoot, "README.md"),
			);
		await copyPublishExtras(extras, context.fs);
		const manifest = buildSourcePublishManifest(sourceManifest, packages, extras);
		await context.fs.writeText(
			resolve(publishRoot, "package.json"),
			`${JSON.stringify(manifest, null, "\t")}\n`,
		);
		return ok({ packageName: sourceManifest.name, publishRoot });
	} catch (error: unknown) {
		return workflowFailure("package-preparation-failed", error);
	}
}

export const qualifyPublicPackageSetRequestSchema = z.object({
	all: z.boolean().optional(),
	version: versionSchema.optional(),
	skipChecks: z.boolean().optional(),
	skipDryRun: z.boolean().optional(),
});
export const qualifyPublicPackageSetResultSchema = z.object({
	packages: z.array(z.string()),
	publishRoots: z.array(z.string()),
	commands: z.array(commandSummarySchema),
});
export async function runQualifyPublicPackageSet(
	context: NsDevCliContext,
	request: z.output<typeof qualifyPublicPackageSetRequestSchema>,
): Promise<ClinkrExit<z.output<typeof qualifyPublicPackageSetResultSchema>>> {
	try {
		const result = await qualifyPublicPackages(context, request);
		return result.type === "failure" ? result.exit : ok(result.value);
	} catch (error: unknown) {
		return workflowFailure("package-qualification-failed", error);
	}
}

export const smokeSdkConsumerResolutionRequestSchema = z.object({ publishRoot: z.string() });
export const smokeSdkConsumerResolutionResultSchema = z.object({
	tempRoot: z.string(),
	kept: z.boolean(),
	commands: z.array(commandSummarySchema),
});
export async function runSmokeSdkConsumerResolution(
	context: NsDevCliContext,
	request: z.output<typeof smokeSdkConsumerResolutionRequestSchema>,
): Promise<ClinkrExit<z.output<typeof smokeSdkConsumerResolutionResultSchema>>> {
	try {
		const result = await smokeSdkConsumer(context, resolve(request.publishRoot));
		return result.type === "failure" ? result.exit : ok(result.value);
	} catch (error: unknown) {
		return workflowFailure("sdk-smoke-failed", error);
	}
}

const verificationResultSchema = z.object({
	packageName: z.string(),
	expectedVersion: z.string(),
	status: z.enum(["published", "missing", "mismatched", "error"]),
	details: z.array(z.string()),
	evidence: z.array(z.string()),
});
export const verifyPublicPackageSetRequestSchema = z.object({
	strict: z.boolean().optional(),
	version: versionSchema.optional(),
	candidateReport: z.string().optional(),
});
export const verifyPublicPackageSetResultSchema = z.object({
	strict: z.boolean(),
	results: z.array(verificationResultSchema),
	commands: z.array(commandSummarySchema),
});
export async function runVerifyPublicPackageSet(
	context: NsDevCliContext,
	request: z.output<typeof verifyPublicPackageSetRequestSchema>,
): Promise<ClinkrExit<z.output<typeof verifyPublicPackageSetResultSchema>>> {
	try {
		const result = await verifyPublicPackages(context, request);
		const unsuccessful = result.results.some((entry) => entry.status !== "published");
		const operationalError = result.results.some((entry) => entry.status === "error");
		if (operationalError || (request.strict === true && unsuccessful))
			return failure(
				"registry-verification-failed",
				"Public package registry verification did not pass.",
				result,
			);
		return ok(result);
	} catch (error: unknown) {
		return workflowFailure("registry-verification-failed", error);
	}
}

export const publishPublicPackageSetRequestSchema = z.object({
	mode: z.enum(["dry-run", "publish"]),
	version: versionSchema,
	verifyDelayMs: z.array(z.string().regex(/^\d+$/u)).optional(),
	verifyDelaySeconds: z.array(z.string().regex(/^\d+$/u)).optional(),
});
export const publishPublicPackageSetResultSchema = z.object({
	mode: z.enum(["dry-run", "publish"]),
	version: z.string(),
	packages: z.array(z.string()),
	commands: z.array(commandSummarySchema),
});
export async function runPublishPublicPackageSet(
	context: NsDevCliContext,
	request: z.output<typeof publishPublicPackageSetRequestSchema>,
): Promise<ClinkrExit<z.output<typeof publishPublicPackageSetResultSchema>>> {
	try {
		assertPlausibleNpmVersion(request.version);
		const packageContext = await loadPublicPackageContext(context.fs);
		assertCoordinatedVersion(packageContext, request.version);
		const plan = buildPublishPlan(packageContext, request.version);
		const commands: CommandSummary[] = [];
		if (request.mode === "publish") {
			const status = await runTrackedCommand(context, {
				command: "git",
				args: ["status", "--porcelain"],
				cwd: repoRoot,
			});
			if (status.type === "failed") return trackedCommandFailureExit(status);
			commands.push(status.summary);
			if (status.result.stdout.trim() !== "")
				return failure("dirty-worktree", "Real publish requires a clean git worktree.", {
					commands,
				});
		}
		const qualified = await qualifyPublicPackages(context, { all: true, version: request.version });
		if (qualified.type === "failure") return qualified.exit;
		commands.push(...qualified.value.commands);
		if (request.mode === "dry-run")
			return ok({
				mode: request.mode,
				version: request.version,
				packages: plan.map((entry) => entry.packageName),
				commands,
			});
		const precheck = await assertUnpublished(context, plan, request.version);
		if (precheck.type === "failure") return precheck.exit;
		commands.push(...precheck.commands);
		const releaseContext = context.release ?? createSystemReleaseCliContext(context);
		const confirmation = await releaseContext.confirmation.confirmPublish(request.version);
		if (!confirmation.ok)
			return failure(confirmation.error.code, confirmation.error.message, confirmation.error);
		if (!confirmation.value)
			return usageError(`Publish confirmation did not match for ${request.version}.`);
		for (const item of plan) {
			const published = await runTrackedCommand(context, {
				command: "npm",
				args: ["publish", item.publishRoot, "--access", "public"],
				cwd: repoRoot,
			});
			if (published.type === "failed") return trackedCommandFailureExit(published);
			commands.push(published.summary);
		}
		const delays = resolveVerifyDelaysMs(request);
		for (let attempt = 0; ; attempt += 1) {
			const verified = await verifyPublicPackages(context, {
				strict: true,
				version: request.version,
			});
			commands.push(...verified.commands);
			if (verified.results.every((entry) => entry.status === "published")) break;
			const delayMs = delays[attempt];
			if (delayMs === undefined)
				return failure(
					"registry-verification-failed",
					`Published packages, but strict registry verification did not pass after ${attempt + 1} attempt(s).`,
					verified,
				);
			await context.timers.delay(delayMs);
		}
		return ok({
			mode: request.mode,
			version: request.version,
			packages: plan.map((entry) => entry.packageName),
			commands,
		});
	} catch (error: unknown) {
		return workflowFailure("package-publish-failed", error);
	}
}

const requiredShimEnv = [
	"NS_TEMPLATE",
	"NS_OUTPUT",
	"NS_TOOL",
	"NS_CANONICAL_CHECKOUT",
	"NS_CLI_REL_PATH",
	"NS_INSTALL_HINT",
] as const;
export const renderCliShimRequestSchema = z.object({});
export const renderCliShimResultSchema = z.object({ output: z.string() });
export async function runRenderCliShim(
	context: NsDevCliContext,
): Promise<ClinkrExit<{ readonly output: string }>> {
	const missing = requiredShimEnv.filter((name) => context.env[name] === undefined);
	if (missing.length > 0)
		return usageError(`Missing required environment variables: ${missing.join(", ")}.`, {
			missing,
		});
	const template = context.env.NS_TEMPLATE;
	const output = context.env.NS_OUTPUT;
	if (template === undefined || output === undefined)
		throw new Error("Validated shim paths became unavailable");
	try {
		const result = renderCliShim({
			template: await context.fs.readText(template),
			tool: context.env.NS_TOOL ?? "",
			canonicalCheckout: context.env.NS_CANONICAL_CHECKOUT ?? "",
			cliRelPath: context.env.NS_CLI_REL_PATH ?? "",
			installHint: context.env.NS_INSTALL_HINT ?? "",
			...(context.env.NS_FALLBACK_MODE === undefined
				? {}
				: { fallbackMode: context.env.NS_FALLBACK_MODE }),
			templateLabel: template,
		});
		if (result.type === "failure")
			return failure("shim-render-failed", result.message, { template, output });
		await context.fs.writeText(output, result.rendered);
		return ok({ output });
	} catch (error: unknown) {
		return workflowFailure("shim-render-failed", error);
	}
}

export function renderCommandResult(_result: unknown): string {
	return "Completed public-package workflow.\n";
}

type WorkflowResult<T> =
	| { readonly type: "ok"; readonly value: T }
	| { readonly type: "failure"; readonly exit: ClinkrExit<never> };

async function qualifyPublicPackages(
	context: NsDevCliContext,
	request: z.output<typeof qualifyPublicPackageSetRequestSchema>,
): Promise<WorkflowResult<z.output<typeof qualifyPublicPackageSetResultSchema>>> {
	const packages = request.all === true ? publicPublishOrder : firstBatchPackages;
	const packageContext = await loadPublicPackageContext(context.fs);
	if (request.version !== undefined) assertCoordinatedVersion(packageContext, request.version);
	const commands: CommandSummary[] = [];
	const publishRoots: string[] = [];
	for (const packageName of packages) {
		const entry = packageContext.manifestByName.get(packageName);
		if (entry === undefined) throw new Error(`Unknown workspace package ${packageName}`);
		if (request.skipChecks !== true) {
			for (const script of ["check", "test"]) {
				const command = await runTrackedCommand(context, {
					command: "pnpm",
					args: ["--dir", "ts", "--filter", packageName, "run", script],
					cwd: repoRoot,
				});
				if (command.type === "failed")
					return { type: "failure", exit: trackedCommandFailureExit(command) };
				commands.push(command.summary);
			}
		}
		if (packageName === "@nseng-ai/ns") {
			const script = request.skipDryRun === true ? "pack:local" : "publish:dry-run";
			const command = await runTrackedCommand(context, {
				command: "pnpm",
				args: ["--dir", "ts", "--filter", packageName, "run", script],
				cwd: repoRoot,
			});
			if (command.type === "failed")
				return { type: "failure", exit: trackedCommandFailureExit(command) };
			commands.push(command.summary);
			continue;
		}
		const publishRoot = await preparePublishRoot(entry, packageContext, context.fs);
		publishRoots.push(publishRoot);
		if (packageName === "@nseng-ai/sdk" && request.skipChecks !== true) {
			const smoke = await smokeSdkConsumer(context, publishRoot);
			if (smoke.type === "failure") return smoke;
			commands.push(...smoke.value.commands);
		}
		if (request.skipDryRun !== true) {
			const command = await runTrackedCommand(context, {
				command: "npm",
				args: ["publish", "--dry-run", publishRoot],
				cwd: repoRoot,
			});
			if (command.type === "failed")
				return { type: "failure", exit: trackedCommandFailureExit(command) };
			commands.push(command.summary);
		}
	}
	return { type: "ok", value: { packages: [...packages], publishRoots, commands } };
}

async function smokeSdkConsumer(
	context: NsDevCliContext,
	publishRoot: string,
): Promise<WorkflowResult<z.output<typeof smokeSdkConsumerResolutionResultSchema>>> {
	const workspaceYaml = await context.fs.readText(resolve(workspaceRoot, "pnpm-workspace.yaml"));
	const nodeTypesSpecifier = `@types/node@${catalogVersion(workspaceYaml, "@types/node")}`;
	const tempRoot = await context.fs.mkdtemp(join(tmpdir(), "ns-sdk-consumer-"));
	const kept = context.env.NS_SDK_KEEP_SMOKE_DIR === "1";
	const commands: CommandSummary[] = [];
	try {
		await context.fs.writeText(
			join(tempRoot, "package.json"),
			`${JSON.stringify({ private: true, type: "module" }, null, "\t")}\n`,
		);
		await context.fs.writeText(
			join(tempRoot, "tsconfig.json"),
			`${JSON.stringify({ compilerOptions: { target: "ES2024", module: "NodeNext", moduleResolution: "NodeNext", strict: true, allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, types: ["node"] }, include: ["consumer.ts"] }, null, "\t")}\n`,
		);
		await context.fs.writeText(join(tempRoot, "consumer.ts"), consumerSource());
		for (const request of [
			{ command: "npm", args: ["install", "--silent", publishRoot, nodeTypesSpecifier] },
			{
				command: resolve(workspaceRoot, "node_modules", ".bin", "tsc"),
				args: ["-p", "tsconfig.json"],
			},
		]) {
			const command = await runTrackedCommand(context, { ...request, cwd: tempRoot });
			if (command.type === "failed")
				return { type: "failure", exit: trackedCommandFailureExit(command) };
			commands.push(command.summary);
		}
		return { type: "ok", value: { tempRoot, kept, commands } };
	} finally {
		if (!kept) await context.fs.rmrf(tempRoot);
	}
}

interface VerificationResult {
	readonly packageName: string;
	readonly expectedVersion: string;
	readonly status: "published" | "missing" | "mismatched" | "error";
	readonly details: string[];
	readonly evidence: string[];
}
async function verifyPublicPackages(
	context: NsDevCliContext,
	request: z.output<typeof verifyPublicPackageSetRequestSchema>,
): Promise<{ strict: boolean; results: VerificationResult[]; commands: CommandSummary[] }> {
	const packageContext = await loadPublicPackageContext(context.fs);
	const candidate =
		request.candidateReport === undefined
			? undefined
			: parseCandidateReport(
					JSON.parse(await context.fs.readText(resolve(request.candidateReport))),
					publicPublishOrder,
				);
	if (
		candidate !== undefined &&
		request.version !== undefined &&
		candidate.version !== request.version
	)
		throw new Error(
			`Candidate report version ${candidate.version} does not match --version ${request.version}`,
		);
	const results: VerificationResult[] = [];
	const commands: CommandSummary[] = [];
	for (const packageName of intendedPublicPackages) {
		const manifest = packageContext.manifestByName.get(packageName)?.manifest;
		if (manifest?.version === undefined)
			throw new Error(`Local manifest for ${packageName} is missing a string version`);
		const expectedVersion = request.version ?? candidate?.version ?? manifest.version;
		const command = await runTrackedCommand(context, {
			command: "npm",
			args: [
				"view",
				`${packageName}@${expectedVersion}`,
				"name",
				"version",
				"bin",
				"exports",
				"dist.tarball",
				"dist.integrity",
				"dist.shasum",
				"time",
				"--json",
			],
			cwd: repoRoot,
		});
		commands.push(command.summary);
		results.push(
			classifyVerification(
				command,
				packageName,
				expectedVersion,
				manifest,
				candidate?.candidates.get(packageName),
			),
		);
	}
	return { strict: request.strict === true, results, commands };
}

function classifyVerification(
	command: Awaited<ReturnType<typeof runTrackedCommand>>,
	packageName: string,
	expectedVersion: string,
	manifest: PackageManifest,
	candidate?: CandidateHashEvidence,
): VerificationResult {
	if (command.type === "failed") {
		if (
			command.data.termination === "exited" &&
			isMissingPackageResult(command.data.stderr, command.data.stdout)
		)
			return { packageName, expectedVersion, status: "missing", details: [], evidence: [] };
		return {
			packageName,
			expectedVersion,
			status: "error",
			details: [command.message, snippet(`${command.data.stderr}\n${command.data.stdout}`)],
			evidence: [],
		};
	}
	const parsed = parseNpmViewJson(command.result.stdout, packageName, expectedVersion);
	if (parsed.type === "error")
		return {
			packageName,
			expectedVersion,
			status: "error",
			details: [parsed.message],
			evidence: [],
		};
	const comparison = compareRegistryMetadata({
		packageName,
		expectedVersion,
		manifest,
		registry: parsed.value,
		...(candidate === undefined ? {} : { candidate }),
	});
	return {
		packageName,
		expectedVersion,
		status: comparison.mismatches.length === 0 ? "published" : "mismatched",
		details: [...comparison.mismatches],
		evidence: [...comparison.evidence],
	};
}

async function assertUnpublished(
	context: NsDevCliContext,
	plan: readonly PublishPlanEntry[],
	version: string,
): Promise<
	{ type: "ok"; commands: CommandSummary[] } | { type: "failure"; exit: ClinkrExit<never> }
> {
	const published: string[] = [];
	const errors: string[] = [];
	const commands: CommandSummary[] = [];
	for (const item of plan) {
		const command = await runTrackedCommand(context, {
			command: "npm",
			args: ["view", `${item.packageName}@${version}`, "version", "--json"],
			cwd: repoRoot,
		});
		commands.push(command.summary);
		if (command.type === "ok") published.push(item.packageName);
		else if (
			!(
				command.data.termination === "exited" &&
				isMissingPackageResult(command.data.stderr, command.data.stdout)
			)
		)
			errors.push(`${item.packageName}: ${command.message}`);
	}
	if (published.length > 0)
		return {
			type: "failure",
			exit: failure(
				"package-already-published",
				`Refusing to publish because package versions already exist at ${version}.`,
				{ published, commands },
			),
		};
	if (errors.length > 0)
		return {
			type: "failure",
			exit: failure("registry-precheck-failed", `Registry precheck failed for ${version}.`, {
				errors,
				commands,
			}),
		};
	return { type: "ok", commands };
}

export function resolveVerifyDelaysMs(
	request: Pick<
		z.output<typeof publishPublicPackageSetRequestSchema>,
		"verifyDelayMs" | "verifyDelaySeconds"
	>,
): number[] {
	const milliseconds = (request.verifyDelayMs ?? []).map(Number);
	const seconds = (request.verifyDelaySeconds ?? []).map((value) => Number(value) * 1_000);
	return milliseconds.length === 0 && seconds.length === 0
		? MAX_VERIFY_DELAYS_MS.map(Number)
		: [...milliseconds, ...seconds];
}

function buildSourcePublishManifest(
	source: PackageManifest,
	context: PublicPackageContext,
	extras: Awaited<ReturnType<typeof validatePublishExtras>>,
): Record<string, unknown> {
	const generic = buildPublishManifest(source, context, extras);
	const rewrite = (block: unknown, isPeer: boolean): Record<string, string> | undefined => {
		if (!isRecord(block)) return undefined;
		return Object.fromEntries(
			Object.entries(block).map(([name, raw]) => {
				if (name === "@nseng-ai/sdk")
					return ["@nseng-ai/ns", workspaceVersion(context, "@nseng-ai/ns")];
				const specifier = String(raw);
				if (specifier.startsWith("workspace:"))
					return [
						name,
						context.manifestByName.get(name)?.manifest.version ??
							(isPeer
								? "*"
								: fail(
										`Cannot rewrite workspace dependency ${name}; package is not versioned in this workspace.`,
									)),
					];
				if (specifier === "catalog:") return [name, catalogVersion(context.workspaceYaml, name)];
				return [name, specifier];
			}),
		);
	};
	const dependencies = rewrite(source.dependencies, false);
	const peerDependencies = rewrite(source.peerDependencies, true);
	return {
		...generic,
		files: filesWithPublishExtras(source.files ?? [], extras),
		...(dependencies === undefined ? {} : { dependencies }),
		...(peerDependencies === undefined ? {} : { peerDependencies }),
		...publishExtrasManifestMetadata(extras),
	};
}

function workspaceVersion(context: PublicPackageContext, name: string): string {
	const version = context.manifestByName.get(name)?.manifest.version;
	if (version === undefined)
		throw new Error(
			`Cannot rewrite workspace dependency ${name}; package is not versioned in this workspace.`,
		);
	return version;
}
function fail(message: string): never {
	throw new Error(message);
}
function assertSourcePackageCanPublish(manifest: PackageManifest): void {
	if (!manifest.name.startsWith("@nseng-ai/"))
		throw new Error(`Expected an @nseng-ai/* package name, got ${manifest.name}`);
	if (manifest.name === "@nseng-ai/ns")
		throw new Error("@nseng-ai/ns uses its dedicated bundle publish pipeline.");
	if (manifest.private === true)
		throw new Error(`${manifest.name} is private; refusing to prepare a publish package.`);
	if (manifest.type !== "module") throw new Error(`${manifest.name} must keep type: module.`);
	if (!Array.isArray(manifest.files) || !manifest.files.includes("src"))
		throw new Error(`${manifest.name} publishable source manifest must include files: ["src"].`);
}
async function readJson(fs: FileSystemGateway, path: string): Promise<Record<string, unknown>> {
	const value: unknown = JSON.parse(await fs.readText(path));
	if (!isRecord(value)) throw new Error(`Expected ${path} to contain a JSON object`);
	return value;
}
function decodeManifest(value: Record<string, unknown>): PackageManifest {
	if (typeof value.name !== "string") throw new Error("Package manifest is missing a string name");
	return { ...value, name: value.name };
}
async function rewriteSdkImports(fs: FileSystemGateway, root: string): Promise<void> {
	for (const entry of await fs.readDir(root)) {
		const path = resolve(root, entry.name);
		if (entry.isDirectory) await rewriteSdkImports(fs, path);
		else if (entry.isFile && entry.name.endsWith(".ts")) {
			const source = await fs.readText(path);
			const rewritten = source
				.replaceAll('"@nseng-ai/sdk"', '"@nseng-ai/ns/sdk"')
				.replaceAll("@nseng-ai/sdk/", "@nseng-ai/ns/sdk/");
			if (rewritten !== source) await fs.writeText(path, rewritten);
		}
	}
}
function consumerSource(): string {
	const imports = sdkFoldEntries.map(
		(entry) =>
			`import type * as ${entry.name.replace(/[^a-zA-Z0-9]/gu, "_")} from "${entry.sourceExport === "." ? "@nseng-ai/sdk" : `@nseng-ai/sdk/${entry.name}`}";`,
	);
	const keys = sdkFoldEntries.map((entry) => {
		const name = entry.name.replace(/[^a-zA-Z0-9]/gu, "_");
		return `type ${name}Keys = keyof typeof ${name};`;
	});
	return `${[...imports, ...keys, "export {};"].join("\n")}\n`;
}
function workflowFailure(errorType: string, error: unknown): ClinkrExit<never> {
	return failure(errorType, formatErrorMessage(error), {
		message: snippet(formatErrorMessage(error)),
	});
}
