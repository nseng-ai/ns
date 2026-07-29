import { PICKUP_HANDOFF_COMMAND_NAME } from "@nseng-ai/handoffs/api";

export function formatPickupHandoffCommand(branch: string, slug: string): string {
	return `/${PICKUP_HANDOFF_COMMAND_NAME} --branch ${branch} ${slug}`;
}
