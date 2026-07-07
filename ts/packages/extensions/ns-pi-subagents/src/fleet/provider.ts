import type { RunnerSubagentPi } from "../runner-subagents/index.ts";
import { SubagentFleetRegistry } from "./registry.ts";

const SUBAGENT_FLEET_REGISTRIES_GLOBAL_KEY = "__nsSubagentFleetRegistries";

interface SubagentFleetRegistryGlobal {
	[SUBAGENT_FLEET_REGISTRIES_GLOBAL_KEY]?: WeakMap<object, SubagentFleetRegistry>;
}

function getOrCreate<K extends object, V>(store: WeakMap<K, V>, key: K, createValue: () => V): V;
function getOrCreate<K extends string, V>(
	store: Partial<Record<K, V>>,
	key: K,
	createValue: () => V,
): V;
function getOrCreate<K extends object | string, V>(
	store: WeakMap<object, V> | Partial<Record<string, V>>,
	key: K,
	createValue: () => V,
): V {
	if (store instanceof WeakMap) {
		if (typeof key !== "object" || key === null) {
			throw new Error("WeakMap registry keys must be objects.");
		}
		const existing = store.get(key);
		if (existing !== undefined) return existing;
		const value = createValue();
		store.set(key, value);
		return value;
	}

	if (typeof key !== "string") throw new Error("Global registry keys must be strings.");
	const existing = store[key];
	if (existing !== undefined) return existing;
	const value = createValue();
	store[key] = value;
	return value;
}

function subagentFleetRegistries(): WeakMap<object, SubagentFleetRegistry> {
	const registryGlobal = globalThis as typeof globalThis & SubagentFleetRegistryGlobal;
	return getOrCreate(
		registryGlobal,
		SUBAGENT_FLEET_REGISTRIES_GLOBAL_KEY,
		() => new WeakMap<object, SubagentFleetRegistry>(),
	);
}

export interface SubagentFleetRegistryProviderOptions {
	readonly recentTaskCap?: number;
}

export function getOrCreateSubagentFleetRegistry(
	pi: RunnerSubagentPi,
	options: SubagentFleetRegistryProviderOptions = {},
): SubagentFleetRegistry {
	const registries = subagentFleetRegistries();
	return getOrCreate(registries, pi, () => new SubagentFleetRegistry(options));
}
