import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { flowExtensionDescriptorSource } from "../../src/ns/extension.ts";
import { FLOW_SUBMIT_CHECK_RECOVERY_POINT_ID } from "../../src/submit/submit-check-recovery.ts";

export interface FlowSubmitRecoveryDefault {
	relativePath: string;
	absolutePath: string;
}

export function resolveFlowSubmitRecoveryDefault(): FlowSubmitRecoveryDefault {
	const point = flowExtensionDescriptorSource.descriptor.points?.find(
		(candidate) => candidate.id === FLOW_SUBMIT_CHECK_RECOVERY_POINT_ID,
	);
	if (point?.default === undefined) {
		throw new Error("Expected the Flow descriptor to declare a recovery default");
	}
	return {
		relativePath: point.default,
		absolutePath: resolve(
			dirname(fileURLToPath(flowExtensionDescriptorSource.descriptorUrl)),
			point.default,
		),
	};
}
