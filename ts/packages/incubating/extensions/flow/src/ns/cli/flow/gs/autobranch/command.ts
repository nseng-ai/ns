import { createFlowAutobranchCommand } from "../../../../commands/autobranch.ts";

export async function command() {
	return createFlowAutobranchCommand("gh-stack");
}
