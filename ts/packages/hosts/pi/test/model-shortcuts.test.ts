import { describe, expect, test } from "vitest";

import type {
	ProjectConfigGateway,
	ProjectConfigReadResult,
} from "@nseng-ai/sdk/project-config/points";

import modelShortcutExtension, {
	MODEL_SHORTCUT_CATALOG,
	type ExtensionAPI,
} from "../src/core/model-shortcuts/extension.ts";

// Keep tests on the factory seam: no process cwd mutation and no real filesystem access.
type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type NotifyLevel = "info" | "warning" | "error";

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface ModelInfo {
	provider: string;
	id: string;
}

const EXPECTED_DEFAULTS = [
	["model:fable", "vercel-ai-gateway/anthropic/claude-fable-5"],
	["model:sonnet", "vercel-ai-gateway/anthropic/claude-sonnet-4.5"],
	["model:spud", "vercel-ai-gateway/openai/gpt-5.6-sol"],
	["model:sol", "vercel-ai-gateway/openai/gpt-5.6-sol"],
	["model:terra", "vercel-ai-gateway/openai/gpt-5.6-terra"],
	["model:luna", "vercel-ai-gateway/openai/gpt-5.6-luna"],
	["model:gpt-mini", "vercel-ai-gateway/openai/gpt-5.4-mini"],
	["model:gemini-pro", "vercel-ai-gateway/google/gemini-3.1-pro-preview"],
	["model:gemini-flash", "vercel-ai-gateway/google/gemini-3.5-flash"],
	["model:haiku", "vercel-ai-gateway/anthropic/claude-haiku-4.5"],
	["model:opus", "vercel-ai-gateway/anthropic/claude-opus-4.8"],
] as const;

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly setModels: ModelInfo[] = [];
	private readonly shouldSetModelSucceed: boolean;

	constructor(shouldSetModelSucceed = true) {
		this.shouldSetModelSucceed = shouldSetModelSucceed;
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async setModel(model: ModelInfo): Promise<boolean> {
		this.setModels.push(model);
		return this.shouldSetModelSucceed;
	}
}

class FakeProjectConfigGateway implements ProjectConfigGateway {
	private readonly files: Readonly<Record<string, string>>;
	private readonly failures: Readonly<Record<string, string>>;

	constructor(
		files: Readonly<Record<string, string>> = {},
		failures: Readonly<Record<string, string>> = {},
	) {
		this.files = files;
		this.failures = failures;
	}

	readTextFile(request: { relativePath: string }): ProjectConfigReadResult {
		const failure = this.failures[request.relativePath];
		if (failure !== undefined) return { type: "error", message: failure };
		const text = this.files[request.relativePath];
		return text === undefined ? { type: "missing" } : { type: "found", text };
	}

	pathExists(): { type: "missing" } {
		return { type: "missing" };
	}
}

async function register(
	pi: FakePi,
	files: Readonly<Record<string, string>> = {},
	failures: Readonly<Record<string, string>> = {},
): Promise<void> {
	await modelShortcutExtension(pi, {
		cwd: "/repo/worktree/nested",
		projectConfigGateway: new FakeProjectConfigGateway(files, failures),
		resolveRepoRoot: async ({ cwd }) => {
			expect(cwd).toBe("/repo/worktree/nested");
			return "/repo/worktree";
		},
	});
}

function commandFor(pi: FakePi, name: string): RegisteredCommand {
	const command = pi.commands.get(name);
	if (command === undefined) throw new Error(`Expected command to be registered: ${name}`);
	return command;
}

function parseRef(ref: string): ModelInfo {
	const separator = ref.indexOf("/");
	return { provider: ref.slice(0, separator), id: ref.slice(separator + 1) };
}

function createContext(options: { models?: readonly ModelInfo[]; hasUI?: boolean } = {}): {
	ctx: Parameters<RegisteredCommand["handler"]>[1];
	notifications: Notification[];
} {
	const notifications: Notification[] = [];
	return {
		notifications,
		ctx: {
			hasUI: options.hasUI ?? true,
			modelRegistry: {
				find(provider, modelId) {
					return options.models?.find(
						(model) => model.provider === provider && model.id === modelId,
					);
				},
			},
			ui: {
				notify(message, level) {
					notifications.push({ message, level });
				},
			},
		},
	};
}

describe("modelShortcutExtension", () => {
	test("awaits config loading and registers the fixed catalog with all gateway defaults", async () => {
		const pi = new FakePi();
		const registration = register(pi);

		expect(pi.commands.size).toBe(0);
		await registration;

		expect(MODEL_SHORTCUT_CATALOG).toHaveLength(11);
		expect(
			[...pi.commands.entries()].map(([name, command]) => [name, command.description]),
		).toEqual(EXPECTED_DEFAULTS.map(([command, ref]) => [command, `Switch to ${ref}`]));
	});

	test("discovers a worktree root from a .git file through the injected stat seam", async () => {
		const pi = new FakePi();
		const probedPaths: string[] = [];

		await modelShortcutExtension(pi, {
			cwd: "/repo/worktree/nested",
			projectConfigGateway: new FakeProjectConfigGateway(),
			statPath: async (path) => {
				probedPaths.push(path);
				if (path !== "/repo/worktree/.git") throw new Error("missing");
				return {
					isFile: () => true,
					isDirectory: () => false,
					isSymbolicLink: () => false,
				};
			},
		});

		expect(probedPaths).toEqual(["/repo/worktree/nested/.git", "/repo/worktree/.git"]);
		expect(pi.commands.size).toBe(11);
	});

	test.each(EXPECTED_DEFAULTS)("switches %s using its effective default", async (command, ref) => {
		const pi = new FakePi();
		await register(pi);
		const model = parseRef(ref);
		const { ctx, notifications } = createContext({ models: [model] });

		await commandFor(pi, command).handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([{ message: `Switched model to ${ref}.`, level: "info" }]);
	});

	test("merges partial local overrides and accepts direct providers and nested gateway model IDs", async () => {
		const pi = new FakePi();
		await register(pi, {
			"ns.toml": '[pi.model-shortcuts]\nfable = "anthropic/claude-direct"\n',
			"ns.local.toml": '[pi.model-shortcuts]\nterra = "custom-gateway/openai/team/gpt-terra"\n',
		});

		expect(commandFor(pi, "model:fable").description).toBe("Switch to anthropic/claude-direct");
		expect(commandFor(pi, "model:terra").description).toBe(
			"Switch to custom-gateway/openai/team/gpt-terra",
		);
		expect(commandFor(pi, "model:luna").description).toBe(
			"Switch to vercel-ai-gateway/openai/gpt-5.6-luna",
		);
	});

	test("allows spud and sol to be overridden independently", async () => {
		const pi = new FakePi();
		await register(pi, {
			"ns.local.toml":
				'[pi.model-shortcuts]\nspud = "openai/spud-model"\nsol = "openai/sol-model"\n',
		});

		expect(commandFor(pi, "model:spud").description).toBe("Switch to openai/spud-model");
		expect(commandFor(pi, "model:sol").description).toBe("Switch to openai/sol-model");
	});

	test.each([
		['[pi.model-shortcuts]\nunknown = "openai/model"\n', "known shortcut keys"],
		['[pi.model-shortcuts]\nfable = "unqualified"\n', "qualified provider/model"],
		['[pi.model-shortcuts]\nfable = ""\n', "qualified provider/model"],
		["[pi.model-shortcuts]\nfable = 42\n", "qualified provider/model"],
		['[pi.model-shortcuts]\nfable = "provider/"\n', "qualified provider/model"],
		["[pi.model-shortcuts\nfable = 1\n", "Invalid TOML"],
	] as const)(
		"rejects invalid config before registering any command %#",
		async (source, message) => {
			const pi = new FakePi();

			await expect(register(pi, { "ns.local.toml": source })).rejects.toThrow(message);
			expect(pi.commands.size).toBe(0);
		},
	);

	test("rejects local config read failures before registering any command", async () => {
		const pi = new FakePi();

		await expect(register(pi, {}, { "ns.local.toml": "permission denied" })).rejects.toThrow(
			"Failed to read ns.local.toml: permission denied",
		);
		expect(pi.commands.size).toBe(0);
	});

	test("notifies when a shortcut model is missing", async () => {
		const pi = new FakePi();
		await register(pi);
		const { ctx, notifications } = createContext();

		await commandFor(pi, "model:spud").handler("", ctx);

		expect(pi.setModels).toEqual([]);
		expect(notifications).toEqual([
			{ message: "Model vercel-ai-gateway/openai/gpt-5.6-sol not found.", level: "error" },
		]);
	});

	test("notifies when a shortcut model cannot be selected", async () => {
		const ref = "vercel-ai-gateway/anthropic/claude-opus-4.8";
		const model = parseRef(ref);
		const pi = new FakePi(false);
		await register(pi);
		const { ctx, notifications } = createContext({ models: [model] });

		await commandFor(pi, "model:opus").handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([
			{
				message: `Model ${ref} is unavailable; run /login or configure Pi auth.`,
				level: "error",
			},
		]);
	});

	test("does not emit a generic ack on a rendered-message host", async () => {
		const sentMessages: unknown[] = [];
		const statusUpdates: { key: string; value: string | undefined }[] = [];
		const model = parseRef("vercel-ai-gateway/anthropic/claude-opus-4.8");
		const pi = new FakePi();
		Object.assign(pi, {
			registerMessageRenderer(): void {},
			sendMessage(message: unknown): void {
				sentMessages.push(message);
			},
		});
		await register(pi);
		const { ctx } = createContext({ models: [model] });
		const statusCtx = {
			...ctx,
			ui: {
				...ctx.ui,
				setStatus(key: string, value: string | undefined): void {
					statusUpdates.push({ key, value });
				},
			},
		};

		await commandFor(pi, "model:opus").handler("", statusCtx);

		expect(sentMessages).toEqual([]);
		expect(statusUpdates).toEqual([]);
	});

	test("does not notify when UI is unavailable", async () => {
		const model = parseRef("vercel-ai-gateway/anthropic/claude-haiku-4.5");
		const pi = new FakePi();
		await register(pi);
		const { ctx, notifications } = createContext({ hasUI: false, models: [model] });

		await commandFor(pi, "model:haiku").handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(notifications).toEqual([]);
	});
});
