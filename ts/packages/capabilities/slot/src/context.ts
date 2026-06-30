import { requireXdgPath, resolveSdlXdgPath } from "@sdl/capability-kit/xdg";

import {
	resolveClinkrInteraction,
	resolveRenderCapabilities,
	type Caps,
	type ClinkrInteraction,
	type ConfirmationPromptFormatter,
	type RenderCapabilities,
} from "@sdl/clinkr";
import { paint } from "@sdl/cli-theme";
import { readStdinLine } from "@sdl/cli-runtime";
import type { ExplicitUndefined } from "@sdl/core/primitives";

import { RealClipboardGateway, type ClipboardGateway } from "./gateways/clipboard.ts";
import { RealSlotCommandGateway, type SlotCommandGateway } from "./gateways/command.ts";
import { RealSlotRepositoryGateway, type SlotRepositoryGateway } from "./gateways/repository.ts";
import { RealGraphiteStackGateway, type GraphiteStackGateway } from "@sdl/graphite/stack";
import { RealSlotPrGateway, type SlotPrGateway } from "./gateways/pr.ts";
import { RealSlotStorageGateway, type SlotStorageGateway } from "./gateways/storage.ts";
import {
	discoverRepoOrSentinel,
	type RepoContext,
	type RepoDiscoveryResult,
} from "./repo-context.ts";

export interface SlotCliContext {
	repo: RepoDiscoveryResult;
	git: SlotRepositoryGateway;
	gt: GraphiteStackGateway;
	pr: SlotPrGateway;
	storage: SlotStorageGateway;
	clipboard: ClipboardGateway;
	command: SlotCommandGateway;
	cwd: string;
	renderCapabilities: RenderCapabilities;
	extensions?: Readonly<Record<string, unknown>>;
	interaction: ClinkrInteraction;
	stderr: (text: string) => void;
	env: NodeJS.ProcessEnv;
	slotsRoot: string;
	shouldWriteCdDirective: boolean;
}

export type RepoSlotContext = SlotCliContext & { repo: RepoContext };

export async function createRealSlotContext(options: {
	cwd: string;
	renderCapabilities: RenderCapabilities;
	env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	extensions?: Readonly<Record<string, unknown>> | undefined;
	formatPrompt?: ConfirmationPromptFormatter | undefined;
	stderr?: ((text: string) => void) | undefined;
	shouldWriteCdDirective?: boolean | undefined;
}): Promise<SlotCliContext> {
	const env = options.env ?? process.env;
	const slotsRoot = resolveSlotsRoot(env);
	const git = new RealSlotRepositoryGateway({ cwd: options.cwd, env });
	const repo = await discoverRepoOrSentinel({ cwd: options.cwd, slotsRoot, git });
	const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
	const caps = resolveRenderCapabilities(options.renderCapabilities);
	return {
		repo,
		git,
		gt: new RealGraphiteStackGateway({ env, git }),
		pr: new RealSlotPrGateway({ cwd: options.cwd, env }),
		storage: new RealSlotStorageGateway(),
		clipboard: new RealClipboardGateway({ env }),
		command: new RealSlotCommandGateway(),
		cwd: options.cwd,
		renderCapabilities: options.renderCapabilities,
		...(options.extensions === undefined ? {} : { extensions: options.extensions }),
		interaction: resolveClinkrInteraction({
			stdin: readStdinLine,
			stderr,
			...(options.formatPrompt === undefined && caps === undefined
				? {}
				: { formatPrompt: options.formatPrompt ?? formatSlotConfirmationPrompt(caps) }),
		}),
		stderr,
		env,
		slotsRoot,
		shouldWriteCdDirective: options.shouldWriteCdDirective ?? true,
	};
}

export function resolveSlotsRoot(env: Record<string, string | undefined>): string {
	return requireXdgPath(resolveSdlXdgPath({ kind: "state", env, segments: ["slots"] }));
}

function formatSlotConfirmationPrompt(caps: Caps | undefined): ConfirmationPromptFormatter {
	return (request, suffix) => {
		if (caps === undefined || caps.colorDepth === "none") return `${request.message} ${suffix}: `;
		return `${request.message} ${paint(caps, "muted", suffix)}: `;
	};
}
