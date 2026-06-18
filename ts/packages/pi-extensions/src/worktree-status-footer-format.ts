import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import {
	formatWorktreeFooterIdentity,
	formatWorktreeStatusForFooter,
	WORKTREE_STATUS_UI_KEY,
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

export function renderStatusFooter(options: StatusFooterRenderOptions): string[] {
	const { ctx, footerData, theme, width, cwd, branch, fallbackRepo, worktreeStatus } = options;
	const identity = formatWorktreeFooterIdentity({
		cwd,
		branch,
		fallbackRepo,
		home: process.env.HOME || process.env.USERPROFILE,
		width,
		status: worktreeStatus,
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
