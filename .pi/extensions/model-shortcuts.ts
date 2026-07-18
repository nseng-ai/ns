import modelShortcutExtension from "../../ts/packages/hosts/pi/src/core/model-shortcuts/extension.ts";
import { nodeProjectConfigGateway } from "../../ts/packages/sdk/src/project-config/points.ts";

export default function registerModelShortcuts(
	pi: Parameters<typeof modelShortcutExtension>[0],
): void {
	modelShortcutExtension(pi, { projectConfig: nodeProjectConfigGateway });
}
