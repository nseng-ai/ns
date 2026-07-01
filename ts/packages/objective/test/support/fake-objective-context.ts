import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@sdl/capability-kit/git/testing";

import type { ObjectiveCliContext } from "../../src/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/fake-storage.ts";
import {
	FakeAutopilotGateway,
	type FakeAutopilotGatewayState,
} from "../../src/operations/autopilot/fake-gateway.ts";
import { ObjectiveStorage } from "../../src/storage.ts";

export interface FakeObjectiveContextOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	repoRoot?: string;
	trunkBranch?: string;
	storage?: ObjectiveStorage;
	storageState?: FakeObjectiveStorageGatewayOptions;
	git?: InMemoryGitGateway;
	gitState?: InMemoryGitGatewayState;
	autopilot?: FakeAutopilotGateway;
	autopilotState?: FakeAutopilotGatewayState;
}

export interface FakeObjectiveCliContext extends ObjectiveCliContext {
	git: InMemoryGitGateway;
	autopilot: FakeAutopilotGateway;
}

export function createFakeObjectiveContext(
	options: FakeObjectiveContextOptions = {},
): FakeObjectiveCliContext {
	const git = options.git ?? new InMemoryGitGateway(options.gitState ?? {});
	const autopilot = options.autopilot ?? new FakeAutopilotGateway(options.autopilotState ?? {});
	return {
		cwd: options.cwd ?? "/repo",
		env: options.env ?? { PATH: "/fake/bin" },
		repoRoot: options.repoRoot ?? "/repo",
		trunkBranch: resolveFakeTrunkBranch(options),
		storage:
			options.storage ??
			new ObjectiveStorage(new FakeObjectiveStorageGateway(options.storageState ?? {})),
		git,
		autopilot,
	};
}

function resolveFakeTrunkBranch(options: FakeObjectiveContextOptions): string {
	if (options.trunkBranch !== undefined) return options.trunkBranch;
	if (typeof options.gitState?.trunkBranch === "string") return options.gitState.trunkBranch;
	return "main";
}
