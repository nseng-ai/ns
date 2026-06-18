import type { ChildrenCorruption, TrunkMarkerStatus, WalkTermination } from "../../../gateways/gt.ts";

export type GraphiteWalkKind = "ancestor" | "descendant";
export type GraphiteWalkLabel = "walk" | "selection";

export function renderWalkTerminationWarning(options: { readonly kind: GraphiteWalkKind; readonly termination: WalkTermination; readonly label: GraphiteWalkLabel }): string | null {
	if (options.termination.type === "completed") return null;
	const metadataName = options.kind === "ancestor" ? "parent" : "children";
	if (options.termination.type === "cycle") return `cycle detected in Graphite ${metadataName} metadata at ${options.termination.branch}; ${options.kind} ${options.label} stopped`;
	const branchName = options.kind === "ancestor" ? "parent" : "child";
	return `${branchName} branch ${options.termination.branch} is missing from Graphite metadata; ${options.kind} ${options.label} stopped`;
}

export function renderChildrenCorruption(corruption: ChildrenCorruption): string {
	switch (corruption.kind) {
		case "not_text": return `children metadata for ${corruption.branch} is not JSON text; treating as no children`;
		case "invalid_json": return `children metadata for ${corruption.branch} is not valid JSON; treating as no children`;
		case "not_list": return `children metadata for ${corruption.branch} is not a JSON list; treating as no children`;
		case "non_string": return `children metadata for ${corruption.branch} contains non-string entries`;
	}
}

export function renderTrunkMarkerWarnings(marker: TrunkMarkerStatus): readonly string[] {
	if (marker.type === "clean") return [];
	if (marker.terminusState === "row_missing") return ["trunk row marker missing"];
	const warnings: string[] = [];
	if (marker.terminusState === "unmarked") warnings.push("trunk row marker missing");
	if (marker.markedTrunks.length > 1) warnings.push("multiple Graphite metadata rows are marked as trunk");
	if (marker.markedTrunks.length > 0 && !marker.markedTrunks.includes(marker.terminus)) warnings.push(`Graphite metadata trunk marker differs from ancestor-walk terminus: ${marker.markedTrunks[0]} != ${marker.terminus}`);
	return warnings;
}
