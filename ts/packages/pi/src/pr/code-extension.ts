import smartRestackExtension from "../flow/smart-restack.ts";
import stackSquashExtension from "../flow/stack-squash.ts";

type CodeExtensionAPI = Parameters<typeof smartRestackExtension>[0] &
	Parameters<typeof stackSquashExtension>[0];

export default function codeExtension(pi: CodeExtensionAPI): void {
	smartRestackExtension(pi);
	stackSquashExtension(pi);
}
