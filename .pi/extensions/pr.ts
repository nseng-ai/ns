import { importTypeScriptWorkspaceDefault } from "../lib/workspace-packages.ts";

const prExtension = await importTypeScriptWorkspaceDefault(
	"@nseng-ai/pi-runtime/core/pr/extension",
);
const prFeedbackWatchExtension = await importTypeScriptWorkspaceDefault(
	"@internal/pi-tools/pr-feedback-watch/extension",
);

export default function prProjectExtension(pi) {
	prExtension(pi);
	prFeedbackWatchExtension(pi);
}
