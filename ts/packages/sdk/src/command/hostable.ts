import type { NsProgressPhaseEvent } from "../sdk/services.ts";

export interface CommandEventSink {
	readonly isLive: boolean;
	emit(event: NsProgressPhaseEvent): void;
}

export interface ConfirmRequest {
	readonly message: string;
	readonly defaultChoice?: "confirm" | "decline";
}

export type ConfirmResult =
	| { readonly type: "confirmed" }
	| { readonly type: "declined" }
	| { readonly type: "unavailable" }
	| { readonly type: "aborted" };

export interface SelectChoice<T extends string = string> {
	readonly value: T;
	readonly label: string;
}

export interface SelectRequest<T extends string = string> {
	readonly message: string;
	readonly choices: readonly SelectChoice<T>[];
	readonly defaultChoice?: T;
}

export type SelectResult<T extends string = string> =
	| { readonly type: "selected"; readonly value: T }
	| { readonly type: "unavailable" }
	| { readonly type: "aborted" };

export interface CommandInteraction {
	confirm(request: ConfirmRequest): Promise<ConfirmResult>;
	select<T extends string>(request: SelectRequest<T>): Promise<SelectResult<T>>;
}

export interface HostableBundle {
	readonly cwd: string;
	/** Compatibility live-output sink while the default SDK event renderer is still being hoisted. */
	readonly onOutput?: (stream: "stdout" | "stderr", text: string) => void;
	readonly events: CommandEventSink;
	readonly interact: CommandInteraction;
}

const hostableRunBrand = Symbol.for("@nseng-ai/sdk/command/hostable");

export interface HostableRun<TContext, TRequest, TResult> {
	(context: TContext, request: TRequest): Promise<TResult> | TResult;
	readonly [hostableRunBrand]: true;
}

export function hostable<TContext, TRequest, TResult>(
	run: (context: TContext, request: TRequest) => Promise<TResult> | TResult,
): HostableRun<TContext, TRequest, TResult> {
	return Object.assign(run, { [hostableRunBrand]: true as const });
}

export function isHostableRun(value: unknown): value is HostableRun<never, never, unknown> {
	return typeof value === "function" && hostableRunBrand in value;
}

export function createUnavailableInteraction(): CommandInteraction {
	return {
		confirm: async () => ({ type: "unavailable" }),
		select: async () => ({ type: "unavailable" }),
	};
}
