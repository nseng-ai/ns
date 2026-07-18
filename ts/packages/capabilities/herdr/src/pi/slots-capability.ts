import type { SkillCommandInfoLike } from "@nseng-ai/capability-kit/pi-types";

import type { HasHerdrSlotsCapability } from "../core/slots-capability.ts";

const NS_SLOT_COMMAND_PREFIX = "ns:slot:";

/**
 * Production Slots-capability probe for the Pi host. The ns Pi extension
 * mirrors effective SDK commands into slash-command names, so a registered
 * `ns:slot:*` command proves that `@nseng-ai/slots` is present in the ns SDK's
 * effective extension registry without spawning a subprocess.
 */
export function createHerdrSlotsCapabilityProbe(pi: {
	getCommands(): readonly SkillCommandInfoLike[];
}): HasHerdrSlotsCapability {
	return async () =>
		pi.getCommands().some((command) => command.name.startsWith(NS_SLOT_COMMAND_PREFIX));
}
