/**
 * The I/O half of the stack-view compose subsystem: a thin specialization of the
 * shared Pi side-session (see `../side-session/`). The compose agent is
 * context-only — it runs with an empty tool allowlist (`tools: []`), so the
 * shared session never emits tool events; this module narrows the shared
 * {@link SideSessionEvent} stream to the tool-less {@link ComposeSessionEvent}
 * the pure transcript reducer and controller state machine consume.
 */
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
	createPiSideSessionFactory,
	type CreateSideSessionResult,
	type SideSessionAskResult,
} from "../side-session/factory.ts";
import type { ComposeSessionEvent } from "./compose-transcript.ts";

export type ComposeAskResult = SideSessionAskResult;

export interface ComposeSession {
	subscribe(listener: (event: ComposeSessionEvent) => void): () => void;
	ask(text: string): Promise<ComposeAskResult>;
	abortTurn(): Promise<void>;
	dispose(): void;
}

export type CreateComposeSessionResult =
	| { ok: true; value: ComposeSession }
	| Extract<CreateSideSessionResult, { ok: false }>;

export interface ComposeSessionFactory {
	create(options: {
		cwd: string;
		systemPrompt: string;
		model: Model<Api>;
		modelRegistry: ModelRegistry;
	}): Promise<CreateComposeSessionResult>;
}

export function createPiComposeSessionFactory(): ComposeSessionFactory {
	const factory = createPiSideSessionFactory();
	return {
		async create(options) {
			// Empty allowlist → no tools enabled (context-only drafting agent).
			const result = await factory.create({ ...options, tools: [] });
			if (!result.ok) return result;
			const inner = result.value;
			return {
				ok: true,
				value: {
					subscribe(listener) {
						return inner.subscribe((event) => {
							if (event.type === "tool-start" || event.type === "tool-end") return;
							listener(event);
						});
					},
					ask: inner.ask.bind(inner),
					abortTurn: inner.abortTurn.bind(inner),
					dispose: inner.dispose.bind(inner),
				},
			};
		},
	};
}
