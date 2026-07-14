import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import {
	formatCommand,
	formatCommandResultFailure,
	runCommand,
	tailText,
	type CommandRunner,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import { isNodeErrorCode, isRecord } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk } from "@nseng-ai/foundation/result";
import { systemTimerScheduler } from "@nseng-ai/foundation/time";
import type { TimerScheduler } from "@nseng-ai/foundation/timers";

import { isMissingPackageResult } from "../public-packages/helpers.ts";
import {
	intendedPublicPackages,
	loadPublicPackageContext,
	publishRootForEntry,
	repoRoot,
	type PublicPackageContext,
} from "../public-packages/package-set.ts";

import { releaseTransactionReportSchema } from "./contracts.ts";
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

interface ReleaseCommandOptions {
	readonly runCommand?: CommandRunner;
}

interface FreshReleaseGatewayOptions extends ReleaseCommandOptions {
	readonly loadPackageContext?: () => Promise<PublicPackageContext>;
}

export function createSystemFreshReleaseGateway(
	options: FreshReleaseGatewayOptions = {},
): FreshReleaseGateway {
	const commandRunner = options.runCommand ?? runCommand;
	const packageContextLoader = options.loadPackageContext ?? loadPublicPackageContext;
	return {
		async inspectFreshState(releaseBranch) {
			const [branch, commit, trunk, status, branchRef, tracking] = await Promise.all([
				execute(commandRunner, "git", ["branch", "--show-current"], repoRoot),
				execute(commandRunner, "git", ["rev-parse", "HEAD"], repoRoot),
				execute(commandRunner, "gt", ["trunk", "--no-interactive"], repoRoot),
				execute(
					commandRunner,
					"git",
					["status", "--porcelain=v1", "--untracked-files=all"],
					repoRoot,
				),
				executeCommand(
					commandRunner,
					"git",
					["show-ref", "--verify", "--quiet", `refs/heads/${releaseBranch}`],
					repoRoot,
				),
				executeCommand(commandRunner, "gt", ["parent", "--no-interactive"], repoRoot),
			]);
			if (!branch.ok) return branch;
			if (!commit.ok) return commit;
			if (!trunk.ok) return trunk;
			if (!status.ok) return status;
			if (
				branchRef.type !== "exited" ||
				branchRef.signal !== null ||
				(branchRef.code !== 0 && branchRef.code !== 1)
			)
				return commandFailure(
					"git",
					["show-ref", "--verify", "--quiet", `refs/heads/${releaseBranch}`],
					branchRef,
				);
			if (tracking.type !== "exited" || tracking.code === null || tracking.signal !== null)
				return commandFailure("gt", ["parent", "--no-interactive"], tracking);
			const packageContextResult = await loadPublicPackageContextResult(packageContextLoader);
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
					isGraphiteTracked: tracking.code === 0,
					isWorktreeClean: status.value.length === 0,
					releaseBranchExists: branchRef.code === 0,
					sourceManifestPaths,
				},
			};
		},
		async bumpCoordinatedVersion(version) {
			return operationFromCommand(
				await execute(
					commandRunner,
					"pnpm",
					["--dir", "ts", "run", "release:bump-version", "--", version],
					repoRoot,
				),
			);
		},
		async qualifyPublicPackages(version) {
			const qualified = await execute(
				commandRunner,
				"pnpm",
				["--dir", "ts", "run", "release:qualify-public", "--", "--all", "--version", version],
				repoRoot,
			);
			if (!qualified.ok) return qualified;
			const packageContextResult = await loadPublicPackageContextResult(packageContextLoader);
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
			const changed = await execute(
				commandRunner,
				"git",
				["diff", "--name-only", "HEAD", "--"],
				repoRoot,
			);
			if (!changed.ok) return changed;
			return {
				ok: true,
				value: changed.value.split("\n").filter((path) => path.length > 0),
			};
		},
		async stageReleaseFiles(paths) {
			return operationFromCommand(
				await execute(commandRunner, "git", ["add", "--", ...paths], repoRoot),
			);
		},
		async createReleaseCheckpoint(options) {
			const created = await execute(
				commandRunner,
				"gt",
				["create", options.branch, "-m", options.message, "--no-interactive"],
				repoRoot,
			);
			if (!created.ok) return created;
			return await inspectSystemCheckpoint(commandRunner);
		},
		async inspectCheckpoint() {
			return await inspectSystemCheckpoint(commandRunner);
		},
	};
}

export function createSystemResumeReleaseGateway(
	options: FreshReleaseGatewayOptions = {},
): ResumeReleaseGateway {
	const commandRunner = options.runCommand ?? runCommand;
	const packageContextLoader = options.loadPackageContext ?? loadPublicPackageContext;
	return {
		async inspectResumeState() {
			const [checkpoint, parent, packageContextResult] = await Promise.all([
				inspectSystemCheckpoint(commandRunner),
				execute(commandRunner, "git", ["rev-parse", "HEAD^"], repoRoot),
				loadPublicPackageContextResult(packageContextLoader),
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
	readonly runCommand?: CommandRunner;
}): NpmCandidateGateway {
	const commandRunner = options.runCommand ?? runCommand;
	return {
		async pack(request): Promise<ValueResult<Omit<ReleaseCandidate, "order">>> {
			try {
				await mkdir(request.packDestination, { recursive: true });
			} catch (error: unknown) {
				return { ok: false, error: failure("candidate-directory-create-failed", error) };
			}
			const executed = await executeNpmPack(
				commandRunner,
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

export interface ReleaseReportFileHandle {
	writeFile(contents: string): Promise<void>;
	sync(): Promise<void>;
	close(): Promise<void>;
}

export interface ReleaseReportFileOperations {
	mkdirp(path: string): Promise<void>;
	open(path: string, flags: "r" | "wx"): Promise<ReleaseReportFileHandle>;
	rename(source: string, destination: string): Promise<void>;
	remove(path: string): Promise<void>;
}

const nodeReleaseReportFileOperations: ReleaseReportFileOperations = {
	async mkdirp(path) {
		await mkdir(path, { recursive: true });
	},
	async open(path, flags) {
		return await open(path, flags);
	},
	async rename(source, destination) {
		await rename(source, destination);
	},
	async remove(path) {
		await rm(path, { force: true });
	},
};

export function createNodeReleaseReportStore(
	fileOperations: ReleaseReportFileOperations = nodeReleaseReportFileOperations,
): ReleaseReportStore {
	return {
		async read(reportPath): Promise<OptionalResult<ReleaseTransactionReport>> {
			let contents: string;
			try {
				contents = await readFile(reportPath, "utf8");
			} catch (error: unknown) {
				if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
				return { type: "error", error: failure("report-read-failed", error) };
			}
			try {
				const parsed: unknown = JSON.parse(contents);
				const validated = releaseTransactionReportSchema.safeParse(parsed);
				if (!validated.success) {
					return {
						type: "error",
						error: {
							code: "report-invalid",
							message: `Invalid release report ${reportPath}: ${validated.error.issues.map((issue) => `${issue.path.join(".") || "report"}: ${issue.message}`).join("; ")}`,
						},
					};
				}
				return { type: "found", value: validated.data };
			} catch (error: unknown) {
				return {
					type: "error",
					error: {
						code: "report-invalid-json",
						message: `Invalid JSON in release report ${reportPath}: ${error instanceof Error ? error.message : String(error)}`,
					},
				};
			}
		},
		async writeAtomic(reportPath, report): Promise<OperationResult> {
			const parentDirectory = dirname(reportPath);
			const temporaryPath = `${reportPath}.${randomUUID()}.tmp`;
			let temporaryHandle: ReleaseReportFileHandle | undefined;
			let isTemporaryHandleClosed = false;
			let directoryHandle: ReleaseReportFileHandle | undefined;
			let isDirectoryHandleClosed = false;
			try {
				await fileOperations.mkdirp(parentDirectory);
				temporaryHandle = await fileOperations.open(temporaryPath, "wx");
				await temporaryHandle.writeFile(`${JSON.stringify(report, null, "\t")}\n`);
				await temporaryHandle.sync();
				await temporaryHandle.close();
				isTemporaryHandleClosed = true;
				await fileOperations.rename(temporaryPath, reportPath);
				directoryHandle = await fileOperations.open(parentDirectory, "r");
				await directoryHandle.sync();
				await directoryHandle.close();
				isDirectoryHandleClosed = true;
				return resultOk(undefined);
			} catch (error: unknown) {
				if (directoryHandle !== undefined && !isDirectoryHandleClosed) {
					await closeBestEffort(directoryHandle);
				}
				if (temporaryHandle !== undefined && !isTemporaryHandleClosed) {
					await closeBestEffort(temporaryHandle);
				}
				await fileOperations.remove(temporaryPath).catch(() => {
					// Best-effort cleanup must not replace the report-write failure.
				});
				return resultErr(failure("report-write-failed", error));
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
				if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
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

export function createSystemNpmRegistryGateway(
	options: ReleaseCommandOptions = {},
): NpmRegistryGateway {
	const commandRunner = options.runCommand ?? runCommand;
	return {
		async readPackageMetadata(name, version) {
			const args = [
				"view",
				`${name}@${version}`,
				"dist.integrity",
				"dist.shasum",
				"--json",
			] as const;
			const outcome = await executeCommand(commandRunner, "npm", args, repoRoot);
			if (outcome.type !== "exited") {
				return { type: "error", error: commandFailure("npm", args, outcome).error };
			}
			if (outcome.code !== 0 || outcome.signal !== null) {
				if (
					outcome.code !== null &&
					outcome.signal === null &&
					isMissingPackageResult(outcome.stderr, outcome.stdout)
				)
					return { type: "missing" };
				return { type: "error", error: commandFailure("npm", args, outcome).error };
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

export function createSystemReleaseCommandGateway(
	options: ReleaseCommandOptions = {},
): ReleaseCommandGateway {
	const commandRunner = options.runCommand ?? runCommand;
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
				await execute(
					commandRunner,
					"npm",
					["publish", tarballPath, "--access", "public"],
					repoRoot,
				),
			);
		},
		async verify(options) {
			return operationFromCommand(
				await execute(
					commandRunner,
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

export function createSystemReleaseDelay(
	timers: TimerScheduler = systemTimerScheduler,
): ReleaseDelay {
	return {
		async wait(delayMs) {
			await timers.delay(delayMs);
		},
	};
}

async function loadPublicPackageContextResult(
	loadPackageContext: () => Promise<PublicPackageContext>,
): Promise<ValueResult<PublicPackageContext>> {
	try {
		return resultOk(await loadPackageContext());
	} catch (error: unknown) {
		return resultErr(failure("public-package-context-failed", error));
	}
}

function nestedDistValue(record: Record<string, unknown>, key: string): unknown {
	const dist = record.dist;
	return isRecord(dist) ? dist[key] : undefined;
}

async function executeNpmPack(
	commandRunner: CommandRunner,
	cwd: string,
	publishRoot: string,
	packDestination: string,
): Promise<ValueResult<string>> {
	const args = ["pack", publishRoot, "--json", "--pack-destination", packDestination] as const;
	const outcome = await executeCommand(commandRunner, "npm", args, cwd);
	if (outcome.type === "exited" && outcome.code === 0) return resultOk(outcome.stdout);
	const commandResult = commandFailure("npm", args, outcome);
	return resultErr({ ...commandResult.error, code: "npm-pack-failed" });
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

async function inspectSystemCheckpoint(commandRunner: CommandRunner) {
	const [branch, commit, status] = await Promise.all([
		execute(commandRunner, "git", ["branch", "--show-current"], repoRoot),
		execute(commandRunner, "git", ["rev-parse", "HEAD"], repoRoot),
		execute(commandRunner, "git", ["status", "--porcelain=v1", "--untracked-files=all"], repoRoot),
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
	commandRunner: CommandRunner,
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<ValueResult<string>> {
	const outcome = await executeCommand(commandRunner, command, args, cwd);
	if (outcome.type === "exited" && outcome.code === 0) return resultOk(outcome.stdout.trim());
	return commandFailure(command, args, outcome);
}

async function executeCommand(
	commandRunner: CommandRunner,
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<ExecResult> {
	return await commandRunner(command, args, { cwd });
}

function commandFailure(
	command: string,
	args: readonly string[],
	outcome: ExecResult,
): { readonly ok: false; readonly error: ReleaseFailure } {
	const displayCommand = formatCommand(command, args);
	return resultErr({
		code: "release-command-failed",
		message: formatCommandResultFailure("Release command failed", command, args, outcome),
		displayCommand,
		details: commandFailureDetails(command, args, outcome),
	});
}

function commandFailureDetails(
	command: string,
	args: readonly string[],
	outcome: ExecResult,
): Record<string, unknown> {
	const output = {
		command,
		args: [...args],
		resultType: outcome.type,
		stdout: tailText(outcome.stdout, { maxChars: 2_000, maxLines: 40 }),
		stderr: tailText(outcome.stderr, { maxChars: 2_000, maxLines: 40 }),
	};
	switch (outcome.type) {
		case "spawn-failed":
			return { ...output, spawnError: outcome.error };
		case "exited":
		case "cancelled":
		case "timed-out":
			return { ...output, exitCode: outcome.code, signal: outcome.signal };
	}
}

function operationFromCommand(result: ValueResult<string>): OperationResult {
	return result.ok ? resultOk(undefined) : result;
}

async function closeBestEffort(handle: ReleaseReportFileHandle): Promise<void> {
	await handle.close().catch(() => {
		// A prior durable-write failure remains the primary diagnostic.
	});
}

function failure(code: string, error: unknown): ReleaseFailure {
	return { code, message: error instanceof Error ? error.message : String(error) };
}
