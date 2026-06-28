import prExtension from "../../ts/packages/hosts/pi/src/pr/extension.ts";
import { createRequire } from "node:module";

const requireFromTypeScriptWorkspace = createRequire(new URL("../../ts/package.json", import.meta.url));
const { default: prFeedbackWatchExtension } = await import(
	requireFromTypeScriptWorkspace.resolve("@local-pi-tools/pr-feedback-watch/extension"),
);
import prPreviewsExtension from "../../ts/packages/local-pi-tools/pr-previews/src/extension.ts";

export default function prProjectExtension(pi) {
	prExtension(pi);
	prFeedbackWatchExtension(pi);
	prPreviewsExtension(pi);
}
