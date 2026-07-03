import { defineExtension } from "@ji/kernel/sdk";

import { handoffSdlCommand } from "../command.ts";
import {
	pickupRequestSchema,
	pickupResultSchema,
	renderPickup,
	runPickup,
} from "../../core/operations/pickup.ts";

export const handoffPickupSdlCommand = handoffSdlCommand({
	name: "pickup",
	summary: "Pick up a handoff by slug.",
	description: "Read one handoff artifact by exact slug.",
	schema: pickupRequestSchema,
	options: { branch: { short: "-b" } },
	resultSchema: pickupResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runPickup,
	renderHuman: renderPickup,
});

export default defineExtension({
	commands: [handoffPickupSdlCommand],
});
