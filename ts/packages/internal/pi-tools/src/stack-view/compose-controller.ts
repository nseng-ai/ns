/**
 * The compose subsystem's state machine: a lazy-spawn controller that bridges the
 * pure transcript/draft reducers to the external {@link ComposeSession} seam. It
 * owns availability (sticky-unavailable ladder), the single-flight spawn (force a
 * full stack enrichment pass, then build the system prompt from the resulting
 * snapshot), the streaming guard, and draft extraction on each assistant-end.
 *
 * All observable state lives behind {@link ComposeViewPort}; every transition
 * calls `onChange` so a view can repaint. The controller is UI-agnostic — it does
 * not import any renderer — and depends on Pi only through the injected
 * {@link ComposeSessionFactory}.
 */
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

import type { ComposeSession, ComposeSessionFactory } from "./compose-session.ts";
import { extractDraft, stripDraftBlock } from "./compose-draft.ts";
import { buildComposeSystemPrompt } from "./compose-prompt.ts";
import {
	EMPTY_COMPOSE_TRANSCRIPT,
	appendNotice,
	appendUser,
	applyComposeEvent,
	lastAssistantText,
	replaceLastAssistantText,
	replaceLastNotice,
	setStreaming,
	type ComposeSessionEvent,
	type ComposeTranscriptState,
} from "./compose-transcript.ts";
import type { StackEnrichmentPort } from "./enrichment-engine.ts";
import type { StackViewModel } from "./types.ts";

const NO_MODEL_REASON = "no model selected in this session";

export interface ComposeViewPort {
	readonly transcript: ComposeTranscriptState;
	readonly draft: string | null;
	readonly unavailableReason: string | null;
	send(text: string): Promise<void>;
	abortTurn(): Promise<void>;
}

export interface ComposeControllerOptions {
	cwd: string;
	// pi-ai exposes runnable models as Model<Api>; undefined means the parent session has no model selected.
	model: Model<Api> | undefined;
	modelRegistry: ModelRegistry;
	stackModel: StackViewModel;
	enrichment: StackEnrichmentPort;
	factory: ComposeSessionFactory;
	onChange: () => void;
}

export class ComposeController implements ComposeViewPort {
	private readonly cwd: string;
	// Matches the pi-ai Model<Api> library seam accepted by the session factory; undefined → sticky unavailable.
	private readonly model: Model<Api> | undefined;
	private readonly modelRegistry: ModelRegistry;
	private readonly stackModel: StackViewModel;
	private readonly enrichment: StackEnrichmentPort;
	private readonly factory: ComposeSessionFactory;
	private readonly onChange: () => void;

	private transcriptState: ComposeTranscriptState;
	private draftValue: string | null;
	private unavailableReasonValue: string | null;
	private session: ComposeSession | null;
	private unsubscribeSession: (() => void) | null;
	private enrichmentUnsub: (() => void) | null;
	private isStarting: boolean;
	private isDisposed: boolean;

	constructor(options: ComposeControllerOptions) {
		this.cwd = options.cwd;
		this.model = options.model;
		this.modelRegistry = options.modelRegistry;
		this.stackModel = options.stackModel;
		this.enrichment = options.enrichment;
		this.factory = options.factory;
		this.onChange = options.onChange;

		this.transcriptState = EMPTY_COMPOSE_TRANSCRIPT;
		this.draftValue = null;
		this.unavailableReasonValue = options.model === undefined ? NO_MODEL_REASON : null;
		this.session = null;
		this.unsubscribeSession = null;
		this.enrichmentUnsub = null;
		this.isStarting = false;
		this.isDisposed = false;
	}

	get transcript(): ComposeTranscriptState {
		return this.transcriptState;
	}

	get draft(): string | null {
		return this.draftValue;
	}

	get unavailableReason(): string | null {
		return this.unavailableReasonValue;
	}

	async send(text: string): Promise<void> {
		const trimmed = text.trim();
		if (trimmed.length === 0) return;
		if (this.transcriptState.isStreaming) {
			this.emitNotice("wait for the current answer or press ctrl+c to abort it");
			return;
		}
		if (this.isStarting) {
			this.emitNotice("still preparing the compose session — send again once it is ready");
			return;
		}
		const started = await this.ensureStarted();
		if (!started) return; // reason already surfaced via unavailableReason / notices.
		const session = this.session;
		if (session === null) return;
		this.setTranscript(setStreaming(appendUser(this.transcriptState, trimmed), true));
		const result = await session.ask(trimmed).finally(() => {
			this.setTranscript(setStreaming(this.transcriptState, false));
		});
		if (!result.ok) this.emitNotice(`prompt failed: ${result.message}`);
	}

	async abortTurn(): Promise<void> {
		if (this.session === null) return;
		await this.session.abortTurn();
	}

	dispose(): void {
		if (this.isDisposed) return; // idempotent
		this.isDisposed = true;
		this.enrichmentUnsub?.();
		this.enrichmentUnsub = null;
		this.unsubscribeSession?.();
		this.unsubscribeSession = null;
		this.session?.dispose();
		this.session = null;
	}

	/** Lazy single-flight spawn. Returns true only when a live session is ready. */
	private async ensureStarted(): Promise<boolean> {
		if (this.isDisposed) return false;
		if (this.session !== null) return true;
		if (this.unavailableReasonValue !== null) return false; // sticky unavailable stays sticky.
		if (this.isStarting) return false; // re-entrancy rejected while spawning.
		const model = this.model;
		if (model === undefined) return false; // guarded above via sticky reason; narrows the type.
		this.isStarting = true;
		try {
			// Force a full enrichment pass so the system prompt reflects the freshest
			// summaries; surface progress in a single, replace-in-place notice.
			this.setTranscript(appendNotice(this.transcriptState, "enriching stack…"));
			this.enrichmentUnsub = this.enrichment.onChange(() => {
				this.setTranscript(replaceLastNotice(this.transcriptState, this.enrichNoticeText()));
			});
			await this.enrichment.ensureAll(this.stackModel);
			this.enrichmentUnsub?.();
			this.enrichmentUnsub = null;
			// Disposed while enriching: stop before touching the dead view or paying
			// for a session spawn that would be dropped immediately.
			if (this.isDisposed) return false;
			this.setTranscript(replaceLastNotice(this.transcriptState, this.enrichNoticeText()));

			const systemPrompt = buildComposeSystemPrompt({
				model: this.stackModel,
				enrichment: this.enrichment.snapshot(),
			});
			const result = await this.factory.create({
				cwd: this.cwd,
				systemPrompt,
				model,
				modelRegistry: this.modelRegistry,
			});
			if (this.isDisposed) {
				// Disposed mid-spawn: drop the freshly created session rather than leak it.
				if (result.ok) result.value.dispose();
				return false;
			}
			if (!result.ok) {
				this.unavailableReasonValue = result.message;
				this.emitNotice(`compose unavailable: ${result.message}`);
				return false;
			}
			this.session = result.value;
			this.unsubscribeSession = this.session.subscribe((event) => {
				this.applySessionEvent(event);
			});
			return true;
		} finally {
			// Both awaited seams are contractually errors-as-values, but a misbehaving
			// injected port/factory must not wedge the controller in `isStarting`.
			this.isStarting = false;
		}
	}

	private applySessionEvent(event: ComposeSessionEvent): void {
		const next = applyComposeEvent(this.transcriptState, event);
		this.setTranscript(event.type === "assistant-end" ? this.handleAssistantEnd(next) : next);
	}

	/** On assistant-end: promote a draft block to `draft`, or notice its absence. */
	private handleAssistantEnd(state: ComposeTranscriptState): ComposeTranscriptState {
		const text = lastAssistantText(state);
		if (text === null) return state;
		const draft = extractDraft(text);
		if (draft === null) {
			return appendNotice(state, "reply had no draft block — kept previous draft");
		}
		this.draftValue = draft;
		return replaceLastAssistantText(state, stripDraftBlock(text));
	}

	private enrichNoticeText(): string {
		const progress = this.enrichment.progress();
		if (progress === null) return "enriching stack…";
		return `enriching stack… ${progress.done}/${progress.total}`;
	}

	private setTranscript(next: ComposeTranscriptState): void {
		this.transcriptState = next;
		this.onChange();
	}

	private emitNotice(text: string): void {
		this.setTranscript(appendNotice(this.transcriptState, text));
	}
}
