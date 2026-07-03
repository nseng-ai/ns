import { PICKUP_HANDOFF_COMMAND_NAME } from "./command-constants.ts";

export function formatPickupHandoffCommand(branch: string, slug: string): string {
	return `/${PICKUP_HANDOFF_COMMAND_NAME} --branch ${branch} ${slug}`;
}
