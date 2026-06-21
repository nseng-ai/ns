import { runCli, type SdlCommandInfo } from "@sdl/sdl/cli";

import autobranchExtension from "./autobranch.ts";
import autoslotExtension from "./autoslot.ts";
import {
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
} from "./cli-command-extension.ts";
import landExtension from "./land.ts";
import { requestWorktreeStatusRefresh } from "./worktree-status.ts";
import { definePiSurfaceParity } from "./parity.ts";
import pushExtension from "./push.ts";
import trunkPullExtension from "./trunk-pull.ts";

export type SdlExtensionAPI = CliCommandExtensionAPI &
	Parameters<typeof autobranchExtension>[0] &
	Parameters<typeof autoslotExtension>[0] &
	Parameters<typeof landExtension>[0] &
	Parameters<typeof pushExtension>[0] &
	Parameters<typeof trunkPullExtension>[0];

const CHANGES_COMMAND_INFO = {
	name: "changes",
	description: "Summarize outstanding worktree changes without committing.",
} as const satisfies SdlCommandInfo;
const CP_COMMAND_INFO = {
	name: "cp",
	description: "Create a checkpoint commit for the current diff.",
} as const satisfies SdlCommandInfo;
const SUBMIT_COMMAND_INFO = {
	name: "submit",
	description: "Checkpoint outstanding changes, then submit the current Graphite stack.",
} as const satisfies SdlCommandInfo;
const REGENERATE_PR_COMMAND_INFO = {
	name: "regenerate-pr",
	description: "Regenerate the current branch PR title and description.",
} as const satisfies SdlCommandInfo;
const SDL_DIRECT_COMMANDS = [
	CHANGES_COMMAND_INFO,
	CP_COMMAND_INFO,
	SUBMIT_COMMAND_INFO,
	REGENERATE_PR_COMMAND_INFO,
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
	const sdlBaseSpec = {
		cliName: "sdl",
		piNamespace: "sdl",
		afterCommandComplete: requestWorktreeStatusRefresh,
		runCli,
	} as const;
	registerCliCommandExtension(pi, {
		...sdlBaseSpec,
		commands: SDL_DIRECT_COMMANDS,
	});
	registerCliCommandExtension(pi, {
		...sdlBaseSpec,
		commands: SDL_CODE_ALIAS_COMMANDS,
		piCommandAliases: SDL_CODE_COMMAND_ALIASES,
	});
	autobranchExtension(pi);
	autoslotExtension(pi);
	landExtension(pi);
	pushExtension(pi);
	trunkPullExtension(pi);
}
