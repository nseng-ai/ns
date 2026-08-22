import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	link,
	lstat,
	mkdir,
	open,
	readFile,
	readdir,
	realpath,
	rmdir,
	unlink,
} from "node:fs/promises";
import { resolve } from "node:path";

import { ensurePrivateParentDirectory } from "@nseng-ai/extension-kit/xdg";
import type { Clock } from "@nseng-ai/foundation/clock";
import { systemClock, systemTimerScheduler } from "@nseng-ai/foundation/time";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";

const LOCK_FILE_NAME = ".ns-plan-store.lock";
const TEMPORARY_FILE_PREFIX = ".ns-plan-store.tmp-";
const DEFAULT_LOCK_STALE_MS = 30_000;
const DEFAULT_LOCK_RETRY_DELAY_MS = 25;
const DEFAULT_MAX_LOCK_ATTEMPTS = 1_201;
const MAX_PUBLICATION_COLLISIONS = 100;

interface LockOwnership {
	lockPath: string;
	lock: PathOwnership;
	tokenPath: string;
	token: PathOwnership;
	tokenFile: Awaited<ReturnType<typeof open>>;
	renewalTimer: ScheduledTimer;
	renewal: Promise<void>;
	renewalError?: unknown;
}

interface PathOwnership {
	dev: number;
	ino: number;
}

export interface RealPlanStoreGatewayOptions {
	clock?: Clock;
	timers?: TimerScheduler;
	lockStaleMs?: number;
	lockRetryDelayMs?: number;
	maxLockAttempts?: number;
}

export interface PlanStoreGateway {
	listDirectory(path: string): Promise<PlanStoreDirectoryRead>;
	statPath(path: string): Promise<PlanStorePathStat | undefined>;
	readTextFile(path: string): Promise<string>;
	readRegularFileBytes(path: string): Promise<Uint8Array>;
	writeTextFileExclusive(path: string, content: string): Promise<void>;
	publishBytesAtomic(options: AtomicPlanPublicationOptions): Promise<AtomicPlanPublication>;
	realpathOrResolve(path: string): Promise<string>;
}

export interface AtomicPlanPublicationOptions {
	directoryPath: string;
	fileNameForSequence(sequence: number): string;
	sequenceFromFileName(fileName: string): number | undefined;
	content: Uint8Array;
	signal?: AbortSignal;
}

export interface AtomicPlanPublication {
	filePath: string;
	fileName: string;
	sequence: number;
}

export type PlanStoreDirectoryRead =
	| { type: "present"; entries: readonly PlanStoreDirectoryEntry[] }
	| { type: "missing" };

export interface PlanStoreDirectoryEntry {
	name: string;
	type: PlanStorePathType;
}

export interface PlanStorePathStat {
	type: PlanStorePathType;
	mtimeMs: number;
}

export type PlanStorePathType = "file" | "directory" | "other";

export class RealPlanStoreGateway implements PlanStoreGateway {
	private readonly clock: Clock;
	private readonly timers: TimerScheduler;
	private readonly lockStaleMs: number;
	private readonly lockRetryDelayMs: number;
	private readonly maxLockAttempts: number;

	constructor(options: RealPlanStoreGatewayOptions = {}) {
		this.clock = options.clock ?? systemClock;
		this.timers = options.timers ?? systemTimerScheduler;
		this.lockStaleMs = options.lockStaleMs ?? DEFAULT_LOCK_STALE_MS;
		this.lockRetryDelayMs = options.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS;
		this.maxLockAttempts = options.maxLockAttempts ?? DEFAULT_MAX_LOCK_ATTEMPTS;
	}

	async listDirectory(path: string): Promise<PlanStoreDirectoryRead> {
		try {
			const entries = await readdir(path, { withFileTypes: true });
			return {
				type: "present",
				entries: entries.map((entry) => ({ name: entry.name, type: direntType(entry) })),
			};
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") return { type: "missing" };
			throw error;
		}
	}

	async statPath(path: string): Promise<PlanStorePathStat | undefined> {
		try {
			const pathStat = await lstat(path);
			return { type: statsType(pathStat), mtimeMs: pathStat.mtimeMs };
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") return undefined;
			throw error;
		}
	}

	async readTextFile(path: string): Promise<string> {
		return await readFile(path, "utf8");
	}

	async readRegularFileBytes(path: string): Promise<Uint8Array> {
		let file: Awaited<ReturnType<typeof open>> | undefined;
		try {
			file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
			if (!(await file.stat()).isFile()) {
				throw new Error(`Plan content file must be a regular, non-symlink file: ${path}`);
			}
			return await file.readFile();
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") {
				throw new Error(`Plan content file does not exist: ${path}`);
			}
			if (isNodeError(error) && error.code === "ELOOP") {
				throw new Error(`Plan content file must be a regular, non-symlink file: ${path}`);
			}
			throw error;
		} finally {
			await file?.close();
		}
	}

	async writeTextFileExclusive(path: string, content: string): Promise<void> {
		await ensurePrivateParentDirectory(path);
		let file: Awaited<ReturnType<typeof open>> | undefined;
		try {
			file = await open(path, "wx");
			await file.writeFile(content, "utf8");
		} catch (error) {
			if (isNodeError(error) && error.code === "EEXIST") {
				throw new Error(
					`Saved plan file already exists in the local plan store; refusing to overwrite.\nPath: ${path}`,
				);
			}
			throw error;
		} finally {
			await file?.close();
		}
	}

	async publishBytesAtomic(options: AtomicPlanPublicationOptions): Promise<AtomicPlanPublication> {
		throwIfAborted(options.signal);
		await ensurePrivateParentDirectory(resolve(options.directoryPath, LOCK_FILE_NAME));
		const lockPath = resolve(options.directoryPath, LOCK_FILE_NAME);
		const lockOwnership = await this.acquireLock(lockPath, options.signal);
		let temporaryPath: string | undefined;
		let temporaryOwnership: PathOwnership | undefined;
		let publication: AtomicPlanPublication | undefined;
		try {
			for (let collision = 0; collision < MAX_PUBLICATION_COLLISIONS; collision += 1) {
				throwIfAborted(options.signal);
				const sequence = (await this.greatestSequence(options)) + 1;
				const fileName = options.fileNameForSequence(sequence);
				const filePath = resolve(options.directoryPath, fileName);
				temporaryPath = resolve(
					options.directoryPath,
					`${TEMPORARY_FILE_PREFIX}${process.pid}-${collision}`,
				);
				try {
					const temporary = await open(temporaryPath, "wx", 0o600);
					try {
						const temporaryStat = await temporary.stat();
						temporaryOwnership = pathOwnership(temporaryStat);
						await temporary.writeFile(options.content);
						await temporary.sync();
					} finally {
						await temporary.close();
					}
					throwIfAborted(options.signal);
					await assertLockOwned(lockOwnership);
					await this.beforePublicationLink();
					await assertLockOwned(lockOwnership);
					await link(temporaryPath, filePath);
					publication = { filePath, fileName, sequence };
					await this.afterPublicationLink({
						temporaryPath,
						lockPath,
						tokenPath: lockOwnership.tokenPath,
					});
					await bestEffortRemoveOwnedFile(temporaryPath, temporaryOwnership);
					temporaryPath = undefined;
					temporaryOwnership = undefined;
					return publication;
				} catch (error) {
					if (publication !== undefined) return publication;
					if (temporaryPath !== undefined && temporaryOwnership !== undefined) {
						await bestEffortRemoveOwnedFile(temporaryPath, temporaryOwnership);
					}
					temporaryPath = undefined;
					temporaryOwnership = undefined;
					if (isNodeError(error) && error.code === "EEXIST") continue;
					throw error;
				}
			}
			throw new Error(
				`Could not publish saved plan after ${MAX_PUBLICATION_COLLISIONS} filename collisions.`,
			);
		} finally {
			if (temporaryPath !== undefined && temporaryOwnership !== undefined) {
				await bestEffortRemoveOwnedFile(temporaryPath, temporaryOwnership);
			}
			await bestEffortReleaseLock(lockOwnership);
		}
	}

	async realpathOrResolve(path: string): Promise<string> {
		try {
			return await realpath(path);
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") return resolve(path);
			throw error;
		}
	}

	protected async beforePublicationLink(): Promise<void> {}

	protected async afterPublicationLink(_paths: {
		temporaryPath: string;
		lockPath: string;
		tokenPath: string;
	}): Promise<void> {}

	private async greatestSequence(options: AtomicPlanPublicationOptions): Promise<number> {
		const directory = await this.listDirectory(options.directoryPath);
		if (directory.type === "missing") return 0;
		let greatest = 0;
		for (const entry of directory.entries) {
			if (entry.type !== "file") continue;
			const sequence = options.sequenceFromFileName(entry.name);
			if (sequence !== undefined && sequence > greatest) greatest = sequence;
		}
		return greatest;
	}

	private async acquireLock(
		lockPath: string,
		signal: AbortSignal | undefined,
	): Promise<LockOwnership> {
		for (let attempt = 1; attempt <= this.maxLockAttempts; attempt += 1) {
			throwIfAborted(signal);
			try {
				await mkdir(lockPath, { mode: 0o700 });
				const tokenPath = resolve(lockPath, `${process.pid}-${randomUUID()}`);
				let tokenFile: Awaited<ReturnType<typeof open>> | undefined;
				try {
					tokenFile = await open(tokenPath, "wx", 0o600);
					const token = pathOwnership(await tokenFile.stat());
					const acquiredAt = new Date(this.clock.nowMs());
					await tokenFile.utimes(acquiredAt, acquiredAt);
					const lockStat = await lstat(lockPath);
					const ownership: LockOwnership = {
						lockPath,
						lock: pathOwnership(lockStat),
						tokenPath,
						token,
						tokenFile,
						renewalTimer: { cancel() {} },
						renewal: Promise.resolve(),
					};
					const renewalDelayMs = Math.max(1, Math.floor(this.lockStaleMs / 3));
					ownership.renewalTimer = this.timers.setInterval(() => {
						ownership.renewal = ownership.renewal
							.then(async () => await renewLock(ownership, this.clock.nowMs()))
							.catch((error: unknown) => {
								ownership.renewalError ??= error;
							});
					}, renewalDelayMs);
					return ownership;
				} catch (error) {
					await tokenFile?.close();
					await removeIfPresent(tokenPath);
					await removeEmptyLockDirectory(lockPath);
					throw error;
				}
			} catch (error) {
				if (!(isNodeError(error) && error.code === "EEXIST")) throw error;
				const lockStat = await lstatIfPresent(lockPath);
				if (lockStat === undefined) continue;
				const leaseMtimeMs = await lockLeaseMtimeMs(lockPath, lockStat);
				const staleBeforeMs = this.clock.nowMs() - this.lockStaleMs;
				if (leaseMtimeMs < staleBeforeMs) {
					const removed = await removeStaleLock(lockPath, pathOwnership(lockStat), staleBeforeMs);
					if (removed) await this.removeStaleTemporaryFiles(resolve(lockPath, ".."));
					continue;
				}
				if (attempt < this.maxLockAttempts) {
					await abortableDelay(this.timers, this.lockRetryDelayMs, signal);
				}
			}
		}
		throw new Error(
			`Could not acquire saved plan publication lock after ${this.maxLockAttempts} attempts: ${lockPath}`,
		);
	}

	private async removeStaleTemporaryFiles(directoryPath: string): Promise<void> {
		const directory = await this.listDirectory(directoryPath);
		if (directory.type === "missing") return;
		for (const entry of directory.entries) {
			if (entry.type !== "file" || !entry.name.startsWith(TEMPORARY_FILE_PREFIX)) continue;
			const temporaryPath = resolve(directoryPath, entry.name);
			const temporaryStat = await lstatIfPresent(temporaryPath);
			if (
				temporaryStat?.isFile() === true &&
				this.clock.nowMs() - Number(temporaryStat.mtimeMs) > this.lockStaleMs
			) {
				await removeOwnedFile(temporaryPath, pathOwnership(temporaryStat));
			}
		}
	}
}

export function createRealPlanStoreGateway(
	options: RealPlanStoreGatewayOptions = {},
): PlanStoreGateway {
	return new RealPlanStoreGateway(options);
}

function direntType(entry: { isFile(): boolean; isDirectory(): boolean }): PlanStorePathType {
	if (entry.isFile()) return "file";
	if (entry.isDirectory()) return "directory";
	return "other";
}

function statsType(pathStat: { isFile(): boolean; isDirectory(): boolean }): PlanStorePathType {
	if (pathStat.isFile()) return "file";
	if (pathStat.isDirectory()) return "directory";
	return "other";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted === true) {
		throw signal.reason ?? new Error("Saved plan publication cancelled.");
	}
}

async function abortableDelay(
	timers: TimerScheduler,
	delayMs: number,
	signal: AbortSignal | undefined,
): Promise<void> {
	throwIfAborted(signal);
	await new Promise<void>((resolveDelay, rejectDelay) => {
		const timer = timers.setTimeout(() => {
			signal?.removeEventListener("abort", abort);
			resolveDelay();
		}, delayMs);
		function abort(): void {
			timer.cancel();
			signal?.removeEventListener("abort", abort);
			rejectDelay(signal?.reason ?? new Error("Saved plan publication cancelled."));
		}
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted === true) abort();
	});
}

async function lstatIfPresent(
	path: string,
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
	try {
		return await lstat(path);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		throw error;
	}
}

async function renewLock(ownership: LockOwnership, nowMs: number): Promise<void> {
	await assertLockOwned(ownership);
	const now = new Date(nowMs);
	await ownership.tokenFile.utimes(now, now);
}

async function assertLockOwned(ownership: LockOwnership): Promise<void> {
	if (!isOwnedPath(await lstatIfPresent(ownership.lockPath), ownership.lock)) {
		throw new Error("Saved plan publication lock ownership was lost.");
	}
	if (!isOwnedPath(await lstatIfPresent(ownership.tokenPath), ownership.token)) {
		throw new Error("Saved plan publication lock token ownership was lost.");
	}
	if (ownership.renewalError !== undefined) throw ownership.renewalError;
}

async function bestEffortReleaseLock(ownership: LockOwnership): Promise<void> {
	ownership.renewalTimer.cancel();
	try {
		await ownership.renewal;
		await ownership.tokenFile.close();
		if (!isOwnedPath(await lstatIfPresent(ownership.lockPath), ownership.lock)) return;
		await removeOwnedFile(ownership.tokenPath, ownership.token);
		if (!isOwnedPath(await lstatIfPresent(ownership.lockPath), ownership.lock)) return;
		await removeEmptyLockDirectory(ownership.lockPath);
	} catch {
		// Publication is already durable; internal lease cleanup must not change its result.
	}
}

async function removeEmptyLockDirectory(lockPath: string): Promise<void> {
	try {
		await rmdir(lockPath);
	} catch (error) {
		if (!(isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTEMPTY"))) {
			throw error;
		}
	}
}

async function lockLeaseMtimeMs(
	lockPath: string,
	lockStat: Awaited<ReturnType<typeof lstat>>,
): Promise<number> {
	if (!lockStat.isDirectory()) return Number(lockStat.mtimeMs);
	const entries = await readdir(lockPath, { withFileTypes: true });
	if (entries.length === 0) return Number(lockStat.mtimeMs);
	let newestMtimeMs = Number.NEGATIVE_INFINITY;
	for (const entry of entries) {
		if (!entry.isFile() || isLiveLockOwner(entry.name)) return Number.POSITIVE_INFINITY;
		const entryStat = await lstatIfPresent(resolve(lockPath, entry.name));
		if (entryStat !== undefined) newestMtimeMs = Math.max(newestMtimeMs, Number(entryStat.mtimeMs));
	}
	return newestMtimeMs;
}

async function removeStaleLock(
	lockPath: string,
	observedOwnership: PathOwnership,
	staleBeforeMs: number,
): Promise<boolean> {
	const currentStat = await lstatIfPresent(lockPath);
	if (!isOwnedPath(currentStat, observedOwnership)) return false;
	if (!currentStat.isDirectory()) {
		if (Number(currentStat.mtimeMs) >= staleBeforeMs) return false;
		return removeOwnedFile(lockPath, observedOwnership);
	}

	const entries = await readdir(lockPath, { withFileTypes: true });
	const staleEntries: Array<{ path: string; ownership: PathOwnership }> = [];
	for (const entry of entries) {
		if (!entry.isFile() || isLiveLockOwner(entry.name)) return false;
		const path = resolve(lockPath, entry.name);
		const entryStat = await lstatIfPresent(path);
		if (entryStat === undefined) continue;
		if (Number(entryStat.mtimeMs) >= staleBeforeMs) return false;
		staleEntries.push({ path, ownership: pathOwnership(entryStat) });
	}
	if (!isOwnedPath(await lstatIfPresent(lockPath), observedOwnership)) return false;
	for (const entry of staleEntries) {
		if (!(await removeOwnedFile(entry.path, entry.ownership))) return false;
	}
	try {
		await rmdir(lockPath);
		return true;
	} catch (error) {
		if (isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTEMPTY")) return false;
		throw error;
	}
}

function isLiveLockOwner(tokenName: string): boolean {
	const separator = tokenName.indexOf("-");
	if (separator <= 0) return false;
	const pid = Number(tokenName.slice(0, separator));
	if (!Number.isSafeInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return isNodeError(error) && error.code === "EPERM";
	}
}

function pathOwnership(pathStat: { dev: number | bigint; ino: number | bigint }): PathOwnership {
	return { dev: Number(pathStat.dev), ino: Number(pathStat.ino) };
}

async function removeOwnedFile(path: string, ownership: PathOwnership): Promise<boolean> {
	if (!isOwnedPath(await lstatIfPresent(path), ownership)) return false;
	return removeIfPresentAndReport(path);
}

async function bestEffortRemoveOwnedFile(path: string, ownership: PathOwnership): Promise<void> {
	try {
		await removeOwnedFile(path, ownership);
	} catch {
		// Internal temporary metadata is safe to leave after publication or another cleanup failure.
	}
}

function isOwnedPath(
	pathStat: Awaited<ReturnType<typeof lstat>> | undefined,
	ownership: PathOwnership,
): pathStat is Awaited<ReturnType<typeof lstat>> {
	return (
		pathStat !== undefined &&
		Number(pathStat.dev) === ownership.dev &&
		Number(pathStat.ino) === ownership.ino
	);
}

async function removeIfPresentAndReport(path: string): Promise<boolean> {
	try {
		await unlink(path);
		return true;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return false;
		throw error;
	}
}

async function removeIfPresent(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (error) {
		if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}
