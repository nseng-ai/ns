import type { StackInfo } from "../../gateways/gt.ts";

export interface StackEdge {
	parent: string;
	child: string;
}

export function deduplicateOrdered(values: readonly string[]): readonly string[] {
	const seen = new Set<string>();
	const deduped: string[] = [];
	for (const value of values) {
		if (seen.has(value)) continue;
		seen.add(value);
		deduped.push(value);
	}
	return deduped;
}

export function collectStackEdges(stack: StackInfo, options: { current: string; downstackOnly: boolean }): readonly StackEdge[] {
	const path = options.downstackOnly ? [...stack.ancestors, options.current] : [...stack.ancestors, options.current, ...stack.descendants];
	const deduped = deduplicateOrdered(path);
	return deduped.slice(0, -1).map((parent, index) => ({ parent, child: deduped[index + 1] ?? "" })).filter((edge) => edge.child.length > 0);
}

export function collectStackBranches(stack: StackInfo, options: { current: string; trunk: string; downstackOnly: boolean; includeCurrent: boolean }): readonly string[] {
	const branches = options.downstackOnly
		? options.includeCurrent ? [...stack.ancestors, options.current] : [...stack.ancestors]
		: options.includeCurrent ? [...stack.ancestors, options.current, ...stack.descendants] : [...stack.ancestors, ...stack.descendants];
	return deduplicateOrdered(branches.filter((branch) => branch !== options.trunk && (options.includeCurrent || branch !== options.current)));
}
