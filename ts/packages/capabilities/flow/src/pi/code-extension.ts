import smartRestackExtension from "./smart-restack.ts";
import stackSquashExtension from "./stack-squash.ts";

type CodeExtensionAPI = Parameters<typeof smartRestackExtension>[0] &
	Parameters<typeof stackSquashExtension>[0];

export default function codeExtension(pi: CodeExtensionAPI): void {
	smartRestackExtension(pi);
	stackSquashExtension(pi);
}
