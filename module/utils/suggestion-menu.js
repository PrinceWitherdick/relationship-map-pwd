/**
 * A menu of suggestions dropped from an "Add …" button: the first item adds a blank one, the rest
 * add a ready-made one. The person bar's Add chip opens it (utils/relmap-person-bar.js).
 *
 * One `<ul>` on `<body>`, `position: fixed`, so no window's scroll box can clip it, height-capped,
 * and opened up instead of down when the button sits near the bottom. Being outside every window it
 * carries the theme itself (`relmap-window` plus window-theme.js `applyTheme`), so the stylesheet's
 * tokens reach it.
 *
 * A real menu for the keyboard: the button says `aria-haspopup="menu"` and `aria-expanded`, the
 * first item takes focus, arrows / Home / End move, Enter or Space picks, and Escape closes and
 * hands focus back to the button. A click anywhere else, Tab, a resize, or the button's window
 * closing closes it.
 */

import { applyTheme } from "./window-theme.js";
import { escHtml as esc } from "./strings.js";

const MAX_HEIGHT = 300;
/** Opened upward when the room below is under this, and there is more above. */
const OPEN_UP_BELOW = 180;
const MIN_HEIGHT = 100;
/** At least this wide, so a name is not cut for its hint. */
const MIN_WIDTH = 360;
// Every V1 / V2 window fires one of these as it closes, whatever its class.
const CLOSE_HOOKS = ["closeApplication", "closeApplicationV2"];
let current = null; // { menu, anchor, cleanup }

/** Close the open menu, if any. `refocus` hands focus back to the button that opened it. */
export function closeSuggestionMenu({ refocus = false } = {}) {
	if (!current) return;
	const { menu, anchor, cleanup } = current;
	current = null;
	cleanup();
	menu.remove();
	anchor.setAttribute("aria-expanded", "false");
	if (refocus && anchor.isConnected) anchor.focus();
}

/**
 * Open (or, pressed again, close) the menu under `anchor`.
 * @param {HTMLElement} anchor   the Add button
 * @param {object} o
 * @param {string} [o.heading]   a quiet line above the items ("Suggested for Ancient Evil")
 * @param {string} o.blankLabel  the first item, which adds an empty row
 * @param {{value: string, label: string, hint?: string, used?: boolean, icon?: string, iconClass?: string,
 *         iconStyle?: string}[]} o.items  `icon` is a Font Awesome class drawn before the label, in a
 *         span wearing `iconClass` and `iconStyle` (the relationship map colours its chips' icons so).
 * @param {string} [o.usedHint]  the hint on an item that is `used` ("Added"), in place of its own.
 * @param {(value: string|null) => void} o.onPick  called with an item's value, or null for blank
 */
export function openSuggestionMenu(anchor, { heading = "", blankLabel, items = [], usedHint = "", onPick }) {
	if (current?.anchor === anchor) { closeSuggestionMenu({ refocus: true }); return; }
	closeSuggestionMenu();

	const menu = document.createElement("ul");
	menu.className = "relmap-window relmap-popup relmap-suggestion-menu";
	applyTheme(menu);
	menu.setAttribute("role", "menu");
	if (anchor.id) menu.setAttribute("aria-labelledby", anchor.id);
	const glyph = ({ icon = "", iconClass = "", iconStyle = "" } = {}) => (icon
		? `<span class="relmap-suggestion-menu-icon${iconClass ? ` ${esc(iconClass)}` : ""}"${iconStyle ? ` style="${esc(iconStyle)}"` : ""}`
			+ ` aria-hidden="true"><i class="fas ${esc(icon)}"></i></span>`
		: "");
	const row = (value, label, hint, { used = false, blank = false, item = null } = {}) =>
		`<li class="relmap-suggestion-menu-option${blank ? " is-blank" : ""}${used ? " is-used" : ""}" role="menuitem" tabindex="-1"`
		+ ` data-value="${esc(value)}"${blank ? " data-blank" : ""}${used ? ' aria-disabled="true"' : ""}>`
		+ glyph(item ?? {})
		+ `<span class="relmap-suggestion-menu-value">${esc(label)}</span>`
		+ (hint ? `<span class="relmap-suggestion-menu-hint">${esc(hint)}</span>` : "")
		+ `</li>`;
	menu.innerHTML = row("", blankLabel, "", { blank: true })
		+ (items.length && heading ? `<li class="relmap-suggestion-menu-heading" role="presentation">${esc(heading)}</li>` : "")
		+ items.map(i => row(i.value, i.label, i.used ? usedHint : (i.hint ?? ""), { used: !!i.used, item: i })).join("");
	document.body.appendChild(menu);

	const options = () => [...menu.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')];
	const pick = li => {
		if (!li || li.getAttribute("aria-disabled") === "true") return;
		const value = li.hasAttribute("data-blank") ? null : li.dataset.value;
		closeSuggestionMenu({ refocus: true });
		onPick(value);
	};

	const place = () => placeFixedPopup(menu, anchor.getBoundingClientRect());

	menu.addEventListener("click", ev => pick(ev.target.closest('[role="menuitem"]')));
	menu.addEventListener("keydown", ev => {
		const list = options();
		const at = list.indexOf(document.activeElement);
		const go = i => { ev.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
		switch (ev.key) {
			case "ArrowDown": return go(at + 1);
			case "ArrowUp": return go(at - 1);
			case "Home": return go(0);
			case "End": return go(list.length - 1);
			case "Enter":
			case " ": ev.preventDefault(); return pick(document.activeElement.closest?.('[role="menuitem"]'));
			case "Escape": ev.preventDefault(); ev.stopPropagation(); return closeSuggestionMenu({ refocus: true });
			case "Tab": return closeSuggestionMenu();
		}
	});
	// Outside presses close it; presses on the button are left to the button's own click, which
	// toggles, so the menu does not close here and reopen there.
	const outside = ev => { if (!menu.contains(ev.target) && !anchor.contains(ev.target)) closeSuggestionMenu(); };
	// A scroll inside the menu is the menu's own, and one in a box that does not hold the button (the
	// chat log, the sidebar) cannot have moved it. Any other keeps it pinned to its button, and a
	// button scrolled away (or re-rendered out of the page) takes the menu with it.
	// Placed at most ONCE A FRAME: a scroll fires many times a frame, and each placing reads the button's box.
	const frame = globalThis.requestAnimationFrame ?? (fn => setTimeout(fn, 16));
	let queued = false;
	const reflow = ev => {
		const target = ev?.target;
		if (target && (menu.contains(target) || (target !== document && !target.contains?.(anchor)))) return;
		if (!anchor.isConnected) return closeSuggestionMenu();
		if (queued) return;
		queued = true;
		frame(() => {
			queued = false;
			if (current?.menu === menu) place();
		});
	};
	const resize = () => closeSuggestionMenu();
	// The menu goes with its button's window, so no window has to put it away in its own close().
	const windowClosed = app => {
		const el = app?.element?.jquery ? app.element[0] : app?.element;
		if (el?.contains?.(anchor)) closeSuggestionMenu();
	};
	const hooks = globalThis.Hooks;
	const hookIds = hooks?.on ? CLOSE_HOOKS.map(name => [name, hooks.on(name, windowClosed)]) : [];
	document.addEventListener("pointerdown", outside, true);
	window.addEventListener("scroll", reflow, true);
	window.addEventListener("resize", resize);

	current = {
		menu, anchor,
		cleanup: () => {
			document.removeEventListener("pointerdown", outside, true);
			window.removeEventListener("scroll", reflow, true);
			window.removeEventListener("resize", resize);
			for (const [name, id] of hookIds) hooks.off?.(name, id);
		},
	};
	anchor.setAttribute("aria-expanded", "true");
	place();
	options()[0]?.focus();
}

/**
 * Pin the `position: fixed` menu 2px under `rect` (the button it belongs to), or over it when the room
 * below is under OPEN_UP_BELOW and there is more above. Its height is capped at MAX_HEIGHT and the room
 * it opens into, but never below MIN_HEIGHT; it is at least MIN_WIDTH wide and kept 8px inside the window.
 */
function placeFixedPopup(popup, rect) {
	const gap = 2;
	const below = window.innerHeight - rect.bottom - gap;
	const above = rect.top - gap;
	// Open downward unless that would be cramped and there's more room above.
	const up = below < Math.min(MAX_HEIGHT, OPEN_UP_BELOW) && above > below;
	const width = Math.min(Math.max(rect.width, MIN_WIDTH), window.innerWidth - 16);
	popup.style.width = `${width}px`;
	popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
	popup.style.maxHeight = `${Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, up ? above : below))}px`;
	popup.style.top = up ? "auto" : `${rect.bottom + gap}px`;
	popup.style.bottom = up ? `${window.innerHeight - rect.top + gap}px` : "auto";
}
