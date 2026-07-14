/** Completion written atomically by an in-sandbox dispatch harness. */
export interface DispatchHarnessCompletion {
	readonly outcome: "completed" | "failed";
	readonly summary?: string;
}
