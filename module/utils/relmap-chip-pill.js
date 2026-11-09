// ONE TAG CHIP ("Dead", "Noble") as the relationship map draws it, built in one place for every place
// that shows one: the board (the window hands its template each row's pills ready-made), the person
// bar's row of worn chips, and the chip form's preview.

import { inkPaint } from "../relmap/relmap-ink.js";
import { escHtml as esc } from "./strings.js";

/** What a pill needs to be drawn: its words, its icon, and its ink as a class and an inline colour. */
export function chipPaint(chip, paint = {}) {
	const { inkKey, inkHex } = inkPaint(chip?.ink ?? "", paint);
	return { id: chip?.id ?? "", name: chip?.name ?? "", icon: chip?.icon ?? "", inkKey, inkHex };
}

/** The class a pill's ink is drawn by, and the inline colour riding on it ("" for one of the eight). */
export const inkClass = paint => `relmap-ink--${paint.inkKey}`;
export const inkStyle = paint => (paint.inkHex ? `--relmap-ink-raw:${paint.inkHex}` : "");

/**
 * The pill's markup. A `<span>` on the board; the person bar makes it a `<button>` and adds its own
 * attributes (`attrs`, already escaped) after the class.
 *
 * @param {{name: string, icon?: string, inkKey: string, inkHex?: string}} paint  from `chipPaint`.
 */
export function chipPillHtml(paint, { tag = "span", attrs = "" } = {}) {
	const style = paint.inkHex ? ` style="${esc(inkStyle(paint))}"` : "";
	const icon = paint.icon ? `<i class="fas ${esc(paint.icon)}" aria-hidden="true"></i>` : "";
	// No tooltip: the pill says its own name, and the face's tooltip lists every chip the person wears.
	return `<${tag} class="relmap-chip ${esc(inkClass(paint))}"${attrs}${style}>${icon}`
		+ `<span class="relmap-chip-text">${esc(paint.name)}</span></${tag}>`;
}
