import { LandStackCommandStream, withCommandStreaming } from "./command-stream.ts";
import {
	createLandGraphiteCommandChannel,
	type LandGraphiteCommandChannel,
} from "./graphite-command-channel.ts";
import type { LandStackExtensionAPI } from "./types.ts";

export interface LandRuntime {
	/** Original host API for non-streamed adapters and host-only capabilities. */
	source: LandStackExtensionAPI;
	/** Generic non-Graphite command execution with command-stream presentation. */
	commands: LandStackExtensionAPI;
	/** Flow-owned Graphite command channel. */
	graphite: LandGraphiteCommandChannel;
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
