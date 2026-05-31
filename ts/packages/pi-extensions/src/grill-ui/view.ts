import type {
	GrillAskOption,
	GrillAskSelectorEntry,
	NormalizedGrillAskInput,
} from "../grill-ui.ts";

export type GrillAskMode = "choices" | "freeform";

export type GrillAskChoiceRow = {
	kind: "choice";
	index: number;
	option: GrillAskOption;
	recommended: boolean;
};

export type GrillAskFreeformRow = {
	kind: "freeform";
};

export type GrillAskEndGrillRow = {
	kind: "end_grill";
};

export type GrillAskRow = GrillAskChoiceRow | GrillAskFreeformRow | GrillAskEndGrillRow;

export function buildGrillAskRows(input: NormalizedGrillAskInput): GrillAskRow[] {
	const rows: GrillAskRow[] = input.options.map((option, optionIndex) => ({
		kind: "choice",
		index: optionIndex + 1,
		option,
		recommended: input.recommended.optionValue === option.value,
	}));

	if (input.allowFreeform) {
		rows.push({ kind: "freeform" });
	}
	if (input.allowEnd) {
		rows.push({ kind: "end_grill" });
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
		case "choice": {
			const marker = row.recommended ? " (recommended)" : "";
			return `${row.index}. ${singleLine(row.option.label)}${marker}`;
		}
		case "freeform":
			return "Other / freeform answer";
		case "end_grill":
			return "End grilling session";
		default: {
			const exhaustive: never = row;
			return exhaustive;
		}
	}
}

export function previewTextForRow(input: NormalizedGrillAskInput, row: GrillAskRow): string {
	switch (row.kind) {
		case "choice": {
			const parts = [`Value: ${row.option.value}`];
			if (row.option.description !== undefined) {
				parts.push(row.option.description);
			}
			if (row.recommended) {
				parts.push(`Recommended: ${input.recommended.answer}`);
				if (input.recommended.rationale !== undefined) {
					parts.push(`Rationale: ${input.recommended.rationale}`);
				}
			}
			return parts.join("\n\n");
		}
		case "freeform":
			return "Write a custom answer when none of the explicit choices captures your position.";
		case "end_grill":
			return "End this grilling session. The model should stop asking questions and summarize decisions, unresolved branches, and its final recommendation.";
		default: {
			const exhaustive: never = row;
			return exhaustive;
		}
	}
}

export function footerText(mode: GrillAskMode): string {
	return mode === "freeform"
		? "Enter submit • Esc back to choices"
		: "↑↓ navigate • Enter select • Esc cancel";
}

export function shouldUseSplitPreview(width: number): boolean {
	return width >= 100;
}

export function selectorEntryForRow(row: GrillAskRow): GrillAskSelectorEntry {
	switch (row.kind) {
		case "choice": {
			const marker = row.recommended ? "★ " : "";
			const description = row.option.description === undefined ? "" : ` — ${singleLine(row.option.description)}`;
			return {
				kind: "choice",
				display: `${row.index}. ${marker}${singleLine(row.option.label)}${description}`,
				index: row.index,
				option: row.option,
				recommended: row.recommended,
			};
		}
		case "freeform":
			return { kind: "freeform", display: "✎ Other / freeform answer" };
		case "end_grill":
			return { kind: "end_grill", display: "⏹ End grilling session" };
		default: {
			const exhaustive: never = row;
			return exhaustive;
		}
	}
}

export function buildGrillAskSelectorEntriesFromRows(input: NormalizedGrillAskInput): GrillAskSelectorEntry[] {
	return buildGrillAskRows(input).map(selectorEntryForRow);
}

function singleLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}
