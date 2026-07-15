import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { systemTimerScheduler } from "@nseng-ai/foundation/time";

import { isMissingPackageResult } from "../../../../../scripts/public-package-helpers.mjs";
import {
	intendedPublicPackages,
	loadPublicPackageContext,
	publishRootForEntry,
	repoRoot,
} from "../../../../../scripts/public-package-set.mjs";

import { releaseTransactionStages } from "./contracts.ts";
import type {
	CandidateFileGateway,
	CandidateFileState,
	FreshReleaseGateway,
	NpmCandidateGateway,
	NpmRegistryGateway,
	OperationResult,
	OptionalResult,
	ReleaseCandidate,
	ReleaseCommandGateway,
	ReleaseConfirmationGateway,
	ReleaseDelay,
	ReleaseFailure,
	ReleaseReportStore,
	ReleaseTransactionReport,
	ResumeReleaseGateway,
	ValueResult,
} from "./contracts.ts";

export function createSystemFreshReleaseGateway(): FreshReleaseGateway {
	return {
		async inspectFreshState(releaseBranch) {
			const [branch, commit, trunk, status, branchRef, tracking] = await Promise.all([
				execute("git", ["branch", "--show-current"], repoRoot),
				execute("git", ["rev-parse", "HEAD"], repoRoot),
				execute("gt", ["trunk", "--no-interactive"], repoRoot),
				execute("git", ["status", "--porcelain=v1", "--untracked-files=all"], repoRoot),
				executeAllowFailure(
					"git",
					["show-ref", "--verify", "--quiet", `refs/heads/${releaseBranch}`],
					repoRoot,
				),
				executeAllowFailure("gt", ["parent", "--no-interactive"], repoRoot),
			]);
			if (!branch.ok) return branch;
			if (!commit.ok) return commit;
			if (!trunk.ok) return trunk;
			if (!status.ok) return status;
			if (branchRef.status !== 0 && branchRef.status !== 1) return commandFailure(branchRef);
			const packageContextResult = await loadPublicPackageContextResult();
			if (!packageContextResult.ok) return packageContextResult;
			const packageContext = packageContextResult.value;
			const sourceManifestPaths: string[] = [];
			for (const packageName of intendedPublicPackages) {
				const entry = packageContext.manifestByName.get(packageName);
				if (entry === undefined) {
					return {
						ok: false,
						error: {
							code: "release-manifest-missing",
							message: `Intended public package is missing: ${packageName}`,
						},
					};
				}
				sourceManifestPaths.push(relative(repoRoot, entry.path));
			}
			return {
				ok: true,
				value: {
					currentBranch: branch.value.trim(),
					headCommit: commit.value.trim(),
					trunkBranch: trunk.value.trim(),
					isGraphiteTracked: tracking.status === 0,
					isWorktreeClean: status.value.length === 0,
					releaseBranchExists: branchRef.status === 0,
					sourceManifestPaths,
				},
			};
		},
		async bumpCoordinatedVersion(version) {
			return operationFromCommand(
				await execute(
					"pnpm",
					["--dir", "ts", "run", "release:bump-version", "--", version],
					repoRoot,
				),
			);
		},
		async qualifyPublicPackages(version) {
			const qualified = await execute(
				"pnpm",
				["--dir", "ts", "run", "release:qualify-public", "--", "--all", "--version", version],
				repoRoot,
			);
			if (!qualified.ok) return qualified;
			const packageContextResult = await loadPublicPackageContextResult();
			if (!packageContextResult.ok) return packageContextResult;
			const packageContext = packageContextResult.value;
			return {
				ok: true,
				value: intendedPublicPackages.map((name) => {
					const entry = packageContext.manifestByName.get(name);
					if (entry === undefined)
						throw new Error(`Missing public package after qualification: ${name}`);
					return { name, path: publishRootForEntry(entry) };
				}),
			};
		},
		async listTrackedChanges() {
			const changed = await execute("git", ["diff", "--name-only", "HEAD", "--"], repoRoot);
			if (!changed.ok) return changed;
			return {
				ok: true,
				value: changed.value.split("\n").filter((path) => path.length > 0),
			};
		},
		async stageReleaseFiles(paths) {
			return operationFromCommand(await execute("git", ["add", "--", ...paths], repoRoot));
		},
		async createReleaseCheckpoint(options) {
			const created = await execute(
				"gt",
				["create", options.branch, "-m", options.message, "--no-interactive"],
				repoRoot,
			);
			if (!created.ok) return created;
			return await inspectSystemCheckpoint();
		},
		async inspectCheckpoint() {
			return await inspectSystemCheckpoint();
		},
	};
}

export function createSystemResumeReleaseGateway(): ResumeReleaseGateway {
	return {
		async inspectResumeState() {
			const [checkpoint, parent, packageContextResult] = await Promise.all([
				inspectSystemCheckpoint(),
				execute("git", ["rev-parse", "HEAD^"], repoRoot),
				loadPublicPackageContextResult(),
			]);
			if (!checkpoint.ok) return checkpoint;
			if (!parent.ok) return parent;
			if (!packageContextResult.ok) return packageContextResult;
			const packageContext = packageContextResult.value;
			const versions = new Set<string>();
			for (const packageName of intendedPublicPackages) {
				const version = packageContext.manifestByName.get(packageName)?.manifest.version;
				if (version === undefined) {
					return {
						ok: false,
						error: {
							code: "release-version-missing",
							message: `Intended public package has no version: ${packageName}`,
						},
					};
				}
				versions.add(version);
			}
			if (versions.size !== 1) {
				return {
					ok: false,
					error: {
						code: "release-versions-uncoordinated",
						message: "Intended public package source manifests are not coordinated",
					},
				};
			}
			const coordinatedVersion = versions.values().next().value;
			if (coordinatedVersion === undefined) throw new Error("Public package inventory is empty");
			return {
				ok: true,
				value: {
					currentBranch: checkpoint.value.branch,
					headCommit: checkpoint.value.commit,
					headParentCommit: parent.value.trim(),
					isWorktreeClean: checkpoint.value.isWorktreeClean,
					coordinatedVersion,
				},
			};
		},
	};
}

export function createSystemNpmCandidateGateway(options: {
	readonly cwd: string;
}): NpmCandidateGateway {
	return {
		async pack(request): Promise<ValueResult<Omit<ReleaseCandidate, "order">>> {
			try {
				await mkdir(request.packDestination, { recursive: true });
			} catch (error: unknown) {
				return { ok: false, error: failure("candidate-directory-create-failed", error) };
			}
			const executed = await executeNpmPack(
				options.cwd,
				request.publishRoot,
				request.packDestination,
			);
			if (!executed.ok) return executed;
			const parsed = parseNpmPackOutput(executed.value);
			if (!parsed.ok) return parsed;
			return {
				ok: true,
				value: {
					...parsed.value,
					tarballPath: resolve(request.packDestination, parsed.value.filename),
				},
			};
		},
	};
}

export function createNodeReleaseReportStore(): ReleaseReportStore {
	return {
		async read(reportPath): Promise<OptionalResult<ReleaseTransactionReport>> {
			let contents: string;
			try {
				contents = await readFile(reportPath, "utf8");
			} catch (error: unknown) {
				if (isNodeError(error) && error.code === "ENOENT") return { type: "missing" };
				return { type: "error", error: failure("report-read-failed", error) };
			}
			try {
				const parsed: unknown = JSON.parse(contents);
				if (!isReleaseTransactionReport(parsed)) {
					return {
						type: "error",
						error: { code: "report-invalid", message: `Invalid release report: ${reportPath}` },
					};
				}
				return { type: "found", value: parsed };
			} catch (error: unknown) {
				return { type: "error", error: failure("report-invalid-json", error) };
			}
		},
		async writeAtomic(reportPath, report): Promise<OperationResult> {
			const temporaryPath = `${reportPath}.${randomUUID()}.tmp`;
			try {
				await mkdir(dirname(reportPath), { recursive: true });
				await writeFile(temporaryPath, `${JSON.stringify(report, null, "\t")}\n`, { flag: "wx" });
				await rename(temporaryPath, reportPath);
				return { ok: true };
			} catch (error: unknown) {
				await rm(temporaryPath, { force: true }).catch(() => {
					// Best-effort cleanup must not replace the report-write failure.
				});
				return { ok: false, error: failure("report-write-failed", error) };
			}
		},
	};
}

export function createNodeCandidateFileGateway(): CandidateFileGateway {
	return {
		async classify(candidate): Promise<CandidateFileState> {
			let bytes: Uint8Array;
			try {
				bytes = await readFile(candidate.tarballPath);
			} catch (error: unknown) {
				if (isNodeError(error) && error.code === "ENOENT") return { type: "missing" };
				return { type: "error", error: failure("candidate-read-failed", error) };
			}
			const actualIntegrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
			const actualShasum = createHash("sha1").update(bytes).digest("hex");
			if (actualIntegrity === candidate.integrity && actualShasum === candidate.shasum)
				return { type: "exact" };
			return { type: "hash-mismatch", actualIntegrity, actualShasum };
		},
	};
}

export function createSystemNpmRegistryGateway(): NpmRegistryGateway {
	return {
		async readPackageMetadata(name, version) {
			const outcome = await executeAllowFailure(
				"npm",
				["view", `${name}@${version}`, "dist.integrity", "dist.shasum", "--json"],
				repoRoot,
			);
			if (outcome.status !== 0) {
				if (isMissingPackageResult(outcome.stderr, outcome.stdout)) return { type: "missing" };
				return { type: "error", error: commandFailure(outcome).error };
			}
			try {
				const parsed: unknown = JSON.parse(outcome.stdout);
				if (!isRecord(parsed)) throw new Error("npm view did not return an object");
				const integrity = parsed["dist.integrity"] ?? nestedDistValue(parsed, "integrity");
				const shasum = parsed["dist.shasum"] ?? nestedDistValue(parsed, "shasum");
				if (typeof integrity !== "string" || integrity.length === 0) {
					throw new Error("npm view result is missing dist.integrity");
				}
				if (typeof shasum !== "string" || shasum.length === 0) {
					throw new Error("npm view result is missing dist.shasum");
				}
				return { type: "found", value: { integrity, shasum } };
			} catch (error: unknown) {
				return { type: "error", error: failure("npm-view-invalid-metadata", error) };
			}
		},
	};
}

export function createTtyReleaseConfirmationGateway(): ReleaseConfirmationGateway {
	return {
		async confirmPublish(version) {
			if (!process.stdin.isTTY) {
				return {
					ok: false,
					error: {
						code: "publish-confirmation-not-tty",
						message: `Refusing to publish non-interactively; type publish ${version} from a TTY`,
					},
				};
			}
			const readline = createInterface({ input: process.stdin, output: process.stderr });
			try {
				const answer = await readline.question(
					`Type "publish ${version}" to publish frozen tarballs to npm: `,
				);
				return { ok: true, value: answer === `publish ${version}` };
			} catch (error: unknown) {
				return { ok: false, error: failure("publish-confirmation-failed", error) };
			} finally {
				readline.close();
			}
		},
	};
}

export function createSystemReleaseCommandGateway(): ReleaseCommandGateway {
	return {
		async publishTarball(tarballPath) {
			if (!tarballPath.endsWith(".tgz")) {
				return {
					ok: false,
					error: {
						code: "invalid-publish-tarball",
						message: `Refusing to publish a non-.tgz path: ${tarballPath}`,
					},
				};
			}
			return operationFromCommand(
				await execute("npm", ["publish", tarballPath, "--access", "public"], repoRoot),
			);
		},
		async verify(options) {
			return operationFromCommand(
				await execute(
					"pnpm",
					[
						"--dir",
						"ts",
						"run",
						"release:verify-public",
						"--",
						"--version",
						options.version,
						"--strict",
						"--candidate-report",
						options.candidateReportPath,
					],
					repoRoot,
				),
			);
		},
	};
}

export function createSystemReleaseDelay(): ReleaseDelay {
	return {
		async wait(delayMs) {
			await systemTimerScheduler.delay(delayMs);
		},
	};
}

async function loadPublicPackageContextResult(): Promise<
	ValueResult<Awaited<ReturnType<typeof loadPublicPackageContext>>>
> {
	try {
		return { ok: true, value: await loadPublicPackageContext() };
	} catch (error: unknown) {
		return { ok: false, error: failure("public-package-context-failed", error) };
	}
}

function nestedDistValue(record: Record<string, unknown>, key: string): unknown {
	const dist = record.dist;
	return isRecord(dist) ? dist[key] : undefined;
}

async function executeNpmPack(
	cwd: string,
	publishRoot: string,
	packDestination: string,
): Promise<ValueResult<string>> {
	const outcome = await executeAllowFailure(
		"npm",
		["pack", publishRoot, "--json", "--pack-destination", packDestination],
		cwd,
	);
	if (outcome.status === 0) return { ok: true, value: outcome.stdout };
	return {
		ok: false,
		error: {
			code: "npm-pack-failed",
			message: `npm pack exited ${outcome.status ?? "without status"}: ${outcome.stderr.trim()}`,
		},
	};
}

interface NpmPackRecord {
	readonly name: string;
	readonly version: string;
	readonly filename: string;
	readonly integrity: string;
	readonly shasum: string;
}

function parseNpmPackOutput(output: string): ValueResult<NpmPackRecord> {
	try {
		const parsed: unknown = JSON.parse(output);
		if (!Array.isArray(parsed) || parsed.length !== 1 || !isNpmPackRecord(parsed[0])) {
			return {
				ok: false,
				error: {
					code: "npm-pack-invalid-output",
					message: "npm pack did not return one complete JSON record",
				},
			};
		}
		return { ok: true, value: parsed[0] };
	} catch (error: unknown) {
		return { ok: false, error: failure("npm-pack-invalid-output", error) };
	}
}

function isNpmPackRecord(value: unknown): value is NpmPackRecord {
	if (!isRecord(value)) return false;
	return ["name", "version", "filename", "integrity", "shasum"].every(
		(key) => typeof value[key] === "string",
	);
}

function isReleaseTransactionReport(value: unknown): value is ReleaseTransactionReport {
	if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.release)) return false;
	if (
		typeof value.release.branch !== "string" ||
		typeof value.release.commit !== "string" ||
		typeof value.release.version !== "string" ||
		!Array.isArray(value.inventory) ||
		!value.inventory.every((item) => typeof item === "string") ||
		!Array.isArray(value.candidates) ||
		!value.candidates.every(isReleaseCandidate) ||
		!Array.isArray(value.completedWrites) ||
		!value.completedWrites.every((item) => typeof item === "string") ||
		!(value.pendingWrite === null || typeof value.pendingWrite === "string")
	) {
		return false;
	}
	return isReleaseTransactionStage(value.stage);
}

function isReleaseTransactionStage(
	value: unknown,
): value is (typeof releaseTransactionStages)[number] {
	return releaseTransactionStages.some((stage) => stage === value);
}

function isReleaseCandidate(value: unknown): value is ReleaseCandidate {
	if (!isRecord(value)) return false;
	return (
		typeof value.name === "string" &&
		typeof value.version === "string" &&
		typeof value.tarballPath === "string" &&
		typeof value.integrity === "string" &&
		typeof value.shasum === "string" &&
		typeof value.order === "number" &&
		Number.isInteger(value.order) &&
		value.order >= 0
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

interface CommandOutcome {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly displayCommand: string;
}

async function inspectSystemCheckpoint() {
	const [branch, commit, status] = await Promise.all([
		execute("git", ["branch", "--show-current"], repoRoot),
		execute("git", ["rev-parse", "HEAD"], repoRoot),
		execute("git", ["status", "--porcelain=v1", "--untracked-files=all"], repoRoot),
	]);
	if (!branch.ok) return branch;
	if (!commit.ok) return commit;
	if (!status.ok) return status;
	return {
		ok: true as const,
		value: {
			branch: branch.value.trim(),
			commit: commit.value.trim(),
			isWorktreeClean: status.value.length === 0,
		},
	};
}

async function execute(
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<ValueResult<string>> {
	const outcome = await executeAllowFailure(command, args, cwd);
	if (outcome.status === 0) return { ok: true, value: outcome.stdout.trim() };
	return commandFailure(outcome);
}

async function executeAllowFailure(
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<CommandOutcome> {
	return await new Promise((resolveResult) => {
		const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let didResolve = false;
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			if (didResolve) return;
			didResolve = true;
			resolveResult({
				status: null,
				stdout,
				stderr: error.message,
				displayCommand: `${command} ${args.join(" ")}`,
			});
		});
		child.on("close", (status) => {
			if (didResolve) return;
			didResolve = true;
			resolveResult({
				status,
				stdout,
				stderr,
				displayCommand: `${command} ${args.join(" ")}`,
			});
		});
	});
}

function commandFailure(outcome: CommandOutcome): {
	readonly ok: false;
	readonly error: ReleaseFailure;
} {
	return {
		ok: false,
		error: {
			code: "release-command-failed",
			message: `${outcome.displayCommand} exited ${outcome.status ?? "without status"}: ${outcome.stderr.trim()}`,
		},
	};
}

function operationFromCommand(result: ValueResult<string>): OperationResult {
	return result.ok ? { ok: true } : result;
}

function failure(code: string, error: unknown): ReleaseFailure {
	return { code, message: error instanceof Error ? error.message : String(error) };
}
