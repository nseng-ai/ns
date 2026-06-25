import smartRestackExtension from "../flow/smart-restack.ts";

type CodeExtensionAPI = Parameters<typeof smartRestackExtension>[0];

export default function codeExtension(pi: CodeExtensionAPI): void {
	smartRestackExtension(pi);
}
