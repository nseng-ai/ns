import { withImmediateCommandAck } from "@sdl/pi-extension-runtime/command-ack";
import { runCli, type SdlCommandInfo } from "@sdl/sdl/cli";

import autoslotExtension from "./autoslot.ts";
import {
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
} from "./cli-command-extension.ts";
import landExtension from "./land.ts";
import { requestWorktreeStatusRefresh } from "./worktree-status.ts";
import { definePiSurfaceParity } from "./parity.ts";
import trunkPullExtension from "./trunk-pull.ts";

export type SdlExtensionAPI = CliCommandExtensionAPI &
	Parameters<typeof autoslotExtension>[0] &
	Parameters<typeof landExtension>[0] &
	Parameters<typeof trunkPullExtension>[0];

const CHANGES_COMMAND_INFO = {
	name: "changes",
	description: "Summarize outstanding worktree changes without committing.",
} as const satisfies SdlCommandInfo;
const CP_COMMAND_INFO = {
	name: "cp",
	description: "Create a checkpoint commit for the current diff.",
} as const satisfies SdlCommandInfo;
const AUTOBRANCH_COMMAND_INFO = {
	name: "autobranch",
	description:
		"Create a Graphite branch from dirty worktree changes or the latest unpushed commit.",
} as const satisfies SdlCommandInfo;
const SUBMIT_COMMAND_INFO = {
	name: "submit",
	description: "Checkpoint outstanding changes, then submit the current Graphite stack.",
} as const satisfies SdlCommandInfo;
const REGENERATE_PR_COMMAND_INFO = {
	name: "regenerate-pr",
	description: "Regenerate the current branch PR title and description.",
} as const satisfies SdlCommandInfo;
const PUSH_COMMAND_INFO = {
	name: "push",
	description: "Push already-committed work on the current branch with git push.",
} as const satisfies SdlCommandInfo;
const SDL_DIRECT_COMMANDS = [
	CHANGES_COMMAND_INFO,
	CP_COMMAND_INFO,
	AUTOBRANCH_COMMAND_INFO,
	SUBMIT_COMMAND_INFO,
	REGENERATE_PR_COMMAND_INFO,
	PUSH_COMMAND_INFO,
] as const satisfies readonly SdlCommandInfo[];
const SDL_CODE_ALIAS_COMMANDS = [CHANGES_COMMAND_INFO] as const satisfies readonly SdlCommandInfo[];
const SDL_CODE_COMMAND_ALIASES = {
	changes: "sdl:code:changes",
} as const satisfies Record<typeof CHANGES_COMMAND_INFO.name, string>;

export const sdlExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "sdl:changes",
		workflow: "Summarize outstanding worktree changes without committing",
		parity: "FULL",
		cli: "sdl changes",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes:
			"Pi command delegates to sdl changes through registerCliCommandExtension; in this repo the CLI behavior is restored by the project-local .sdl/extensions/changes.ts extension.",
	},
	{
		kind: "command",
		surface: "sdl:cp",
		workflow: "Create a checkpoint commit for the current diff",
		parity: "FULL",
		cli: "sdl cp",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes:
			"Pi command delegates to sdl cp through registerCliCommandExtension; in this repo the CLI behavior is restored by the project-local .sdl/extensions/cp.ts extension. Old /code:* checkpoint aliases are not restored.",
	},
	{
		kind: "command",
		surface: "sdl:submit",
		workflow: "Checkpoint outstanding changes, then submit the current Graphite stack",
		parity: "FULL",
		cli: "sdl submit",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes:
			"Pi command delegates to sdl submit through registerCliCommandExtension; in this repo the CLI behavior is restored by the project-local .sdl/extensions/submit.ts extension. Nested /sdl:code:submit and legacy submit aliases are not restored.",
	},
	{
		kind: "command",
		surface: "sdl:autobranch",
		workflow: "Create a Graphite branch from dirty worktree changes or the latest unpushed commit",
		parity: "FULL",
		cli: "sdl autobranch",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes:
			"Pi command delegates to sdl autobranch through registerCliCommandExtension; in this repo the CLI behavior is restored by the project-local SDK-only .sdl/extensions/autobranch.ts extension.",
	},
	{
		kind: "command",
		surface: "sdl:regenerate-pr",
		workflow: "Regenerate the current branch PR title and generated description region",
		parity: "FULL",
		cli: "sdl regenerate-pr",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes:
			"Pi command delegates to sdl regenerate-pr through registerCliCommandExtension; in this repo the CLI behavior is restored by the project-local .sdl/extensions/regenerate-pr.ts extension. Nested /sdl:code:regenerate-pr and legacy pr-regen aliases are not restored.",
	},
	{
		kind: "command",
		surface: "sdl:push",
		workflow: "Push already-committed work from the current branch",
		parity: "FULL",
		cli: "sdl push",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes:
			"Pi command delegates to sdl push through registerCliCommandExtension; in this repo the CLI behavior is restored by the project-local .sdl/extensions/push.ts extension. /sdl:code:push and /code:push are not retained.",
	},
	{
		kind: "command",
		surface: "sdl:code:changes",
		workflow: "Nested code-lifecycle alias for outstanding worktree changes",
		parity: "FULL",
		cli: "sdl changes",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Nested code-lifecycle Pi alias over sdl changes; flat /sdl:changes remains primary.",
	},
] as const);

export default function sdlExtension(pi: SdlExtensionAPI): void {
	const commandPi = withImmediateCommandAck(pi);
	const sdlBaseSpec = {
		cliName: "sdl",
		piNamespace: "sdl",
		afterCommandComplete: requestWorktreeStatusRefresh,
		runCli,
	} as const;
	registerCliCommandExtension(commandPi, {
		...sdlBaseSpec,
		commands: SDL_DIRECT_COMMANDS,
	});
	registerCliCommandExtension(commandPi, {
		...sdlBaseSpec,
		commands: SDL_CODE_ALIAS_COMMANDS,
		piCommandAliases: SDL_CODE_COMMAND_ALIASES,
	});
	autoslotExtension(commandPi);
	landExtension(commandPi);
	trunkPullExtension(commandPi);
}
