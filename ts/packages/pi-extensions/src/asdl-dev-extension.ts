import { listAsdlDevCommands, runCli, type AsdlDevCommandInfo } from "asdl-dev/cli";
import { createRealAsdlDevContext } from "asdl-dev/context";
import { runSubmitCliCommand } from "asdl-dev/submit-cli-command";

import { registerCliCommandExtension, selectCliCommands, type CliCommandRunDeps, type ExtensionAPI } from "./cli-command-extension.ts";
import { definePiSurfaceParity } from "./parity.ts";

const DEV_COMMAND_NAMES = ["preview-url"] as const;
const CODE_COMMAND_NAMES = ["pr-regen"] as const;

const ASDL_DEV_SUBMIT_COMMAND = {
	name: "submit",
	description: "Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.",
} as const satisfies AsdlDevCommandInfo;

export const asdlDevExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "dev:preview-url",
		workflow: "Resolve the current Vercel preview URL",
		parity: "FULL",
		cli: "asdl-dev preview-url",
		skill: "dev-preview-url",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "asdl-dev-extension",
		notes: "Pi command is registered through registerCliCommandExtension and delegates to the asdl-dev CLI.",
	},
] as const);

export const asdlDevCodeExtensionParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "code:submit",
		workflow: "Checkpoint outstanding changes, then submit the current Graphite stack",
		parity: "FULL",
		cli: "Pi-only bridge to asdl-dev submit helper",
		skill: "code-submit",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "asdl-dev-extension",
		notes: "Pi command delegates directly to the exported submit helper while the asdl-dev submit CLI surface is removed during the SDL hard-cutover.",
	},
	{
		kind: "command",
		surface: "code:pr-regen",
		workflow: "Regenerate the current branch PR title and description",
		parity: "FULL",
		cli: "asdl-dev pr-regen",
		skill: "code-submit",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "asdl-dev-extension",
		notes: "Pi command delegates to asdl-dev pr-regen; the code-submit skill documents the PR description regeneration operation.",
	},
] as const);

export default function asdlDevExtension(pi: ExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "asdl-dev",
		piNamespace: "dev",
		commands: selectAsdlDevCommands(DEV_COMMAND_NAMES),
		runCli,
	});
}

export function asdlDevCodeExtension(pi: ExtensionAPI): void {
	registerCliCommandExtension(pi, {
		cliName: "asdl-dev",
		piNamespace: "code",
		commands: [ASDL_DEV_SUBMIT_COMMAND, ...selectAsdlDevCommands(CODE_COMMAND_NAMES)],
		runCli: runAsdlDevCodeCli,
	});
}

async function runAsdlDevCodeCli(args: readonly string[], deps: CliCommandRunDeps): Promise<number> {
	const commandName = args[0];
	if (commandName !== "submit") {
		return runCli(args, deps);
	}

	return runSubmitFromPi(args.slice(1), deps);
}

async function runSubmitFromPi(args: readonly string[], deps: CliCommandRunDeps): Promise<number> {
	if (args.length === 0) {
		return runSubmitCliCommand({ context: createRealAsdlDevContext(), runDeps: deps, restack: false });
	}
	if (args.length === 1 && args[0] === "--restack") {
		return runSubmitCliCommand({ context: createRealAsdlDevContext(), runDeps: deps, restack: true });
	}
	if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
		deps.stdout(formatSubmitHelp());
		return 0;
	}

	const badArg = args[0] ?? "";
	deps.stderr(`error: unknown option '${badArg}'\n`);
	return 2;
}

function formatSubmitHelp(): string {
	return `Usage: asdl-dev submit [options]

Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.

Options:
  --restack              Run gt restack before submitting when required.
  -h, --help             display help for command
`;
}

function selectAsdlDevCommands(names: readonly string[]): AsdlDevCommandInfo[] {
	return selectCliCommands({
		availableCommands: listAsdlDevCommands(),
		names,
		missingCommandLabel: "asdl-dev",
	});
}
