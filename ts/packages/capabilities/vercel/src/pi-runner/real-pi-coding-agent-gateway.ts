// The real PiCodingAgentGateway adapter over the
// `@earendil-works/pi-coding-agent` library API — the one module that
// touches the pi library, so its pre-1.0 churn (a recorded risk) lands
// here and nowhere else. Prior art for driving the library headless:
// `@ai-sdk/harness-pi` and this repo's own `PiTextGenerator`; this adapter
// stays deliberately thinner than both. One session per run: created over
// the checkout so pi's default discovery picks up the repo's skills,
// extensions, and context files from the checkout itself; the model comes
// from pi's own default resolution (settings, else first model with a
// usable key — the launch environment carries the model key). Session
// state is in-memory: the decision log and the landed commits are the
// run's durable record, not a session file. `sdk` is the test seam;
// production uses the lazy library-backed default.
import type { PiCodingAgentGateway, PiCodingAgentRunResult } from "./runner.ts";

export interface PiAgentSdkSession {
	prompt(text: string): Promise<void>;
	/** The session's message history, opaque to the seam. */
	messages(): readonly unknown[];
	dispose(): void;
}

export interface PiAgentSessionSdk {
	createSession(options: { readonly cwd: string }): Promise<PiAgentSdkSession>;
}

const piCodingAgentSdk: PiAgentSessionSdk = {
	async createSession(options) {
		// Lazy import: the pi library is loaded only when a real session
		// starts, never when this module is merely imported.
		const { createAgentSession, SessionManager } = await import("@earendil-works/pi-coding-agent");
		const { session } = await createAgentSession({
			cwd: options.cwd,
			sessionManager: SessionManager.inMemory(),
		});
		return {
			prompt: async (text) => {
				await session.prompt(text);
			},
			messages: () => session.messages,
			dispose: () => {
				session.dispose();
			},
		};
	},
};

export function createRealPiCodingAgentGateway(options: {
	readonly cwd: string;
	readonly sdk?: PiAgentSessionSdk;
}): PiCodingAgentGateway {
	const sdk = options.sdk ?? piCodingAgentSdk;
	return {
		async runPromptToCompletion(run): Promise<PiCodingAgentRunResult> {
			let session: PiAgentSdkSession;
			try {
				session = await sdk.createSession({ cwd: options.cwd });
			} catch (error) {
				return {
					ok: false,
					message: `Starting the pi agent session failed: ${formatError(error)}`,
				};
			}
			try {
				await session.prompt(run.prompt);
				return extractPiAgentRunResult(session.messages());
			} catch (error) {
				return { ok: false, message: `The pi agent run failed: ${formatError(error)}` };
			} finally {
				try {
					session.dispose();
				} catch {
					// Disposal problems must not mask the run's outcome.
				}
			}
		},
	};
}

/**
 * Read the run's outcome from the session's message history: the last
 * assistant message decides. A terminal `error`/`aborted` stop reason is a
 * failed run; otherwise the message's text blocks become the completion
 * summary. Narrowing is defensive throughout — the message shape belongs
 * to the pre-1.0 library.
 */
export function extractPiAgentRunResult(messages: readonly unknown[]): PiCodingAgentRunResult {
	const lastAssistant = findLastAssistantMessage(messages);
	if (lastAssistant === null) {
		return { ok: false, message: "The pi agent produced no assistant response." };
	}
	const stopReason = lastAssistant["stopReason"];
	if (stopReason === "error" || stopReason === "aborted") {
		const errorMessage = lastAssistant["errorMessage"];
		return {
			ok: false,
			message:
				typeof errorMessage === "string" && errorMessage.length > 0
					? errorMessage
					: `The pi agent stopped with ${stopReason}.`,
		};
	}
	return { ok: true, finalAssistantText: extractAssistantText(lastAssistant) };
}

function findLastAssistantMessage(messages: readonly unknown[]): Record<string, unknown> | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (isRecord(message) && message["role"] === "assistant") return message;
	}
	return null;
}

function extractAssistantText(message: Record<string, unknown>): string | null {
	const content = message["content"];
	if (!Array.isArray(content)) return null;
	const parts: string[] = [];
	for (const block of content) {
		if (!isRecord(block) || block["type"] !== "text") continue;
		const text = block["text"];
		if (typeof text === "string") parts.push(text);
	}
	const text = parts.join("\n").trim();
	return text.length === 0 ? null : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
