import { describe, expect, test } from "vitest";

import modelShortcutExtension from "../src/core/model-shortcuts/extension.ts";
import type { ExtensionAPI } from "../src/core/model-shortcuts/extension.ts";
import type {
	ProjectConfigGateway,
	ProjectConfigReadResult,
} from "@nseng-ai/sdk/project-config/points";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type SessionStartHandler = Parameters<ExtensionAPI["on"]>[1];
type CommandContext = Parameters<RegisteredCommand["handler"]>[1];

interface ModelInfo {
	provider: string;
	id: string;
}

interface Notification {
	message: string;
	level: "info" | "warning" | "error" | "success" | undefined;
}

const POLICY = `[models.profiles.standard]
model = "acme/standard"
thinking = "medium"

[models.profiles.fast]
model = "acme/fast"
thinking = "off"
`;

class FakeProjectConfigGateway implements ProjectConfigGateway {
	readonly reads: { repoRoot: string; relativePath: string }[] = [];
	private readonly result: ProjectConfigReadResult;

	constructor(result: ProjectConfigReadResult = { type: "found", text: POLICY }) {
		this.result = result;
	}

	readTextFile(request: { repoRoot: string; relativePath: string }): ProjectConfigReadResult {
		this.reads.push(request);
		return this.result;
	}

	pathExists(): { type: "missing" } {
		return { type: "missing" };
	}
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly setModels: ModelInfo[] = [];
	readonly thinkingLevels: string[] = [];
	readonly execCwds: (string | undefined)[] = [];
	private sessionStart: SessionStartHandler | undefined;
	private readonly shouldSetModelSucceed: boolean;
	private readonly repoRootResult: { code: number; stdout: string; stderr: string };

	constructor(
		options: {
			shouldSetModelSucceed?: boolean;
			repoRootResult?: { code: number; stdout: string; stderr: string };
		} = {},
	) {
		this.shouldSetModelSucceed = options.shouldSetModelSucceed ?? true;
		this.repoRootResult = options.repoRootResult ?? {
			code: 0,
			stdout: "/repo\n",
			stderr: "",
		};
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		if (this.commands.has(name)) throw new Error(`duplicate command: ${name}`);
		this.commands.set(name, command);
	}

	on(_event: "session_start", handler: SessionStartHandler): void {
		this.sessionStart = handler;
	}

	async exec(
		_command: string,
		_args: string[],
		options?: { cwd?: string },
	): Promise<{ code: number; stdout: string; stderr: string }> {
		this.execCwds.push(options?.cwd);
		return this.repoRootResult;
	}

	async setModel(model: ModelInfo): Promise<boolean> {
		this.setModels.push(model);
		return this.shouldSetModelSucceed;
	}

	setThinkingLevel(level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"): void {
		this.thinkingLevels.push(level);
	}

	async start(ctx: Parameters<SessionStartHandler>[1]): Promise<void> {
		if (this.sessionStart === undefined) throw new Error("session_start was not registered");
		await this.sessionStart({}, ctx);
	}
}

function createContext(
	options: {
		models?: readonly ModelInfo[];
		hasUI?: boolean;
		cwd?: string;
	} = {},
): { ctx: CommandContext & { cwd: string }; notifications: Notification[] } {
	const notifications: Notification[] = [];
	return {
		notifications,
		ctx: {
			cwd: options.cwd ?? "/repo/subdir",
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

function commandFor(pi: FakePi, name: string): RegisteredCommand {
	const command = pi.commands.get(name);
	if (command === undefined) throw new Error(`Expected command to be registered: ${name}`);
	return command;
}

describe("modelShortcutExtension", () => {
	test("loads policy at session_start and registers sorted dynamic commands once", async () => {
		const pi = new FakePi();
		const gateway = new FakeProjectConfigGateway();
		modelShortcutExtension(pi, { projectConfig: gateway });
		const { ctx } = createContext();

		expect([...pi.commands]).toEqual([]);
		await pi.start(ctx);
		await pi.start(ctx);

		expect(pi.execCwds).toEqual(["/repo/subdir"]);
		expect(gateway.reads).toEqual([{ repoRoot: "/repo", relativePath: "ns.toml" }]);
		expect(
			[...pi.commands.entries()].map(([name, command]) => [name, command.description]),
		).toEqual([
			["model:fast", "Switch to acme/fast with thinking off"],
			["model:standard", "Switch to acme/standard with thinking medium"],
		]);
	});

	test("selects the profile model, then applies thinking", async () => {
		const model = { provider: "acme", id: "standard" };
		const pi = new FakePi();
		modelShortcutExtension(pi, { projectConfig: new FakeProjectConfigGateway() });
		const { ctx, notifications } = createContext({ models: [model] });
		await pi.start(ctx);

		await commandFor(pi, "model:standard").handler("", ctx);

		expect(pi.setModels).toEqual([model]);
		expect(pi.thinkingLevels).toEqual(["medium"]);
		expect(notifications).toEqual([
			{ message: "Switched model to acme/standard with thinking medium.", level: "info" },
		]);
	});

	test("reports actionable missing-model and auth failures without changing thinking", async () => {
		const missingPi = new FakePi();
		modelShortcutExtension(missingPi, { projectConfig: new FakeProjectConfigGateway() });
		const missing = createContext();
		await missingPi.start(missing.ctx);
		await commandFor(missingPi, "model:fast").handler("", missing.ctx);
		expect(missing.notifications).toEqual([
			{ message: "Model acme/fast not found in Pi's model registry.", level: "error" },
		]);
		expect(missingPi.thinkingLevels).toEqual([]);

		const unavailablePi = new FakePi({ shouldSetModelSucceed: false });
		modelShortcutExtension(unavailablePi, { projectConfig: new FakeProjectConfigGateway() });
		const unavailable = createContext({ models: [{ provider: "acme", id: "fast" }] });
		await unavailablePi.start(unavailable.ctx);
		await commandFor(unavailablePi, "model:fast").handler("", unavailable.ctx);
		expect(unavailable.notifications).toEqual([
			{
				message: "Model acme/fast is unavailable; run /login or configure Pi auth.",
				level: "error",
			},
		]);
		expect(unavailablePi.thinkingLevels).toEqual([]);
	});

	test("reports repository and policy errors without registering commands", async () => {
		const noRepoPi = new FakePi({
			repoRootResult: { code: 128, stdout: "", stderr: "not a git repository" },
		});
		modelShortcutExtension(noRepoPi, { projectConfig: new FakeProjectConfigGateway() });
		const noRepo = createContext();
		await noRepoPi.start(noRepo.ctx);
		expect(noRepo.notifications[0]?.message).toContain("not inside a Git repository");
		expect([...noRepoPi.commands]).toEqual([]);

		const invalidPi = new FakePi();
		modelShortcutExtension(invalidPi, {
			projectConfig: new FakeProjectConfigGateway({ type: "found", text: "[models.profiles.bad" }),
		});
		const invalid = createContext();
		await invalidPi.start(invalid.ctx);
		expect(invalid.notifications[0]?.message).toContain("Could not load model shortcuts:");
		expect([...invalidPi.commands]).toEqual([]);
	});
});
