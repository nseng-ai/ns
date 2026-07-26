import prExtension from "../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/core/pr/extension.ts";
import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const prFeedbackWatchExtension = await importTypeScriptWorkspaceDefault(
	"@internal/pi-tools/pr-feedback-watch/extension",
);

export default function prProjectExtension(pi) {
	prExtension(pi);
	prFeedbackWatchExtension(pi);
}
