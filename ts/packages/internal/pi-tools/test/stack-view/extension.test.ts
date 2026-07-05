/**
 * Extension-wiring tests for the enrichment engine lifecycle in
 * `handleStackViewCommand`. Both the engine factory and the stack loader are
 * exercised through the internal seams on {@link registerStackViewExtension}
 * (kept off the public parity surface). The default ack delivery is `"none"`, so
 * the registered handler runs straight through after a no-op acknowledgement.
 */
import type { Api, Model } from "@earendil-works/pi-ai";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { AuthStorage, ModelRegistry, type Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";

import registerStackViewExtension, {
	type CommandContext,
	type ComposeControllerHandle,
	type ExtensionAPI,
} from "../../src/stack-view/extension.ts";
import type { ComposeControllerOptions } from "../../src/stack-view/compose-controller.ts";
import type { StackEnrichmentPort } from "../../src/stack-view/enrichment-engine.ts";
import type { LoadStackViewResult } from "../../src/stack-view/data.ts";
import type { StackViewModel, StackViewPr } from "../../src/stack-view/types.ts";
import { createFakeComposeControllerHandle } from "./stack-view-fixtures.ts";
import { identityTheme } from "./stack-view-test-themes.ts";

const ESC = "\x1b";
const CTRL_Y = "\x19";

const TEST_MODEL: Model<Api> = {
	id: "m",
	name: "test model",
	api: "anthropic-messages",
	provider: "p",
	baseUrl: "https://example.invalid",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100_000,
	maxTokens: 4_096,
};

interface RecordingEngine {
	port: StackEnrichmentPort;
	abortCalls: () => number;
}

/** A StackEnrichmentPort that only records abort() calls; the rest are inert stubs. */
function recordingEngine(): RecordingEngine {
	let abortCalls = 0;
	const port: StackEnrichmentPort = {
		snapshot: () => new Map(),
		ensureRow: () => {},
		ensureAll: async () => {},
		progress: () => null,
		degradedReason: () => null,
		onChange: () => () => {},
		abort: () => {
			abortCalls += 1;
		},
	};
	return { port, abortCalls: () => abortCalls };
}

/** Capture every engine the factory hands out so tests can assert creation/abort. */
function recordingEngineFactory(): {
	factory: () => StackEnrichmentPort;
	engines: RecordingEngine[];
} {
	const engines: RecordingEngine[] = [];
	return {
		factory: () => {
			const engine = recordingEngine();
			engines.push(engine);
			return engine.port;
		},
		engines,
	};
}

interface CapturedCommand {
	handler: (args: string, ctx: CommandContext) => Promise<void> | void;
}

/** One entry in the ordered host delivery log: a rendered snapshot or a user message. */
type HostDelivery =
	| { type: "message"; message: unknown }
	| { type: "userMessage"; content: string; options?: { deliverAs?: "steer" | "followUp" } };

/** Minimal ExtensionAPI that captures the registered command handler and an ordered delivery log. */
function fakeHost(): {
	pi: ExtensionAPI;
	command: () => CapturedCommand;
	sentMessages: unknown[];
	deliveries: HostDelivery[];
} {
	let captured: CapturedCommand | undefined;
	const sentMessages: unknown[] = [];
	const deliveries: HostDelivery[] = [];
	const pi: ExtensionAPI = {
		registerCommand(_name, options) {
			captured = { handler: options.handler };
		},
		sendUserMessage(content, options) {
			deliveries.push(
				options === undefined
					? { type: "userMessage", content }
					: { type: "userMessage", content, options },
			);
		},
		sendMessage(message) {
			sentMessages.push(message);
			deliveries.push({ type: "message", message });
		},
		registerMessageRenderer() {},
		async exec() {
			return { stdout: "", stderr: "", code: 0, killed: false };
		},
	};
	return {
		pi,
		command: () => {
			if (captured === undefined) throw new Error("no command registered");
			return captured;
		},
		sentMessages,
		deliveries,
	};
}

function fakeModel(): StackViewModel {
	const pr: StackViewPr = {
		branch: "feature/1",
		parentBranch: "main",
		number: 1,
		title: "First",
		url: "https://github.com/acme/widgets/pull/1",
		graphiteUrl: "https://app.graphite.dev/pr/1",
		isDraft: false,
		body: "",
		threads: { resolved: 0, total: 0 },
		checks: { passing: 0, failing: 0, pending: 0, total: 0 },
		checkEntries: [],
		unresolvedThreads: [],
		status: "ready",
		objectiveSlugs: [],
	};
	return {
		trunk: "main",
		currentBranch: "feature/1",
		prs: [pr],
		owner: "acme",
		repo: "widgets",
		objectivesBySlug: new Map(),
	};
}

function okLoader(): () => Promise<LoadStackViewResult> {
	return async () => ({ type: "ok", model: fakeModel() });
}

function testRegistry(): ModelRegistry {
	return ModelRegistry.inMemory(AuthStorage.inMemory());
}

function fakeTui(): TUI {
	const terminal = { rows: 30 } satisfies Partial<TUI["terminal"]>;
	const tui = { terminal: terminal as TUI["terminal"], requestRender() {} } satisfies Partial<TUI>;
	return tui as TUI;
}

/** An interactive ctx whose overlay immediately settles via `settleKey` so the loop exits. */
function interactiveCtx(settleKey = "q"): CommandContext {
	return scriptedCtx([[settleKey]], TEST_MODEL);
}

/**
 * An interactive ctx that plays a per-overlay key script: `scripts[i]` drives the
 * `i`-th `ctx.ui.custom` invocation (later invocations default to `["q"]`). `model`
 * gates whether the compose option is offered — pass `undefined` for no model.
 */
function scriptedCtx(scripts: string[][], model: Model<Api> | undefined): CommandContext {
	let call = 0;
	return {
		cwd: "/repo",
		hasUI: true,
		model,
		modelRegistry: testRegistry(),
		waitForIdle: async () => {},
		ui: {
			notify() {},
			setStatus() {},
			custom<T>(
				factory: (
					tui: TUI,
					theme: Theme,
					keybindings: unknown,
					done: (value: T) => void,
				) => Component,
			): Promise<T> {
				const keys = scripts[call] ?? ["q"];
				call += 1;
				return new Promise<T>((resolve) => {
					const component = factory(fakeTui(), identityTheme(), undefined, resolve);
					for (const key of keys) component.handleInput?.(key);
				});
			},
		},
	};
}

/** An interactive ctx whose custom UI rejects after mount: the thrown-overlay fallback path. */
function rejectingCustomCtx(): {
	ctx: CommandContext;
	notifications: Array<{ message: string; level: string | undefined }>;
} {
	const notifications: Array<{ message: string; level: string | undefined }> = [];
	const ctx = interactiveCtx();
	ctx.ui.notify = (message, level) => {
		notifications.push({ message, level });
	};
	ctx.ui.custom = <T>(
		factory: (tui: TUI, theme: Theme, keybindings: unknown, done: (value: T) => void) => Component,
	): Promise<T> => {
		factory(fakeTui(), identityTheme(), undefined, () => {});
		return Promise.reject(new Error("custom UI unsupported"));
	};
	return { ctx, notifications };
}

/** A non-interactive ctx: the plain-snapshot fallback path. */
function nonInteractiveCtx(): CommandContext {
	return {
		cwd: "/repo",
		hasUI: false,
		model: TEST_MODEL,
		modelRegistry: testRegistry(),
		waitForIdle: async () => {},
		ui: {
			notify() {},
			setStatus() {},
		},
	};
}

interface RecordingComposeFactory {
	factory: (options: ComposeControllerOptions) => ComposeControllerHandle;
	controllers: Array<{ disposeCalls: () => number; stackBranch: string }>;
}

/** A compose-controller factory that hands out fake controllers and records each. */
function recordingComposeFactory(draft: string | null): RecordingComposeFactory {
	const controllers: Array<{ disposeCalls: () => number; stackBranch: string }> = [];
	return {
		factory: (options) => {
			const controller = createFakeComposeControllerHandle({ draft });
			controllers.push({
				disposeCalls: controller.disposeCalls,
				stackBranch: options.stackModel.currentBranch,
			});
			return controller.handle;
		},
		controllers,
	};
}

describe("stack-view extension enrichment wiring", () => {
	test("creates one engine on the interactive path and aborts it when the loop exits", async () => {
		const host = fakeHost();
		const { factory, engines } = recordingEngineFactory();
		registerStackViewExtension(host.pi, { engineFactory: factory, loadStackView: okLoader() });

		await host.command().handler("", interactiveCtx());

		expect(engines).toHaveLength(1);
		expect(engines[0]?.abortCalls()).toBe(1);
	});

	test("aborts the engine on the summarize exit, not just close", async () => {
		const host = fakeHost();
		const { factory, engines } = recordingEngineFactory();
		registerStackViewExtension(host.pi, { engineFactory: factory, loadStackView: okLoader() });

		await host.command().handler("", interactiveCtx("s"));

		expect(engines).toHaveLength(1);
		expect(engines[0]?.abortCalls()).toBe(1);
	});

	test("aborts the engine and surfaces a warning when the custom UI rejects (snapshot fallback path)", async () => {
		const host = fakeHost();
		const { factory, engines } = recordingEngineFactory();
		registerStackViewExtension(host.pi, { engineFactory: factory, loadStackView: okLoader() });

		const { ctx, notifications } = rejectingCustomCtx();
		await host.command().handler("", ctx);

		expect(engines).toHaveLength(1);
		expect(engines[0]?.abortCalls()).toBe(1);
		expect(host.sentMessages).toHaveLength(1); // fell back to the plain snapshot
		// The overlay failure is surfaced at warning level, not silently swallowed, and
		// the concrete error message rides along.
		expect(notifications).toContainEqual({
			message: expect.stringContaining("overlay failed"),
			level: "warning",
		});
		expect(notifications.some((entry) => entry.message.includes("custom UI unsupported"))).toBe(
			true,
		);
	});

	test("never creates the engine on the non-interactive fallback path", async () => {
		const host = fakeHost();
		const { factory, engines } = recordingEngineFactory();
		registerStackViewExtension(host.pi, { engineFactory: factory, loadStackView: okLoader() });

		await host.command().handler("", nonInteractiveCtx());

		expect(engines).toHaveLength(0);
		expect(host.sentMessages).toHaveLength(1); // the plain snapshot
	});
});

describe("stack-view extension compose wiring", () => {
	test("compose-inject sends the snapshot before delivering the draft as a follow-up", async () => {
		const host = fakeHost();
		const compose = recordingComposeFactory("drafted message");
		registerStackViewExtension(host.pi, {
			loadStackView: okLoader(),
			composeControllerFactory: compose.factory,
		});

		// Enter compose (build the controller), then Ctrl+Y to accept & inject.
		await host.command().handler("", scriptedCtx([["p", CTRL_Y]], TEST_MODEL));

		expect(compose.controllers).toHaveLength(1);
		expect(host.deliveries).toEqual([
			{ type: "message", message: expect.anything() },
			{ type: "userMessage", content: "drafted message", options: { deliverAs: "followUp" } },
		]);
	});

	test("refresh disposes the compose controller; a new one is built on the next entry", async () => {
		const host = fakeHost();
		const compose = recordingComposeFactory(null);
		registerStackViewExtension(host.pi, {
			loadStackView: okLoader(),
			composeControllerFactory: compose.factory,
		});

		// First overlay: enter compose (controller #1), Esc to browse, then refresh.
		// Second overlay: enter compose again (controller #2), Esc to browse, close.
		await host.command().handler(
			"",
			scriptedCtx(
				[
					["p", ESC, "r"],
					["p", ESC, "q"],
				],
				TEST_MODEL,
			),
		);

		expect(compose.controllers).toHaveLength(2);
		expect(compose.controllers[0]?.disposeCalls()).toBe(1);
	});

	test("re-entering compose after an open outcome keeps the same controller and its draft", async () => {
		const host = fakeHost();
		const compose = recordingComposeFactory("keep me");
		registerStackViewExtension(host.pi, {
			loadStackView: okLoader(),
			composeControllerFactory: compose.factory,
		});

		// First overlay: enter compose (controller #1), Esc, `o` opens the PR URL and the
		// loop continues (rebuilding the overlay) WITHOUT disposing anything. Second overlay:
		// enter compose again — getPort must hand back the SAME memoized controller, so its
		// in-progress side session, transcript, and draft survive the open round-trip.
		await host.command().handler(
			"",
			scriptedCtx(
				[
					["p", ESC, "o"],
					["p", ESC, "q"],
				],
				TEST_MODEL,
			),
		);

		// Built exactly once across the round-trip, and disposed only by the loop finally.
		expect(compose.controllers).toHaveLength(1);
		expect(compose.controllers[0]?.disposeCalls()).toBe(1);
	});

	test("offers no compose option when the session has no model", async () => {
		const host = fakeHost();
		const compose = recordingComposeFactory("unused");
		registerStackViewExtension(host.pi, {
			loadStackView: okLoader(),
			composeControllerFactory: compose.factory,
		});

		// `p` is inert without a model; `q` closes the overlay so the loop exits.
		await host.command().handler("", scriptedCtx([["p", "q"]], undefined));

		expect(compose.controllers).toHaveLength(0);
	});
});
