import { objectiveCommandMetadata } from "../../../command-metadata.ts";

export function metadata() {
	return objectiveCommandMetadata(COMMAND_DESCRIPTION);
}

export async function command() {
	return await (await import("./definition.ts")).command();
}

const COMMAND_DESCRIPTION =
	"Validate the subagent report, run the verification gate, create the runner-owned commit, and emit the Runner Checkpoint for one decomposed Objective Runner step (ADR 0024).";
