import { listSdlCommands, runCli, type SdlCommandInfo } from "@asdl/sdl/cli";

import autobranchExtension from "./autobranch.ts";
import autoslotExtension from "./autoslot.ts";
import { registerCliCommandExtension, selectCliCommands, type ExtensionAPI as CliExtensionAPI } from "./cli-command-extension.ts";
import landExtension from "./land.ts";
import { definePiSurfaceParity } from "./parity.ts";
import pushExtension from "./push.ts";

export type ExtensionAPI = CliExtensionAPI &
	Parameters<typeof autobranchExtension>[0] &
	Parameters<typeof autoslotExtension>[0] &
	Parameters<typeof landExtension>[0] &
	Parameters<typeof pushExtension>[0];

const SDL_COMMAND_NAMES = ["changes", "cp", "submit"] as const;
const SDL_CODE_COMMAND_NAMES = ["changes", "cp", "submit", "regenerate-pr"] as const;
const SDL_CODE_PI_COMMAND_ALIASES = {
	changes: "sdl:code:changes",
	cp: "sdl:code:checkpoint",
	submit: "sdl:code:submit",
	"regenerate-pr": "sdl:code:regenerate-pr",
} as const satisfies Record<(typeof SDL_CODE_COMMAND_NAMES)[number], string>;

export const sdlExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "sdl:changes",
		workflow: "Summarize outstanding worktree changes without committing",
		parity: "FULL",
		cli: "sdl changes",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Pi command delegates to the built-in SDL changes command through registerCliCommandExtension.",
	},
	{
		kind: "command",
		surface: "sdl:cp",
		workflow: "Create a checkpoint commit for the current diff",
		parity: "FULL",
		cli: "sdl cp",
		skill: "code-checkpoint",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Pi command is registered through registerCliCommandExtension and delegates to the shared SDL cp command-entry runner.",
	},
	{
		kind: "command",
		surface: "sdl:submit",
		workflow: "Checkpoint outstanding changes, then submit the current Graphite stack",
		parity: "FULL",
		cli: "sdl submit",
		skill: "sdl-submit",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Pi command delegates to the built-in SDL submit command through registerCliCommandExtension.",
	},
	{
		kind: "command",
		surface: "sdl:code:changes",
		workflow: "Nested code-lifecycle alias for outstanding worktree changes",
		parity: "FULL",
		cli: "sdl changes",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Nested code-lifecycle Pi alias over sdl changes; flat /sdl:changes remains primary.",
	},
	{
		kind: "command",
		surface: "sdl:code:checkpoint",
		workflow: "Nested code-lifecycle alias for checkpoint creation",
		parity: "FULL",
		cli: "sdl cp",
		skill: "code-checkpoint",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Nested code-lifecycle Pi alias over sdl cp; flat /sdl:cp remains primary and no sdl checkpoint CLI command is created.",
	},
	{
		kind: "command",
		surface: "sdl:code:submit",
		workflow: "Nested code-lifecycle alias for submitting the current Graphite stack",
		parity: "FULL",
		cli: "sdl submit",
		skill: "sdl-submit",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Nested code-lifecycle Pi alias over sdl submit; flat /sdl:submit remains primary.",
	},
	{
		kind: "command",
		surface: "sdl:code:regenerate-pr",
		workflow: "Regenerate the current branch PR title and description",
		parity: "FULL",
		cli: "sdl regenerate-pr",
		skill: "sdl-submit",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "sdl-extension",
		notes: "Nested code-lifecycle Pi alias over sdl regenerate-pr; no flat /sdl:regenerate-pr mirror is registered.",
	},
] as const);

export default function sdlExtension(pi: ExtensionAPI): void {
	const commands = selectSdlCommands(SDL_COMMAND_NAMES);
	registerCliCommandExtension(pi, {
		cliName: "sdl",
		piNamespace: "sdl",
		commands,
		runCli,
	});
	registerCliCommandExtension(pi, {
		cliName: "sdl",
		piNamespace: "sdl",
		commands: selectSdlCommands(SDL_CODE_COMMAND_NAMES),
		piCommandAliases: SDL_CODE_PI_COMMAND_ALIASES,
		runCli,
	});
	autobranchExtension(pi);
	autoslotExtension(pi);
	landExtension(pi);
	pushExtension(pi);
}

function selectSdlCommands(names: readonly string[]): SdlCommandInfo[] {
	return selectCliCommands({
		availableCommands: listSdlCommands(),
		names,
		missingCommandLabel: "sdl",
	});
}
