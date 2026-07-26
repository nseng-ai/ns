import { objectiveCommandMetadata } from "../../../command-metadata.ts";

export function metadata() {
	return objectiveCommandMetadata(COMMAND_DESCRIPTION);
}

export async function command() {
	return await (await import("./definition.ts")).command();
}

const COMMAND_DESCRIPTION =
	"Publish one verified parent checkpoint to its bound branch and best-effort update the existing pull request.";
