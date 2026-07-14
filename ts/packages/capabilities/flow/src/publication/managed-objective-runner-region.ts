import { parseManagedRegion } from "@nseng-ai/foundation/managed-region";

export const OBJECTIVE_RUNNER_REGION_BEGIN = "<!-- ns-objective-runner:begin";
export const OBJECTIVE_RUNNER_REGION_END = "<!-- ns-objective-runner:end -->";

export type ObjectiveRunnerRegionMergeResult =
	| { type: "merged"; body: string }
	| {
			type: "refused";
			reason: "invalid-objective" | "malformed-region" | "foreign-objective";
			message: string;
	  };

export function mergeObjectiveRunnerRegion(input: {
	existingBody: string;
	objectiveSlug: string;
	managedBody: string;
}): ObjectiveRunnerRegionMergeResult {
	if (!isObjectiveSlug(input.objectiveSlug)) {
		return {
			type: "refused",
			reason: "invalid-objective",
			message: `Invalid Objective slug: ${JSON.stringify(input.objectiveSlug)}.`,
		};
	}
	const region = formatObjectiveRunnerRegion(input.objectiveSlug, input.managedBody);
	const parsed = parseManagedRegion({
		text: input.existingBody,
		markers: { beginPrefix: OBJECTIVE_RUNNER_REGION_BEGIN, end: OBJECTIVE_RUNNER_REGION_END },
		parseMetadata: parseObjectiveSlug,
	});
	if (parsed.type === "malformed") {
		return {
			type: "refused",
			reason: "malformed-region",
			message: `The Objective Runner managed region is malformed: ${parsed.reason}.`,
		};
	}
	if (parsed.type === "found") {
		if (parsed.metadata !== input.objectiveSlug) {
			return {
				type: "refused",
				reason: "foreign-objective",
				message: `The Objective Runner managed region belongs to ${parsed.metadata}, not ${input.objectiveSlug}.`,
			};
		}
		return {
			type: "merged",
			body: `${input.existingBody.slice(0, parsed.start)}${region}${input.existingBody.slice(parsed.end)}`,
		};
	}

	if (input.existingBody === "") return { type: "merged", body: region };
	const separator = input.existingBody.endsWith("\n") ? "\n" : "\n\n";
	return { type: "merged", body: `${input.existingBody}${separator}${region}` };
}

function formatObjectiveRunnerRegion(objectiveSlug: string, managedBody: string): string {
	return [
		`${OBJECTIVE_RUNNER_REGION_BEGIN} objective=${objectiveSlug} -->`,
		managedBody.trim(),
		OBJECTIVE_RUNNER_REGION_END,
	].join("\n");
}

function parseObjectiveSlug(beginComment: string): string | undefined {
	const match = beginComment.match(/\sobjective=([a-z0-9]+(?:-[a-z0-9]+)*)\s*-->/u);
	return match?.[1];
}

function isObjectiveSlug(value: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}
