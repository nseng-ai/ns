import { downloadPrFeedback, type PrAddressRunner } from "../feedback-download.ts";
import { optionalEntry } from "@sdl/core/primitives";
import type { ScheduledTimer, TimerScheduler } from "@sdl/core/timers";
import { unrefTimerScheduler } from "@sdl/pi/shared/timers";

import {
	type ExistingFeedbackMode,
	shouldDispatchExistingFeedback,
	type WatchCommandOptions,
} from "./command-args.ts";
import {
	COMMAND_TIMEOUT_MS,
	DEFAULT_INTERVAL_MS,
	HEAVY_FALLBACK_INTERVAL_MS,
	GIT_TIMEOUT_MS,
	PR_FEEDBACK_WATCH_COMMAND_NAME,
	PR_FEEDBACK_WATCH_MESSAGE_TYPE,
	PR_FEEDBACK_WATCH_STATE_TYPE,
	REST_FAILURES_BEFORE_HEAVY_FALLBACK,
	REST_FAILURE_STATUS,
	STATUS_REFRESH_INTERVAL_MS,
} from "./constants.ts";
import { parseWatchEventEntry } from "./events.ts";
import {
	feedbackItemKeyFromDownload,
	feedbackItemKeysFromFingerprint,
	filterIgnoredFeedback,
} from "./fingerprint.ts";
import {
	loadCurrentGitHubLogin,
	loadHeadRefOid,
	loadPrCheckSummary,
	loadRestFingerprint,
	parseGitHubPullRequestUrl,
	skewIso,
} from "./github.ts";
import type {
	FeedbackFingerprint,
	FeedbackItemKey,
	FeedbackSnapshot,
	PrCheckSummary,
	PrFeedbackWatchGithubPrIdentity,
	WatchEventEntry,
	WatchStatus,
} from "./model.ts";

import { buildDetectedFeedbackPrompt } from "./prompt.ts";
import { isWorkingTreeDirty, notify } from "./runtime.ts";
import { defaultStatusLine, initialWatchStatus, shouldRefreshStatusAge } from "./status.ts";
import type {
	ActiveSession,
	ExtensionAPI,
	ExtensionContext,
	PrFeedbackWatchExtensionOptions,
} from "./types.ts";

interface WatchEventAppendInput {
	branch?: string;
	prNumber?: number;
	headRefOid?: string;
	itemKeys?: string[];
	details?: Record<string, unknown>;
}

export class PrFeedbackWatchController {
	private readonly pi: ExtensionAPI;
	private activeSession: ActiveSession | undefined;
	private nextSessionId = 0;
	private readonly timers: TimerScheduler;
	private timer: ScheduledTimer | undefined;
	private statusRefreshTimer: ScheduledTimer | undefined;
	private isPollInFlight = false;
	private isPollPending = false;
	private state: WatchStatus = initialWatchStatus();
	private options: WatchCommandOptions = {
		intervalMs: DEFAULT_INTERVAL_MS,
		shouldAllowDirty: true,
		existingFeedbackMode: "dispatch",
	};
	private seenKeys = new Set<string>();
	private attemptedKeys = new Set<string>();
	private queuedItems: FeedbackItemKey[] = [];
	private currentUserLogin: string | undefined;
	private hasNotifiedDirtyPause = false;
	private hasNotifiedRestFailure = false;
	private headRefOid: string | undefined;
	private githubPrIdentity: PrFeedbackWatchGithubPrIdentity | undefined;
	private lastRestFingerprintKey: string | undefined;
	private restSinceIso: string | undefined;
	private lastHeavyFallbackAt = 0;
	private runner: PrAddressRunner | undefined;

	constructor(pi: ExtensionAPI, options: PrFeedbackWatchExtensionOptions) {
		this.pi = pi;
		this.runner = options.runner;
		this.timers = options.timers ?? unrefTimerScheduler;
	}

	activate(ctx: ExtensionContext): void {
		this.closeActiveSession();
		const sessionId = ++this.nextSessionId;
		this.activeSession = {
			id: sessionId,
			ctx,
			cwd: ctx.cwd,
			abortController: new AbortController(),
			harnessSessionId: `pr-feedback-watch-${sessionId}`,
			isClosed: false,
		};
		this.restoreState(ctx);
		this.renderStatus();
	}

	async start(ctx: ExtensionContext, options: WatchCommandOptions): Promise<void> {
		const session = this.ensureSession(ctx);
		this.options = { ...options };
		this.state = clearLastError({
			...this.state,
			isEnabled: true,
			state: "polling",
			intervalMs: options.intervalMs,
		});
		this.appendEvent("config", {
			details: {
				intervalMs: options.intervalMs,
				shouldAllowDirty: options.shouldAllowDirty,
				existingFeedbackMode: options.existingFeedbackMode,
			},
		});
		this.renderStatus(
			options.existingFeedbackMode === "baseline"
				? "PR watch: baselining"
				: "PR watch: checking current feedback",
		);
		const snapshot = await this.loadSnapshot(session);
		if (snapshot.type === "failed") {
			this.recordError(snapshot.message);
			return;
		}
		if (!snapshot.snapshot.data.found) {
			this.state = {
				...this.state,
				isEnabled: false,
				state: "stopped",
				lastError: "No PR found for current branch.",
			};
			notify(
				ctx,
				"No PR found for the current branch; PR feedback watch was not started.",
				"warning",
			);
			this.renderStatus();
			return;
		}

		this.updateContextFromSnapshot(snapshot.snapshot);
		await this.initializeRestBaseline(session, snapshot.snapshot);
		if (shouldDispatchExistingFeedback(options)) {
			if (await this.pauseIfWorkingTreeDirty(session)) {
				this.scheduleNextPoll(session);
				return;
			}
			await this.dispatchNewItems(session, snapshot.snapshot.items, snapshot.snapshot);
		} else {
			this.baseline(snapshot.snapshot);
			notify(
				ctx,
				`PR feedback watch started for #${snapshot.snapshot.data.target.pr_number ?? "unknown"}; existing feedback was baselined.`,
				"info",
			);
		}
		this.state = {
			...this.state,
			isEnabled: true,
			state: "active",
			mode: this.lastRestFingerprintKey === undefined ? "heavy_fallback" : "rest_fingerprint",
		};
		this.renderStatus();
		this.scheduleNextPoll(session);
	}

	async once(ctx: ExtensionContext, options: WatchCommandOptions): Promise<void> {
		const session = this.ensureSession(ctx);
		this.options = { ...options };
		await this.pollOnce(session, {
			scheduleNext: false,
			existingFeedbackMode: options.existingFeedbackMode,
		});
	}

	stop(reason: "user" | "shutdown"): void {
		this.clearTimer();
		const session = this.activeSession;
		this.state = {
			...this.state,
			isEnabled: false,
			state: "stopped",
			mode: "stopped",
			queuedCount: 0,
		};
		this.githubPrIdentity = undefined;
		this.lastRestFingerprintKey = undefined;
		this.queuedItems = [];
		if (reason === "user") this.appendEvent("stopped");
		session?.ctx.ui?.setStatus?.(PR_FEEDBACK_WATCH_COMMAND_NAME, undefined);
		this.closeActiveSession();
	}

	status(): WatchStatus {
		return {
			...this.state,
			seenCount: this.seenKeys.size,
			attemptedCount: this.attemptedKeys.size,
			queuedCount: this.queuedItems.length,
		};
	}

	async handleAgentEnd(): Promise<void> {
		if (this.queuedItems.length === 0) return;
		const completedQueuedKeys = new Set(this.queuedItems.map((item) => item.key));
		const session = this.activeSession;
		if (session === undefined || !this.isActiveSession(session)) return;
		const snapshot = await this.loadSnapshot(session);
		if (snapshot.type === "failed") {
			this.recordError(snapshot.message);
			return;
		}
		this.updateContextFromSnapshot(snapshot.snapshot);
		this.queuedItems = [];
		const newItems = this.unattemptedActionableItems(snapshot.snapshot, completedQueuedKeys);
		if (newItems.length > 0) {
			if (
				!this.options.shouldAllowDirty &&
				(await this.pauseIfWorkingTreeDirty(session, { queuedCount: 0 }))
			)
				return;
			this.hasNotifiedDirtyPause = false;
			await this.dispatchNewItems(session, newItems, snapshot.snapshot);
			return;
		}
		this.baseline(snapshot.snapshot);
		this.state = {
			...this.state,
			state: this.state.isEnabled ? "active" : "stopped",
			queuedCount: 0,
		};
		this.renderStatus();
	}

	private ensureSession(ctx: ExtensionContext): ActiveSession {
		if (
			this.activeSession !== undefined &&
			this.activeSession.ctx === ctx &&
			!this.activeSession.isClosed
		)
			return this.activeSession;
		this.activate(ctx);
		return this.activeSession as ActiveSession;
	}

	private closeActiveSession(): void {
		this.clearStatusRefreshTimer();
		const session = this.activeSession;
		if (session !== undefined) {
			session.ctx.ui?.setStatus?.(PR_FEEDBACK_WATCH_COMMAND_NAME, undefined);
			session.isClosed = true;
			session.abortController.abort();
		}
		this.activeSession = undefined;
	}

	private isActiveSession(session: ActiveSession): boolean {
		return (
			this.activeSession === session && !session.isClosed && !session.abortController.signal.aborted
		);
	}

	private async pollOnce(
		session: ActiveSession,
		options: { scheduleNext: boolean; existingFeedbackMode: ExistingFeedbackMode },
	): Promise<void> {
		if (!this.isActiveSession(session)) return;
		if (this.isPollInFlight) {
			this.isPollPending = true;
			return;
		}
		this.isPollInFlight = true;
		this.state = { ...this.state, state: "polling" };
		this.renderStatus();
		try {
			if (session.ctx.isIdle?.() === false) {
				this.state = { ...this.state, state: "paused" };
				this.renderStatus("PR watch: waiting for idle agent");
				return;
			}
			if (this.canUseRestFingerprint(options)) {
				await this.pollWithRestFingerprint(session, options);
				return;
			}
			await this.pollWithHeavySnapshot(session, options, { reason: "normal" });
		} finally {
			this.isPollInFlight = false;
			if (this.isPollPending && this.isActiveSession(session)) {
				this.isPollPending = false;
				void this.pollOnce(session, options);
			} else if (options.scheduleNext && this.state.isEnabled && this.isActiveSession(session)) {
				this.scheduleNextPoll(session);
			}
		}
	}

	private canUseRestFingerprint(options: { existingFeedbackMode: ExistingFeedbackMode }): boolean {
		return (
			options.existingFeedbackMode === "baseline" &&
			this.githubPrIdentity !== undefined &&
			this.lastRestFingerprintKey !== undefined
		);
	}

	private async initializeRestBaseline(
		session: ActiveSession,
		snapshot: FeedbackSnapshot,
	): Promise<void> {
		const identity = parseGitHubPullRequestUrl(
			snapshot.data.target.url ?? undefined,
			snapshot.data.target.pr_number ?? undefined,
		);
		this.githubPrIdentity = identity;
		this.lastRestFingerprintKey = undefined;
		if (identity === undefined) {
			this.state = { ...this.state, mode: "heavy_fallback" };
			notify(
				session.ctx,
				"PR feedback watch could not parse the GitHub PR URL; falling back to conservative polling.",
				"warning",
			);
			return;
		}
		const sinceIso = skewIso(new Date().toISOString());
		const result = await loadRestFingerprint({
			pi: this.pi,
			cwd: session.cwd,
			identity,
			...optionalEntry("sinceIso", sinceIso),
			signal: session.abortController.signal,
		});
		if (result.type === "failed") {
			this.recordRestFailure(session, result.message);
			this.state = { ...this.state, mode: "heavy_fallback" };
			return;
		}
		this.restSinceIso = sinceIso;
		this.markFingerprintItemsSeen(result.fingerprint);
		this.advanceRestFingerprint(result.fingerprint);
		await this.refreshCheckSummary(session, identity.number);
	}

	private async pollWithRestFingerprint(
		session: ActiveSession,
		options: { scheduleNext: boolean; existingFeedbackMode: ExistingFeedbackMode },
	): Promise<void> {
		const identity = this.githubPrIdentity;
		if (identity === undefined || this.lastRestFingerprintKey === undefined) {
			await this.pollWithHeavySnapshot(session, options, { reason: "normal" });
			return;
		}
		const result = await loadRestFingerprint({
			pi: this.pi,
			cwd: session.cwd,
			identity,
			...optionalEntry("sinceIso", this.restSinceIso),
			signal: session.abortController.signal,
		});
		if (result.type === "failed") {
			this.recordRestFailure(session, result.message);
			if (
				this.state.restFailures >= REST_FAILURES_BEFORE_HEAVY_FALLBACK &&
				this.canRunHeavyFallback()
			) {
				this.lastHeavyFallbackAt = Date.now();
				await this.pollWithHeavySnapshot(session, options, { reason: "fallback" });
			}
			return;
		}
		this.markRestFingerprintSuccess(result.fingerprint);
		await this.refreshCheckSummary(session, identity.number);
		if (result.fingerprint.key === this.lastRestFingerprintKey) {
			this.state = { ...this.state, state: this.state.isEnabled ? "active" : "stopped" };
			this.renderStatus();
			if (!this.state.isEnabled) notify(session.ctx, "No new PR feedback detected.", "info");
			return;
		}
		if (await this.pauseIfWorkingTreeDirty(session)) return;
		this.renderStatus("PR watch: checking changed feedback");
		await this.pollWithHeavySnapshot(session, options, {
			reason: "rest_changed",
			fingerprint: result.fingerprint,
		});
	}

	private async pollWithHeavySnapshot(
		session: ActiveSession,
		options: { scheduleNext: boolean; existingFeedbackMode: ExistingFeedbackMode },
		context: {
			reason: "normal" | "fallback" | "rest_changed";
			fingerprint?: FeedbackFingerprint;
		},
	): Promise<void> {
		if (context.reason === "fallback") this.renderStatus("PR watch: fallback polling 60s");
		const snapshotResult = await this.loadSnapshot(session);
		if (snapshotResult.type === "failed") {
			this.recordError(snapshotResult.message);
			return;
		}
		const snapshot = snapshotResult.snapshot;
		if (!snapshot.data.found) {
			this.recordError("No PR found for current branch.");
			return;
		}
		if (this.shouldRebaselineForHead(snapshot)) {
			this.updateContextFromSnapshot(snapshot);
			this.baseline(snapshot);
			if (context.fingerprint !== undefined) this.advanceRestFingerprint(context.fingerprint);
			this.state = { ...this.state, state: this.state.isEnabled ? "active" : "stopped" };
			this.renderStatus();
			notify(session.ctx, "PR head changed; refreshed feedback baseline.", "info");
			return;
		}
		this.updateContextFromSnapshot(snapshot);
		if (
			this.state.isEnabled &&
			context.reason !== "rest_changed" &&
			this.lastRestFingerprintKey === undefined
		) {
			await this.initializeRestBaseline(session, snapshot);
		}
		if (!this.state.isEnabled && options.existingFeedbackMode === "baseline") {
			this.baseline(snapshot);
			if (context.fingerprint !== undefined) this.advanceRestFingerprint(context.fingerprint);
			this.state = { ...this.state, state: "stopped" };
			this.renderStatus();
			notify(
				session.ctx,
				"No new PR feedback detected; current feedback is now baselined.",
				"info",
			);
			return;
		}
		if (context.reason !== "rest_changed" && (await this.pauseIfWorkingTreeDirty(session))) return;
		const candidateItems =
			context.fingerprint === undefined
				? snapshot.items
				: filterIgnoredFeedback(
						feedbackItemKeysFromFingerprint(context.fingerprint.items),
						currentUserLoginOptions(this.currentUserLogin),
					).actionableTriggerItems;
		const newItems =
			options.existingFeedbackMode === "dispatch"
				? candidateItems.filter((item) => !this.attemptedKeys.has(item.key))
				: candidateItems.filter(
						(item) => !this.seenKeys.has(item.key) && !this.attemptedKeys.has(item.key),
					);
		if (newItems.length === 0) {
			this.baseline(snapshot);
			if (context.fingerprint !== undefined) this.advanceRestFingerprint(context.fingerprint);
			this.state = { ...this.state, state: this.state.isEnabled ? "active" : "stopped" };
			this.renderStatus();
			if (!this.state.isEnabled) notify(session.ctx, "No new PR feedback detected.", "info");
			return;
		}
		if (context.fingerprint !== undefined) this.advanceRestFingerprint(context.fingerprint);
		await this.dispatchNewItems(session, newItems, snapshot);
	}

	private recordRestFailure(session: ActiveSession, message: string): void {
		this.state = {
			...this.state,
			state: "error",
			mode: "heavy_fallback",
			restFailures: this.state.restFailures + 1,
			lastError: message,
		};
		this.renderStatus(REST_FAILURE_STATUS);
		if (!this.hasNotifiedRestFailure) {
			this.hasNotifiedRestFailure = true;
			notify(session.ctx, `PR feedback watch REST check failed; retrying: ${message}`, "warning");
		}
	}

	private canRunHeavyFallback(): boolean {
		return Date.now() - this.lastHeavyFallbackAt >= HEAVY_FALLBACK_INTERVAL_MS;
	}

	private advanceRestFingerprint(fingerprint: FeedbackFingerprint): void {
		this.lastRestFingerprintKey = fingerprint.key;
		this.restSinceIso = skewIso(fingerprint.latestTimestamp ?? fingerprint.fetchedAt);
		this.markRestFingerprintSuccess(fingerprint);
	}

	private markRestFingerprintSuccess(fingerprint: FeedbackFingerprint): void {
		this.hasNotifiedRestFailure = false;
		this.state = clearLastError({
			...this.state,
			mode: "rest_fingerprint",
			restFailures: 0,
			lastRestPollAt: fingerprint.fetchedAt,
			lastPollAt: fingerprint.fetchedAt,
		});
	}

	private markFingerprintItemsSeen(fingerprint: FeedbackFingerprint): void {
		for (const item of feedbackItemKeysFromFingerprint(fingerprint.items))
			this.seenKeys.add(item.key);
	}

	private async refreshCheckSummary(session: ActiveSession, prNumber: number): Promise<void> {
		const result = await loadPrCheckSummary({
			pi: this.pi,
			cwd: session.cwd,
			prNumber,
			signal: session.abortController.signal,
		});
		this.state = setCheckSummary(this.state, result.type === "loaded" ? result.summary : undefined);
	}

	private async loadSnapshot(
		session: ActiveSession,
	): Promise<{ type: "loaded"; snapshot: FeedbackSnapshot } | { type: "failed"; message: string }> {
		const runner = await this.resolveRunner(session);
		if (runner.type === "failed") return runner;
		const download = await downloadPrFeedback({
			pi: this.pi,
			cwd: session.cwd,
			timeoutMs: COMMAND_TIMEOUT_MS,
			signal: session.abortController.signal,
			runner: runner.runner,
		});
		if (download.type === "error") return { type: "failed", message: download.message };
		const currentUserLoginPromise =
			this.currentUserLogin === undefined
				? loadCurrentGitHubLogin(this.pi, session.cwd, session.abortController.signal)
				: Promise.resolve(this.currentUserLogin);
		const headRefOidPromise =
			download.data.target.pr_number === undefined || download.data.target.pr_number === null
				? Promise.resolve(undefined)
				: loadHeadRefOid(
						this.pi,
						session.cwd,
						download.data.target.pr_number,
						session.abortController.signal,
					);
		const [currentUserLogin, headRefOid] = await Promise.all([
			currentUserLoginPromise,
			headRefOidPromise,
		]);
		this.currentUserLogin = currentUserLogin;
		const filtered = filterIgnoredFeedback(
			feedbackItemKeyFromDownload(download.data),
			currentUserLoginOptions(currentUserLogin),
		);
		return {
			type: "loaded",
			snapshot: {
				data: download.data,
				items: filtered.actionableTriggerItems,
				ignoredItems: filtered.ignoredItems,
				...(headRefOid === undefined ? {} : { headRefOid }),
			},
		};
	}

	private async resolveRunner(
		session: ActiveSession,
	): Promise<{ type: "resolved"; runner: PrAddressRunner } | { type: "failed"; message: string }> {
		if (this.runner !== undefined) return { type: "resolved", runner: this.runner };
		const pathSdl = await this.pi.exec("which", ["ji"], {
			cwd: session.cwd,
			timeout: GIT_TIMEOUT_MS,
			signal: session.abortController.signal,
		});
		if (!pathSdl.killed && pathSdl.code === 0 && pathSdl.stdout.trim().length > 0) {
			this.runner = { command: "ji", baseArgs: ["address"] };
			return { type: "resolved", runner: this.runner };
		}
		return {
			type: "failed",
			message: "Could not find ji. Expected `ji` on PATH (installed with `just install-tools`).",
		};
	}

	private baseline(snapshot: FeedbackSnapshot): void {
		this.headRefOid = snapshot.headRefOid;
		for (const item of [...snapshot.items, ...snapshot.ignoredItems.map((ignored) => ignored.item)])
			this.seenKeys.add(item.key);
		this.appendEvent("baseline", {
			...eventFieldsFromSnapshot(snapshot),
			itemKeys: snapshot.items.map((item) => item.key),
		});
		if (snapshot.ignoredItems.length > 0) {
			this.appendEvent("ignored", {
				...eventFieldsFromSnapshot(snapshot),
				itemKeys: snapshot.ignoredItems.map((ignored) => ignored.item.key),
			});
		}
	}

	private unattemptedActionableItems(
		snapshot: FeedbackSnapshot,
		completedQueuedKeys: ReadonlySet<string>,
	): FeedbackItemKey[] {
		return snapshot.items.filter(
			(item) => !this.attemptedKeys.has(item.key) && !completedQueuedKeys.has(item.key),
		);
	}

	private async pauseIfWorkingTreeDirty(
		session: ActiveSession,
		options: { queuedCount?: number } = {},
	): Promise<boolean> {
		const dirty = await isWorkingTreeDirty(this.pi, session.cwd, session.abortController.signal);
		if (!dirty || this.options.shouldAllowDirty) {
			this.hasNotifiedDirtyPause = false;
			return false;
		}
		const queuedCountUpdate =
			options.queuedCount === undefined ? {} : { queuedCount: options.queuedCount };
		this.state = { ...this.state, ...queuedCountUpdate, state: "paused" };
		this.renderStatus("PR watch: paused dirty tree");
		if (!this.hasNotifiedDirtyPause) {
			this.hasNotifiedDirtyPause = true;
			notify(session.ctx, "PR feedback watch paused because the working tree is dirty.", "warning");
		}
		return true;
	}

	private async dispatchNewItems(
		session: ActiveSession,
		items: readonly FeedbackItemKey[],
		snapshot: FeedbackSnapshot,
	): Promise<void> {
		if (items.length === 0) return;
		this.headRefOid = snapshot.headRefOid;
		for (const item of items) {
			this.attemptedKeys.add(item.key);
			this.seenKeys.add(item.key);
		}
		this.queuedItems = [...items];
		const itemKeys = items.map((item) => item.key);
		this.state = { ...this.state, state: "dispatching", queuedCount: items.length };
		this.appendEvent("detected", {
			...eventFieldsFromSnapshot(snapshot),
			itemKeys,
		});
		this.renderStatus(`PR watch: dispatching ${items.length} item(s)`);
		const prompt = buildDetectedFeedbackPrompt({ data: snapshot.data, items });
		if (this.pi.sendUserMessage !== undefined) {
			this.pi.sendUserMessage(prompt, { deliverAs: "followUp" });
		} else if (this.pi.sendMessage !== undefined) {
			this.pi.sendMessage(
				{
					customType: PR_FEEDBACK_WATCH_MESSAGE_TYPE,
					content: prompt,
					display: true,
					details: { itemKeys },
				},
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		} else {
			notify(
				session.ctx,
				"PR feedback watch detected new feedback, but this Pi runtime cannot inject user messages.",
				"error",
			);
			session.ctx.ui?.setEditorText?.(prompt);
		}
		this.appendEvent("dispatched", {
			...eventFieldsFromSnapshot(snapshot),
			itemKeys,
		});
	}

	private shouldRebaselineForHead(snapshot: FeedbackSnapshot): boolean {
		return (
			this.headRefOid !== undefined &&
			snapshot.headRefOid !== undefined &&
			this.headRefOid !== snapshot.headRefOid
		);
	}

	private updateContextFromSnapshot(snapshot: FeedbackSnapshot): void {
		const checkedAt = new Date().toISOString();
		const prNumber = snapshot.data.target.pr_number;
		const branch = snapshot.data.target.branch ?? snapshot.data.target.head_ref_name ?? undefined;
		this.state = clearLastError({
			...this.state,
			...(prNumber === undefined || prNumber === null ? {} : { prNumber }),
			...(branch === undefined ? {} : { branch }),
			lastPollAt: checkedAt,
			lastHeavyCheckAt: checkedAt,
			seenCount: this.seenKeys.size,
			attemptedCount: this.attemptedKeys.size,
		});
	}

	private scheduleNextPoll(session: ActiveSession): void {
		this.clearTimer();
		this.timer = this.timers.setTimeout(() => {
			this.timer = undefined;
			void this.pollOnce(session, { scheduleNext: true, existingFeedbackMode: "baseline" });
		}, this.nextPollDelayMs());
	}

	private nextPollDelayMs(): number {
		return this.githubPrIdentity === undefined || this.lastRestFingerprintKey === undefined
			? HEAVY_FALLBACK_INTERVAL_MS
			: this.options.intervalMs;
	}

	private clearTimer(): void {
		this.timer?.cancel();
		this.timer = undefined;
	}

	private updateStatusRefreshTimer(shouldAllowRefresh: boolean): void {
		if (!shouldAllowRefresh || !shouldRefreshStatusAge(this.status())) {
			this.clearStatusRefreshTimer();
			return;
		}
		if (this.statusRefreshTimer !== undefined) return;
		this.statusRefreshTimer = this.timers.setInterval(() => {
			const ctx = this.activeSession?.ctx;
			if (ctx === undefined || !shouldRefreshStatusAge(this.status())) {
				this.clearStatusRefreshTimer();
				return;
			}
			ctx.ui?.setStatus?.(PR_FEEDBACK_WATCH_COMMAND_NAME, defaultStatusLine(this.status()));
		}, STATUS_REFRESH_INTERVAL_MS);
	}

	private clearStatusRefreshTimer(): void {
		this.statusRefreshTimer?.cancel();
		this.statusRefreshTimer = undefined;
	}

	private restoreState(ctx: ExtensionContext): void {
		const entries = ctx.sessionManager?.getBranch?.() ?? ctx.sessionManager?.getEntries?.() ?? [];
		this.seenKeys = new Set<string>();
		this.attemptedKeys = new Set<string>();
		for (const entry of entries) {
			if (entry.type !== "custom" || entry.customType !== PR_FEEDBACK_WATCH_STATE_TYPE) continue;
			const event = parseWatchEventEntry(entry.data);
			if (event === undefined || event.itemKeys === undefined) continue;
			if (event.type === "baseline" || event.type === "ignored") {
				for (const key of event.itemKeys) this.seenKeys.add(key);
			}
			if (event.type === "dispatched") {
				for (const key of event.itemKeys) {
					this.seenKeys.add(key);
					this.attemptedKeys.add(key);
				}
			}
		}
	}

	private appendEvent(type: WatchEventEntry["type"], overrides: WatchEventAppendInput = {}): void {
		this.pi.appendEntry?.(PR_FEEDBACK_WATCH_STATE_TYPE, {
			version: 1,
			type,
			...(this.state.branch === undefined ? {} : { branch: this.state.branch }),
			...(this.state.prNumber === undefined ? {} : { prNumber: this.state.prNumber }),
			createdAt: new Date().toISOString(),
			...overrides,
		} satisfies WatchEventEntry);
	}

	private recordError(message: string): void {
		this.state = { ...this.state, state: "error", lastError: message };
		this.appendEvent("error", { details: { message } });
		this.renderStatus("PR watch: error; see notification");
		const ctx = this.activeSession?.ctx;
		if (ctx !== undefined) notify(ctx, `PR feedback watch error: ${message}`, "error");
	}

	private renderStatus(value?: string): void {
		const ctx = this.activeSession?.ctx;
		if (ctx === undefined) return;
		ctx.ui?.setStatus?.(PR_FEEDBACK_WATCH_COMMAND_NAME, value ?? defaultStatusLine(this.status()));
		this.updateStatusRefreshTimer(value === undefined);
	}
}

function clearLastError(status: WatchStatus): WatchStatus {
	const { lastError, ...rest } = status;
	void lastError;
	return rest;
}

function setCheckSummary(status: WatchStatus, summary: PrCheckSummary | undefined): WatchStatus {
	if (summary === undefined) {
		const { checkSummary, ...rest } = status;
		void checkSummary;
		return rest;
	}
	return { ...status, checkSummary: summary };
}

function currentUserLoginOptions(currentUserLogin: string | undefined): {
	currentUserLogin?: string;
} {
	return currentUserLogin === undefined ? {} : { currentUserLogin };
}

function eventFieldsFromSnapshot(snapshot: FeedbackSnapshot): WatchEventAppendInput {
	const branch = snapshot.data.target.branch ?? undefined;
	const prNumber = snapshot.data.target.pr_number;
	return {
		...(branch === undefined ? {} : { branch }),
		...(prNumber === undefined || prNumber === null ? {} : { prNumber }),
		...(snapshot.headRefOid === undefined ? {} : { headRefOid: snapshot.headRefOid }),
	};
}
