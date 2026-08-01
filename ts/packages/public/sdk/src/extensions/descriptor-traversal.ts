import type { ExtensionGroupEntry } from "../sdk/descriptor.ts";
import { commandKey } from "./command-registry.ts";

export interface DescriptorTraversalState {
	readonly segments: readonly string[];
	readonly hiddenAncestorKeys: readonly string[];
	readonly rootGroupDescription: string;
}

export function nextDescriptorTraversalState(
	entry: ExtensionGroupEntry,
	state: DescriptorTraversalState,
): DescriptorTraversalState {
	const segments = [...state.segments, entry.group];
	const hiddenAncestorKeys = entry.hidden
		? [...state.hiddenAncestorKeys, commandKey({ name: entry.group, segments })]
		: state.hiddenAncestorKeys;
	const rootGroupDescription =
		state.segments.length === 0 ? entry.description : state.rootGroupDescription;
	return { segments, hiddenAncestorKeys, rootGroupDescription };
}
