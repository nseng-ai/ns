import {
	loadModelPolicy,
	type ModelProfile,
	type ModelThinking,
} from "@nseng-ai/capability-kit/model-policy";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

import { registerCommandWithImmediateAck } from "../../commands/ack.ts";
import { notifyCommandUi, type NotifiableCommandContext } from "../../commands/helpers.ts";

interface ModelInfo {
	provider: string;
	id: string;
}

interface ModelRegistry {
	find(provider: string, modelId: string): ModelInfo | undefined;
}

interface CommandContext extends NotifiableCommandContext {
	modelRegistry: ModelRegistry;
}

interface SessionStartContext extends NotifiableCommandContext {
	cwd: string;
}

interface ExecResult {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly code: number;
}

interface ExtensionOptions {
	readonly projectConfig: ProjectConfigGateway;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	on(
		event: "session_start",
		handler: (event: unknown, ctx: SessionStartContext) => Promise<void> | void,
	): void;
	exec(command: string, args: string[], options?: { cwd?: string }): Promise<ExecResult>;
	setModel(model: ModelInfo): Promise<boolean>;
	setThinkingLevel(level: ModelThinking): void;
}

export default function modelShortcutExtension(pi: ExtensionAPI, options: ExtensionOptions): void {
	let hasStarted = false;
	pi.on("session_start", async (_event, ctx) => {
		if (hasStarted) return;

		const repoRoot = await resolveRepositoryRoot(pi, ctx.cwd);
		if (repoRoot.ok === false) {
			notifyCommandUi(ctx, repoRoot.message, "error");
			return;
		}
		const policy = loadModelPolicy({ repoRoot: repoRoot.value, gateway: options.projectConfig });
		if (policy.ok === false) {
			notifyCommandUi(ctx, `Could not load model shortcuts: ${policy.error.message}`, "error");
			return;
		}

		for (const [profileName, profile] of Object.entries(policy.value.profiles).sort(
			([left], [right]) => left.localeCompare(right),
		)) {
			registerProfileCommand(pi, profileName, profile);
		}
		hasStarted = true;
	});
}

function registerProfileCommand(
	pi: ExtensionAPI,
	profileName: string,
	profile: ModelProfile,
): void {
	const commandName = `model:${profileName}`;
	const ref = modelRef(profile);
	registerCommandWithImmediateAck({
		host: pi,
		commandName,
		commandDefinition: {
			description: `Switch to ${ref} with thinking ${profile.thinking}`,
			handler: async (_args, ctx) => {
				await switchToModel(pi, ctx, profile);
			},
		},
		options: { delivery: "none" },
	});
}

async function switchToModel(
	pi: ExtensionAPI,
	ctx: CommandContext,
	profile: ModelProfile,
): Promise<void> {
	const ref = modelRef(profile);
	const model = ctx.modelRegistry.find(profile.model.provider, profile.model.modelId);
	if (model === undefined) {
		notifyCommandUi(ctx, `Model ${ref} not found in Pi's model registry.`, "error");
		return;
	}

	const switched = await pi.setModel(model);
	if (!switched) {
		notifyCommandUi(ctx, `Model ${ref} is unavailable; run /login or configure Pi auth.`, "error");
		return;
	}

	pi.setThinkingLevel(profile.thinking);
	notifyCommandUi(ctx, `Switched model to ${ref} with thinking ${profile.thinking}.`, "info");
}

function modelRef(profile: ModelProfile): string {
	return `${profile.model.provider}/${profile.model.modelId}`;
}

async function resolveRepositoryRoot(
	pi: ExtensionAPI,
	cwd: string,
): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
	if (result.code !== 0) {
		const detail = result.stderr?.trim();
		return {
			ok: false,
			message: `Could not load model shortcuts because ${cwd} is not inside a Git repository${detail === undefined || detail.length === 0 ? "." : `: ${detail}`}`,
		};
	}
	const repoRoot = result.stdout?.trim();
	if (repoRoot === undefined || repoRoot.length === 0) {
		return {
			ok: false,
			message: "Could not load model shortcuts because git returned an empty repository root.",
		};
	}
	return { ok: true, value: repoRoot };
}
