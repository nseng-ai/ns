import { readFileSync } from "node:fs";

import { flowExtensionDescriptorSource } from "../../src/ns/extension.ts";
import { FLOW_PR_DESCRIPTION_POINT_ID } from "../../src/submit/pr-description.ts";

export function readFlowPrDescriptionDefault(): string {
	const point = flowExtensionDescriptorSource.descriptor.points?.find(
		(candidate) => candidate.id === FLOW_PR_DESCRIPTION_POINT_ID,
	);
	if (point?.default === undefined) {
		throw new Error("Expected the Flow descriptor to declare a PR-description default");
	}
	return readFileSync(
		new URL(point.default, flowExtensionDescriptorSource.descriptorUrl),
		"utf8",
	).trimEnd();
}
