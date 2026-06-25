import { requireXdgPath, resolveSdlXdgPath } from "@sdl/core/xdg";

import { resolveClinkrInteraction, type ClinkrInteraction } from "@sdl/clinkr";
import { readStdinLine } from "@sdl/core/stdin";

import { RealClipboardGateway, type ClipboardGateway } from "./gateways/clipboard.ts";
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
	cwd: string;
	interaction: ClinkrInteraction;
	stderr: (text: string) => void;
	env: NodeJS.ProcessEnv;
	slotsRoot: string;
	shouldWriteCdDirective: boolean;
}

export type RepoSlotContext = SlotCliContext & { repo: RepoContext };

export async function createRealSlotContext(options: {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
}): Promise<SlotCliContext> {
	const env = options.env ?? process.env;
	const slotsRoot = resolveSlotsRoot(env);
	const git = new RealSlotRepositoryGateway({ cwd: options.cwd, env });
	const repo = await discoverRepoOrSentinel({ cwd: options.cwd, slotsRoot, git });
	const stderr = (text: string) => process.stderr.write(text);
	return {
		repo,
		git,
		gt: new RealGraphiteStackGateway({ env, git }),
		pr: new RealSlotPrGateway({ cwd: options.cwd, env }),
		storage: new RealSlotStorageGateway(),
		clipboard: new RealClipboardGateway({ env }),
		cwd: options.cwd,
		interaction: resolveClinkrInteraction({
			stdin: readStdinLine,
			stderr,
			isInteractive: () => process.stdin.isTTY === true,
		}),
		stderr,
		env,
		slotsRoot,
		shouldWriteCdDirective: true,
	};
}

export function resolveSlotsRoot(env: Record<string, string | undefined>): string {
	return requireXdgPath(resolveSdlXdgPath({ kind: "state", env, segments: ["slots"] }));
}
