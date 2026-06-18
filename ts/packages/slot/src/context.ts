import { homedir } from "node:os";
import { resolve } from "node:path";

import { readStdinLine } from "@asdl/core/stdin";

import { RealClipboardGateway, type ClipboardGateway } from "./gateways/clipboard.ts";
import { RealSlotGitGateway, type SlotGitGateway } from "./gateways/git.ts";
import { RealSlotGtGateway, type SlotGtGateway } from "./gateways/gt.ts";
import { RealSlotPrGateway, type SlotPrGateway } from "./gateways/pr.ts";
import { RealSlotStorageGateway, type SlotStorageGateway } from "./gateways/storage.ts";
import {
	discoverRepoOrSentinel,
	type RepoContext,
	type RepoDiscoveryResult,
} from "./repo-context.ts";

export interface SlotCliContext {
	repo: RepoDiscoveryResult;
	git: SlotGitGateway;
	gt: SlotGtGateway;
	pr: SlotPrGateway;
	storage: SlotStorageGateway;
	clipboard: ClipboardGateway;
	cwd: string;
	stdin: () => Promise<string | null>;
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
	const slotsRoot = env.SLOTS_ROOT ?? resolve(homedir(), ".slots");
	const git = new RealSlotGitGateway({ cwd: options.cwd, env });
	const repo = await discoverRepoOrSentinel({ cwd: options.cwd, slotsRoot, git });
	return {
		repo,
		git,
		gt: new RealSlotGtGateway({ env, git }),
		pr: new RealSlotPrGateway({ cwd: options.cwd, env }),
		storage: new RealSlotStorageGateway(),
		clipboard: new RealClipboardGateway({ env }),
		cwd: options.cwd,
		stdin: readStdinLine,
		stderr: (text) => process.stderr.write(text),
		env,
		slotsRoot,
		shouldWriteCdDirective: true,
	};
}
