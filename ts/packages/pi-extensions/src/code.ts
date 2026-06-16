import prFeedbackWatchExtension from "./pr-feedback-watch.ts";

type CodeExtensionAPI = Parameters<typeof prFeedbackWatchExtension>[0];

export default function codeExtension(pi: CodeExtensionAPI): void {
	prFeedbackWatchExtension(pi);
}
