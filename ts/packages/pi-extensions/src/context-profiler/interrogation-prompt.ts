import type { LiveRegion } from "./model.ts";

export const INTERROGATION_TOOLS = ["read", "grep", "find", "ls"] as const;

export interface EpisodeScopeSeed {
	label: string;
	kind: string;
	outcome: string | null;
	turnRange: { start: number; end: number };
	efficiency?: string;
	relevance?: string;
	analysisSummary?: string;
}

export type InterrogationScope = { type: "session" } | { type: "episode"; seed: EpisodeScopeSeed };

export function buildInterrogationSystemPrompt(options: {
	sessionId: string;
	model: string;
	turnCount: number;
	capturedAt: string;
}): string {
	return `You are an embedded context-profiler interrogation agent.

You answer questions about one frozen Pi provider-context bundle on disk. Your cwd is the bundle directory.

Bundle facts:
- sessionId: ${options.sessionId}
- host model: ${options.model}
- capturedAt: ${options.capturedAt}
- turnCount: ${options.turnCount}

Files:
- messages.jsonl: exact provider-visible messages, one JSON message per line. Line N is turn N.
- manifest.json: bundle envelope and content hash.
- system-prompt.md: exact system prompt text.
- episodes.json: optional late export of context-profiler episode claims. It may appear after you start; use ls to check and re-check between turns when relevant.

Rules:
- Answer only from files in this bundle. Do not use memory of the host session or assumptions.
- Verify before asserting. Read the relevant lines/files before answering.
- Cite turn numbers when discussing conversation content.
- Treat episode data as optional LM claims, not ground truth. Never invent episodes if episodes.json is absent.
- A FOCUS preamble in user questions is a hint, not a wall; answer broader session questions when asked.
- Keep terminal answers concise and direct.`;
}

export function scopeForRegion(region: LiveRegion): InterrogationScope {
	return {
		type: "episode",
		seed: {
			label: region.label,
			kind: region.kind,
			outcome: region.outcome,
			turnRange: { ...region.turnRange },
			...(region.efficiency === undefined ? {} : { efficiency: region.efficiency }),
			...(region.relevance === undefined ? {} : { relevance: region.relevance }),
			...(region.analysisSummary === undefined ? {} : { analysisSummary: region.analysisSummary }),
		},
	};
}

export function scopesEqual(left: InterrogationScope, right: InterrogationScope): boolean {
	if (left.type !== right.type) return false;
	if (left.type === "session" || right.type === "session") return true;
	return JSON.stringify(left.seed) === JSON.stringify(right.seed);
}

export function scopeLabel(scope: InterrogationScope): string {
	if (scope.type === "session") return "session";
	return `ep · t${scope.seed.turnRange.start}–${scope.seed.turnRange.end}`;
}

export function buildInterrogationUserMessage(options: {
	question: string;
	scope: InterrogationScope;
	includeScopePreamble: boolean;
}): string {
	if (!options.includeScopePreamble) return options.question;
	if (options.scope.type === "session") return `FOCUS: whole session.\n\n${options.question}`;
	const seed = options.scope.seed;
	const verdicts = [seed.efficiency === undefined ? null : `efficiency=${seed.efficiency}`, seed.relevance === undefined ? null : `relevance=${seed.relevance}`]
		.filter((part): part is string => part !== null)
		.join(" · ");
	const verdictLine = verdicts.length === 0 ? "" : `\nVerdicts: ${verdicts}`;
	const summaryLine = seed.analysisSummary === undefined ? "" : `\nSummary: ${seed.analysisSummary}`;
	return `FOCUS: episode ${seed.label} (${seed.kind}, outcome=${seed.outcome ?? "unknown"}, turns ${seed.turnRange.start}–${seed.turnRange.end}).${verdictLine}${summaryLine}\n\n${options.question}`;
}
