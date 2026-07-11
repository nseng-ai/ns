import type {
	ExtensionAPI,
	SessionShutdownEvent,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";

import { SubagentFleetRegistry } from "./registry.ts";

const SUBAGENT_FLEET_MANAGERS_GLOBAL_KEY = "__nsSubagentFleetManagers";

interface SubagentFleetManagerRecord {
	readonly registry: SubagentFleetRegistry;
	isLifecycleBound: boolean;
}

interface SubagentFleetManagerGlobal {
	[SUBAGENT_FLEET_MANAGERS_GLOBAL_KEY]?: WeakMap<
		ExtensionAPI["events"],
		SubagentFleetManagerRecord
	>;
}

function subagentFleetManagers(): WeakMap<ExtensionAPI["events"], SubagentFleetManagerRecord> {
	const managerGlobal = globalThis as typeof globalThis & SubagentFleetManagerGlobal;
	const existing = managerGlobal[SUBAGENT_FLEET_MANAGERS_GLOBAL_KEY];
	if (existing !== undefined) return existing;
	const managers = new WeakMap<ExtensionAPI["events"], SubagentFleetManagerRecord>();
	managerGlobal[SUBAGENT_FLEET_MANAGERS_GLOBAL_KEY] = managers;
	return managers;
}

export interface SubagentFleetLifecycleRegistrar {
	onSessionStart(handler: (event: SessionStartEvent) => void): void;
	onSessionShutdown(handler: (event: SessionShutdownEvent) => void): void;
}

export interface SubagentFleetManagerOptions extends SubagentFleetLifecycleRegistrar {
	readonly owner: ExtensionAPI["events"];
	readonly recentTaskCap?: number;
}

/** Acquires the event-bus-owned Fleet registry and binds its active-runtime lifecycle once. */
export function getOrCreateSubagentFleetRegistry(
	options: SubagentFleetManagerOptions,
): SubagentFleetRegistry {
	const managers = subagentFleetManagers();
	let manager = managers.get(options.owner);
	if (manager === undefined) {
		manager = {
			registry:
				options.recentTaskCap === undefined
					? new SubagentFleetRegistry()
					: new SubagentFleetRegistry({ recentTaskCap: options.recentTaskCap }),
			isLifecycleBound: false,
		};
		managers.set(options.owner, manager);
	}
	bindLifecycle(manager, options);
	return manager.registry;
}

function bindLifecycle(
	manager: SubagentFleetManagerRecord,
	registrar: SubagentFleetLifecycleRegistrar,
): void {
	if (manager.isLifecycleBound) return;
	manager.isLifecycleBound = true;
	registrar.onSessionStart((event) => {
		switch (event.reason) {
			case "reload":
				return;
			case "startup":
			case "new":
			case "resume":
			case "fork":
				manager.registry.clear();
				return;
			default: {
				const exhaustive: never = event.reason;
				return exhaustive;
			}
		}
	});
	registrar.onSessionShutdown(() => {
		manager.isLifecycleBound = false;
	});
}
