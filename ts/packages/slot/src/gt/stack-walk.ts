import type { StackInfo } from "./types.ts";

export interface CollectStackBranchesOptions {
	current: string;
	trunk: string;
	downstackOnly: boolean;
	includeCurrent: boolean;
}

export function collectStackBranches(stack: StackInfo, options: CollectStackBranchesOptions): readonly string[] {
	const ordered = options.downstackOnly ? [...stack.ancestors] : [...stack.ancestors, ...(options.includeCurrent ? [options.current] : []), ...stack.descendants];
	if (options.downstackOnly && options.includeCurrent) ordered.push(options.current);
	const seen = new Set<string>();
	const branches: string[] = [];
	for (const branch of ordered) {
		if (branch === options.trunk || (!options.includeCurrent && branch === options.current) || seen.has(branch)) continue;
		seen.add(branch);
		branches.push(branch);
	}
	return branches;
}

export interface StackEdge {
	parent: string;
	child: string;
}

export function collectStackEdges(stack: StackInfo, options: { current: string; downstackOnly: boolean }): readonly StackEdge[] {
	const edges: StackEdge[] = [];
	const chain = [...stack.ancestors, options.current, ...(options.downstackOnly ? [] : stack.descendants)];
	for (let index = 0; index < chain.length - 1; index += 1) {
		edges.push({ parent: chain[index] ?? "", child: chain[index + 1] ?? "" });
	}
	return edges.filter((edge) => edge.parent.length > 0 && edge.child.length > 0);
}
