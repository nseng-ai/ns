import { asdlDevCodeExtension } from "./asdl-dev-extension.ts";
import changesExtension from "./changes.ts";
import landExtension from "./land.ts";
import prFeedbackWatchExtension from "./pr-feedback-watch.ts";
import autobranchExtension from "./autobranch.ts";

type CodeExtensionAPI = Parameters<typeof changesExtension>[0] &
	Parameters<typeof asdlDevCodeExtension>[0] &
	Parameters<typeof autobranchExtension>[0] &
	Parameters<typeof landExtension>[0] &
	Parameters<typeof prFeedbackWatchExtension>[0];

export default function codeExtension(pi: CodeExtensionAPI): void {
	changesExtension(pi);
	asdlDevCodeExtension(pi);
	autobranchExtension(pi);
	landExtension(pi);
	prFeedbackWatchExtension(pi);
}
