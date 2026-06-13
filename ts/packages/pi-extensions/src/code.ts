import { asdlDevCodeExtension } from "./asdl-dev-extension.ts";
import changesExtension from "./changes.ts";
import landExtension from "./land.ts";
import prFeedbackWatchExtension from "./pr-feedback-watch.ts";
import pushExtension from "./push.ts";
import autobranchExtension from "./autobranch.ts";
import autoslotExtension from "./autoslot.ts";

type CodeExtensionAPI = Parameters<typeof changesExtension>[0] &
	Parameters<typeof asdlDevCodeExtension>[0] &
	Parameters<typeof autobranchExtension>[0] &
	Parameters<typeof autoslotExtension>[0] &
	Parameters<typeof landExtension>[0] &
	Parameters<typeof pushExtension>[0] &
	Parameters<typeof prFeedbackWatchExtension>[0];

export default function codeExtension(pi: CodeExtensionAPI): void {
	changesExtension(pi);
	asdlDevCodeExtension(pi);
	pushExtension(pi);
	autobranchExtension(pi);
	autoslotExtension(pi);
	landExtension(pi);
	prFeedbackWatchExtension(pi);
}
