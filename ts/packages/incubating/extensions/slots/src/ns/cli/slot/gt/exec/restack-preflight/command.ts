import { loadSlotNsCommand } from "../../../../../slot-ns-command.ts";

export async function command() {
	return loadSlotNsCommand("restack-preflight");
}
