import { displayWidth } from "@nseng-ai/foundation/text-table";

export type NsNotifyLevel = "info" | "warning" | "error";

export interface NsCommandMessageOptions {
	/** Notification level for text-only fallback sinks. Defaults to "info". */
	level?: NsNotifyLevel;
	/**
	 * Opaque structured presentation payload for rich sinks (e.g. a Pi custom
	 * scrollback message's `details`). The SDK never inspects this value.
	 */
	details?: unknown;
	/**
	 * When true, emit only to a rich sink. Text-only sinks drop the message.
	 * Use for content already delivered through another durable channel (e.g. a
	 * CLI summary printed via notify) so it is not duplicated in fallback output.
	 */
	isRichOnly?: boolean;
}

export interface NsCommandIo {
	/** Transient, human-facing phase text. Non-contractual wording; never stdout in machine mode. */
	phase(message: string): void;
	/** Terminal human notification (success/warning/error). */
	notify(message: string, level?: NsNotifyLevel): void;
	/**
	 * Durable, human-facing scrollback message. Rich sinks (e.g. Pi custom
	 * messages) receive `details`; text-only sinks render the message as transient
	 * phase text, or drop it entirely when `isRichOnly` is set.
	 */
	message(message: string, options?: NsCommandMessageOptions): void;
	/** Clears any sticky transient phase (no-op for append-only sinks). */
	clearPhase(): void;
}

export const noopNsCommandIo: NsCommandIo = {
	phase: () => {},
	notify: () => {},
	message: () => {},
	clearPhase: () => {},
};

/** Presentation metadata for a declared phase checklist. */
export interface NsProgressPhaseInfo {
	key: string;
	name: string;
	label?: string;
	detail?: string;
}

/** A long-running operation currently blocking workflow progress. */
export type ActiveOperation =
	| { kind: "command"; display: string }
	| { kind: "model"; operation: string; modelRef: string; detail?: string };

/** Lifecycle state of a single matrix cell. */
export type NsProgressMatrixCellState = "pending" | "active" | "done" | "skipped" | "failed";

/** Presentation metadata for a declared matrix column. */
export interface NsProgressMatrixColumnInfo {
	key: string;
	label: string;
	/** Preferred display width hint in cells; hosts may ignore. */
	width?: number;
}

/** Presentation metadata for a declared matrix row. */
export interface NsProgressMatrixRowInfo {
	rowKey: string;
	label: string;
}

/**
 * Optional per-row × per-column progress-grid events streamed alongside the
 * phase checklist. Hosts without matrix rendering ignore them.
 */
export type NsProgressMatrixEvent =
	| {
			type: "matrix-declared";
			columns: readonly NsProgressMatrixColumnInfo[];
			labelHeader?: string;
	  }
	| { type: "matrix-rows"; rows: readonly NsProgressMatrixRowInfo[] }
	| {
			type: "matrix-cell";
			rowKey: string;
			columnKey: string;
			state: NsProgressMatrixCellState;
			/** Compact cell text; hosts render it only when it fits the column. */
			text?: string;
	  }
	| { type: "matrix-active-operations"; operations: readonly ActiveOperation[] };

export type NsProgressPhaseEvent =
	| { type: "phases-declared"; title: string; phases: readonly NsProgressPhaseInfo[] }
	| { type: "title-changed"; title: string }
	| { type: "phase-started"; phaseKey: string; label?: string }
	| { type: "phase-progress"; phaseKey: string; label: string }
	| { type: "phase-done"; phaseKey: string; detail?: string }
	| { type: "phase-failed"; phaseKey: string; detail: string }
	| NsProgressMatrixEvent;

export const MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS = 18;
export const MATRIX_PROGRESS_MAX_LABEL_WIDTH_CHARS = 36;

export function matrixProgressDisplayWidthChars(value: string): number {
	return displayWidth(value);
}

export function clampMatrixProgressLabelWidthChars(preferredWidthChars: number): number {
	return Math.max(
		MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS,
		Math.min(MATRIX_PROGRESS_MAX_LABEL_WIDTH_CHARS, preferredWidthChars),
	);
}

export function centerMatrixProgressText(text: string, widthChars: number): string {
	const padChars = Math.max(0, widthChars - matrixProgressDisplayWidthChars(text));
	const leftPadChars = Math.floor(padChars / 2);
	return `${" ".repeat(leftPadChars)}${text}${" ".repeat(padChars - leftPadChars)}`;
}

export function padMatrixProgressTextEnd(text: string, widthChars: number): string {
	const padChars = Math.max(0, widthChars - matrixProgressDisplayWidthChars(text));
	return `${text}${" ".repeat(padChars)}`;
}

// `satisfies Record<..., true>` keeps this membership list two-way exhaustive
// against NsProgressMatrixEvent: adding or removing a variant fails to compile
// until the guard is updated.
const MATRIX_EVENT_TYPES = {
	"matrix-declared": true,
	"matrix-rows": true,
	"matrix-cell": true,
	"matrix-active-operations": true,
} satisfies Record<NsProgressMatrixEvent["type"], true>;

export function isMatrixProgressEvent(event: NsProgressPhaseEvent): event is NsProgressMatrixEvent {
	return event.type in MATRIX_EVENT_TYPES;
}

export type NsProgressPhaseListener = (event: NsProgressPhaseEvent) => void;

export interface NsProgress {
	/** True when a host listener consumes phase events; false for the noop sink. */
	readonly isLive: boolean;
	phase(event: NsProgressPhaseEvent): void;
}

export const noopNsProgress: NsProgress = {
	isLive: false,
	phase: () => {},
};
