import type { RunnerSubagentPi } from "../runner-subagents/index.ts";
import { SubagentFleetRegistry } from "./registry.ts";

const subagentFleetRegistries = new WeakMap<object, SubagentFleetRegistry>();

export interface SubagentFleetRegistryProviderOptions {
	readonly recentTaskCap?: number;
}

export function getOrCreateSubagentFleetRegistry(
	pi: RunnerSubagentPi,
	options: SubagentFleetRegistryProviderOptions = {},
): SubagentFleetRegistry {
	const existing = subagentFleetRegistries.get(pi);
	if (existing !== undefined) return existing;
	const registry = new SubagentFleetRegistry(options);
	subagentFleetRegistries.set(pi, registry);
	return registry;
}
