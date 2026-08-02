import { parseManagedRegion } from "@nseng-ai/foundation/managed-region";

export interface ManagedPublicationRegion {
	beginPrefix: string;
	end: string;
	identity: string;
}

export type ManagedPublicationRegionMergeResult =
	| { type: "merged"; body: string }
	| {
			type: "refused";
			reason: "invalid-managed-region" | "malformed-region" | "foreign-managed-region";
			message: string;
	  };

export function mergeManagedPublicationRegion(input: {
	existingBody: string;
	region: ManagedPublicationRegion;
	managedBody: string;
}): ManagedPublicationRegionMergeResult {
	if (!isSafeRegion(input.region)) {
		return {
			type: "refused",
			reason: "invalid-managed-region",
			message: "The caller-supplied managed region markers or identity are invalid.",
		};
	}
	const formattedRegion = formatManagedRegion(input.region, input.managedBody);
	const parsed = parseManagedRegion({
		text: input.existingBody,
		markers: { beginPrefix: input.region.beginPrefix, end: input.region.end },
		parseMetadata: (beginComment) => parseMetadata(beginComment, input.region.beginPrefix),
	});
	if (parsed.type === "malformed") {
		return {
			type: "refused",
			reason: "malformed-region",
			message: `The managed publication region is malformed: ${parsed.reason}.`,
		};
	}
	if (parsed.type === "found") {
		if (parsed.metadata !== input.region.identity) {
			return {
				type: "refused",
				reason: "foreign-managed-region",
				message: `The managed publication region identity is ${JSON.stringify(parsed.metadata)}, not ${JSON.stringify(input.region.identity)}.`,
			};
		}
		return {
			type: "merged",
			body: `${input.existingBody.slice(0, parsed.start)}${formattedRegion}${input.existingBody.slice(parsed.end)}`,
		};
	}

	if (input.existingBody === "") return { type: "merged", body: formattedRegion };
	const separator = input.existingBody.endsWith("\n") ? "\n" : "\n\n";
	return { type: "merged", body: `${input.existingBody}${separator}${formattedRegion}` };
}

function formatManagedRegion(region: ManagedPublicationRegion, managedBody: string): string {
	return [`${region.beginPrefix}${region.identity} -->`, managedBody.trim(), region.end].join("\n");
}

function parseMetadata(beginComment: string, beginPrefix: string): string | undefined {
	const closeIndex = beginComment.lastIndexOf("-->");
	if (!beginComment.startsWith(beginPrefix) || closeIndex === -1) return undefined;
	const identity = beginComment.slice(beginPrefix.length, closeIndex).trim();
	return identity === "" ? undefined : identity;
}

function isSafeRegion(region: ManagedPublicationRegion): boolean {
	return (
		region.beginPrefix.startsWith("<!--") &&
		!region.beginPrefix.includes("-->") &&
		!region.beginPrefix.includes("\n") &&
		region.end.startsWith("<!--") &&
		region.end.endsWith("-->") &&
		!region.end.includes("\n") &&
		region.identity.trim() === region.identity &&
		region.identity !== "" &&
		!region.identity.includes("-->") &&
		!region.identity.includes("\n")
	);
}
