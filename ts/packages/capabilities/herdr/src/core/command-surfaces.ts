import { nsCommandSurface } from "@nseng-ai/foundation/command";

// Canonical catalog of ns:herdr:* command surfaces. Pi command registration
// shares these names; import from here instead of spelling out raw `ns:herdr:*`
// literals.

export const HERDR_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME = nsCommandSurface(
	"herdr",
	"sidebar:objective-summary",
);

export const HERDR_COMMAND_NAMES = [HERDR_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME] as const;
