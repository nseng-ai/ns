import type {
	ExtensionAPI,
	SessionShutdownEvent,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";

import { SubagentFleetRegistry } from "./registry.ts";

const SUBAGENT_FLEET_MANAGERS_GLOBAL_KEY = "__nsSubagentFleetManagers";

interface SubagentFleetLifecycleBinding {
	dispose(): void;
}

interface SubagentFleetManagerRecord {
	readonly registry: SubagentFleetRegistry;
	lifecycleBinding: SubagentFleetLifecycleBinding | undefined;
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
}

/** Acquires the event-bus-owned Fleet registry and binds its active-runtime lifecycle once. */
export function getOrCreateSubagentFleetRegistry(
	options: SubagentFleetManagerOptions,
): SubagentFleetRegistry {
	const managers = subagentFleetManagers();
	let manager = managers.get(options.owner);
	if (manager === undefined) {
		manager = {
			registry: new SubagentFleetRegistry(),
			lifecycleBinding: undefined,
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
	if (manager.lifecycleBinding !== undefined) return;
	let isActive = true;
	const binding: SubagentFleetLifecycleBinding = {
		dispose() {
			if (!isActive) return;
			isActive = false;
		},
	};
	manager.lifecycleBinding = binding;
	registrar.onSessionStart((event) => {
		if (!isActive) return;
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
		if (!isActive) return;
		binding.dispose();
		if (manager.lifecycleBinding === binding) manager.lifecycleBinding = undefined;
	});
}
