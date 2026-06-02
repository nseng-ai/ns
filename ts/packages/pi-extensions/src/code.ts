import { asdlDevCodeExtension } from "./asdl-dev-extension.ts";
import changesExtension from "./changes.ts";
import landStackExtension from "./land-stack.ts";
import landExtension from "./land.ts";
import autobranchExtension from "./autobranch.ts";

type CodeExtensionAPI = Parameters<typeof changesExtension>[0] &
	Parameters<typeof asdlDevCodeExtension>[0] &
	Parameters<typeof autobranchExtension>[0] &
	Parameters<typeof landExtension>[0] &
	Parameters<typeof landStackExtension>[0];

export default function codeExtension(pi: CodeExtensionAPI): void {
	changesExtension(pi);
	asdlDevCodeExtension(pi);
	autobranchExtension(pi);
	landExtension(pi);
	landStackExtension(pi);
}
