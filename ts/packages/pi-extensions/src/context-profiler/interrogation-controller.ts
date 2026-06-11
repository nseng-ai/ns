import type { Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { PersistedBundle } from "./bundle-store.ts";
import { buildInterrogationSystemPrompt, buildInterrogationUserMessage, scopesEqual, type InterrogationScope } from "./interrogation-prompt.ts";
import type { InterrogationSession, InterrogationSessionFactory } from "./interrogation-session.ts";
import { appendNotice, appendUser, applyInterrogationEvent, createTranscript, type TranscriptState } from "./interrogation-transcript.ts";

export type InterrogationAvailability = { ok: true } | { ok: false; reason: string };

export interface InterrogationControllerOptions {
	bundle: PersistedBundle;
	model: Model<any> | undefined;
	modelRegistry: ModelRegistry;
	factory: InterrogationSessionFactory;
	onTranscriptChange: (state: TranscriptState) => void;
}

export class InterrogationController {
	private readonly bundle: PersistedBundle;
	private readonly model: Model<any> | undefined;
	private readonly modelRegistry: ModelRegistry;
	private readonly factory: InterrogationSessionFactory;
	private readonly onTranscriptChange: (state: TranscriptState) => void;
	private transcript: TranscriptState;
	private session: InterrogationSession | null;
	private isStarting: boolean;
	private unavailableReason: string | null;
	private lastScope: InterrogationScope | null;

	constructor(options: InterrogationControllerOptions) {
		this.bundle = options.bundle;
		this.model = options.model;
		this.modelRegistry = options.modelRegistry;
		this.factory = options.factory;
		this.onTranscriptChange = options.onTranscriptChange;
		this.transcript = createTranscript();
		this.session = null;
		this.isStarting = false;
		this.unavailableReason = null;
		this.lastScope = null;
	}

	get bundleOrdinal(): number {
		return this.bundle.ordinal;
	}

	get state(): TranscriptState {
		return { ...this.transcript, entries: [...this.transcript.entries] };
	}

	async ensureStarted(): Promise<InterrogationAvailability> {
		if (this.session !== null) return { ok: true };
		if (this.unavailableReason !== null) return { ok: false, reason: this.unavailableReason };
		if (this.model === undefined) return this.markUnavailable("host session has no selected model");
		if (this.isStarting) return { ok: false, reason: "interrogation agent is still spawning" };
		this.isStarting = true;
		this.emitNotice("spawning interrogation agent…");
		const result = await this.factory.create({
			bundleDir: this.bundle.dir,
			systemPrompt: buildInterrogationSystemPrompt({
				sessionId: this.bundle.sessionId,
				model: this.bundle.model,
				turnCount: this.bundle.turnCount,
				capturedAt: this.bundle.capturedAt,
			}),
			model: this.model,
			modelRegistry: this.modelRegistry,
		});
		this.isStarting = false;
		if (!result.ok) return this.markUnavailable(result.error.message);
		this.session = result.value;
		this.session.subscribe((event) => {
			this.transcript = applyInterrogationEvent(this.transcript, event);
			this.onTranscriptChange(this.state);
		});
		this.emitNotice("interrogation agent ready");
		return { ok: true };
	}

	async ask(question: string, scope: InterrogationScope): Promise<void> {
		const trimmed = question.trim();
		if (trimmed.length === 0) return;
		const started = await this.ensureStarted();
		if (!started.ok) {
			this.emitNotice(`interrogation unavailable: ${started.reason}`);
			return;
		}
		const session = this.session;
		if (session === null) return;
		if (session.isStreaming() || this.transcript.isStreaming) {
			this.emitNotice("wait for the current answer or press Ctrl+C to abort it");
			return;
		}
		const includeScopePreamble = this.lastScope === null || !scopesEqual(this.lastScope, scope);
		this.lastScope = scope;
		this.transcript = appendUser(this.transcript, trimmed);
		this.onTranscriptChange(this.state);
		const result = await session.ask(buildInterrogationUserMessage({ question: trimmed, scope, includeScopePreamble }));
		if (!result.ok) this.emitNotice(`prompt failed: ${result.error.message}`);
	}

	async abortTurn(): Promise<void> {
		if (this.session === null) return;
		await this.session.abortTurn();
	}

	dispose(): void {
		this.session?.dispose();
		this.session = null;
	}

	private markUnavailable(reason: string): InterrogationAvailability {
		this.isStarting = false;
		this.unavailableReason = reason;
		return { ok: false, reason };
	}

	private emitNotice(text: string): void {
		this.transcript = appendNotice(this.transcript, text);
		this.onTranscriptChange(this.state);
	}
}
