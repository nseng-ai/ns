import prFeedbackWatchExtension from "./pr-feedback-watch.ts";
import smartRestackExtension from "./smart-restack.ts";

type CodeExtensionAPI = Parameters<typeof prFeedbackWatchExtension>[0] & Parameters<typeof smartRestackExtension>[0];

export default function codeExtension(pi: CodeExtensionAPI): void {
	prFeedbackWatchExtension(pi);
	smartRestackExtension(pi);
}
