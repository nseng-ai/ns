import type { RunnerSubagentPi } from "../runner-subagents/index.ts";
import { SubagentFleetRegistry } from "./registry.ts";

const SUBAGENT_FLEET_REGISTRIES_GLOBAL_KEY = "__nsSubagentFleetRegistries";

interface SubagentFleetRegistryGlobal {
	[SUBAGENT_FLEET_REGISTRIES_GLOBAL_KEY]?: WeakMap<object, SubagentFleetRegistry>;
}

function subagentFleetRegistries(): WeakMap<object, SubagentFleetRegistry> {
	const registryGlobal = globalThis as typeof globalThis & SubagentFleetRegistryGlobal;
	const existing = registryGlobal[SUBAGENT_FLEET_REGISTRIES_GLOBAL_KEY];
	if (existing !== undefined) return existing;
	const registries = new WeakMap<object, SubagentFleetRegistry>();
	registryGlobal[SUBAGENT_FLEET_REGISTRIES_GLOBAL_KEY] = registries;
	return registries;
}

export interface SubagentFleetRegistryProviderOptions {
	readonly recentTaskCap?: number;
}

export function getOrCreateSubagentFleetRegistry(
	pi: RunnerSubagentPi,
	options: SubagentFleetRegistryProviderOptions = {},
): SubagentFleetRegistry {
	const registries = subagentFleetRegistries();
	const existing = registries.get(pi);
	if (existing !== undefined) return existing;
	const registry = new SubagentFleetRegistry(options);
	registries.set(pi, registry);
	return registry;
}
