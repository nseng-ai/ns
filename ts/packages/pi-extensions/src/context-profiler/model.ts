/**
 * Pure derivation for the context profiler: captured prompt options, system
 * prompt, and live messages/entries in; base regions, flat turn list, and
 * capping metadata out. No TUI or extension-runtime imports — type-only
 * imports from pi-coding-agent are the boundary.
 */

import type { BuildSystemPromptOptions, ContextUsage, SessionEntry, Skill } from "@earendil-works/pi-coding-agent";

/**
 * Every count carries provenance even though all per-item counts start as
 * "estimated" — the only reported figures are ContextUsage totals. Estimation
 * stays isolated behind estimateTokensFromChars so precision can improve later
 * without a view rewrite.
 */
export type TokenProvenance = "reported" | "estimated";

export interface TokenCount {
	value: number;
	provenance: TokenProvenance;
}

export interface BaseMember {
	name: string;
	tokens: TokenCount;
	/** Verbatim text behind this member, when captured. */
	content: string | null;
	/** Provenance/estimation note shown in the content view. */
	note: string | null;
}

export interface BaseRegion {
	id: string;
	label: string;
	tokens: TokenCount;
	members: BaseMember[];
}

export interface LiveTurn {
	/** 1-based position in the live message list. */
	index: number;
	role: string;
	tokens: TokenCount;
	toolNames: string[];
	excerpt: string;
	/** Raw message this turn was derived from; rendered verbatim in the content view. */
	message: unknown;
}

export type EpisodeKind = "explore" | "edit" | "debug" | "test" | "review" | "chat" | "uncategorized";

export interface TurnRange {
	start: number;
	end: number;
}

/**
 * Optional annotation over the turn list. Episodes are never structural: the
 * deterministic view is complete without them, and LM segmentation (a later
 * roadmap row) only supplies these as additive input.
 */
export interface EpisodeAnnotation {
	label: string;
	kind: EpisodeKind;
	turnRange: TurnRange;
}

/** One LIVE-section overview row: a span of turns with a label. */
export interface LiveRegion {
	id: string;
	label: string;
	kind: EpisodeKind;
	turnRange: TurnRange;
	tokens: TokenCount;
	/** True when the span contains the last live turn. */
	isCurrent: boolean;
	source: "deterministic" | "annotation";
}

export type LiveSource = "context-event" | "branch-fallback";

export interface TurnCapInfo {
	originalCount: number;
	includedCount: number;
	elidedMiddleTurns: number;
}

export interface ProfileSnapshot {
	cwd: string;
	model: string;
	usage: ContextUsage | undefined;
	baseRegions: BaseRegion[];
	liveTurns: LiveTurn[];
	liveRegions: LiveRegion[];
	liveSource: LiveSource;
	cap: TurnCapInfo;
	openedAt: string;
}

export const CAP_FIRST_TURNS = 16;
export const CAP_LAST_TURNS = 64;
const EXCERPT_MAX_CHARS = 120;

/** The single token estimation function. All estimated counts go through here. */
export function estimateTokensFromChars(chars: number): TokenCount {
	return { value: Math.ceil(Math.max(0, chars) / 4), provenance: "estimated" };
}

export function sumTurnTokens(turns: readonly LiveTurn[]): number {
	return turns.reduce((total, turn) => total + turn.tokens.value, 0);
}

export function buildBaseRegions(options: BuildSystemPromptOptions | null, systemPrompt: string | null): BaseRegion[] {
	if (options === null) {
		return [
			{
				id: "base-pending",
				label: "base profile pending",
				tokens: estimateTokensFromChars(0),
				members: [
					{
						name: "send one prompt to capture before_agent_start data",
						tokens: estimateTokensFromChars(0),
						content: null,
						note: "no system prompt options captured yet",
					},
				],
			},
		];
	}

	const contextFiles = options.contextFiles ?? [];
	const skills = options.skills ?? [];
	const toolSnippets = options.toolSnippets ?? {};
	const tools = options.selectedTools ?? Object.keys(toolSnippets);
	const guidelines = options.promptGuidelines ?? [];

	const fileMembers: BaseMember[] = contextFiles.map((file) => ({
		name: file.path,
		tokens: estimateTokensFromChars(file.content.length),
		content: file.content,
		note: "verbatim file content as passed to the system prompt",
	}));
	const skillMembers: BaseMember[] = skills.map((skill) => ({
		name: skill.name,
		tokens: estimateTokensFromChars(skillPromptChars(skill)),
		content: skillContentText(skill),
		note: "reconstructed from the skill's prompt fields (name / description / path)",
	}));
	const toolMembers: BaseMember[] = tools.map((tool) => {
		const snippet = toolSnippets[tool];
		return {
			name: tool,
			tokens: estimateTokensFromChars(tool.length + (snippet?.length ?? 0)),
			content: snippet ?? null,
			note: snippet === undefined ? "no prompt snippet captured for this tool; size covers the tool name only" : "verbatim tool prompt snippet",
		};
	});

	const fileChars = contextFiles.reduce((total, file) => total + file.content.length, 0);
	const skillChars = skills.reduce((total, skill) => total + skillPromptChars(skill), 0);
	const toolChars = tools.reduce((total, tool) => total + tool.length + (toolSnippets[tool]?.length ?? 0), 0);
	const guidelineChars = guidelines.reduce((total, guideline) => total + guideline.length + 3, 0);
	const customChars = options.customPrompt?.length ?? 0;
	const appendChars = options.appendSystemPrompt?.length ?? 0;
	const knownChars = fileChars + skillChars + toolChars + appendChars + customChars + guidelineChars;
	const scaffoldChars = Math.max(0, (systemPrompt?.length ?? 0) - knownChars);

	const instructionMembers: BaseMember[] = [
		{
			name: "system scaffold / guidelines",
			tokens: estimateTokensFromChars(scaffoldChars),
			content: systemPrompt,
			note: "size estimated by subtracting known parts from the assembled prompt; showing the FULL assembled system prompt",
		},
		{
			name: "custom prompt",
			tokens: estimateTokensFromChars(customChars),
			content: options.customPrompt ?? null,
			note: options.customPrompt === undefined ? "no custom prompt set" : "verbatim custom system prompt",
		},
		{
			name: "appended system prompt",
			tokens: estimateTokensFromChars(appendChars),
			content: options.appendSystemPrompt ?? null,
			note: options.appendSystemPrompt === undefined ? "no appended system prompt set" : "verbatim appended system prompt",
		},
		{
			name: `${guidelines.length.toLocaleString()} extra guideline bullets`,
			tokens: estimateTokensFromChars(guidelineChars),
			content: guidelines.length === 0 ? null : guidelines.map((guideline) => `• ${guideline}`).join("\n"),
			note: guidelines.length === 0 ? "no extra guideline bullets" : "verbatim guideline bullets appended to the default guidelines",
		},
	];

	return [
		{
			id: "base-instructions",
			label: "system scaffold + custom instructions",
			tokens: estimateTokensFromChars(scaffoldChars + customChars + appendChars + guidelineChars),
			members: instructionMembers,
		},
		{
			id: "base-context-files",
			label: "project context files",
			tokens: estimateTokensFromChars(fileChars),
			members: fileMembers,
		},
		{
			id: "base-skills",
			label: "loaded skills",
			tokens: estimateTokensFromChars(skillChars),
			members: skillMembers,
		},
		{
			id: "base-tools",
			label: "tool/capability prompt",
			tokens: estimateTokensFromChars(toolChars),
			members: toolMembers,
		},
	];
}

function skillPromptChars(skill: Skill): number {
	return stableJsonLength({
		name: skill.name,
		description: skill.description,
		filePath: skill.filePath,
		disabled: skill.disableModelInvocation,
	});
}

function skillContentText(skill: Skill): string {
	const path = skill.filePath.length === 0 ? "" : `\n\n${skill.filePath}`;
	const disabled = skill.disableModelInvocation ? "\n(model invocation disabled)" : "";
	return `${skill.name}\n${skill.description}${path}${disabled}`;
}

export interface LiveTurnsInput {
	/** Messages from the latest `context` event, or null if none arrived yet. */
	contextMessages: readonly unknown[] | null;
	/** Session-branch entries, the pre-first-event fallback. */
	branchEntries: readonly SessionEntry[];
}

/**
 * Select the live source and derive turns. The `context` event is
 * authoritative whenever one has been received this session; the branch
 * fallback is used only before the first event arrives (rule documented in
 * runtime.ts).
 */
export function deriveLiveTurns(input: LiveTurnsInput): { turns: LiveTurn[]; source: LiveSource } {
	if (input.contextMessages !== null) {
		return { turns: buildTurnsFromMessages(input.contextMessages), source: "context-event" };
	}
	return { turns: buildTurnsFromEntries(input.branchEntries), source: "branch-fallback" };
}

export function buildTurnsFromMessages(messages: readonly unknown[]): LiveTurn[] {
	return messages.map((message, index) => ({
		index: index + 1,
		role: messageRole(message),
		tokens: estimateTokensFromChars(estimateMessageChars(message)),
		toolNames: toolNamesOf(message),
		excerpt: excerptForMessage(message),
		message,
	}));
}

export function buildTurnsFromEntries(entries: readonly SessionEntry[]): LiveTurn[] {
	const messages = entries.flatMap((entry): unknown[] => {
		if (entry.type === "message") return [entry.message];
		if (entry.type === "custom_message") return [{ role: "custom", content: entry.content, details: entry.details }];
		if (entry.type === "compaction") return [{ role: "compaction", content: entry.summary }];
		if (entry.type === "branch_summary") return [{ role: "branch_summary", content: entry.summary }];
		return [];
	});
	return buildTurnsFromMessages(messages);
}

export function capTurns(turns: readonly LiveTurn[]): { turns: LiveTurn[]; cap: TurnCapInfo } {
	const maxTurns = CAP_FIRST_TURNS + CAP_LAST_TURNS;
	if (turns.length <= maxTurns) {
		return {
			turns: [...turns],
			cap: { originalCount: turns.length, includedCount: turns.length, elidedMiddleTurns: 0 },
		};
	}
	const capped = [...turns.slice(0, CAP_FIRST_TURNS), ...turns.slice(turns.length - CAP_LAST_TURNS)];
	return {
		turns: capped,
		cap: { originalCount: turns.length, includedCount: capped.length, elidedMiddleTurns: turns.length - maxTurns },
	};
}

/**
 * Derive LIVE-section overview rows. Without annotations this is one
 * deterministic span over all turns; with annotations each becomes a row,
 * with uncovered spans kept as "unannotated turns" rows so every turn stays
 * reachable (annotations are claims over the list, never structure).
 */
export function buildLiveRegions(turns: readonly LiveTurn[], episodes?: readonly EpisodeAnnotation[]): LiveRegion[] {
	if (turns.length === 0) return [];
	const firstIndex = turns[0]?.index ?? 1;
	const lastIndex = turns[turns.length - 1]?.index ?? firstIndex;
	if (episodes === undefined || episodes.length === 0) {
		return [
			{
				id: "live-conversation",
				label: turns.length < 3 ? "current exchange" : "conversation turns",
				kind: "chat",
				turnRange: { start: firstIndex, end: lastIndex },
				tokens: { value: sumTurnTokens(turns), provenance: "estimated" },
				isCurrent: true,
				source: "deterministic",
			},
		];
	}

	const clamped = episodes
		.map((episode): EpisodeAnnotation => ({
			...episode,
			turnRange: {
				start: Math.max(firstIndex, Math.min(lastIndex, episode.turnRange.start)),
				end: Math.max(firstIndex, Math.min(lastIndex, episode.turnRange.end)),
			},
		}))
		.filter((episode) => episode.turnRange.start <= episode.turnRange.end)
		.sort((left, right) => left.turnRange.start - right.turnRange.start);

	const regions: LiveRegion[] = [];
	let cursor = firstIndex;
	clamped.forEach((episode, position) => {
		if (episode.turnRange.start > cursor) {
			regions.push(unannotatedRegion(turns, { start: cursor, end: episode.turnRange.start - 1 }, lastIndex));
		}
		regions.push({
			id: `episode-${position + 1}`,
			label: episode.label,
			kind: episode.kind,
			turnRange: episode.turnRange,
			tokens: { value: sumTurnTokens(turnsInRange(turns, episode.turnRange)), provenance: "estimated" },
			isCurrent: episode.turnRange.end >= lastIndex,
			source: "annotation",
		});
		cursor = Math.max(cursor, episode.turnRange.end + 1);
	});
	if (cursor <= lastIndex) {
		regions.push(unannotatedRegion(turns, { start: cursor, end: lastIndex }, lastIndex));
	}
	return regions;
}

export function turnsInRange(turns: readonly LiveTurn[], range: TurnRange): LiveTurn[] {
	return turns.filter((turn) => turn.index >= range.start && turn.index <= range.end);
}

function unannotatedRegion(turns: readonly LiveTurn[], range: TurnRange, lastIndex: number): LiveRegion {
	return {
		id: `unannotated-${range.start}`,
		label: "unannotated turns",
		kind: "uncategorized",
		turnRange: range,
		tokens: { value: sumTurnTokens(turnsInRange(turns, range)), provenance: "estimated" },
		isCurrent: range.end >= lastIndex,
		source: "deterministic",
	};
}

function messageRole(message: unknown): string {
	if (!isRecord(message)) return "message";
	return typeof message.role === "string" ? message.role : "message";
}

function toolNamesOf(message: unknown): string[] {
	if (!isRecord(message)) return [];
	const direct = typeof message.toolName === "string" ? [message.toolName] : [];
	const contentTools = Array.isArray(message.content)
		? message.content.flatMap((part): string[] => (isRecord(part) && part.type === "toolCall" && typeof part.name === "string" ? [part.name] : []))
		: [];
	return [...new Set([...direct, ...contentTools])];
}

function excerptForMessage(message: unknown): string {
	if (!isRecord(message)) return "";
	const content = describeContent(message.content);
	if (content.length > 0) return collapseToExcerpt(content);
	const toolName = stringField(message, "toolName");
	if (toolName !== null) return collapseToExcerpt(toolName);
	return collapseToExcerpt(stableJsonPreview(message));
}

function describeContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map(describeContentPart).filter((part) => part.length > 0).join(" ");
}

function describeContentPart(part: unknown): string {
	if (!isRecord(part)) return "";
	if (part.type === "text" && typeof part.text === "string") return part.text;
	if (part.type === "thinking" && typeof part.thinking === "string") return part.thinking;
	if (part.type === "toolCall") return `tool:${stringField(part, "name") ?? "unknown"}`;
	if (part.type === "image") return "[image]";
	return "";
}

function collapseToExcerpt(text: string): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	if (collapsed.length <= EXCERPT_MAX_CHARS) return collapsed;
	return `${collapsed.slice(0, EXCERPT_MAX_CHARS - 1)}…`;
}

function estimateMessageChars(message: unknown): number {
	if (!isRecord(message)) return 0;
	const toolNameChars = typeof message.toolName === "string" ? message.toolName.length : 0;
	return toolNameChars + estimateContentChars(message.content) + stableJsonLength(message.details);
}

function estimateContentChars(content: unknown): number {
	if (typeof content === "string") return content.length;
	if (!Array.isArray(content)) return 0;
	return content.reduce((total: number, part) => total + estimateContentPartChars(part), 0);
}

function estimateContentPartChars(part: unknown): number {
	if (!isRecord(part) || typeof part.type !== "string") return 0;
	if (part.type === "text" && typeof part.text === "string") return part.text.length;
	if (part.type === "thinking" && typeof part.thinking === "string") return part.thinking.length;
	if (part.type === "toolCall") {
		const nameChars = typeof part.name === "string" ? part.name.length : 0;
		return nameChars + stableJsonLength(part.arguments);
	}
	return 0;
}

export function stableJsonLength(value: unknown): number {
	if (value === undefined) return 0;
	try {
		return JSON.stringify(value)?.length ?? 0;
	} catch {
		// Circular or non-serializable details contribute zero estimated chars.
		return 0;
	}
}

function stableJsonPreview(value: unknown): string {
	try {
		return JSON.stringify(value) ?? "";
	} catch {
		return "";
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function stringField(value: Record<string, unknown>, key: string): string | null {
	const field = value[key];
	return typeof field === "string" ? field : null;
}
