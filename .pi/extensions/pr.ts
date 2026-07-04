import prExtension from "../../ts/packages/hosts/pi/src/core/pr/extension.ts";
import prPreviewsExtension from "../../ts/packages/internal/pi-tools/src/pr-previews/extension.ts";
import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const prFeedbackWatchExtension = await importTypeScriptWorkspaceDefault(
	"@internal/pi-tools/pr-feedback-watch/extension",
);

export default function prProjectExtension(pi) {
	prExtension(pi);
	prFeedbackWatchExtension(pi);
	prPreviewsExtension(pi);
}
