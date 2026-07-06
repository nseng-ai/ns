import { parseManagedRegion, replaceManagedRegion } from "@nseng-ai/foundation/managed-region";

export const OBJECTIVE_INSTRUCTION_BLOCK_VERSION = 1;

const BEGIN_MARKER_PREFIX = "<!-- ns:objectives:begin";
const END_MARKER = "<!-- ns:objectives:end -->";

const INSTRUCTION_BODY = `## Objectives

This repository uses ns Objectives: durable planning records under \`.ns/objectives/\`
that carry work across sessions and branches.

- Before starting non-trivial work, run \`ns objective list\` and read any Objective that
  overlaps your task (start with its \`objective.md\` and \`roadmap.md\`).
- Use the \`ns objective\` CLI and the objective skills to create, advance, update, and
  close Objectives.`;

export function renderObjectiveInstructionBlock(): string {
	return `${BEGIN_MARKER_PREFIX} v${OBJECTIVE_INSTRUCTION_BLOCK_VERSION} -->\n${INSTRUCTION_BODY}\n${END_MARKER}`;
}

export type ApplyObjectiveInstructionBlockResult =
	| { type: "applied"; content: string; change: "appended" | "replaced" | "unchanged" }
	| { type: "malformed"; reason: string };

export function applyObjectiveInstructionBlock(input: {
	text: string;
}): ApplyObjectiveInstructionBlockResult {
	const block = renderObjectiveInstructionBlock();
	const parsed = parseManagedRegion({
		text: input.text,
		markers: { beginPrefix: BEGIN_MARKER_PREFIX, end: END_MARKER },
	});
	if (parsed.type === "malformed") return { type: "malformed", reason: parsed.reason };
	if (parsed.type === "missing") {
		const base = input.text.trimEnd();
		const content = base === "" ? `${block}\n` : `${base}\n\n${block}\n`;
		return { type: "applied", content, change: "appended" };
	}
	if (input.text.slice(parsed.start, parsed.end) === block) {
		return { type: "applied", content: input.text, change: "unchanged" };
	}
	const replaced = replaceManagedRegion({
		text: input.text,
		replacement: block,
		start: parsed.start,
		end: parsed.end,
	});
	return { type: "applied", content: `${replaced}\n`, change: "replaced" };
}

export const CLAUDE_AGENTS_IMPORT_LINE = "See @AGENTS.md — agent instructions for this repository.";

export interface EnsureClaudeAgentsImportResult {
	content: string;
	change: "appended" | "unchanged";
}

export function ensureClaudeAgentsImport(input: { text: string }): EnsureClaudeAgentsImportResult {
	if (input.text.includes("@AGENTS.md")) return { content: input.text, change: "unchanged" };
	const base = input.text.trimEnd();
	const content =
		base === "" ? `${CLAUDE_AGENTS_IMPORT_LINE}\n` : `${base}\n\n${CLAUDE_AGENTS_IMPORT_LINE}\n`;
	return { content, change: "appended" };
}
