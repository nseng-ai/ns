import changesExtension from "./changes.ts";
import checkpointExtension from "./cp.ts";
import landStackExtension from "./land-stack.ts";
import landExtension from "./land.ts";
import autobranchExtension from "./autobranch.ts";
import submitExtension from "./submit.ts";

type DevExtensionAPI = Parameters<typeof checkpointExtension>[0] &
	Parameters<typeof changesExtension>[0] &
	Parameters<typeof autobranchExtension>[0] &
	Parameters<typeof submitExtension>[0] &
	Parameters<typeof landExtension>[0] &
	Parameters<typeof landStackExtension>[0];

export default function devExtension(pi: DevExtensionAPI): void {
	checkpointExtension(pi);
	changesExtension(pi);
	autobranchExtension(pi);
	submitExtension(pi);
	landExtension(pi);
	landStackExtension(pi);
}
