import type {
	FlowAutobranchCheckpointInput,
	FlowAutobranchCheckpointResult,
	FlowAutobranchFileStat,
	FlowAutobranchRequest,
} from "@nseng-ai/flow/api";
import { createFlowAutobranchCheckpointFlow } from "@nseng-ai/flow/api";

export type AutobranchFlowInput = FlowAutobranchCheckpointInput;
export type AutobranchFlowResult = FlowAutobranchCheckpointResult;
export type FileStat = FlowAutobranchFileStat;
export type ParsedAutobranchArgs = FlowAutobranchRequest;

export async function createAutobranchCheckpointFlow(
	input: AutobranchFlowInput,
): Promise<AutobranchFlowResult> {
	return await createFlowAutobranchCheckpointFlow(input);
}
