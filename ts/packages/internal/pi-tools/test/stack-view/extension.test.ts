/**
 * Extension-wiring tests for the enrichment engine lifecycle in
 * `handleStackViewCommand`. Both the engine factory and the stack loader are
 * exercised through the internal seams on {@link registerStackViewExtension}
 * (kept off the public parity surface). The default ack delivery is `"none"`, so
 * the registered handler runs straight through after a no-op acknowledgement.
 */
import type { Component, TUI } from "@earendil-works/pi-tui";
import { AuthStorage, ModelRegistry, type Theme } from "@earendil-works/pi-coding-agent";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { describe, expect, test } from "vitest";

import registerStackViewExtension, {
	type CommandContext,
	type ExtensionAPI,
} from "../../src/stack-view/extension.ts";
import type { StackEnrichmentPort } from "../../src/stack-view/enrichment-engine.ts";
import type { LoadStackViewResult } from "../../src/stack-view/data.ts";
import type { StackViewModel, StackViewPr } from "../../src/stack-view/types.ts";
import { identityTheme } from "./stack-view-test-themes.ts";

const projectConfigGateway: ProjectConfigGateway = {
	readTextFile: () => ({
		type: "found",
		text: '[models.profiles.fast]\nmodel = "acme/fast"\nthinking = "minimal"\n',
	}),
	pathExists: () => ({ type: "missing" }),
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
type HostDelivery = { type: "message"; message: unknown };

/** Minimal ExtensionAPI that captures the registered command handler and an ordered delivery log. */
function fakeHost(): {
	pi: ExtensionAPI;
	command: () => CapturedCommand;
	sentMessages: unknown[];
	deliveries: HostDelivery[];
	execCalls: Array<{ command: string; args: readonly string[] }>;
} {
	let captured: CapturedCommand | undefined;
	const sentMessages: unknown[] = [];
	const deliveries: HostDelivery[] = [];
	const execCalls: Array<{ command: string; args: readonly string[] }> = [];
	const pi: ExtensionAPI = {
		registerCommand(_name, options) {
			captured = { handler: options.handler };
		},
		sendMessage(message) {
			sentMessages.push(message);
			deliveries.push({ type: "message", message });
		},
		registerMessageRenderer() {},
		async exec(command, args) {
			execCalls.push({ command, args });
			return { stdout: "", stderr: "", code: 0 };
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
		execCalls,
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
		checks: { passing: 0, failing: 0, pending: 0, cancelled: 0, total: 0 },
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
	return scriptedCtx([[settleKey]]);
}

/** An interactive ctx that plays one key script per overlay invocation. */
function scriptedCtx(scripts: string[][]): CommandContext {
	let call = 0;
	return {
		cwd: "/repo",
		hasUI: true,
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
		modelRegistry: testRegistry(),
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
		registerStackViewExtension(host.pi, {
			projectConfigGateway,
			engineFactory: factory,
			loadStackView: okLoader(),
		});

		await host.command().handler("", interactiveCtx());

		expect(engines).toHaveLength(1);
		expect(engines[0]?.abortCalls()).toBe(1);
	});

	test("aborts the engine and surfaces a warning when the custom UI rejects (snapshot fallback path)", async () => {
		const host = fakeHost();
		const { factory, engines } = recordingEngineFactory();
		registerStackViewExtension(host.pi, {
			projectConfigGateway,
			engineFactory: factory,
			loadStackView: okLoader(),
		});

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
		registerStackViewExtension(host.pi, {
			projectConfigGateway,
			engineFactory: factory,
			loadStackView: okLoader(),
		});

		await host.command().handler("", nonInteractiveCtx());

		expect(engines).toHaveLength(0);
		expect(host.sentMessages).toHaveLength(1); // the plain snapshot
	});

	test("degrades to a snapshot with a clear warning when the fast profile is missing", async () => {
		const host = fakeHost();
		const { factory, engines } = recordingEngineFactory();
		const missingConfigGateway: ProjectConfigGateway = {
			readTextFile: () => ({ type: "missing" }),
			pathExists: () => ({ type: "missing" }),
		};
		registerStackViewExtension(host.pi, {
			projectConfigGateway: missingConfigGateway,
			engineFactory: factory,
			loadStackView: okLoader(),
		});
		const ctx = interactiveCtx();
		const notifications: Array<{ message: string; level: string | undefined }> = [];
		ctx.ui.notify = (message, level) => notifications.push({ message, level });

		await host.command().handler("", ctx);

		expect(engines).toHaveLength(0);
		expect(host.sentMessages).toHaveLength(1);
		expect(notifications).toContainEqual({
			message: expect.stringContaining("[models.profiles.fast]"),
			level: "warning",
		});
	});
});

describe("stack-view extension clipboard wiring", () => {
	test("copy-branch shortcut writes the selected branch to the clipboard", async () => {
		const host = fakeHost();
		const notifications: Array<{ message: string; level: string | undefined }> = [];
		registerStackViewExtension(host.pi, { projectConfigGateway, loadStackView: okLoader() });
		const ctx = interactiveCtx("b");
		ctx.ui.notify = (message, level) => notifications.push({ message, level });

		await host.command().handler("", ctx);

		expect(host.execCalls).toEqual([
			{
				command: "/bin/sh",
				args: ["-c", 'printf %s "$1" | pbcopy', "sh", "feature/1"],
			},
		]);
		expect(host.deliveries).toEqual([]);
		expect(notifications).toContainEqual({
			message: "Copied branch 'feature/1' to the clipboard.",
			level: "info",
		});
	});
});
