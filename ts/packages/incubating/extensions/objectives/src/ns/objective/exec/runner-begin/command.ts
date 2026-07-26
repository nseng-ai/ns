import { objectiveCommandMetadata } from "../../../command-metadata.ts";

export function metadata() {
	return objectiveCommandMetadata(COMMAND_DESCRIPTION);
}

export async function command() {
	return await (await import("./definition.ts")).command();
}

const COMMAND_DESCRIPTION =
	"Check preconditions and emit step facts plus the subagent prompt for one decomposed Objective Runner step (ADR 0024).";
