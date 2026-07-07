export const AGENTS_COMMAND_NAMESPACE = "ns:agents";
export const SUBAGENT_FLEET_COMMAND_NAME = `${AGENTS_COMMAND_NAMESPACE}:fleet`;
/**
 * All chords open the fleet navigator; terminals differ in which they deliver
 * (F-keys need Fn/standard-function-keys on macOS, alt needs option-as-meta,
 * shift+ctrl needs the Kitty keyboard protocol). Registering all three means
 * at least one works everywhere Pi's own defaults work.
 */
export const SUBAGENT_FLEET_SHORTCUTS = ["f2", "alt+e", "shift+ctrl+e"] as const;
export const SUBAGENT_FLEET_SHORTCUT_LABEL = "F2/alt+e";
