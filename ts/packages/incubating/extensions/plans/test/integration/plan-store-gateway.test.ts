import { describe, expect, test } from "vitest";
import {
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	realpath,
	rm,
	symlink,
	unlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import {
	createRealPlanStoreGateway,
	RealPlanStoreGateway,
	encodeBranchForPlanPath,
	findLatestSavedPlanFile,
	resolvePlanSourceFile,
	savePlanContentBytes,
	writeSavedPlanFile,
} from "../../src/index.ts";

const unusedPi = {
	exec: async () => ({ type: "exited" as const, stdout: "", stderr: "", code: 0, signal: null }),
};

describe("RealPlanStoreGateway", () => {
	test("writes saved plans exclusively and latest selection reads real mtimes", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-gateway-"));
		try {
			const repoRoot = join(root, "repo");
			await mkdir(repoRoot, { recursive: true });
			const planStoreRoot = join(root, "store");
			const sourceBranch = "feature/source-plan";
			const git = new InMemoryGitGateway({
				repoRoot,
				originUrl: "git@github.com:owner/repo.git",
				currentBranch: sourceBranch,
				cachedOriginHeadBranch: { type: "missing" },
			});
			const planStoreGateway = createRealPlanStoreGateway();

			const evidence = await writeSavedPlanFile(
				unusedPi,
				{ slug: "real-gateway-saved-plan", content: "# Real\n" },
				{ cwd: repoRoot, planStoreRoot, git, planStoreGateway },
			);

			await expect(
				writeSavedPlanFile(
					unusedPi,
					{ slug: "real-gateway-saved-plan", content: "# Again\n" },
					{ cwd: repoRoot, planStoreRoot, git, planStoreGateway },
				),
			).rejects.toThrow("refusing to overwrite");

			const branchDirectory = join(
				planStoreRoot,
				"gh--owner--repo",
				encodeBranchForPlanPath(sourceBranch),
			);
			const newerPath = join(branchDirectory, "newer-real-saved-plan--26-01-02T03-04-05--1.md");
			await writeFile(newerPath, "# Newer\n", "utf8");
			const newerDate = new Date(4_102_444_800_000);
			await utimes(newerPath, newerDate, newerDate);

			const latest = await findLatestSavedPlanFile(unusedPi, {
				cwd: repoRoot,
				planStoreRoot,
				git,
				planStoreGateway,
			});
			expect(evidence.filePath).toContain("real-gateway-saved-plan.md");
			expect(latest).toMatchObject({ slug: "newer-real-saved-plan", filePath: newerPath });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("publishes complete bytes with canonical sequence and internal metadata lock", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-publication-"));
		try {
			const repoRoot = join(root, "repo");
			await mkdir(repoRoot, { recursive: true });
			const planStoreRoot = join(root, "store");
			const git = new InMemoryGitGateway({
				repoRoot,
				originUrl: "git@github.com:owner/repo.git",
				currentBranch: "feature/source-plan",
			});
			const gateway = createRealPlanStoreGateway();
			const content = new TextEncoder().encode("# Publish Complete Bytes\r\n");
			const plan = await savePlanContentBytes(unusedPi, content, {
				cwd: repoRoot,
				planStoreRoot,
				git,
				planStoreGateway: gateway,
				localTimestamp: "26-01-02T03-04-05",
			});
			expect(plan.fileName).toBe("publish-complete-bytes--26-01-02T03-04-05--1.md");
			expect([...(await gateway.readRegularFileBytes(plan.filePath))]).toEqual([...content]);
			const directory = await gateway.listDirectory(plan.directoryPath);
			expect(directory.type).toBe("present");
			if (directory.type === "present") {
				expect(directory.entries).not.toContainEqual({
					name: ".ns-plan-store.lock",
					type: "file",
				});
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("serializes concurrent same-timestamp publications with complete bytes", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-concurrent-publication-"));
		try {
			const repoRoot = join(root, "repo");
			await mkdir(repoRoot, { recursive: true });
			const planStoreRoot = join(root, "store");
			const git = new InMemoryGitGateway({
				repoRoot,
				originUrl: "git@github.com:owner/repo.git",
				currentBranch: "feature/source-plan",
			});
			const firstContent = new TextEncoder().encode("# First Concurrent Publication\r\nalpha\n");
			const secondContent = new TextEncoder().encode("# Second Concurrent Publication\nbeta\r\n");
			const options = {
				cwd: repoRoot,
				planStoreRoot,
				git,
				localTimestamp: "26-01-02T03-04-05",
			};

			const [first, second] = await Promise.all([
				savePlanContentBytes(unusedPi, firstContent, {
					...options,
					planStoreGateway: createRealPlanStoreGateway(),
				}),
				savePlanContentBytes(unusedPi, secondContent, {
					...options,
					planStoreGateway: createRealPlanStoreGateway(),
				}),
			]);

			expect([first.sequence, second.sequence].sort((a, b) => a - b)).toEqual([1, 2]);
			expect([
				...(await createRealPlanStoreGateway().readRegularFileBytes(first.filePath)),
			]).toEqual([...firstContent]);
			expect([
				...(await createRealPlanStoreGateway().readRegularFileBytes(second.filePath)),
			]).toEqual([...secondContent]);
			const directory = await createRealPlanStoreGateway().listDirectory(first.directoryPath);
			expect(directory).toMatchObject({
				type: "present",
				entries: expect.not.arrayContaining([
					expect.objectContaining({ name: expect.stringMatching(/^\.ns-plan-store\./) }),
				]),
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("removes stale lock and temporary metadata before publication", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-stale-lock-"));
		try {
			const lockPath = join(root, ".ns-plan-store.lock");
			const temporaryPath = join(root, ".ns-plan-store.tmp-stale");
			await mkdir(lockPath);
			await writeFile(join(lockPath, "stale-writer"), "", "utf8");
			await writeFile(temporaryPath, "partial", "utf8");
			const staleDate = new Date(1_000);
			await utimes(lockPath, staleDate, staleDate);
			await utimes(join(lockPath, "stale-writer"), staleDate, staleDate);
			await utimes(temporaryPath, staleDate, staleDate);
			const gateway = createRealPlanStoreGateway({ clock: { nowMs: () => 40_000 } });

			const publication = await gateway.publishBytesAtomic({
				directoryPath: root,
				fileNameForSequence: (sequence) => `fresh-plan--26-01-02T03-04-05--${sequence}.md`,
				sequenceFromFileName: () => undefined,
				content: new TextEncoder().encode("# Fresh Plan\n"),
			});

			expect(publication.sequence).toBe(1);
			expect(await gateway.statPath(lockPath)).toBeUndefined();
			expect(await gateway.statPath(temporaryPath)).toBeUndefined();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("renews an active lock lease so a long publication cannot be stolen", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-renewed-lock-"));
		try {
			const manualTimers = createManualTimerScheduler();
			let continuePublication: (() => void) | undefined;
			const publicationPaused = new Promise<void>((resolvePause) => {
				continuePublication = resolvePause;
			});
			let reachedPublication: (() => void) | undefined;
			const publicationReached = new Promise<void>((resolveReached) => {
				reachedPublication = resolveReached;
			});
			class PausedPlanStoreGateway extends RealPlanStoreGateway {
				protected override async beforePublicationLink(): Promise<void> {
					reachedPublication?.();
					await publicationPaused;
				}
			}
			const clock = { nowMs: () => 100_000 + elapsedMs };
			let elapsedMs = 0;
			const owner = new PausedPlanStoreGateway({
				clock,
				timers: manualTimers.timers,
				lockStaleMs: 30,
			});
			const publication = owner.publishBytesAtomic({
				directoryPath: root,
				fileNameForSequence: (sequence) => `owned-plan--26-01-02T03-04-05--${sequence}.md`,
				sequenceFromFileName: () => undefined,
				content: new TextEncoder().encode("# Owned Plan\n"),
			});
			await publicationReached;
			const lockPath = join(root, ".ns-plan-store.lock");
			const [tokenName] = await readdir(lockPath);
			if (tokenName === undefined) throw new Error("Expected publication lock token.");
			const tokenPath = join(lockPath, tokenName);
			const initialMtimeMs = (await lstat(tokenPath)).mtimeMs;
			elapsedMs = 100;
			manualTimers.advanceMs(100);
			await waitForMtimeAfter(tokenPath, initialMtimeMs);
			expect((await lstat(tokenPath)).mtimeMs).toBeGreaterThan(initialMtimeMs);

			await expect(
				createRealPlanStoreGateway({
					clock,
					lockStaleMs: 30,
					maxLockAttempts: 1,
				}).publishBytesAtomic({
					directoryPath: root,
					fileNameForSequence: (sequence) => `competing-plan--26-01-02T03-04-05--${sequence}.md`,
					sequenceFromFileName: () => undefined,
					content: new TextEncoder().encode("# Competing Plan\n"),
				}),
			).rejects.toThrow("Could not acquire saved plan publication lock");

			continuePublication?.();
			await expect(publication).resolves.toMatchObject({ sequence: 1 });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("preserves successful publication when ownership-safe cleanup fails", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-cleanup-failure-"));
		try {
			let replacementTokenPath = "";
			class FailingCleanupPlanStoreGateway extends RealPlanStoreGateway {
				protected override async afterPublicationLink(paths: {
					temporaryPath: string;
					lockPath: string;
					tokenPath: string;
				}): Promise<void> {
					await unlink(paths.tokenPath);
					await writeFile(paths.tokenPath, "replacement-owner", "utf8");
					replacementTokenPath = paths.tokenPath;
					throw new Error("simulated internal cleanup failure");
				}
			}
			const gateway = new FailingCleanupPlanStoreGateway();
			const publication = await gateway.publishBytesAtomic({
				directoryPath: root,
				fileNameForSequence: (sequence) => `durable-plan--26-01-02T03-04-05--${sequence}.md`,
				sequenceFromFileName: () => undefined,
				content: new TextEncoder().encode("# Durable Plan\n"),
			});

			expect(publication.sequence).toBe(1);
			expect(await gateway.statPath(publication.filePath)).toMatchObject({ type: "file" });
			expect(await gateway.readTextFile(replacementTokenPath)).toBe("replacement-owner");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("cancels bounded lock waiting through the injected timer scheduler", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-lock-wait-"));
		try {
			const lockPath = join(root, ".ns-plan-store.lock");
			const otherWriterToken = join(lockPath, "another-writer");
			await mkdir(lockPath);
			await writeFile(otherWriterToken, "", "utf8");
			const manualTimers = createManualTimerScheduler();
			const controller = new AbortController();
			const gateway = createRealPlanStoreGateway({
				timers: manualTimers.timers,
				maxLockAttempts: 2,
				lockRetryDelayMs: 10,
			});
			const publication = gateway.publishBytesAtomic({
				directoryPath: root,
				fileNameForSequence: (sequence) => `waiting-plan--26-01-02T03-04-05--${sequence}.md`,
				sequenceFromFileName: () => undefined,
				content: new TextEncoder().encode("# Waiting Plan\n"),
				signal: controller.signal,
			});
			await waitForPendingTimer(root, manualTimers.pendingTimerCount);
			expect(manualTimers.pendingTimerCount()).toBe(1);

			const cancellation = new Error("stop waiting for the plan lock");
			controller.abort(cancellation);
			await expect(publication).rejects.toBe(cancellation);
			expect(manualTimers.pendingTimerCount()).toBe(0);
			expect(await gateway.statPath(otherWriterToken)).toMatchObject({ type: "file" });

			const boundedTimers = createManualTimerScheduler();
			const bounded = createRealPlanStoreGateway({
				timers: boundedTimers.timers,
				maxLockAttempts: 2,
				lockRetryDelayMs: 10,
			}).publishBytesAtomic({
				directoryPath: root,
				fileNameForSequence: (sequence) => `bounded-plan--26-01-02T03-04-05--${sequence}.md`,
				sequenceFromFileName: () => undefined,
				content: new TextEncoder().encode("# Bounded Plan\n"),
			});
			await waitForPendingTimer(root, boundedTimers.pendingTimerCount);
			boundedTimers.advanceMs(10);
			await expect(bounded).rejects.toThrow("after 2 attempts");
			expect(await gateway.statPath(otherWriterToken)).toMatchObject({ type: "file" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("realpath fallback is limited to missing paths", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-realpath-errors-"));
		try {
			const gateway = createRealPlanStoreGateway();
			await expect(gateway.realpathOrResolve(join(root, "missing"))).resolves.toBe(
				join(root, "missing"),
			);
			const regularFile = join(root, "regular-file");
			await writeFile(regularFile, "not a directory", "utf8");
			await expect(gateway.realpathOrResolve(join(regularFile, "child"))).rejects.toMatchObject({
				code: "ENOTDIR",
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("rejects a symlink supplied as the content file", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-symlink-"));
		try {
			const target = join(root, "target.md");
			const link = join(root, "link.md");
			await writeFile(target, "# Target\n", "utf8");
			await symlink(target, link);
			await expect(createRealPlanStoreGateway().readRegularFileBytes(link)).rejects.toThrow(
				"non-symlink",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("reads explicit source files and rejects repository-internal plans", async () => {
		const root = await mkdtemp(join(tmpdir(), "plans-real-source-"));
		try {
			const repoRoot = join(root, "repo");
			await mkdir(repoRoot, { recursive: true });
			const outsidePlan = join(root, "outside.md");
			const insidePlan = join(repoRoot, "inside.md");
			await writeFile(outsidePlan, "# Outside\n", "utf8");
			await writeFile(insidePlan, "# Inside\n", "utf8");
			const git = new InMemoryGitGateway({ repoRoot, cachedOriginHeadBranch: { type: "missing" } });
			const planStoreGateway = createRealPlanStoreGateway();

			await expect(
				resolvePlanSourceFile(unusedPi, {
					cwd: repoRoot,
					rawFilePath: insidePlan,
					git,
					planStoreGateway,
				}),
			).rejects.toThrow("inside");
			await expect(
				resolvePlanSourceFile(unusedPi, {
					cwd: repoRoot,
					rawFilePath: outsidePlan,
					git,
					planStoreGateway,
				}),
			).resolves.toBe(await realpath(outsidePlan));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

async function waitForPendingTimer(root: string, pendingTimerCount: () => number): Promise<void> {
	for (let attempt = 0; attempt < 100 && pendingTimerCount() === 0; attempt += 1) {
		await realpath(root);
	}
}

async function waitForMtimeAfter(path: string, priorMtimeMs: number): Promise<void> {
	for (
		let attempt = 0;
		attempt < 100 && (await lstat(path)).mtimeMs <= priorMtimeMs;
		attempt += 1
	) {
		await realpath(path);
	}
}
