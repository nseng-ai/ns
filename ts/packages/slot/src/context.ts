import { homedir } from "node:os";
import { resolve } from "node:path";

import { readStdin } from "@asdl/core/stdin";

import { RealClipboardGateway, type ClipboardGateway } from "./gateways/clipboard.ts";
import { RealSlotGitGateway, type SlotGitGateway } from "./gateways/git.ts";
import { RealSlotPRGateway, type SlotPRGateway } from "./gateways/pr.ts";
import { RealSlotStorageGateway, type SlotStorageGateway } from "./gateways/storage.ts";
import { discoverRepoOrSentinel, type RepoContext, type RepoDiscoveryResult } from "./repo-context.ts";

export interface SlotCliContext {
	repo: RepoDiscoveryResult;
	git: SlotGitGateway;
	storage: SlotStorageGateway;
	clipboard: ClipboardGateway;
	pr: SlotPRGateway;
	stdin: () => Promise<string>;
	stderr: (text: string) => void;
	cwd: string;
	env: NodeJS.ProcessEnv;
	slotsRoot: string;
	shouldWriteCdDirective: boolean;
}

export type RepoSlotContext = SlotCliContext & { repo: RepoContext };

export async function createRealSlotContext(options: { cwd: string; env?: NodeJS.ProcessEnv | undefined }): Promise<SlotCliContext> {
	const env = options.env ?? process.env;
	const slotsRoot = env.SLOTS_ROOT ?? resolve(homedir(), ".slots");
	const git = new RealSlotGitGateway({ cwd: options.cwd, env });
	const repo = await discoverRepoOrSentinel({ cwd: options.cwd, slotsRoot, git });
	return {
		repo,
		git,
		storage: new RealSlotStorageGateway(),
		clipboard: new RealClipboardGateway({ env }),
		pr: new RealSlotPRGateway({ cwd: options.cwd, env }),
		stdin: readStdin,
		stderr: (text) => process.stderr.write(text),
		cwd: options.cwd,
		env,
		slotsRoot,
		shouldWriteCdDirective: true,
	};
}
