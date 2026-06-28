import prExtension from "../../ts/packages/hosts/pi/src/pr/extension.ts";
import prPreviewsExtension from "../../ts/packages/local-pi-tools/pr-previews/src/extension.ts";
import { importTypeScriptWorkspaceDefault } from "./workspace-packages.ts";

const prFeedbackWatchExtension = await importTypeScriptWorkspaceDefault(
	"@local-pi-tools/pr-feedback-watch/extension",
);

export default function prProjectExtension(pi) {
	prExtension(pi);
	prFeedbackWatchExtension(pi);
	prPreviewsExtension(pi);
}
