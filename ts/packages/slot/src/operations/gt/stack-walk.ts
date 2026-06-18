import {
	walkGraphiteAncestors,
	type GraphiteTopology,
	type GraphiteWalkTermination,
} from "@asdl/core/graphite-metadata";

import { deduplicateOrderedStrings } from "../../collections.ts";
import type { StackInfo } from "../../gateways/gt.ts";

export interface StackEdge {
	parent: string;
	child: string;
}

export interface GraphiteTopologyBranchWalk {
	readonly branches: readonly string[];
	readonly problems: readonly GraphiteWalkTermination[];
}

export function collectStackEdges(
	stack: StackInfo,
	options: { current: string; downstackOnly: boolean },
): readonly StackEdge[] {
	const path = options.downstackOnly
		? [...stack.ancestors, options.current]
		: [...stack.ancestors, options.current, ...stack.descendants];
	const deduped = deduplicateOrderedStrings(path);
	return deduped
		.slice(0, -1)
		.map((parent, index) => ({ parent, child: deduped[index + 1] ?? "" }))
		.filter((edge) => edge.child.length > 0);
}

export function collectStackBranches(
	stack: StackInfo,
	options: { current: string; trunk: string; downstackOnly: boolean; includeCurrent: boolean },
): readonly string[] {
	const branches = options.downstackOnly
		? options.includeCurrent
			? [...stack.ancestors, options.current]
			: [...stack.ancestors]
		: options.includeCurrent
			? [...stack.ancestors, options.current, ...stack.descendants]
			: [...stack.ancestors, ...stack.descendants];
	return deduplicateOrderedStrings(
		branches.filter(
			(branch) =>
				branch !== options.trunk && (options.includeCurrent || branch !== options.current),
		),
	);
}

export function collectGraphiteTopologyAncestors(options: {
	readonly branch: string;
	readonly topology: GraphiteTopology;
}): GraphiteTopologyBranchWalk {
	const walk = walkGraphiteAncestors(options.topology, options.branch);
	return {
		branches: [options.branch, ...walk.ancestors.filter((branch) => options.topology.has(branch))],
		problems: walk.termination.type === "completed" ? [] : [walk.termination],
	};
}

// Keep stack-map-style descendant traversal distinct from walkGraphiteSubtree: callers need missing
// child-row and cycle problems, while walkGraphiteSubtree only returns the selected subtree plus cycleAt.
export function collectGraphiteTopologyDescendants(options: {
	readonly branch: string;
	readonly topology: GraphiteTopology;
}): GraphiteTopologyBranchWalk {
	const branches: string[] = [];
	const problems: GraphiteWalkTermination[] = [];
	const root = options.topology.get(options.branch);
	if (root === undefined) return { branches, problems };
	const pending = [...root.children];
	const visited = new Set<string>([options.branch]);
	while (pending.length > 0) {
		const child = pending.pop();
		if (child === undefined) continue;
		if (visited.has(child)) {
			problems.push({ type: "cycle", branch: child });
			continue;
		}
		visited.add(child);
		const row = options.topology.get(child);
		if (row === undefined) {
			problems.push({ type: "row_missing", branch: child });
			continue;
		}
		branches.push(child);
		pending.push(...row.children);
	}
	return { branches, problems };
}
