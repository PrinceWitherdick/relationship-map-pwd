// Which of Foundry's two themes a window of this module is drawn in, and keeping it in step.
//
// ⚠ CORE FORCES EVERY V1 WINDOW LIGHT. Both v13 and v14 push `themed theme-light` onto an
// ApplicationV1's classes in its constructor unless `theme-dark` is already there
// (client/appv1/api/application-v1.mjs). The map window and the people chooser are V1 windows, so
// left alone they would come up light in a dark world. So they choose for themselves, at
// construction, from the same setting core reads for its own application windows: User Interface
// Configuration's "applications" colour scheme, falling back to the browser's preference the way
// core's `configureUI` does.
//
// AND THEY FOLLOW A CHANGE WHILE OPEN. Core re-themes its own windows when that setting changes or
// the operating system flips between light and dark; nothing re-themes a V1 window, so
// `installThemeFollower` does it for ours.
//
// The HIGH-CONTRAST board is this module's own client setting, carried as a class on the same root,
// for the same reason: every rule that paints the board for it hangs off that one class.

import { getBooleanSetting } from "../settings.js";

/** The class on the root of every window this module opens. Everything themed hangs off it. */
export const WINDOW_CLASS = "relmap-window";

/** The class that turns the high-contrast board on. */
export const HIGH_CONTRAST_CLASS = "relmap-high-contrast";

/** "dark" or "light": the scheme core would give an application window right now. */
export function currentScheme() {
	let chosen = "";
	try {
		chosen = globalThis.game?.settings?.get?.("core", "uiConfig")?.colorScheme?.applications ?? "";
	} catch (_) {
		chosen = "";
	}
	if (chosen === "dark" || chosen === "light") return chosen;
	return globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

/** Whether this reader has asked for the high-contrast board. */
export function wantsHighContrast() {
	return getBooleanSetting("highContrast", false);
}

/** The theme classes a window of ours wears right now. */
export function themeClasses() {
	const classes = ["themed", `theme-${currentScheme()}`];
	if (wantsHighContrast()) classes.push(HIGH_CONTRAST_CLASS);
	return classes;
}

/**
 * Every class a window of ours opens with: the marker, the window's own, and the theme.
 *
 * The theme classes go LAST so core's constructor finds `theme-dark` when it looks, and adds its own
 * `theme-light` only when this reader really is in the light.
 */
export function windowClasses(...extra) {
	return [WINDOW_CLASS, ...extra, ...themeClasses()];
}

/** The same list for a DialogV2 of ours, which core does not re-theme either once it is open. */
export function themedDialogClasses(...extra) {
	return windowClasses(...extra);
}

/** Put the current theme onto one window root. Returns true when anything changed. */
export function applyTheme(root) {
	if (!root?.classList) return false;
	const scheme = currentScheme();
	const contrast = wantsHighContrast();
	const was = root.classList.contains("theme-dark") ? "dark" : "light";
	const wasContrast = root.classList.contains(HIGH_CONTRAST_CLASS);
	root.classList.add("themed");
	root.classList.remove("theme-light", "theme-dark");
	root.classList.add(`theme-${scheme}`);
	root.classList.toggle(HIGH_CONTRAST_CLASS, contrast);
	return was !== scheme || wasContrast !== contrast;
}

/**
 * Re-theme every open window of ours, and let the ones that measure colours repaint.
 *
 * A board reads its ground off the page to keep a colour somebody chose legible on it
 * (relmap/relmap-ink.js), so a window whose theme changed is asked to `refreshTheme` itself.
 */
export function refreshOpenWindows() {
	const doc = globalThis.document;
	if (!doc?.querySelectorAll) return;
	for (const root of doc.querySelectorAll(`.${WINDOW_CLASS}`)) {
		if (!applyTheme(root)) continue;
		const app = globalThis.ui?.windows?.[root.dataset?.appid];
		app?.refreshTheme?.();
	}
}

/** Follow core's colour scheme and this module's high-contrast switch. Call once, from `init`. */
export function installThemeFollower() {
	Hooks.on("clientSettingChanged", key => {
		if (key === "core.uiConfig") refreshOpenWindows();
	});
	globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => refreshOpenWindows());
}
