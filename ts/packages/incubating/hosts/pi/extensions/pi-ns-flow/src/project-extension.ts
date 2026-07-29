import registerFlowExtension, { type FlowExtensionAPI } from "./extension.ts";
import { createFreshNsCliRunner } from "./fresh-ns-cli.ts";

export default function registerFlowProjectExtension(pi: FlowExtensionAPI): void {
	registerFlowExtension(pi, { runCli: createFreshNsCliRunner() });
}
