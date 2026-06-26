import { parseObjectiveListData } from "@sdl/objective/api";
import type { ObjectiveListParseResult } from "@sdl/objective/api";

import { parseMachineEnvelopeData } from "../runtime/machine-envelope.ts";

export type {
	ObjectiveList,
	ObjectiveListParseResult,
	ObjectiveListRecord,
} from "@sdl/objective/api";

export function parseObjectiveList(stdout: string): ObjectiveListParseResult {
	const envelope = parseMachineEnvelopeData(stdout, { label: "objective list JSON" });
	if (envelope.type !== "valid") {
		return { type: "invalid", message: envelope.message };
	}

	return parseObjectiveListData(envelope.data);
}
