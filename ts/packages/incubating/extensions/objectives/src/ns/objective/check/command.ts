import { objectiveCommandMetadata } from "../../command-metadata.ts";

export function metadata() {
	return objectiveCommandMetadata(COMMAND_DESCRIPTION);
}

export async function command() {
	return await (await import("./definition.ts")).command();
}

const COMMAND_DESCRIPTION = "Check one Objective record, or sweep all record edges with --all.";
