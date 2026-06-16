import { homedir } from "node:os";
import { resolve } from "node:path";

import { RealSlotGitGateway, type SlotGitGateway } from "./gateways/git.ts";
import { RealSlotStorageGateway, type SlotStorageGateway } from "./gateways/storage.ts";
import { discoverRepoOrSentinel, type RepoDiscoveryResult } from "./repo-context.ts";

export interface SlotCliContext {
	repo: RepoDiscoveryResult;
	git: SlotGitGateway;
	storage: SlotStorageGateway;
	cwd: string;
	env: NodeJS.ProcessEnv;
	slotsRoot: string;
}

export async function createRealSlotContext(options: { cwd: string; env?: NodeJS.ProcessEnv | undefined }): Promise<SlotCliContext> {
	const env = options.env ?? process.env;
	const slotsRoot = env.SLOTS_ROOT ?? resolve(homedir(), ".slots");
	const git = new RealSlotGitGateway({ cwd: options.cwd, env });
	const repo = await discoverRepoOrSentinel({ cwd: options.cwd, slotsRoot, git });
	return {
		repo,
		git,
		storage: new RealSlotStorageGateway(),
		cwd: options.cwd,
		env,
		slotsRoot,
	};
}
