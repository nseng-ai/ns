export interface GrillStatusSessionManagerLike {
	getBranch(): readonly unknown[];
}

export interface GrillStatusUiContext {
	setWidget?(
		key: string,
		content: string[] | undefined,
		options?: { placement?: "aboveEditor" | "belowEditor" },
	): void;
}

export interface GrillStatusEventContext {
	hasUI: boolean;
	ui: GrillStatusUiContext;
	sessionManager?: GrillStatusSessionManagerLike;
}

export type GrillStatusEventHandler = (
	event: unknown,
	ctx: GrillStatusEventContext,
) => Promise<void> | void;

export interface GrillStatusLifecycleHost {
	on(
		event: "turn_end" | "session_start" | "session_shutdown",
		handler: GrillStatusEventHandler,
	): void;
}

export type GrillStatusState =
	| { grill: "none" }
	| {
			grill: "active" | "confirmed" | "ended" | "failed";
			submittedRoundCount: number;
			answeredDecisionCount: number;
	  };
