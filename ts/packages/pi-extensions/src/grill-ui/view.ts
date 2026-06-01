import type { GrillAskOption, NormalizedGrillAskInput } from "../grill-ui.ts";

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

export interface GrillAskEndGrillRow {
	kind: "end_grill";
	index: number;
}

export type GrillAskRow = GrillAskChoiceRow | GrillAskFreeformRow | GrillAskEndGrillRow;

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
	if (input.allowEnd) {
		rows.push({ kind: "end_grill", index: rows.length + 1 });
	}

	return rows;
}

export function defaultGrillAskRowIndex(input: NormalizedGrillAskInput, rows: readonly GrillAskRow[]): number {
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
		case "end_grill":
			return "__end_grill__";
		default: {
			const exhaustive: never = row;
			return exhaustive;
		}
	}
}

export function rowLabel(row: GrillAskRow): string {
	switch (row.kind) {
		case "choice":
			return `${row.index}. ${singleLine(row.option.label)}`;
		case "freeform":
			return `${row.index}. Other / freeform answer`;
		case "end_grill":
			return `${row.index}. End grilling session`;
		default: {
			const exhaustive: never = row;
			return exhaustive;
		}
	}
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
	switch (row.kind) {
		case "choice": {
			const marker = row.recommended ? "★ " : "";
			const description = row.option.description === undefined ? "" : ` — ${singleLine(row.option.description)}`;
			return `${row.index}. ${marker}${singleLine(row.option.label)}${description}`;
		}
		case "freeform":
			return `${row.index}. ✎ Other / freeform answer`;
		case "end_grill":
			return `${row.index}. ⏹ End grilling session`;
		default: {
			const exhaustive: never = row;
			return exhaustive;
		}
	}
}

function singleLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}
