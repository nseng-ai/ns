import type { GrillAskOption, NormalizedGrillAskInput } from "./protocol.ts";

export type GrillAskMode = "choices" | "freeform";

export interface GrillAskChoiceRow {
	kind: "choice";
	index: number;
	option: GrillAskOption;
	recommended: boolean;
}

export interface GrillAskFreeformRow {
	kind: "freeform";
	index: number;
}

export interface GrillAskStatusRow {
	kind: "status";
	index: number;
}

export interface GrillAskEndGrillRow {
	kind: "end-grill";
	index: number;
}

export type GrillAskExceptionalRow = GrillAskFreeformRow | GrillAskStatusRow | GrillAskEndGrillRow;

export type GrillAskRow = GrillAskChoiceRow | GrillAskExceptionalRow;

export interface GrillAskExceptionalRowDisplay {
	glyph: string;
	label: string;
}

const ROW_KIND_DISPLAY = {
	freeform: { glyph: "✎", label: "Other / freeform answer" },
	status: { glyph: "ℹ", label: "Show current grill status" },
	"end-grill": { glyph: "⏹", label: "End grilling session" },
} as const satisfies Record<GrillAskExceptionalRow["kind"], GrillAskExceptionalRowDisplay>;

export function exceptionalRowDisplay(row: GrillAskExceptionalRow): GrillAskExceptionalRowDisplay {
	return ROW_KIND_DISPLAY[row.kind];
}

export function buildGrillAskRows(input: NormalizedGrillAskInput): GrillAskRow[] {
	const rows: GrillAskRow[] = input.options.map((option, optionIndex) => ({
		kind: "choice",
		index: optionIndex + 1,
		option,
		recommended: input.recommended.optionValue === option.value,
	}));

	if (input.allowFreeform) {
		rows.push({ kind: "freeform", index: rows.length + 1 });
	}
	rows.push({ kind: "status", index: rows.length + 1 });
	if (input.allowEnd) {
		rows.push({ kind: "end-grill", index: rows.length + 1 });
	}

	return rows;
}

export function defaultGrillAskRowIndex(
	input: NormalizedGrillAskInput,
	rows: readonly GrillAskRow[],
): number {
	if (input.recommended.optionValue !== undefined) {
		const recommendedIndex = rows.findIndex(
			(row) => row.kind === "choice" && row.option.value === input.recommended.optionValue,
		);
		if (recommendedIndex >= 0) return recommendedIndex;
	}

	const firstChoiceIndex = rows.findIndex((row) => row.kind === "choice");
	return firstChoiceIndex >= 0 ? firstChoiceIndex : 0;
}

export function rowValue(row: GrillAskRow): string {
	switch (row.kind) {
		case "choice":
			return row.option.value;
		case "freeform":
			return "__freeform__";
		case "status":
			return "__status__";
		case "end-grill":
			return "__end-grill__";
		default: {
			const exhaustive: never = row;
			return exhaustive;
		}
	}
}

export function rowLabel(row: GrillAskRow): string {
	if (row.kind === "choice") return `${row.index}. ${singleLine(row.option.label)}`;

	return `${row.index}. ${exceptionalRowDisplay(row).label}`;
}

export function rowRecommendationTag(row: GrillAskRow): string | undefined {
	return row.kind === "choice" && row.recommended ? "★ recommended" : undefined;
}

export function choiceDetailLines(input: NormalizedGrillAskInput, row: GrillAskRow): string[] {
	if (row.kind !== "choice") return [];

	const lines: string[] = [];
	if (row.option.description !== undefined) {
		lines.push(row.option.description);
	}
	if (row.recommended && input.recommended.rationale !== undefined) {
		lines.push(`Why: ${input.recommended.rationale}`);
	}
	return lines;
}

export function footerText(mode: GrillAskMode): string {
	return mode === "freeform"
		? "Enter submit • Esc back to choices"
		: "↑↓/j/k navigate • number/Enter select • Esc cancel";
}

export function rowSelectDisplay(row: GrillAskRow): string {
	if (row.kind === "choice") {
		const marker = row.recommended ? "★ " : "";
		const description =
			row.option.description === undefined ? "" : ` — ${singleLine(row.option.description)}`;
		return `${row.index}. ${marker}${singleLine(row.option.label)}${description}`;
	}

	const display = exceptionalRowDisplay(row);
	return `${row.index}. ${display.glyph} ${display.label}`;
}

function singleLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}
