import type { NormalizedGrillAskInput } from "../grill-ui.ts";
import {
	buildGrillAskRows,
	defaultGrillAskRowIndex,
	type GrillAskChoiceRow,
	type GrillAskMode,
	type GrillAskRow,
} from "./view.ts";

export type GrillAskOutcome =
	| { action: "choice"; entry: GrillAskChoiceRow }
	| { action: "freeform"; answer: string }
	| { action: "status_request" }
	| { action: "end_grill" }
	| { action: "cancelled" };

export class GrillAskController {
	readonly input: NormalizedGrillAskInput;
	readonly rows: readonly GrillAskRow[];

	private currentMode: GrillAskMode = "choices";
	private currentFocusIndex: number;

	constructor(input: NormalizedGrillAskInput) {
		this.input = input;
		this.rows = buildGrillAskRows(input);
		this.currentFocusIndex = defaultGrillAskRowIndex(input, this.rows);
	}

	get mode(): GrillAskMode {
		return this.currentMode;
	}

	get focusIndex(): number {
		return this.currentFocusIndex;
	}

	get focusedRow(): GrillAskRow {
		const row = this.rows[this.currentFocusIndex] ?? this.rows[0];
		if (row === undefined) {
			throw new Error("grill_ask controller requires at least one row");
		}
		return row;
	}

	moveFocus(delta: number): void {
		if (this.currentMode !== "choices" || this.rows.length === 0) return;
		const lastIndex = this.rows.length - 1;
		this.currentFocusIndex = clamp(this.currentFocusIndex + delta, 0, lastIndex);
	}

	setFocus(index: number): void {
		if (this.currentMode !== "choices" || this.rows.length === 0) return;
		this.currentFocusIndex = clamp(index, 0, this.rows.length - 1);
	}

	openFreeform(): void {
		const freeformIndex = this.rows.findIndex((row) => row.kind === "freeform");
		if (freeformIndex < 0) return;
		this.currentFocusIndex = freeformIndex;
		this.currentMode = "freeform";
	}

	closeFreeform(): void {
		this.currentMode = "choices";
	}

	submitFocused(): GrillAskOutcome | undefined {
		const row = this.focusedRow;
		switch (row.kind) {
			case "choice":
				return { action: "choice", entry: row };
			case "freeform":
				this.currentMode = "freeform";
				return undefined;
			case "status":
				return { action: "status_request" };
			case "end_grill":
				return { action: "end_grill" };
			default: {
				const exhaustive: never = row;
				return exhaustive;
			}
		}
	}

	submitFreeform(answer: string): GrillAskOutcome | undefined {
		const trimmed = answer.trim();
		if (trimmed.length === 0) return undefined;
		return { action: "freeform", answer: trimmed };
	}

	escape(): GrillAskOutcome | undefined {
		if (this.currentMode === "freeform") {
			this.closeFreeform();
			return undefined;
		}
		return { action: "cancelled" };
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
