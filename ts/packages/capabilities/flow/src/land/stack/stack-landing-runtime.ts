import type { GitWorktreeStateFs } from "@nseng-ai/capability-kit/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { LandContext } from "../api.ts";
import { LandStackCommandStream, withCommandStreaming } from "./command-stream.ts";
import {
	createLandGraphiteCommandChannel,
	type LandGraphiteCommandChannel,
} from "./graphite-command-channel.ts";
import { createLandContext } from "./land-context-adapter.ts";
import type { LandStackExtensionAPI } from "./types.ts";

export interface StackLandingRuntime {
	/** Original host API for non-streamed adapters and host-only capabilities. */
	source: LandStackExtensionAPI;
	/** Generic non-Graphite command execution with command-stream presentation. */
	commands: LandStackExtensionAPI;
	/** Flow-owned Graphite command channel. */
	graphite: LandGraphiteCommandChannel;
	/** Gateway set constructed once for the selected runtime adapters. */
	landContext: LandContext;
	/** Optional git worktree state filesystem seam for scenario tests. */
	gitStateFs?: GitWorktreeStateFs;
}

export function createStackLandingRuntime(
	pi: LandStackExtensionAPI,
	commandStream: LandStackCommandStream,
	options: { gitStateFs?: GitWorktreeStateFs; graphite?: LandGraphiteCommandChannel } = {},
): StackLandingRuntime {
	const commands = withCommandStreaming(pi, commandStream);
	const graphite = options.graphite ?? createLandGraphiteCommandChannel({ pi, commandStream });
	const landContext = createLandContext(commands, {
		graphite,
		...optionalEntry("gitStateFs", options.gitStateFs),
	});
	return {
		source: pi,
		commands,
		graphite,
		landContext,
		...optionalEntry("gitStateFs", options.gitStateFs),
	};
}
