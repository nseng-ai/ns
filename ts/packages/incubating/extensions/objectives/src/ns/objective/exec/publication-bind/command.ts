import { objectiveCommandMetadata } from "../../../command-metadata.ts";

export function metadata() {
	return objectiveCommandMetadata(COMMAND_DESCRIPTION);
}

export async function command() {
	return await (await import("./definition.ts")).command();
}

const COMMAND_DESCRIPTION =
	"Bind one parent-held Objective Runner publication authorization to the current branch and existing pull request.";
