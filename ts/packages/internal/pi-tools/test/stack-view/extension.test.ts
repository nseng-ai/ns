/**
 * Extension-wiring tests for the enrichment engine lifecycle in
 * `handleStackViewCommand`. Both the engine factory and the stack loader are
 * exercised through the internal seams on {@link registerStackViewExtension}
 * (kept off the public parity surface). The default ack delivery is `"none"`, so
 * the registered handler runs straight through after a no-op acknowledgement.
 */
import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { PiModelRegistryLike } from "@ns/pi/models/call";
import { describe, expect, test } from "vitest";

import registerStackViewExtension, {
	type CommandContext,
	type ExtensionAPI,
} from "../../src/stack-view/extension.ts";
import type { StackEnrichmentPort } from "../../src/stack-view/enrichment-engine.ts";
import type { LoadStackViewResult } from "../../src/stack-view/data.ts";
import type { StackViewModel, StackViewPr } from "../../src/stack-view/types.ts";
import { identityTheme } from "./stack-view-test-themes.ts";

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

/** Minimal ExtensionAPI that captures the registered command handler. */
function fakeHost(): { pi: ExtensionAPI; command: () => CapturedCommand; sentMessages: unknown[] } {
	let captured: CapturedCommand | undefined;
	const sentMessages: unknown[] = [];
	const pi: ExtensionAPI = {
		registerCommand(_name, options) {
			captured = { handler: options.handler };
		},
		sendUserMessage() {},
		sendMessage(message) {
			sentMessages.push(message);
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

function fakeRegistry(): PiModelRegistryLike {
	return {
		find: () => undefined,
		getApiKeyAndHeaders: async () => ({ ok: false, error: "unused" }),
	};
}

function fakeTui(): TUI {
	return { terminal: { rows: 30 }, requestRender() {} } as TUI;
}

/** An interactive ctx whose overlay immediately settles via `settleKey` so the loop exits. */
function interactiveCtx(settleKey = "q"): CommandContext {
	return {
		cwd: "/repo",
		hasUI: true,
		modelRegistry: fakeRegistry(),
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
				return new Promise<T>((resolve) => {
					const component = factory(fakeTui(), identityTheme(), undefined, resolve);
					component.handleInput?.(settleKey);
				});
			},
		},
	};
}

/** An interactive ctx whose custom UI rejects after mount: the thrown-overlay fallback path. */
function rejectingCustomCtx(): CommandContext {
	const ctx = interactiveCtx();
	ctx.ui.custom = <T>(
		factory: (tui: TUI, theme: Theme, keybindings: unknown, done: (value: T) => void) => Component,
	): Promise<T> => {
		factory(fakeTui(), identityTheme(), undefined, () => {});
		return Promise.reject(new Error("custom UI unsupported"));
	};
	return ctx;
}

/** A non-interactive ctx: the plain-snapshot fallback path. */
function nonInteractiveCtx(): CommandContext {
	return {
		cwd: "/repo",
		hasUI: false,
		modelRegistry: fakeRegistry(),
		waitForIdle: async () => {},
		ui: {
			notify() {},
			setStatus() {},
		},
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

	test("aborts the engine when the custom UI rejects (snapshot fallback path)", async () => {
		const host = fakeHost();
		const { factory, engines } = recordingEngineFactory();
		registerStackViewExtension(host.pi, { engineFactory: factory, loadStackView: okLoader() });

		await host.command().handler("", rejectingCustomCtx());

		expect(engines).toHaveLength(1);
		expect(engines[0]?.abortCalls()).toBe(1);
		expect(host.sentMessages).toHaveLength(1); // fell back to the plain snapshot
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
