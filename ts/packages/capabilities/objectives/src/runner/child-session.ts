/**
 * ADR0024-LEGACY-DELETE(whole file): child dispatch left the CLI (ADR 0024);
 * the decomposed bookends need no session gateway. Deleted with `runner-step`.
 *
 * Contract for dispatching one child implementation session and observing it.
 *
 * The runner core depends only on this interface; the real Pi adapter lives in
 * the container's `pi` subpackage and the fake in `./fake-child-session.ts`.
 * The event vocabulary is deliberately minimal — richer variants can be added
 * additively without breaking existing adapters or consumers.
 */

export interface ChildSessionRequest {
	cwd: string;
	prompt: string;
	model?: string;
	timeoutMs?: number;
}

export type ChildSessionEvent =
	| { type: "activity"; line: string }
	| { type: "stderr"; text: string };

export type ChildSessionOutcome =
	| {
			type: "completed";
			exitCode: number;
			finalText: string;
			stderrTail: string;
			stopReason?: string;
			sessionFile?: string;
	  }
	| {
			type: "signaled";
			signal: NodeJS.Signals | string | null;
			stderrTail: string;
			sessionFile?: string;
	  }
	| { type: "timed-out"; stderrTail: string; sessionFile?: string }
	| { type: "startup-failed"; message: string };

export interface ChildSessionHandle {
	/** Streamed progress events; iteration ends once the session finishes. */
	events: AsyncIterable<ChildSessionEvent>;
	/**
	 * Resolves with the terminal outcome. Never rejects: every failure mode
	 * (timeout, spawn failure, nonzero exit) is an outcome variant.
	 */
	outcome: Promise<ChildSessionOutcome>;
}

export interface ChildSessionGateway {
	dispatch(request: ChildSessionRequest): ChildSessionHandle;
}
