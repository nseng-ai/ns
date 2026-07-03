import type { LandContext } from "../api.ts";
import { LandStackCommandStream, withCommandStreaming } from "./command-stream.ts";
import {
	createLandGraphiteCommandChannel,
	type LandGraphiteCommandChannel,
} from "./graphite-command-channel.ts";
import { createLandContext } from "./land-context-adapter.ts";
import type { LandStackExtensionAPI } from "./types.ts";

export interface LandRuntime {
	/** Original host API for non-streamed adapters and host-only capabilities. */
	source: LandStackExtensionAPI;
	/** Generic non-Graphite command execution with command-stream presentation. */
	commands: LandStackExtensionAPI;
	/** Flow-owned Graphite command channel. */
	graphite: LandGraphiteCommandChannel;
}

export function createRuntimeLandContext(runtime: LandRuntime): LandContext {
	return createLandContext(runtime.commands, { graphite: runtime.graphite });
}

export function createLandRuntime(
	pi: LandStackExtensionAPI,
	commandStream: LandStackCommandStream,
): LandRuntime {
	return {
		source: pi,
		commands: withCommandStreaming(pi, commandStream),
		graphite: createLandGraphiteCommandChannel({ pi, commandStream }),
	};
}
