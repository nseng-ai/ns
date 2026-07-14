import { dispatchWorkflowId } from "../../workflows/dispatch-id.ts";
import { helloWorkflowId } from "../../workflows/hello-id.ts";
import { sandboxProbeWorkflowId } from "../../workflows/sandbox-probe-id.ts";
import { supervisionProbeWorkflowId } from "../../workflows/supervision-probe-id.ts";
import type { TriggerWorkflowName } from "./contracts.ts";

export const triggerWorkflowIds = {
	hello: helloWorkflowId,
	"sandbox-probe": sandboxProbeWorkflowId,
	"supervision-probe": supervisionProbeWorkflowId,
	dispatch: dispatchWorkflowId,
} as const satisfies Record<TriggerWorkflowName, string>;
