import prExtension from "../../ts/packages/hosts/pi/src/pr/extension.ts";
import prFeedbackWatchExtension from "../../ts/packages/local-pi-tools/pr-feedback-watch/src/extension.ts";
import prPreviewsExtension from "../../ts/packages/local-pi-tools/pr-previews/src/extension.ts";

export default function prProjectExtension(pi) {
	prExtension(pi);
	prFeedbackWatchExtension(pi);
	prPreviewsExtension(pi);
}
