import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import {
	formatWorktreeStatusForFooter,
	WORKTREE_STATUS_UI_KEY,
	type GtCommitStatus,
	type GtStatus,
	type StatusTheme,
	type WorktreeStatus,
} from "@asdl/ccc/worktree-status";

interface StatusFooterData {
	getExtensionStatuses(): ReadonlyMap<string, string>;
	getAvailableProviderCount(): number;
}

interface StatusSessionManager {
	getEntries(): readonly StatusSessionEntry[];
}

interface StatusSessionEntry {
	type: string;
	message?: StatusMessage;
}

interface StatusMessage {
	role: string;
	usage: StatusUsage;
}

interface StatusUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: { total: number };
}

interface StatusModelRegistry {
	isUsingOAuth(model: StatusModel): boolean;
}

interface StatusModel {
	id: string;
	provider?: string;
	contextWindow?: number;
}

interface StatusContextUsage {
	contextWindow: number;
	percent: number | null;
}

export interface StatusFooterRenderContext {
	sessionManager?: StatusSessionManager;
	modelRegistry?: StatusModelRegistry;
	model?: StatusModel;
	getContextUsage?(): StatusContextUsage | undefined;
}

export interface StatusFooterRenderOptions {
	ctx: StatusFooterRenderContext;
	footerData: StatusFooterData;
	theme: StatusTheme;
	width: number;
	cwd: string;
	branch: string;
	fallbackRepo: string;
	worktreeStatus?: WorktreeStatus | undefined;
}

interface FooterExtensionStatusLines {
	activity: string[];
}

export interface WorktreeFooterIdentityOptions {
	readonly cwd: string;
	readonly branch: string;
	readonly fallbackRepo: string;
	readonly home?: string | undefined;
	readonly width: number;
	readonly gt?: GtStatus | undefined;
	readonly theme: StatusTheme;
}

interface FooterIdentityParts {
	repo: string;
	slot: string;
	branch: string;
	relativePath: string;
}

type FooterIdentityColor = "dim" | "accent" | "warning" | "error";

interface FooterIdentitySegment {
	text: string;
	color: FooterIdentityColor;
}

export function formatWorktreeFooterIdentity(options: WorktreeFooterIdentityOptions): string {
	const identity = footerIdentityParts(options.cwd, options.branch, options.fallbackRepo, options.home);
	const segments = buildFooterIdentitySegments(identity, options.gt);
	const rawFullIdentity = rawFooterIdentity(segments);
	if (visibleWidth(rawFullIdentity) <= options.width) return colorFooterIdentitySegments(segments, options.theme);
	return options.theme.fg("dim", truncateToWidth(rawFullIdentity, options.width, "..."));
}

function buildFooterIdentitySegments(identity: FooterIdentityParts, gt: GtStatus | undefined): FooterIdentitySegment[] {
	const segments: FooterIdentitySegment[] = [
		{ text: "[wt]", color: "dim" },
		{ text: " ", color: "dim" },
		{ text: "repo:", color: "dim" },
		{ text: identity.repo, color: "accent" },
		{ text: " ", color: "dim" },
		{ text: "wt:", color: "dim" },
		{ text: identity.slot, color: "accent" },
		{ text: " ", color: "dim" },
		{ text: "pwd:", color: "dim" },
		{ text: identity.relativePath, color: "accent" },
	];
	if (gt?.dirty === "yes") {
		segments.push(
			{ text: " (", color: "dim" },
			{ text: "✗", color: "error" },
			{ text: ")", color: "dim" },
		);
	}
	segments.push(
		{ text: " | ", color: "dim" },
		{ text: "br:", color: "dim" },
		{ text: identity.branch, color: "warning" },
	);
	if (gt !== undefined) {
		segments.push(
			{ text: " ", color: "dim" },
			{ text: "↓:", color: "dim" },
			{ text: gt.down ?? "-", color: "accent" },
			{ text: " ", color: "dim" },
			{ text: "commits:", color: "dim" },
			{ text: footerCommitCount(gt.commits), color: "accent" },
			{ text: " ", color: "dim" },
			{ text: "↑:", color: "dim" },
			{ text: gt.up, color: "accent" },
		);
	}
	return segments;
}

function rawFooterIdentity(segments: readonly FooterIdentitySegment[]): string {
	return segments.map((segment) => segment.text).join("");
}

function colorFooterIdentitySegments(segments: readonly FooterIdentitySegment[], theme: StatusTheme): string {
	return segments.map((segment) => theme.fg(segment.color, segment.text)).join("");
}

function footerCommitCount(commits: GtCommitStatus): string {
	switch (commits.type) {
		case "count":
			return commits.count.toString();
		case "unknown":
			return "?";
		case "not-applicable":
			return "-";
	}
}

function footerIdentityParts(cwd: string, branch: string, fallbackRepo: string, home: string | undefined): FooterIdentityParts {
	const slotInfo = slotInfoFromCwd(cwd);
	if (slotInfo !== undefined) {
		const relativePath = relative(slotInfo.worktreeRoot, resolve(cwd));
		return { repo: slotInfo.repo, slot: slotInfo.slot, branch, relativePath: relativePath.length > 0 ? relativePath : "." };
	}
	return { repo: fallbackRepo, slot: "no-slot", branch, relativePath: formatFooterCwd(cwd, home) };
}

function slotInfoFromCwd(cwd: string): { repo: string; slot: string; worktreeRoot: string } | undefined {
	const resolvedCwd = resolve(cwd);
	const parts = resolvedCwd.split(sep);
	for (let index = 0; index < parts.length - 4; index++) {
		if (parts[index] !== ".slots" || parts[index + 1] !== "repos" || parts[index + 3] !== "worktrees") continue;
		const repo = parts[index + 2];
		const slot = parts[index + 4];
		if (repo === undefined || repo.length === 0 || slot === undefined || slot.length === 0) return undefined;
		return { repo, slot, worktreeRoot: pathFromParts(parts.slice(0, index + 5)) };
	}
	return undefined;
}

function pathFromParts(parts: readonly string[]): string {
	if (parts[0] === "") return `${sep}${join(...parts.slice(1))}`;
	return join(...parts);
}

function formatFooterCwd(cwd: string, home: string | undefined): string {
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

export function renderStatusFooter(options: StatusFooterRenderOptions): string[] {
	const { ctx, footerData, theme, width, cwd, branch, fallbackRepo, worktreeStatus } = options;
	const identity = formatWorktreeFooterIdentity({
		cwd,
		branch,
		fallbackRepo,
		home: process.env.HOME || process.env.USERPROFILE,
		width,
		gt: worktreeStatus?.gt,
		theme,
	});

	const footerStatusLines = formatFooterExtensionStatusLines(footerData.getExtensionStatuses());
	const statsLine = formatFooterStats({ ctx, footerData, theme, width });
	const lines = [identity];
	for (const statusLine of formatStructuredFooterWorktreeLines(worktreeStatus, theme)) {
		lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
	}
	lines.push(statsLine);
	for (const statusLine of footerStatusLines.activity) {
		lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
	}
	return lines;
}

function formatStructuredFooterWorktreeLines(status: WorktreeStatus | undefined, theme: StatusTheme): string[] {
	return status === undefined ? [] : formatWorktreeStatusForFooter(status, theme);
}

function formatFooterStats(options: Pick<StatusFooterRenderOptions, "ctx" | "footerData" | "theme" | "width">): string {
	const { ctx, footerData, theme, width } = options;
	const totals = totalAssistantUsage(ctx.sessionManager?.getEntries() ?? []);
	const statsParts: string[] = [];
	if (totals.input) statsParts.push(`↑${formatFooterTokens(totals.input)}`);
	if (totals.output) statsParts.push(`↓${formatFooterTokens(totals.output)}`);
	if (totals.cacheRead) statsParts.push(`R${formatFooterTokens(totals.cacheRead)}`);
	if (totals.cacheWrite) statsParts.push(`W${formatFooterTokens(totals.cacheWrite)}`);

	const model = ctx.model;
	const usingSubscription = model !== undefined && (ctx.modelRegistry?.isUsingOAuth(model) ?? false);
	if (totals.cost.total || usingSubscription) {
		statsParts.push(`$${totals.cost.total.toFixed(3)}${usingSubscription ? " (sub)" : ""}`);
	}

	statsParts.push(formatContextUsage(ctx, theme));
	let statsLeft = statsParts.join(" ");
	let statsLeftWidth = visibleWidth(statsLeft);
	if (statsLeftWidth > width) {
		statsLeft = truncateToWidth(statsLeft, width, "...");
		statsLeftWidth = visibleWidth(statsLeft);
	}

	let rightSide = model?.id ?? "no-model";
	if (footerData.getAvailableProviderCount() > 1 && model?.provider) {
		const providerRightSide = `(${model.provider}) ${rightSide}`;
		if (statsLeftWidth + 2 + visibleWidth(providerRightSide) <= width) rightSide = providerRightSide;
	}

	const rightSideWidth = visibleWidth(rightSide);
	if (statsLeftWidth + 2 + rightSideWidth <= width) {
		return theme.fg("dim", statsLeft) + theme.fg("dim", " ".repeat(width - statsLeftWidth - rightSideWidth) + rightSide);
	}

	const availableForRight = width - statsLeftWidth - 2;
	if (availableForRight <= 0) return theme.fg("dim", statsLeft);

	const truncatedRight = truncateToWidth(rightSide, availableForRight, "");
	const padding = " ".repeat(Math.max(0, width - statsLeftWidth - visibleWidth(truncatedRight)));
	return theme.fg("dim", statsLeft) + theme.fg("dim", padding + truncatedRight);
}

function totalAssistantUsage(entries: readonly StatusSessionEntry[]): StatusUsage {
	const totals: StatusUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } };
	for (const entry of entries) {
		const message = entry.message;
		if (entry.type !== "message" || message?.role !== "assistant") continue;
		totals.input += message.usage.input;
		totals.output += message.usage.output;
		totals.cacheRead += message.usage.cacheRead;
		totals.cacheWrite += message.usage.cacheWrite;
		totals.cost.total += message.usage.cost.total;
	}
	return totals;
}

function formatContextUsage(ctx: StatusFooterRenderContext, theme: StatusTheme): string {
	const contextUsage = readContextUsage(ctx);
	const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
	const percent = contextUsage?.percent;
	const display = percent == null ? `?/${formatFooterTokens(contextWindow)} (auto)` : `${percent.toFixed(1)}%/${formatFooterTokens(contextWindow)} (auto)`;
	if ((percent ?? 0) > 90) return theme.fg("error", display);
	if ((percent ?? 0) > 70) return theme.fg("warning", display);
	return display;
}

function readContextUsage(ctx: StatusFooterRenderContext): StatusContextUsage | undefined {
	try {
		return ctx.getContextUsage?.();
	} catch {
		// Context usage is footer telemetry. Malformed legacy/session entries must not crash Pi's TUI render loop.
		return undefined;
	}
}

function formatFooterTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function formatFooterExtensionStatusLines(extensionStatuses: ReadonlyMap<string, string>): FooterExtensionStatusLines {
	const activity: string[] = [];
	let compactActivityParts: string[] = [];

	for (const [key, text] of Array.from(extensionStatuses.entries()).sort(([a], [b]) => a.localeCompare(b))) {
		const sanitizedLines = sanitizeStatusLines(text);
		if (key === WORKTREE_STATUS_UI_KEY) continue;

		if (sanitizedLines.length <= 1) {
			const line = sanitizedLines[0];
			if (line !== undefined) compactActivityParts.push(line);
			continue;
		}

		if (compactActivityParts.length > 0) {
			activity.push(compactActivityParts.join(" "));
			compactActivityParts = [];
		}
		activity.push(...sanitizedLines);
	}

	if (compactActivityParts.length > 0) activity.push(compactActivityParts.join(" "));
	return { activity };
}

function sanitizeStatusLines(text: string): string[] {
	return text
		.split("\n")
		.map((line) => sanitizeStatusLine(line))
		.filter((line) => line.length > 0);
}

function sanitizeStatusLine(text: string): string {
	return text
		.replace(/[\r\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}
