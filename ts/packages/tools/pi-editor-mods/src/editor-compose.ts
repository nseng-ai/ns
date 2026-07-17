import { CustomEditor, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";

export type EditorFactory = Exclude<
	ReturnType<ExtensionUIContext["getEditorComponent"]>,
	undefined
>;
export type EditorDecorator = (editor: EditorComponent) => EditorComponent;
export type EditorInputHandler = (data: string, delegate: (data: string) => void) => void;
export type EditorTextInsertionHandler = (text: string, delegate: (text: string) => void) => void;

/**
 * Stacks an editor decorator over the factory currently installed on a Pi UI.
 * The current factory is captured at registration time, so extension load order
 * determines decorator order without shared state.
 */
export function composeEditorComponent(
	ui: Pick<ExtensionUIContext, "getEditorComponent" | "setEditorComponent">,
	decorate: EditorDecorator,
): void {
	const currentFactory = ui.getEditorComponent();
	const baseFactory: EditorFactory =
		currentFactory ?? ((tui, theme, keybindings) => new CustomEditor(tui, theme, keybindings));

	ui.setEditorComponent((tui, theme, keybindings) =>
		decorate(baseFactory(tui, theme, keybindings)),
	);
}

/**
 * Decorates editor input while forwarding every other property, callback, and
 * optional method to the wrapped editor.
 */
export function withEditorInput(
	editor: EditorComponent,
	handleInput: EditorInputHandler,
	handleTextInsertion?: EditorTextInsertionHandler,
): EditorComponent {
	const methodBindings = new Map<PropertyKey, { source: Function; bound: unknown }>();
	const decoratedHandleInput = (data: string) => {
		handleInput(data, (delegatedData) => editor.handleInput(delegatedData));
	};
	const decoratedTextInsertion = (text: string) => {
		const insertTextAtCursor: unknown = Reflect.get(editor, "insertTextAtCursor", editor);
		if (typeof insertTextAtCursor !== "function") return;
		handleTextInsertion?.(text, (delegatedText) =>
			Reflect.apply(insertTextAtCursor, editor, [delegatedText]),
		);
	};
	return new Proxy(editor, {
		get(target, property) {
			if (property === "handleInput") return decoratedHandleInput;

			const value: unknown = Reflect.get(target, property, target);
			if (property === "insertTextAtCursor" && handleTextInsertion !== undefined) {
				return typeof value === "function" ? decoratedTextInsertion : undefined;
			}
			if (property === "onSubmit" || property === "onChange" || property === "borderColor") {
				return value;
			}
			if (typeof value !== "function") return value;
			const cached = methodBindings.get(property);
			if (cached?.source === value) return cached.bound;
			const bound: unknown = value.bind(target);
			methodBindings.set(property, { source: value, bound });
			return bound;
		},
		set(target, property, value) {
			return Reflect.set(target, property, value, target);
		},
	});
}
