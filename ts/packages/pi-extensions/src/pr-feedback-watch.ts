import { accessSync, constants } from "node:fs";
import { join } from "node:path";

import { githubPrIdentityFromUrl, type GithubPrIdentity as CoreGithubPrIdentity } from "@asdl/core/github-status";
import { formatElapsedMs } from "@asdl/core/time-format";
import { isRecord, stringField } from "./cmux/primitives.ts";
import { parseMachineEnvelopeData } from "./machine-envelope.ts";
import type { SendMessageOptions, SendUserMessageOptions } from "./message-delivery.ts";
import { definePiSurfaceParity } from "./parity.ts";

export const PR_FEEDBACK_WATCH_COMMAND_NAME = "code:pr-feedback-watch";

export const prFeedbackWatchParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: PR_FEEDBACK_WATCH_COMMAND_NAME,
		workflow: "Watch the current branch PR for new feedback and dispatch constrained pr-address runs",
		parity: "WAIVED",
		fallback: "Use the pr-address skill/CLI manually when PR feedback is detected or requested outside Pi.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "pr-feedback-watch",
		notes: "Pi owns opt-in live polling and prompt injection; pr-address owns the portable feedback normalization and mutation workflow.",
	},
] as const);
export const PR_FEEDBACK_WATCH_MESSAGE_TYPE = "code-pr-feedback-watch";
export const PR_FEEDBACK_WATCH_STATE_TYPE = "code-pr-feedback-watch-state";

const DEFAULT_INTERVAL_MS = 15_000;
const MIN_INTERVAL_MS = 10_000;
const HEAVY_FALLBACK_INTERVAL_MS = 60_000;
const STATUS_REFRESH_INTERVAL_MS = 1_000;
const REST_FINGERPRINT_SKEW_MS = 2_000;
const REST_FAILURES_BEFORE_HEAVY_FALLBACK = 3;
const REST_FAILURE_STATUS = "PR watch: REST check failed; retrying";
const COMMAND_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 5_000;
const TOP_LEVEL_BOT_DISCUSSION_AUTHORS = new Set(["vercel[bot]"]);

type WatchCommandAction = "toggle" | "start" | "stop" | "status" | "once";
type ExistingFeedbackMode = "dispatch" | "baseline";
type FeedbackItemKind = "download" | "review" | "thread_comment" | "discussion_comment";
type FeedbackFingerprintItemKind = "discussion_comment" | "review" | "review_comment";
type WatchMode = "rest_fingerprint" | "heavy_fallback" | "stopped";
type IgnoredFeedbackReason = "current_user" | "status_bot";

type WatchCommandParseResult =
	| { type: "valid"; action: WatchCommandAction; options: WatchCommandOptions }
	| { type: "invalid"; message: string };

export interface WatchCommandOptions {
	intervalMs: number;
	shouldAllowDirty: boolean;
	existingFeedbackMode: ExistingFeedbackMode;
}

export interface FeedbackItemKey {
	kind: FeedbackItemKind;
	key: string;
	author: string | undefined;
	path?: string | undefined;
	line?: number | undefined;
	jsonPointer?: string | undefined;
	itemPointer?: string | undefined;
}

export interface IgnoredFeedbackItem {
	item: FeedbackItemKey;
	reason: IgnoredFeedbackReason;
}

export interface GithubPrIdentity extends CoreGithubPrIdentity {
	url?: string | undefined;
}

export interface FeedbackFingerprintItem {
	kind: FeedbackFingerprintItemKind;
	id: string;
	updatedAt?: string | undefined;
	author?: string | undefined;
	path?: string | undefined;
	line?: number | undefined;
	state?: string | undefined;
	commitId?: string | undefined;
	reviewId?: string | undefined;
	inReplyToId?: string | undefined;
}

export interface FeedbackFingerprint {
	key: string;
	items: FeedbackFingerprintItem[];
	latestTimestamp?: string | undefined;
	fetchedAt: string;
}

export interface FilteredFeedbackItems {
	actionableTriggerItems: FeedbackItemKey[];
	ignoredItems: IgnoredFeedbackItem[];
}

export interface DownloadFeedbackData {
	found: boolean;
	target: {
		pr_number?: number | null | undefined;
		branch?: string | null | undefined;
		title?: string | null | undefined;
		url?: string | null | undefined;
		head_ref_name?: string | null | undefined;
		base_ref_name?: string | null | undefined;
	};
	counts: {
		included_review_threads: number;
		included_reviews: number;
		included_discussion_comments: number;
	};
	markdown: string;
}

interface DownloadFeedbackDataParseInvalid {
	type: "invalid";
	message: string;
}

type DownloadFeedbackDataParseResult = { type: "valid"; data: DownloadFeedbackData } | DownloadFeedbackDataParseInvalid;

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

interface ExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

interface LoadRestFingerprintOptions {
	pi: ExecGateway;
	cwd: string;
	identity: GithubPrIdentity;
	sinceIso?: string | undefined;
	signal?: AbortSignal | undefined;
}

interface LoadPrCheckSummaryOptions {
	pi: ExecGateway;
	cwd: string;
	prNumber: number;
	signal?: AbortSignal | undefined;
}

interface GhApiJsonOptions {
	pi: ExecGateway;
	cwd: string;
	endpoint: string;
	jq: string;
	signal?: AbortSignal | undefined;
}

interface GhJsonCommandOptions {
	pi: ExecGateway;
	cwd: string;
	args: string[];
	label: string;
	signal?: AbortSignal | undefined;
	shouldAllowNonZeroWithStdout?: boolean | undefined;
}

type GhJsonCommandResult = { type: "loaded"; value: unknown } | { type: "failed"; message: string };

type GhApiJsonResult = GhJsonCommandResult;

interface CustomMessage {
	customType: string;
	content: string;
	display: boolean;
	details?: unknown;
}

export interface ExtensionContext {
	cwd: string;
	hasUI?: boolean;
	ui?: {
		notify?(message: string, level?: "info" | "warning" | "error"): void;
		setStatus?(key: string, value: string | undefined): void;
		setEditorText?(text: string): void;
	};
	waitForIdle?(): Promise<void>;
	isIdle?(): boolean;
	sessionManager?: {
		getBranch?(): readonly SessionEntry[];
		getEntries?(): readonly SessionEntry[];
	};
}

interface SessionEntry {
	type: string;
	customType?: string;
	data?: unknown;
}

interface RegisteredCommand {
	description?: string;
	handler(args: string, ctx: ExtensionContext): Promise<void> | void;
}

export interface ExtensionAPI {
	registerCommand(name: string, options: RegisteredCommand): void;
	on(event: "session_start", handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void): void;
	on(event: "agent_end" | "session_shutdown", handler: () => Promise<void> | void): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	sendUserMessage?(content: string, options?: SendUserMessageOptions): void;
	sendMessage?(message: CustomMessage, options?: SendMessageOptions): void;
	appendEntry?(customType: string, data?: unknown): void;
}

type ExecGateway = Pick<ExtensionAPI, "exec">;

export interface PrAddressRunner {
	command: string;
	baseArgs: string[];
}

export interface PrFeedbackWatchExtensionOptions {
	runner?: PrAddressRunner;
	minimumIntervalMs?: number;
}

interface ActiveSession {
	id: number;
	ctx: ExtensionContext;
	cwd: string;
	abortController: AbortController;
	harnessSessionId: string;
	isClosed: boolean;
}

interface FeedbackSnapshot {
	data: DownloadFeedbackData;
	items: FeedbackItemKey[];
	ignoredItems: IgnoredFeedbackItem[];
	headRefOid?: string | undefined;
}

interface WatchStatus {
	isEnabled: boolean;
	state: "stopped" | "active" | "polling" | "paused" | "dispatching" | "error";
	mode: WatchMode;
	prNumber?: number | undefined;
	branch?: string | undefined;
	intervalMs: number;
	seenCount: number;
	attemptedCount: number;
	queuedCount: number;
	lastPollAt?: string | undefined;
	lastRestPollAt?: string | undefined;
	lastHeavyCheckAt?: string | undefined;
	checkSummary?: PrCheckSummary | undefined;
	restFailures: number;
	lastError?: string | undefined;
}

interface PrCheckSummary {
	totalCount: number;
	pendingCount: number;
	passCount: number;
	failCount: number;
}

interface WatchEventEntry {
	version: 1;
	type: "baseline" | "detected" | "dispatched" | "ignored" | "stopped" | "config" | "error";
	branch: string | undefined;
	prNumber: number | undefined;
	headRefOid?: string | undefined;
	itemKeys?: string[] | undefined;
	createdAt: string;
	details?: Record<string, unknown> | undefined;
}

interface DispatchPromptInput {
	data: DownloadFeedbackData;
	items: readonly FeedbackItemKey[];
}

export default function prFeedbackWatchExtension(pi: ExtensionAPI, options: PrFeedbackWatchExtensionOptions = {}): void {
	const controller = new PrFeedbackWatchController(pi, options);

	pi.registerCommand(PR_FEEDBACK_WATCH_COMMAND_NAME, {
		description: "Watch the current branch PR for feedback; bare command starts with existing feedback or toggles off when active.",
		handler: async (rawArgs, ctx) => {
			const parsed = parseWatchCommandArgs(rawArgs, options.minimumIntervalMs ?? MIN_INTERVAL_MS);
			if (parsed.type === "invalid") {
				notify(ctx, parsed.message, "error");
				return;
			}

			switch (parsed.action) {
				case "toggle":
					if (controller.status().isEnabled) {
						controller.stop("user");
						notify(ctx, "PR feedback watch stopped.", "info");
						return;
					}
					await ctx.waitForIdle?.();
					await controller.start(ctx, parsed.options);
					return;
				case "start":
					await ctx.waitForIdle?.();
					await controller.start(ctx, parsed.options);
					return;
				case "once":
					await ctx.waitForIdle?.();
					await controller.once(ctx, parsed.options);
					return;
				case "stop":
					controller.stop("user");
					notify(ctx, "PR feedback watch stopped.", "info");
					return;
				case "status":
					notify(ctx, formatWatchStatus(controller.status()), "info");
					return;
				default: {
					const exhaustive: never = parsed.action;
					return exhaustive;
				}
			}
		},
	});

	pi.on("session_start", (_event, ctx) => {
		controller.activate(ctx);
	});
	pi.on("agent_end", () => controller.handleAgentEnd());
	pi.on("session_shutdown", () => {
		controller.stop("shutdown");
	});
}

export function parseWatchCommandArgs(rawArgs: string, minimumIntervalMs = MIN_INTERVAL_MS): WatchCommandParseResult {
	const tokens = rawArgs.trim().length === 0 ? [] : rawArgs.trim().split(/\s+/);
	const explicitActionToken = tokens[0];
	const hasExplicitAction = explicitActionToken !== undefined && !explicitActionToken.startsWith("--");
	const actionToken = tokens.length === 0 ? "toggle" : hasExplicitAction ? explicitActionToken : "start";
	if (!isWatchCommandAction(actionToken)) {
		return { type: "invalid", message: `Unknown pr-feedback-watch action: ${actionToken}` };
	}
	if ((actionToken === "stop" || actionToken === "status") && tokens.length > 1) {
		return { type: "invalid", message: `${actionToken} does not accept options.` };
	}

	const options: WatchCommandOptions = {
		intervalMs: DEFAULT_INTERVAL_MS,
		shouldAllowDirty: true,
		existingFeedbackMode: "dispatch",
	};
	let hasDispatchExistingFlag = false;
	let hasBaselineExistingFlag = false;

	const optionStartIndex = hasExplicitAction ? 1 : 0;
	for (let index = optionStartIndex; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === "--allow-dirty") {
			options.shouldAllowDirty = true;
			continue;
		}
		if (token === "--pause-on-dirty") {
			options.shouldAllowDirty = false;
			continue;
		}
		if (token === "--dispatch-existing") {
			hasDispatchExistingFlag = true;
			options.existingFeedbackMode = "dispatch";
			continue;
		}
		if (token === "--baseline-existing") {
			hasBaselineExistingFlag = true;
			options.existingFeedbackMode = "baseline";
			continue;
		}
		if (token === "--interval-seconds") {
			const value = tokens[index + 1];
			if (value === undefined) return { type: "invalid", message: "--interval-seconds requires a value." };
			const seconds = Number(value);
			if (!Number.isInteger(seconds) || seconds <= 0) {
				return { type: "invalid", message: "--interval-seconds must be a positive integer." };
			}
			const intervalMs = seconds * 1_000;
			if (intervalMs < minimumIntervalMs) {
				return { type: "invalid", message: `--interval-seconds must be at least ${minimumIntervalMs / 1_000}.` };
			}
			options.intervalMs = intervalMs;
			index += 1;
			continue;
		}
		return { type: "invalid", message: `Unknown pr-feedback-watch option: ${token}` };
	}
	if (hasDispatchExistingFlag && hasBaselineExistingFlag) {
		return { type: "invalid", message: "--dispatch-existing and --baseline-existing cannot be used together." };
	}

	return { type: "valid", action: actionToken, options };
}

export function parseDownloadFeedbackData(value: unknown): DownloadFeedbackDataParseResult {
	if (!isRecord(value)) return { type: "invalid", message: "download-feedback data was not an object." };
	const found = booleanField(value, "found");
	if (found === undefined) return { type: "invalid", message: "download-feedback data missing boolean found." };
	if (!isRecord(value.target)) return { type: "invalid", message: "download-feedback data missing target." };
	if (!isRecord(value.counts)) return { type: "invalid", message: "download-feedback data missing counts." };
	const markdown = stringField(value, "markdown");
	if (markdown === undefined) return { type: "invalid", message: "download-feedback data missing markdown." };
	for (const key of ["included_review_threads", "included_reviews", "included_discussion_comments"]) {
		if (numberField(value.counts, key) === undefined) return { type: "invalid", message: `download-feedback data missing numeric counts.${key}.` };
	}
	return {
		type: "valid",
		data: {
			found,
			target: {
				pr_number: numberField(value.target, "pr_number") ?? null,
				branch: stringField(value.target, "branch") ?? null,
				title: stringField(value.target, "title") ?? null,
				url: stringField(value.target, "url") ?? null,
				head_ref_name: stringField(value.target, "head_ref_name") ?? null,
				base_ref_name: stringField(value.target, "base_ref_name") ?? null,
			},
			counts: {
				included_review_threads: requiredNumberField(value.counts, "included_review_threads"),
				included_reviews: requiredNumberField(value.counts, "included_reviews"),
				included_discussion_comments: requiredNumberField(value.counts, "included_discussion_comments"),
			},
			markdown,
		},
	};
}

export function feedbackItemKeyFromDownload(data: DownloadFeedbackData): FeedbackItemKey[] {
	if (!data.found) return [];
	const prNumber = data.target.pr_number ?? "unknown";
	const total = data.counts.included_review_threads + data.counts.included_reviews + data.counts.included_discussion_comments;
	if (total === 0) return [];
	return [{ kind: "download", key: `download-feedback:${prNumber}:${total}`, author: undefined }];
}

export function feedbackItemKeysFromFingerprint(items: readonly FeedbackFingerprintItem[]): FeedbackItemKey[] {
	return items.map((item) => ({
		kind: item.kind === "review_comment" ? "thread_comment" : item.kind,
		key: `${item.kind}:${item.id}:${item.updatedAt ?? ""}`,
		author: item.author,
		path: item.path,
		line: item.line,
	}));
}

export function parseGitHubPullRequestUrl(url: string | undefined, fallbackNumber: number | undefined): GithubPrIdentity | undefined {
	if (url === undefined) return undefined;
	const identity = githubPrIdentityFromUrl(url, fallbackNumber);
	return identity === undefined ? undefined : { ...identity, url };
}

export function parseDiscussionCommentFingerprint(value: unknown): FeedbackFingerprintItem[] {
	if (!Array.isArray(value)) return [];
	const items: FeedbackFingerprintItem[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const id = idField(item, "id");
		if (id === undefined) continue;
		items.push({
			kind: "discussion_comment",
			id,
			updatedAt: stringField(item, "updated_at") ?? stringField(item, "created_at"),
			author: authorFromValue(item),
		});
	}
	return items;
}

export function parseReviewFingerprint(value: unknown): FeedbackFingerprintItem[] {
	if (!Array.isArray(value)) return [];
	const items: FeedbackFingerprintItem[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const id = idField(item, "id") ?? stringField(item, "node_id");
		if (id === undefined) continue;
		items.push({
			kind: "review",
			id,
			updatedAt: stringField(item, "submitted_at"),
			author: authorFromValue(item),
			state: stringField(item, "state"),
			commitId: stringField(item, "commit_id"),
		});
	}
	return items;
}

export function parseReviewCommentFingerprint(value: unknown): FeedbackFingerprintItem[] {
	if (!Array.isArray(value)) return [];
	const items: FeedbackFingerprintItem[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const id = idField(item, "id");
		if (id === undefined) continue;
		items.push({
			kind: "review_comment",
			id,
			updatedAt: stringField(item, "updated_at") ?? stringField(item, "created_at"),
			author: authorFromValue(item),
			path: stringField(item, "path"),
			line: numberField(item, "line"),
			reviewId: idField(item, "pull_request_review_id"),
			inReplyToId: idField(item, "in_reply_to_id"),
		});
	}
	return items;
}

export function buildFeedbackFingerprint(items: readonly FeedbackFingerprintItem[], fetchedAt = new Date().toISOString()): FeedbackFingerprint {
	const copied = [...items];
	return {
		key: fingerprintKeyFromOwnedItems(copied),
		items: copied,
		latestTimestamp: maxFingerprintTimestamp(copied),
		fetchedAt,
	};
}

export function fingerprintKeyFromItems(items: readonly FeedbackFingerprintItem[]): string {
	return fingerprintKeyFromOwnedItems([...items]);
}

function fingerprintKeyFromOwnedItems(items: FeedbackFingerprintItem[]): string {
	return items
		.sort(compareFingerprintItems)
		.map((item) => [
			item.kind,
			item.id,
			item.updatedAt ?? "",
			item.author ?? "",
			item.path ?? "",
			item.line === undefined ? "" : String(item.line),
			item.state ?? "",
			item.commitId ?? "",
			item.reviewId ?? "",
			item.inReplyToId ?? "",
		].join(":"))
		.join("\n");
}

export function maxFingerprintTimestamp(items: readonly FeedbackFingerprintItem[]): string | undefined {
	let latest: string | undefined;
	for (const item of items) {
		if (item.updatedAt === undefined) continue;
		if (latest === undefined || item.updatedAt > latest) latest = item.updatedAt;
	}
	return latest;
}

export function filterIgnoredFeedback(
	items: readonly FeedbackItemKey[],
	options: { currentUserLogin?: string | undefined } = {},
): FilteredFeedbackItems {
	const actionableTriggerItems: FeedbackItemKey[] = [];
	const ignoredItems: IgnoredFeedbackItem[] = [];
	for (const item of items) {
		if (options.currentUserLogin !== undefined && item.author === options.currentUserLogin) {
			ignoredItems.push({ item, reason: "current_user" });
			continue;
		}
		if (item.kind === "discussion_comment" && item.author !== undefined && TOP_LEVEL_BOT_DISCUSSION_AUTHORS.has(item.author)) {
			ignoredItems.push({ item, reason: "status_bot" });
			continue;
		}
		actionableTriggerItems.push(item);
	}
	return { actionableTriggerItems, ignoredItems };
}

export function buildDetectedFeedbackPrompt(input: DispatchPromptInput): string {
	const data = input.data;
	const lines = [
		"Automated PR feedback watch trigger.",
		"",
		"New PR feedback arrived for the current branch's PR.",
		"",
		`PR: #${data.target.pr_number ?? "unknown"} ${data.target.title ?? "(untitled)"}`,
		`URL: ${data.target.url ?? "(unknown)"}`,
		`Branch: ${data.target.branch ?? data.target.head_ref_name ?? "(unknown)"}`,
		"Detected feedback change keys:",
	];
	for (const item of input.items) {
		const location = item.path === undefined ? "" : ` path=${item.path}${item.line === undefined ? "" : `:${item.line}`}`;
		lines.push(`- ${item.kind}/${item.key} author=${item.author ?? "(unknown)"}${location}`);
	}
	lines.push(
		"",
		"Downloaded feedback Markdown:",
		"",
		data.markdown,
		"",
		"Instructions:",
		"- Triage the downloaded feedback above and propose a focused plan before editing.",
		"- Do not push, submit, create branches, resolve threads, or reply on GitHub unless the human explicitly asks.",
		"- Ask before cross-cutting, complex, ambiguous, or dirty-tree work.",
		"- Run appropriate tests before committing.",
	);
	return lines.join("\n");
}

class PrFeedbackWatchController {
	private readonly pi: ExtensionAPI;
	private activeSession: ActiveSession | undefined;
	private nextSessionId = 0;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private statusRefreshTimer: ReturnType<typeof setInterval> | undefined;
	private isPollInFlight = false;
	private isPollPending = false;
	private state: WatchStatus = initialWatchStatus();
	private options: WatchCommandOptions = { intervalMs: DEFAULT_INTERVAL_MS, shouldAllowDirty: true, existingFeedbackMode: "dispatch" };
	private seenKeys = new Set<string>();
	private attemptedKeys = new Set<string>();
	private queuedItems: FeedbackItemKey[] = [];
	private currentUserLogin: string | undefined;
	private hasNotifiedDirtyPause = false;
	private hasNotifiedRestFailure = false;
	private headRefOid: string | undefined;
	private githubPrIdentity: GithubPrIdentity | undefined;
	private lastRestFingerprintKey: string | undefined;
	private restSinceIso: string | undefined;
	private lastHeavyFallbackAt = 0;
	private runner: PrAddressRunner | undefined;

	constructor(pi: ExtensionAPI, options: PrFeedbackWatchExtensionOptions) {
		this.pi = pi;
		this.runner = options.runner;
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
		this.state = { ...this.state, isEnabled: true, state: "polling", intervalMs: options.intervalMs, lastError: undefined };
		this.appendEvent("config", { details: { intervalMs: options.intervalMs, shouldAllowDirty: options.shouldAllowDirty, existingFeedbackMode: options.existingFeedbackMode } });
		this.renderStatus(options.existingFeedbackMode === "baseline" ? "PR watch: baselining" : "PR watch: checking current feedback");
		const snapshot = await this.loadSnapshot(session);
		if (snapshot.type === "failed") {
			this.recordError(snapshot.message);
			return;
		}
		if (!snapshot.snapshot.data.found) {
			this.state = { ...this.state, isEnabled: false, state: "stopped", lastError: "No PR found for current branch." };
			notify(ctx, "No PR found for the current branch; PR feedback watch was not started.", "warning");
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
			notify(ctx, `PR feedback watch started for #${snapshot.snapshot.data.target.pr_number ?? "unknown"}; existing feedback was baselined.`, "info");
		}
		this.state = { ...this.state, isEnabled: true, state: "active", mode: this.lastRestFingerprintKey === undefined ? "heavy_fallback" : "rest_fingerprint" };
		this.renderStatus();
		this.scheduleNextPoll(session);
	}

	async once(ctx: ExtensionContext, options: WatchCommandOptions): Promise<void> {
		const session = this.ensureSession(ctx);
		this.options = { ...options };
		await this.pollOnce(session, { scheduleNext: false, existingFeedbackMode: options.existingFeedbackMode });
	}

	stop(reason: "user" | "shutdown"): void {
		this.clearTimer();
		const session = this.activeSession;
		this.state = { ...this.state, isEnabled: false, state: "stopped", mode: "stopped", queuedCount: 0 };
		this.githubPrIdentity = undefined;
		this.lastRestFingerprintKey = undefined;
		this.queuedItems = [];
		if (reason === "user") this.appendEvent("stopped");
		session?.ctx.ui?.setStatus?.(PR_FEEDBACK_WATCH_COMMAND_NAME, undefined);
		this.closeActiveSession();
	}

	status(): WatchStatus {
		return { ...this.state, seenCount: this.seenKeys.size, attemptedCount: this.attemptedKeys.size, queuedCount: this.queuedItems.length };
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
			if (!this.options.shouldAllowDirty && await this.pauseIfWorkingTreeDirty(session, { queuedCount: 0 })) return;
			this.hasNotifiedDirtyPause = false;
			await this.dispatchNewItems(session, newItems, snapshot.snapshot);
			return;
		}
		this.baseline(snapshot.snapshot);
		this.state = { ...this.state, state: this.state.isEnabled ? "active" : "stopped", queuedCount: 0 };
		this.renderStatus();
	}

	private ensureSession(ctx: ExtensionContext): ActiveSession {
		if (this.activeSession !== undefined && this.activeSession.ctx === ctx && !this.activeSession.isClosed) return this.activeSession;
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
		return this.activeSession === session && !session.isClosed && !session.abortController.signal.aborted;
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
		return options.existingFeedbackMode === "baseline" && this.githubPrIdentity !== undefined && this.lastRestFingerprintKey !== undefined;
	}

	private async initializeRestBaseline(session: ActiveSession, snapshot: FeedbackSnapshot): Promise<void> {
		const identity = parseGitHubPullRequestUrl(snapshot.data.target.url ?? undefined, snapshot.data.target.pr_number ?? undefined);
		this.githubPrIdentity = identity;
		this.lastRestFingerprintKey = undefined;
		if (identity === undefined) {
			this.state = { ...this.state, mode: "heavy_fallback" };
			notify(session.ctx, "PR feedback watch could not parse the GitHub PR URL; falling back to conservative polling.", "warning");
			return;
		}
		const sinceIso = skewIso(new Date().toISOString());
		const result = await loadRestFingerprint({ pi: this.pi, cwd: session.cwd, identity, sinceIso, signal: session.abortController.signal });
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

	private async pollWithRestFingerprint(session: ActiveSession, options: { scheduleNext: boolean; existingFeedbackMode: ExistingFeedbackMode }): Promise<void> {
		const identity = this.githubPrIdentity;
		if (identity === undefined || this.lastRestFingerprintKey === undefined) {
			await this.pollWithHeavySnapshot(session, options, { reason: "normal" });
			return;
		}
		const result = await loadRestFingerprint({ pi: this.pi, cwd: session.cwd, identity, sinceIso: this.restSinceIso, signal: session.abortController.signal });
		if (result.type === "failed") {
			this.recordRestFailure(session, result.message);
			if (this.state.restFailures >= REST_FAILURES_BEFORE_HEAVY_FALLBACK && this.canRunHeavyFallback()) {
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
		await this.pollWithHeavySnapshot(session, options, { reason: "rest_changed", fingerprint: result.fingerprint });
	}

	private async pollWithHeavySnapshot(
		session: ActiveSession,
		options: { scheduleNext: boolean; existingFeedbackMode: ExistingFeedbackMode },
		context: { reason: "normal" | "fallback" | "rest_changed"; fingerprint?: FeedbackFingerprint | undefined },
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
		if (this.state.isEnabled && context.reason !== "rest_changed" && this.lastRestFingerprintKey === undefined) {
			await this.initializeRestBaseline(session, snapshot);
		}
		if (!this.state.isEnabled && options.existingFeedbackMode === "baseline") {
			this.baseline(snapshot);
			if (context.fingerprint !== undefined) this.advanceRestFingerprint(context.fingerprint);
			this.state = { ...this.state, state: "stopped" };
			this.renderStatus();
			notify(session.ctx, "No new PR feedback detected; current feedback is now baselined.", "info");
			return;
		}
		if (context.reason !== "rest_changed" && await this.pauseIfWorkingTreeDirty(session)) return;
		const candidateItems = context.fingerprint === undefined ? snapshot.items : filterIgnoredFeedback(feedbackItemKeysFromFingerprint(context.fingerprint.items), { currentUserLogin: this.currentUserLogin }).actionableTriggerItems;
		const newItems = options.existingFeedbackMode === "dispatch"
			? candidateItems.filter((item) => !this.attemptedKeys.has(item.key))
			: candidateItems.filter((item) => !this.seenKeys.has(item.key) && !this.attemptedKeys.has(item.key));
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
		this.state = {
			...this.state,
			mode: "rest_fingerprint",
			restFailures: 0,
			lastRestPollAt: fingerprint.fetchedAt,
			lastPollAt: fingerprint.fetchedAt,
			lastError: undefined,
		};
	}

	private markFingerprintItemsSeen(fingerprint: FeedbackFingerprint): void {
		for (const item of feedbackItemKeysFromFingerprint(fingerprint.items)) this.seenKeys.add(item.key);
	}

	private async refreshCheckSummary(session: ActiveSession, prNumber: number): Promise<void> {
		const result = await loadPrCheckSummary({ pi: this.pi, cwd: session.cwd, prNumber, signal: session.abortController.signal });
		this.state = { ...this.state, checkSummary: result.type === "loaded" ? result.summary : undefined };
	}

	private async loadSnapshot(session: ActiveSession): Promise<{ type: "loaded"; snapshot: FeedbackSnapshot } | { type: "failed"; message: string }> {
		const runner = await this.resolveRunner(session);
		if (runner.type === "failed") return runner;
		const result = await this.pi.exec(
			runner.runner.command,
			[...runner.runner.baseArgs, "exec", "download-feedback", "--format", "json"],
			{ cwd: session.cwd, timeout: COMMAND_TIMEOUT_MS, signal: session.abortController.signal },
		);
		if (result.killed || result.code !== 0) {
			return { type: "failed", message: `download-feedback failed: ${result.stderr.trim() || `exit code ${result.code}`}` };
		}
		const parsed = parseMachineEnvelopeData(result.stdout, { label: "pr-address download-feedback JSON", stdoutTail: { maxChars: 1_000 } });
		if (parsed.type !== "valid") return { type: "failed", message: parsed.message };
		const dataResult = parseDownloadFeedbackData(parsed.data);
		if (dataResult.type === "invalid") return { type: "failed", message: dataResult.message };
		const currentUserLoginPromise = this.currentUserLogin === undefined
			? loadCurrentGitHubLogin(this.pi, session.cwd, session.abortController.signal)
			: Promise.resolve(this.currentUserLogin);
		const headRefOidPromise = dataResult.data.target.pr_number === undefined || dataResult.data.target.pr_number === null
			? Promise.resolve(undefined)
			: loadHeadRefOid(this.pi, session.cwd, dataResult.data.target.pr_number, session.abortController.signal);
		const [currentUserLogin, headRefOid] = await Promise.all([currentUserLoginPromise, headRefOidPromise]);
		this.currentUserLogin = currentUserLogin;
		const filtered = filterIgnoredFeedback(feedbackItemKeyFromDownload(dataResult.data), { currentUserLogin });
		return {
			type: "loaded",
			snapshot: {
				data: dataResult.data,
				items: filtered.actionableTriggerItems,
				ignoredItems: filtered.ignoredItems,
				headRefOid,
			},
		};
	}

	private async resolveRunner(session: ActiveSession): Promise<{ type: "resolved"; runner: PrAddressRunner } | { type: "failed"; message: string }> {
		if (this.runner !== undefined) return { type: "resolved", runner: this.runner };
		const pathPrAddress = await this.pi.exec("which", ["pr-address"], { cwd: session.cwd, timeout: GIT_TIMEOUT_MS, signal: session.abortController.signal });
		if (!pathPrAddress.killed && pathPrAddress.code === 0 && pathPrAddress.stdout.trim().length > 0) {
			this.runner = { command: "pr-address", baseArgs: [] };
			return { type: "resolved", runner: this.runner };
		}
		const repoRoot = await resolveRepoRoot(this.pi, session.cwd, session.abortController.signal);
		const checkoutCli = repoRoot === undefined ? undefined : join(repoRoot, "ts", "packages", "pr-address", "src", "cli.ts");
		if (checkoutCli !== undefined && pathExists(checkoutCli)) {
			this.runner = { command: "node", baseArgs: [checkoutCli] };
			return { type: "resolved", runner: this.runner };
		}
		return { type: "failed", message: "Could not find pr-address. Expected `pr-address` on PATH (installed with `just install-pr-address`) or an asdl checkout containing ts/packages/pr-address/src/cli.ts." };
	}

	private baseline(snapshot: FeedbackSnapshot): void {
		this.headRefOid = snapshot.headRefOid;
		for (const item of [...snapshot.items, ...snapshot.ignoredItems.map((ignored) => ignored.item)]) this.seenKeys.add(item.key);
		this.appendEvent("baseline", {
			branch: snapshot.data.target.branch ?? undefined,
			prNumber: snapshot.data.target.pr_number ?? undefined,
			headRefOid: snapshot.headRefOid,
			itemKeys: snapshot.items.map((item) => item.key),
		});
		if (snapshot.ignoredItems.length > 0) {
			this.appendEvent("ignored", {
				branch: snapshot.data.target.branch ?? undefined,
				prNumber: snapshot.data.target.pr_number ?? undefined,
				itemKeys: snapshot.ignoredItems.map((ignored) => ignored.item.key),
			});
		}
	}

	private unattemptedActionableItems(snapshot: FeedbackSnapshot, completedQueuedKeys: ReadonlySet<string>): FeedbackItemKey[] {
		return snapshot.items.filter((item) => !this.attemptedKeys.has(item.key) && !completedQueuedKeys.has(item.key));
	}

	private async pauseIfWorkingTreeDirty(session: ActiveSession, options: { queuedCount?: number | undefined } = {}): Promise<boolean> {
		const dirty = await isWorkingTreeDirty(this.pi, session.cwd, session.abortController.signal);
		if (!dirty || this.options.shouldAllowDirty) {
			this.hasNotifiedDirtyPause = false;
			return false;
		}
		const queuedCountUpdate = options.queuedCount === undefined ? {} : { queuedCount: options.queuedCount };
		this.state = { ...this.state, ...queuedCountUpdate, state: "paused" };
		this.renderStatus("PR watch: paused dirty tree");
		if (!this.hasNotifiedDirtyPause) {
			this.hasNotifiedDirtyPause = true;
			notify(session.ctx, "PR feedback watch paused because the working tree is dirty.", "warning");
		}
		return true;
	}

	private async dispatchNewItems(session: ActiveSession, items: readonly FeedbackItemKey[], snapshot: FeedbackSnapshot): Promise<void> {
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
			branch: snapshot.data.target.branch ?? undefined,
			prNumber: snapshot.data.target.pr_number ?? undefined,
			headRefOid: snapshot.headRefOid,
			itemKeys,
		});
		this.renderStatus(`PR watch: dispatching ${items.length} item(s)`);
		const prompt = buildDetectedFeedbackPrompt({ data: snapshot.data, items });
		if (this.pi.sendUserMessage !== undefined) {
			this.pi.sendUserMessage(prompt, { deliverAs: "followUp" });
		} else if (this.pi.sendMessage !== undefined) {
			this.pi.sendMessage(
				{ customType: PR_FEEDBACK_WATCH_MESSAGE_TYPE, content: prompt, display: true, details: { itemKeys } },
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		} else {
			notify(session.ctx, "PR feedback watch detected new feedback, but this Pi runtime cannot inject user messages.", "error");
			session.ctx.ui?.setEditorText?.(prompt);
		}
		this.appendEvent("dispatched", {
			branch: snapshot.data.target.branch ?? undefined,
			prNumber: snapshot.data.target.pr_number ?? undefined,
			headRefOid: snapshot.headRefOid,
			itemKeys,
		});
	}

	private shouldRebaselineForHead(snapshot: FeedbackSnapshot): boolean {
		return this.headRefOid !== undefined && snapshot.headRefOid !== undefined && this.headRefOid !== snapshot.headRefOid;
	}

	private updateContextFromSnapshot(snapshot: FeedbackSnapshot): void {
		const checkedAt = new Date().toISOString();
		this.state = {
			...this.state,
			prNumber: snapshot.data.target.pr_number ?? undefined,
			branch: snapshot.data.target.branch ?? snapshot.data.target.head_ref_name ?? undefined,
			lastPollAt: checkedAt,
			lastHeavyCheckAt: checkedAt,
			lastError: undefined,
			seenCount: this.seenKeys.size,
			attemptedCount: this.attemptedKeys.size,
		};
	}

	private scheduleNextPoll(session: ActiveSession): void {
		this.clearTimer();
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.pollOnce(session, { scheduleNext: true, existingFeedbackMode: "baseline" });
		}, this.nextPollDelayMs());
		const maybeTimer = this.timer as { unref?: () => void };
		maybeTimer.unref?.();
	}

	private nextPollDelayMs(): number {
		return this.githubPrIdentity === undefined || this.lastRestFingerprintKey === undefined ? HEAVY_FALLBACK_INTERVAL_MS : this.options.intervalMs;
	}

	private clearTimer(): void {
		if (this.timer !== undefined) clearTimeout(this.timer);
		this.timer = undefined;
	}

	private updateStatusRefreshTimer(shouldAllowRefresh: boolean): void {
		if (!shouldAllowRefresh || !shouldRefreshStatusAge(this.status())) {
			this.clearStatusRefreshTimer();
			return;
		}
		if (this.statusRefreshTimer !== undefined) return;
		this.statusRefreshTimer = setInterval(() => {
			const ctx = this.activeSession?.ctx;
			if (ctx === undefined || !shouldRefreshStatusAge(this.status())) {
				this.clearStatusRefreshTimer();
				return;
			}
			ctx.ui?.setStatus?.(PR_FEEDBACK_WATCH_COMMAND_NAME, defaultStatusLine(this.status()));
		}, STATUS_REFRESH_INTERVAL_MS);
		const maybeTimer = this.statusRefreshTimer as { unref?: () => void };
		maybeTimer.unref?.();
	}

	private clearStatusRefreshTimer(): void {
		if (this.statusRefreshTimer !== undefined) clearInterval(this.statusRefreshTimer);
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

	private appendEvent(type: WatchEventEntry["type"], overrides: Partial<WatchEventEntry> = {}): void {
		this.pi.appendEntry?.(PR_FEEDBACK_WATCH_STATE_TYPE, {
			version: 1,
			type,
			branch: this.state.branch,
			prNumber: this.state.prNumber,
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

	private renderStatus(value?: string | undefined): void {
		const ctx = this.activeSession?.ctx;
		if (ctx === undefined) return;
		ctx.ui?.setStatus?.(PR_FEEDBACK_WATCH_COMMAND_NAME, value ?? defaultStatusLine(this.status()));
		this.updateStatusRefreshTimer(value === undefined);
	}

}

async function resolveRepoRoot(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<string | undefined> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], execOptions(cwd, GIT_TIMEOUT_MS, signal));
	if (result.killed || result.code !== 0) return undefined;
	return result.stdout.trim() || undefined;
}

async function isWorkingTreeDirty(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<boolean> {
	const result = await pi.exec("git", ["status", "--porcelain=v1"], execOptions(cwd, GIT_TIMEOUT_MS, signal));
	if (result.killed || result.code !== 0) return true;
	return result.stdout.trim().length > 0;
}

async function loadCurrentGitHubLogin(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<string | undefined> {
	const result = await pi.exec("gh", ["api", "user", "--jq", ".login"], execOptions(cwd, GIT_TIMEOUT_MS, signal));
	if (result.killed || result.code !== 0) return undefined;
	return result.stdout.trim() || undefined;
}

async function loadHeadRefOid(pi: ExecGateway, cwd: string, prNumber: number, signal?: AbortSignal): Promise<string | undefined> {
	const result = await pi.exec(
		"gh",
		["pr", "view", String(prNumber), "--json", "headRefOid", "--jq", ".headRefOid"],
		execOptions(cwd, GIT_TIMEOUT_MS, signal),
	);
	if (result.killed || result.code !== 0) return undefined;
	return result.stdout.trim() || undefined;
}

async function loadPrCheckSummary(options: LoadPrCheckSummaryOptions): Promise<{ type: "loaded"; summary: PrCheckSummary } | { type: "failed"; message: string }> {
	const { pi, cwd, prNumber, signal } = options;
	const result = await ghJsonCommand({
		pi,
		cwd,
		args: ["pr", "checks", String(prNumber), "--json", "bucket"],
		label: "gh pr checks",
		signal,
		shouldAllowNonZeroWithStdout: true,
	});
	return result.type === "loaded" ? { type: "loaded", summary: parsePrCheckSummary(result.value) } : result;
}

function parsePrCheckSummary(value: unknown): PrCheckSummary {
	const items = Array.isArray(value) ? value : [];
	let pendingCount = 0;
	let passCount = 0;
	let failCount = 0;
	for (const item of items) {
		if (!isRecord(item)) continue;
		const bucket = stringField(item, "bucket");
		if (bucket === "pending") pendingCount += 1;
		if (bucket === "pass") passCount += 1;
		if (bucket === "fail") failCount += 1;
	}
	return { totalCount: items.length, pendingCount, passCount, failCount };
}

async function loadRestFingerprint(options: LoadRestFingerprintOptions): Promise<{ type: "loaded"; fingerprint: FeedbackFingerprint } | { type: "failed"; message: string }> {
	const { pi, cwd, identity, sinceIso, signal } = options;
	const discussionEndpoint = discussionCommentsEndpoint(identity, sinceIso);
	const reviewsEndpointValue = reviewsEndpoint(identity);
	const reviewCommentsEndpointValue = reviewCommentsEndpoint(identity, sinceIso);
	const [discussionResult, reviewsResult, reviewCommentsResult] = await Promise.allSettled([
		ghApiJson({ pi, cwd, endpoint: discussionEndpoint, jq: "[.[] | {id, created_at, updated_at, author: .user.login}]", signal }),
		ghApiJson({ pi, cwd, endpoint: reviewsEndpointValue, jq: "[.[] | {id, node_id, state, submitted_at, commit_id, author: .user.login}]", signal }),
		ghApiJson({
			pi,
			cwd,
			endpoint: reviewCommentsEndpointValue,
			jq: "[.[] | {id, pull_request_review_id, created_at, updated_at, path, line, in_reply_to_id, author: .user.login}]",
			signal,
		}),
	]);
	const discussion = settledGhApiJsonResult(discussionResult, discussionEndpoint);
	const reviews = settledGhApiJsonResult(reviewsResult, reviewsEndpointValue);
	const reviewComments = settledGhApiJsonResult(reviewCommentsResult, reviewCommentsEndpointValue);
	if (discussion.type === "failed") return discussion;
	if (reviews.type === "failed") return reviews;
	if (reviewComments.type === "failed") return reviewComments;
	return {
		type: "loaded",
		fingerprint: buildFeedbackFingerprint([
			...parseDiscussionCommentFingerprint(discussion.value),
			...parseReviewFingerprint(reviews.value),
			...parseReviewCommentFingerprint(reviewComments.value),
		]),
	};
}

function settledGhApiJsonResult(result: PromiseSettledResult<GhApiJsonResult>, endpoint: string): GhApiJsonResult {
	if (result.status === "fulfilled") return result.value;
	return { type: "failed", message: `gh api failed for ${endpoint}: ${formatUnknownError(result.reason)}` };
}

async function ghApiJson(options: GhApiJsonOptions): Promise<GhApiJsonResult> {
	const { pi, cwd, endpoint, jq, signal } = options;
	return ghJsonCommand({ pi, cwd, args: ["api", "--method", "GET", endpoint, "--jq", jq], label: `gh api for ${endpoint}`, signal });
}

async function ghJsonCommand(options: GhJsonCommandOptions): Promise<GhJsonCommandResult> {
	const { pi, cwd, args, label, signal, shouldAllowNonZeroWithStdout = false } = options;
	const result = await pi.exec("gh", args, execOptions(cwd, GIT_TIMEOUT_MS, signal));
	if (result.killed || (result.code !== 0 && (!shouldAllowNonZeroWithStdout || result.stdout.trim().length === 0))) {
		return { type: "failed", message: `${label} failed: ${result.stderr.trim() || `exit code ${result.code}`}` };
	}
	try {
		return { type: "loaded", value: JSON.parse(result.stdout) };
	} catch {
		return { type: "failed", message: `${label} returned malformed JSON.` };
	}
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function discussionCommentsEndpoint(identity: GithubPrIdentity, sinceIso: string | undefined): string {
	return buildGitHubRestEndpoint(`repos/${identity.owner}/${identity.repo}/issues/${identity.number}/comments`, { per_page: 100, since: sinceIso });
}

function reviewsEndpoint(identity: GithubPrIdentity): string {
	return buildGitHubRestEndpoint(`repos/${identity.owner}/${identity.repo}/pulls/${identity.number}/reviews`, { per_page: 100 });
}

function reviewCommentsEndpoint(identity: GithubPrIdentity, sinceIso: string | undefined): string {
	return buildGitHubRestEndpoint(`repos/${identity.owner}/${identity.repo}/pulls/${identity.number}/comments`, { per_page: 100, sort: "updated", direction: "desc", since: sinceIso });
}

function buildGitHubRestEndpoint(path: string, params: Record<string, string | number | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) search.set(key, String(value));
	}
	return search.size === 0 ? path : `${path}?${search.toString()}`;
}

function skewIso(iso: string): string {
	const timestamp = Date.parse(iso);
	if (!Number.isFinite(timestamp)) return iso;
	return new Date(timestamp - REST_FINGERPRINT_SKEW_MS).toISOString();
}

function execOptions(cwd: string, timeout: number, signal?: AbortSignal): ExecOptions {
	return { cwd, timeout, ...(signal === undefined ? {} : { signal }) };
}

function pathExists(path: string): boolean {
	try {
		accessSync(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

function initialWatchStatus(): WatchStatus {
	return {
		isEnabled: false,
		state: "stopped",
		mode: "stopped",
		intervalMs: DEFAULT_INTERVAL_MS,
		seenCount: 0,
		attemptedCount: 0,
		queuedCount: 0,
		restFailures: 0,
	};
}

function defaultStatusLine(status: WatchStatus): string | undefined {
	if (!status.isEnabled && status.state === "stopped") return undefined;
	if (status.state === "paused") return "PR watch: paused";
	if (status.state === "dispatching") return `PR watch: dispatching ${status.queuedCount} item(s)`;
	if (status.state === "error") return status.mode === "heavy_fallback" ? REST_FAILURE_STATUS : "PR watch: error";
	if (status.mode === "heavy_fallback" && status.prNumber !== undefined) return "PR watch: fallback polling 60s";
	if (status.prNumber !== undefined) {
		const intervalSeconds = Math.round(status.intervalMs / 1_000);
		const feedbackAge = status.lastRestPollAt === undefined ? `feedback ${intervalSeconds}s` : `feedback ${formatElapsedSinceMs(status.lastRestPollAt)}/${intervalSeconds}s`;
		const checks = status.checkSummary === undefined ? "" : ` · ${formatCheckSummary(status.checkSummary)}`;
		return `PR #${status.prNumber} · ${feedbackAge}${checks} · /${PR_FEEDBACK_WATCH_COMMAND_NAME} stops`;
	}
	return "PR watch: active";
}

function formatCheckSummary(summary: PrCheckSummary): string {
	return `[ci](pending:${summary.pendingCount} ok:${summary.passCount} fail:${summary.failCount})`;
}

function shouldRefreshStatusAge(status: WatchStatus): boolean {
	return status.isEnabled && status.state === "active" && status.mode === "rest_fingerprint" && status.prNumber !== undefined && status.lastRestPollAt !== undefined;
}

function formatElapsedSinceMs(iso: string): string {
	const timestamp = Date.parse(iso);
	if (!Number.isFinite(timestamp)) return "recently";
	return formatElapsedMs(Date.now() - timestamp);
}

function formatWatchStatus(status: WatchStatus): string {
	const lines = [
		`PR feedback watch: ${status.isEnabled ? status.state : "stopped"}`,
		`Interval: ${Math.round(status.intervalMs / 1_000)}s`,
		`Mode: ${formatWatchMode(status.mode)}`,
		`REST failures: ${status.restFailures}`,
		`Seen: ${status.seenCount}`,
		`Attempted: ${status.attemptedCount}`,
		`Queued: ${status.queuedCount}`,
	];
	if (status.prNumber !== undefined) lines.push(`PR: #${status.prNumber}`);
	if (status.branch !== undefined) lines.push(`Branch: ${status.branch}`);
	if (status.checkSummary !== undefined) lines.push(`CI: ${formatCheckSummary(status.checkSummary)}`);
	if (status.lastRestPollAt !== undefined) lines.push(`Last REST poll: ${status.lastRestPollAt}`);
	if (status.lastHeavyCheckAt !== undefined) lines.push(`Last heavy check: ${status.lastHeavyCheckAt}`);
	if (status.lastPollAt !== undefined) lines.push(`Last poll: ${status.lastPollAt}`);
	if (status.lastError !== undefined) lines.push(`Last error: ${status.lastError}`);
	return lines.join("\n");
}

function formatWatchMode(mode: WatchMode): string {
	if (mode === "rest_fingerprint") return "REST fingerprint";
	if (mode === "heavy_fallback") return "heavy fallback";
	return "stopped";
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
	ctx.ui?.notify?.(message, level);
}

function parseWatchEventEntry(value: unknown): WatchEventEntry | undefined {
	if (!isRecord(value)) return undefined;
	if (value.version !== 1) return undefined;
	if (typeof value.type !== "string") return undefined;
	if (!isWatchEventType(value.type)) return undefined;
	const itemKeys = Array.isArray(value.itemKeys) ? value.itemKeys.filter((item): item is string => typeof item === "string") : undefined;
	return {
		version: 1,
		type: value.type,
		branch: stringField(value, "branch"),
		prNumber: numberField(value, "prNumber"),
		headRefOid: stringField(value, "headRefOid"),
		itemKeys,
		createdAt: stringField(value, "createdAt") ?? "",
	};
}

function shouldDispatchExistingFeedback(options: WatchCommandOptions): boolean {
	return options.existingFeedbackMode === "dispatch";
}

function isWatchCommandAction(value: string): value is WatchCommandAction {
	return value === "toggle" || value === "start" || value === "stop" || value === "status" || value === "once";
}

function isWatchEventType(value: string): value is WatchEventEntry["type"] {
	return value === "baseline" || value === "detected" || value === "dispatched" || value === "ignored" || value === "stopped" || value === "config" || value === "error";
}

function compareFingerprintItems(left: FeedbackFingerprintItem, right: FeedbackFingerprintItem): number {
	return fingerprintSortKey(left).localeCompare(fingerprintSortKey(right));
}

function fingerprintSortKey(item: FeedbackFingerprintItem): string {
	return [item.kind, item.id, item.updatedAt ?? "", item.path ?? "", item.line === undefined ? "" : String(item.line)].join(":");
}

function authorFromValue(value: Record<string, unknown>): string | undefined {
	const author = stringField(value, "author");
	if (author !== undefined) return author;
	if (!isRecord(value.user)) return undefined;
	return stringField(value.user, "login");
}

function idField(value: Record<string, unknown>, key: string): string | undefined {
	const field = value[key];
	if (typeof field === "number" && Number.isFinite(field)) return String(field);
	return typeof field === "string" ? field : undefined;
}

function numberField(value: Record<string, unknown>, key: string): number | undefined {
	const field = value[key];
	return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function requiredNumberField(value: Record<string, unknown>, key: string): number {
	const field = numberField(value, key);
	if (field === undefined) throw new Error(`Expected numeric field ${key} after validation.`);
	return field;
}

function booleanField(value: Record<string, unknown>, key: string): boolean | undefined {
	const field = value[key];
	return typeof field === "boolean" ? field : undefined;
}
