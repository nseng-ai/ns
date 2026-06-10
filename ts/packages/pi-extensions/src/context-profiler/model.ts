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

/**
 * One typed piece of a normalized message. `normalizeMessage` is the only
 * code that inspects raw `unknown` messages; everything downstream (token
 * estimation, excerpts, verbatim rendering) is a trivial fold over these.
 */
export type MessagePart =
	| { kind: "text"; text: string }
	| { kind: "thinking"; text: string }
	| { kind: "toolCall"; name: string; argsJson: string }
	| { kind: "image" }
	| { kind: "opaque"; json: string };

export interface NormalizedMessage {
	role: string;
	toolName: string | null;
	parts: MessagePart[];
	/** Pretty-printed `details`, null when absent. */
	detailsJson: string | null;
}

export interface LiveTurn {
	/** 1-based position in the live message list. */
	index: number;
	role: string;
	tokens: TokenCount;
	toolNames: string[];
	excerpt: string;
	/** Normalized message this turn was derived from; rendered verbatim in the content view. */
	message: NormalizedMessage;
}

/** Runtime value list kept alongside the type so Zod enums can derive from it. */
export const EPISODE_KIND_VALUES = ["explore", "edit", "debug", "test", "review", "chat", "uncategorized"] as const;

export type EpisodeKind = (typeof EPISODE_KIND_VALUES)[number];

/** Runtime value list kept alongside the type so Zod enums can derive from it. */
export const EPISODE_OUTCOME_VALUES = ["active", "completed", "abandoned", "errored", "unknown"] as const;

export type EpisodeOutcome = (typeof EPISODE_OUTCOME_VALUES)[number];

/** Runtime value list kept alongside the type so Zod enums can derive from it. */
export const EFFICIENCY_VALUES = ["efficient", "mixed", "wasteful"] as const;

export type EfficiencyVerdict = (typeof EFFICIENCY_VALUES)[number];

/** Runtime value list kept alongside the type so Zod enums can derive from it. */
export const RELEVANCE_VALUES = ["load-bearing", "still-useful", "stale", "rot"] as const;

export type RelevanceVerdict = (typeof RELEVANCE_VALUES)[number];

export interface TurnRange {
	start: number;
	end: number;
}

/**
 * Optional annotation over the turn list. Episodes are never structural: the
 * deterministic view is complete without them, and LM segmentation only
 * supplies these as additive input.
 */
export interface EpisodeAnnotation {
	label: string;
	kind: EpisodeKind;
	outcome: EpisodeOutcome;
	turnRange: TurnRange;
	/** Optional LM judgment; absence means unanalyzed or invalid/missing output. */
	efficiency?: EfficiencyVerdict;
	/** Optional LM judgment; absence means unanalyzed or invalid/missing output. */
	relevance?: RelevanceVerdict;
}

/** One LIVE-section overview row: a span of turns with a label. */
export interface LiveRegion {
	id: string;
	label: string;
	kind: EpisodeKind;
	/** Null for deterministic/unannotated rows; set only by episode annotations. */
	outcome: EpisodeOutcome | null;
	turnRange: TurnRange;
	tokens: TokenCount;
	/** True when the span contains the last live turn. */
	isCurrent: boolean;
	source: "deterministic" | "annotation";
	/** Index into the ready state's episode/status arrays; null for deterministic rows. */
	episodeIndex: number | null;
	/** Optional LM judgment; absence means unanalyzed or invalid/missing output. */
	efficiency?: EfficiencyVerdict;
	/** Optional LM judgment; absence means unanalyzed or invalid/missing output. */
	relevance?: RelevanceVerdict;
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
	return messages.map((message, index) => {
		const normalized = normalizeMessage(message);
		return {
			index: index + 1,
			role: normalized.role,
			tokens: estimateTokensFromChars(messageChars(normalized)),
			toolNames: turnToolNames(normalized),
			excerpt: excerptOf(normalized),
			message: normalized,
		};
	});
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
 * reachable (annotations are claims over the list, never structure). A gap
 * that covers only elided (capped-out) turns — the index-space hole at an
 * elision seam — contains no real turns and is skipped, never rendered as a
 * ghost zero-token row.
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
				outcome: null,
				turnRange: { start: firstIndex, end: lastIndex },
				tokens: { value: sumTurnTokens(turns), provenance: "estimated" },
				isCurrent: true,
				source: "deterministic",
				episodeIndex: null,
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
	const pushUnannotated = (range: TurnRange): void => {
		const gapTurns = turnsInRange(turns, range);
		// An index-space gap with no included turns is an elision seam, not a region.
		if (gapTurns.length === 0) return;
		regions.push({
			id: `unannotated-${range.start}`,
			label: "unannotated turns",
			kind: "uncategorized",
			outcome: null,
			turnRange: range,
			tokens: { value: sumTurnTokens(gapTurns), provenance: "estimated" },
			isCurrent: range.end >= lastIndex,
			source: "deterministic",
			episodeIndex: null,
		});
	};
	let cursor = firstIndex;
	clamped.forEach((episode, position) => {
		if (episode.turnRange.start > cursor) {
			pushUnannotated({ start: cursor, end: episode.turnRange.start - 1 });
		}
		regions.push({
			id: `episode-${position + 1}`,
			label: episode.label,
			kind: episode.kind,
			outcome: episode.outcome,
			turnRange: episode.turnRange,
			tokens: { value: sumTurnTokens(turnsInRange(turns, episode.turnRange)), provenance: "estimated" },
			isCurrent: episode.turnRange.end >= lastIndex,
			source: "annotation",
			episodeIndex: position,
			...(episode.efficiency === undefined ? {} : { efficiency: episode.efficiency }),
			...(episode.relevance === undefined ? {} : { relevance: episode.relevance }),
		});
		cursor = Math.max(cursor, episode.turnRange.end + 1);
	});
	if (cursor <= lastIndex) {
		pushUnannotated({ start: cursor, end: lastIndex });
	}
	return regions;
}

export function turnsInRange(turns: readonly LiveTurn[], range: TurnRange): LiveTurn[] {
	return turns.filter((turn) => turn.index >= range.start && turn.index <= range.end);
}

/** Render a normalized message verbatim with semantic part headers. */
export function renderNormalizedMessageText(message: NormalizedMessage): string {
	const sections: string[] = [];
	if (message.toolName !== null) sections.push(`⏺ tool result · ${message.toolName}`);
	sections.push(...message.parts.map(renderMessagePartSection));
	if (message.detailsJson !== null) sections.push(`[details]\n${message.detailsJson}`);
	return sections.join("\n\n");
}

function renderMessagePartSection(part: MessagePart): string {
	switch (part.kind) {
		case "text":
			return part.text;
		case "thinking":
			return `[thinking]\n${part.text}`;
		case "toolCall":
			return `⏺ ${part.name}\n${part.argsJson}`;
		case "image":
			return "[image]";
		case "opaque":
			return part.json;
	}
}

/**
 * Normalize one raw message into the typed model. This is the only function
 * that handles `unknown` message shapes; its rules consolidate the previous
 * per-walker decisions:
 *
 * - Non-record message → role "message", one opaque part with its pretty JSON.
 * - String content → one text part (empty string contributes no part).
 * - Array content → typed parts; unknown record parts become opaque JSON,
 *   non-record parts are skipped.
 * - Empty message (no parts, no toolName, no details) → one opaque part with
 *   the pretty JSON of the whole message, so it still renders and counts.
 */
export function normalizeMessage(message: unknown): NormalizedMessage {
	if (!isRecord(message)) {
		return { role: "message", toolName: null, parts: opaqueParts(message), detailsJson: null };
	}
	const toolName = stringField(message, "toolName");
	const detailsJson = stableJsonPretty(message.details);
	const parts = normalizeContent(message.content);
	if (parts.length === 0 && toolName === null && detailsJson === null) {
		parts.push(...opaqueParts(message));
	}
	return {
		role: typeof message.role === "string" ? message.role : "message",
		toolName,
		parts,
		detailsJson,
	};
}

function normalizeContent(content: unknown): MessagePart[] {
	if (typeof content === "string") return content.length === 0 ? [] : [{ kind: "text", text: content }];
	if (!Array.isArray(content)) return [];
	return content.flatMap((part): MessagePart[] => {
		if (!isRecord(part)) return [];
		if (part.type === "text" && typeof part.text === "string") return [{ kind: "text", text: part.text }];
		if (part.type === "thinking" && typeof part.thinking === "string") return [{ kind: "thinking", text: part.thinking }];
		if (part.type === "toolCall") return [{ kind: "toolCall", name: stringField(part, "name") ?? "tool", argsJson: stableJsonPretty(part.arguments) ?? "" }];
		if (part.type === "image") return [{ kind: "image" }];
		return opaqueParts(part);
	});
}

function opaqueParts(value: unknown): MessagePart[] {
	const json = stableJsonPretty(value);
	return json === null ? [] : [{ kind: "opaque", json }];
}

function turnToolNames(message: NormalizedMessage): string[] {
	const direct = message.toolName === null ? [] : [message.toolName];
	const fromParts = message.parts.flatMap((part): string[] => (part.kind === "toolCall" ? [part.name] : []));
	return [...new Set([...direct, ...fromParts])];
}

function messageChars(message: NormalizedMessage): number {
	const contentChars = message.parts.reduce((total, part) => total + partChars(part), 0);
	return (message.toolName?.length ?? 0) + (message.detailsJson?.length ?? 0) + contentChars;
}

function partChars(part: MessagePart): number {
	switch (part.kind) {
		case "text":
		case "thinking":
			return part.text.length;
		case "toolCall":
			return part.name.length + part.argsJson.length;
		case "image":
			return 0;
		case "opaque":
			return part.json.length;
	}
}

function excerptOf(message: NormalizedMessage): string {
	const joined = message.parts.map(partExcerpt).filter((text) => text.length > 0).join(" ");
	if (joined.length > 0) return collapseToExcerpt(joined);
	if (message.toolName !== null) return collapseToExcerpt(message.toolName);
	return "";
}

function partExcerpt(part: MessagePart): string {
	switch (part.kind) {
		case "text":
		case "thinking":
			return part.text;
		case "toolCall":
			return `tool:${part.name}`;
		case "image":
			return "[image]";
		case "opaque":
			return part.json;
	}
}

function collapseToExcerpt(text: string): string {
	const collapsed = text.replace(/\s+/g, " ").trim();
	if (collapsed.length <= EXCERPT_MAX_CHARS) return collapsed;
	return `${collapsed.slice(0, EXCERPT_MAX_CHARS - 1)}…`;
}

/**
 * The single JSON stringify helper for messages: pretty-printed so estimates
 * count exactly what the verbatim view renders. Null when the value is absent
 * or not serializable.
 */
function stableJsonPretty(value: unknown): string | null {
	if (value === undefined) return null;
	try {
		return JSON.stringify(value, null, 2) ?? null;
	} catch {
		// Circular or non-serializable values contribute nothing.
		return null;
	}
}

function stableJsonLength(value: unknown): number {
	if (value === undefined) return 0;
	try {
		return JSON.stringify(value)?.length ?? 0;
	} catch {
		// Circular or non-serializable details contribute zero estimated chars.
		return 0;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function stringField(value: Record<string, unknown>, key: string): string | null {
	const field = value[key];
	return typeof field === "string" ? field : null;
}
