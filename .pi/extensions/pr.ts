import prExtension from "../../ts/packages/hosts/pi/src/pr/extension.ts";
import prPreviewsExtension from "../../ts/packages/local-pi-tools/pr-previews/src/extension.ts";

export default function prProjectExtension(pi) {
	prExtension(pi);
	prPreviewsExtension(pi);
}
