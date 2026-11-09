// The small questions this module asks in a DialogV2: a line of text (or a few, labelled), and one row
// off a short list. Both have to obey the same unforgiving rule about how a DialogV2 is handed its content, which
// is why they share a file. See `contentElement`.

import { escHtml } from "../utils/strings.js";
import { CTA_CLASS, dialogWindow, themedDialogClasses } from "../utils/window-theme.js";

/**
 * Present a one-of-N chooser and resolve to the picked option's id.
 *
 * Labels and hints are escaped, not trusted: rows are built from map names, which are text somebody
 * at the table typed.
 *
 * @param {object} params
 * @param {string} params.title       Window title.
 * @param {{id: string, label: string, icon: string, hint?: string}[]} params.options
 *                                    The rows, in display order.
 * @param {string} [params.buttonLabel="Continue"]  Confirm-button label.
 * @param {string} [params.icon]      The title bar's glyph, as a Font Awesome class list.
 * @param {string} [params.selected]  Which row opens picked, by id. Absent, or naming a row that is not
 *                                    there, picks the first. A default is offered without reordering
 *                                    the list: sorting one row to the top is how a reader loses the
 *                                    order they had learned.
 * @returns {Promise<string|null>}    The chosen option id, or null if the dialog was dismissed.
 */
export function pickContentOption({ title, options, buttonLabel = "Continue", icon = "", selected = null }) {
	// Whether the caller's default is actually one of the rows, worked out ONCE: asking per row would
	// leave a list whose default is missing with nothing checked at all, and a radio group with no
	// selection is a confirm button that resolves to undefined.
	const pick = options.some(opt => opt.id === selected) ? selected : options[0]?.id;
	const rows = options.map(opt => `
		<label class="relmap-content-picker-option">
			<input type="radio" name="contentType" value="${escHtml(opt.id)}"${opt.id === pick ? " checked" : ""}>
			<i class="fas ${escHtml(opt.icon)}" aria-hidden="true"></i>
			<span class="relmap-content-picker-text">
				<span class="relmap-content-picker-label">${escHtml(opt.label)}</span>
				<span class="relmap-content-picker-hint">${escHtml(opt.hint ?? "")}</span>
			</span>
		</label>`).join("");

	return promptRows({
		title, icon, rows, buttonLabel, width: 440,
		read: form => form.contentType,
		// ⚠ THE PICKED ROW HAS TO BE ON SCREEN. It can be anywhere in a long list, and a default the
		// reader has to scroll to find is a default they will not know is there. `scrollIntoView` and
		// not focus: the confirm button keeps the focus a dialog opens with.
		onShow: root => root
			.querySelector("input:checked")?.closest("label")
			?.scrollIntoView?.({ block: "nearest" }),
	});
}

/**
 * The `<div>` a DialogV2 will accept as its content, wrapped around the markup you actually want.
 *
 * ⚠ THE RULE, AND IT THROWS. Core's `DialogV2#_initializeApplicationOptions`
 * (client/applications/api/dialog.mjs) refuses a content element that is not a `<div>`, refuses one
 * carrying ANY attribute at all, and then keeps only its `innerHTML`. So a `content.className = "x"`
 * on the way in is not merely ignored: it is `Error: config.content element must have no
 * attributes`, thrown out of the constructor, which surfaces as an unhandled rejection and a button
 * that silently does nothing.
 *
 * ONE FUNCTION so there is one place that knows. The classed, styled container always lives one level
 * in, which is fine, because the wrapper is inside the `innerHTML` that survives.
 *
 * @param {string} inner  Authored markup for the container that carries the classes.
 * @returns {HTMLDivElement}
 */
function contentElement(inner) {
	const content = document.createElement("div");
	content.innerHTML = inner;
	return content;
}

/**
 * Ask for one line of text.
 *
 * RESOLVES TO A STRING OR NULL, and the difference matters to every caller: `""` means "saved without
 * typing anything", which is a name the caller may substitute a default for, while `null` means
 * "never mind", which must leave everything alone. Trimmed here, so no caller has to.
 *
 * THE FIELD TAKES FOCUS AND ITS TEXT IS SELECTED once the window is on screen. That is what makes this
 * usable for a RENAME as well as a new name: the box opens on the name it already has, and a reader who
 * meant to replace it can simply type. `render` and not a wire step, because focusing a node that is
 * not in a document yet is a silent no-op.
 *
 * @param {object} p
 * @param {string} p.title              Window title.
 * @param {string} p.buttonLabel        Confirm-button label.
 * @param {string} [p.value]            What the box opens on.
 * @param {string} [p.placeholder]      Ghost text for an empty box.
 * @param {string} [p.icon]             The title bar's glyph, as a Font Awesome class list.
 * @param {number} [p.width=420]
 * @returns {Promise<string|null>}
 */
export function promptForText({ title, buttonLabel, value = "", placeholder = "", icon = "", width = 420 }) {
	// Escaped because both are shown as ATTRIBUTES here, and both can be text somebody at this table
	// typed: `value` is very often the existing name of the thing being renamed.
	const content = contentElement(`
		<div class="relmap-text-prompt">
			<input type="text" name="relmapText" value="${escHtml(value)}"
			       placeholder="${escHtml(placeholder)}">
		</div>`);

	return showTextPrompt({ title, icon, buttonLabel, width, content, names: ["relmapText"] })
		.then(answer => answer?.relmapText ?? null);
}

/**
 * Ask for several lines of text at once, each under a label of its own.
 *
 * ONE WINDOW FOR WHAT IS ONE DECISION. Making a collection is also making its first map, and two boxes
 * in a row read as the second one asking the first question again (the first answer having apparently
 * gone nowhere). Same contract as `promptForText`, per field: every value trimmed, `""` for a field
 * left blank, and `null` for the whole window dismissed.
 *
 * The FIRST field takes the focus once the window is on screen, for the reason `promptForText` gives,
 * and Enter moves down to the next one rather than confirming early (see `showTextPrompt`).
 *
 * @param {object} p
 * @param {string} p.title              Window title.
 * @param {string} p.buttonLabel        Confirm-button label.
 * @param {{name: string, label: string, value?: string, placeholder?: string}[]} p.fields
 *                                      The boxes, top to bottom. `name` is the key it answers under.
 * @param {string} [p.lead]             A line of plain text above the boxes.
 * @param {string} [p.icon]             The title bar's glyph, as a Font Awesome class list.
 * @param {number} [p.width=420]
 * @returns {Promise<Object<string, string>|null>}
 */
export function promptForTexts({ title, buttonLabel, fields, lead = "", icon = "", width = 420 }) {
	// Every label, value and placeholder escaped: any of them can be text somebody at this table typed.
	const boxes = fields.map(field => `
		<label class="relmap-text-prompt-field">
			<span class="relmap-text-prompt-label">${escHtml(field.label)}</span>
			<input type="text" name="${escHtml(field.name)}" value="${escHtml(field.value ?? "")}"
			       placeholder="${escHtml(field.placeholder ?? "")}">
		</label>`).join("");
	const content = contentElement(`
		<div class="relmap-text-prompt relmap-text-prompt--fields">
			${lead ? `<p class="relmap-text-prompt-lead">${escHtml(lead)}</p>` : ""}
			${boxes}
		</div>`);

	return showTextPrompt({ title, icon, buttonLabel, width, content, names: fields.map(field => field.name) });
}

/**
 * The window `promptForText` and `promptForTexts` both are: their boxes, resolving to every one of
 * `names` read off the form, trimmed, or to null when the window is dismissed.
 *
 * THE FIRST BOX TAKES THE FOCUS, AND ENTER WALKS DOWN THE BOXES. A form submits on Enter in any of
 * its boxes, so a reader who typed the first of two names and pressed Enter, as a single box taught
 * them to, would have the second taken as blank without ever seeing it. Enter in the last box still
 * confirms.
 *
 * @param {object} p
 * @param {string} p.title
 * @param {string} p.icon
 * @param {string} p.buttonLabel
 * @param {number} p.width
 * @param {HTMLDivElement} p.content  from `contentElement`.
 * @param {string[]} p.names          the boxes' `name`s, top to bottom.
 * @returns {Promise<Object<string, string>|null>}
 */
function showTextPrompt({ title, icon, buttonLabel, width, content, names }) {
	return foundry.applications.api.DialogV2.prompt({
		classes: themedDialogClasses("relmap-text-prompt-dialog"),
		window: dialogWindow(title, icon),
		position: { width },
		content,
		render: (_event, dialog) => {
			const root = dialog?.element ?? dialog;
			const boxes = [...(root?.querySelectorAll?.(".relmap-text-prompt input[type='text']") ?? [])];
			boxes.forEach((box, at) => {
				const next = boxes[at + 1];
				if (!next) return;
				box.addEventListener?.("keydown", event => {
					if (event.key !== "Enter" || event.isComposing) return;
					event.preventDefault();
					next.focus?.();
					next.select?.();
				});
			});
			boxes[0]?.focus?.();
			boxes[0]?.select?.();
		},
		ok: {
			label: buttonLabel,
			class: CTA_CLASS,
			// Through `namedItem`, not `form.elements[name]`: named access on a
			// HTMLFormControlsCollection can collide with the collection's own members.
			callback: (event, button) => Object.fromEntries(names.map(name => [
				name,
				String(button.form.elements.namedItem(name)?.value ?? "").trim(),
			])),
		},
		rejectClose: false,
	});
}

/**
 * The window the chooser is: a radio list, resolving to whatever the caller reads out of the form.
 *
 * @param {object} p
 * @param {string} p.title        Window title.
 * @param {string} p.icon         The title bar's glyph.
 * @param {string} p.rows         The radio rows, as authored markup.
 * @param {string} p.buttonLabel  Confirm-button label.
 * @param {number} p.width
 * @param {Function} p.read       `(formObject) => any`, what the dialog resolves to.
 * @param {Function} [p.onShow]   `(root) => void`, run once the dialog is ON SCREEN, where measuring
 *                                and scrolling work.
 */
function promptRows({ title, icon, rows, buttonLabel, width, read, onShow = null }) {
	const content = contentElement(`<div class="relmap-content-picker">${rows}</div>`);

	return foundry.applications.api.DialogV2.prompt({
		classes: themedDialogClasses("relmap-content-picker-dialog"),
		window: dialogWindow(title, icon),
		position: { width },
		content,
		render: (_event, dialog) => {
			const root = dialog?.element ?? dialog;
			if (root?.querySelector) onShow?.(root);
		},
		ok: {
			label: buttonLabel,
			class: CTA_CLASS,
			callback: (event, button) =>
				read(new foundry.applications.ux.FormDataExtended(button.form).object),
		},
		rejectClose: false,
	});
}
