import registerGsExtension, { type GsExtensionAPI } from "./extension.ts";
import { createFreshNsCliRunner } from "./fresh-ns-cli.ts";

export default function registerGsProjectExtension(pi: GsExtensionAPI): void {
	registerGsExtension(pi, { runCli: createFreshNsCliRunner() });
}
