import { RealGitGateway, type GitGateway, type GitWorktreeStateFs } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { LandContext } from "../api.ts";
import { LandStackCommandStream, withCommandStreaming } from "./command-stream.ts";
import {
	createLandGraphiteCommandChannel,
	type LandGraphiteCommandChannel,
} from "./graphite-command-channel.ts";
import { createLandContext } from "./land-context-adapter.ts";
import type { LandExecutionApi } from "./types.ts";

export interface StackLandingRuntime {
	/** Original host API for non-streamed adapters and host-only capabilities. */
	source: LandExecutionApi;
	/** Generic non-Graphite command execution with command-stream presentation. */
	commands: LandExecutionApi;
	/** Foundation Git gateway shared by land context adapters. */
	git: GitGateway;
	/** Flow-owned Graphite command channel. */
	graphite: LandGraphiteCommandChannel;
	/** Gateway set constructed once for the selected runtime adapters. */
	landContext: LandContext;
	/** Optional git worktree state filesystem seam for scenario tests. */
	gitStateFs?: GitWorktreeStateFs;
}

export function createStackLandingRuntime(
	pi: LandExecutionApi,
	commandStream: LandStackCommandStream,
	options: { gitStateFs?: GitWorktreeStateFs; graphite?: LandGraphiteCommandChannel } = {},
): StackLandingRuntime {
	const commands = withCommandStreaming(pi, commandStream);
	const git = new RealGitGateway(commands);
	const graphite = options.graphite ?? createLandGraphiteCommandChannel({ pi, commandStream });
	const gitStateFsEntry = optionalEntry("gitStateFs", options.gitStateFs);
	const landContext = createLandContext(commands, {
		git,
		graphite,
		...gitStateFsEntry,
	});
	return {
		source: pi,
		commands,
		git,
		graphite,
		landContext,
		...gitStateFsEntry,
	};
}
