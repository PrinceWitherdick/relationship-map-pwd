import { afterEach, describe, expect, it, vi } from "vitest";
import {
	HIGH_CONTRAST_CLASS, WINDOW_CLASS, applyTheme, currentScheme, installThemeFollower,
	refreshOpenWindows, themeClasses, windowClasses,
} from "../../module/utils/window-theme.js";
import { MODULE_ID } from "../../module/module-id.js";
import { fakeClassList } from "../fakes/dom.js";

// Core forces every V1 window light unless it already wears `theme-dark`, and never re-themes one
// while it is open. So the module picks the theme itself and follows changes; see the header of
// module/utils/window-theme.js.

const SAVED = {
	game: globalThis.game,
	ui: globalThis.ui,
	Hooks: globalThis.Hooks,
	document: globalThis.document,
	matchMedia: globalThis.matchMedia,
};

/**
 * This reader: the scheme chosen for application windows ("" for none), the high-contrast switch,
 * and what the browser prefers (null for no `matchMedia` at all).
 */
function reader({ scheme = "", contrast = false, throws = false, prefersDark = null } = {}) {
	globalThis.game = {
		...SAVED.game,
		settings: {
			get(scope, key) {
				if (scope === "core" && key === "uiConfig") {
					if (throws) throw new Error("not registered yet");
					return { colorScheme: { applications: scheme } };
				}
				if (scope === MODULE_ID && key === "highContrast") return contrast;
				throw new Error(`not registered: ${scope}.${key}`);
			},
		},
	};
	if (prefersDark === null) delete globalThis.matchMedia;
	else globalThis.matchMedia = query => ({ matches: prefersDark && query === "(prefers-color-scheme: dark)", addEventListener() {} });
}

/** One window root, as `applyTheme` sees it. */
function windowRoot(classes, appid = "") {
	const node = { classes: [...classes], dataset: { appid } };
	node.classList = fakeClassList(node);
	return node;
}

const themesOn = node => node.classes.filter(name => name.startsWith("theme-"));

afterEach(() => {
	for (const [key, value] of Object.entries(SAVED)) {
		if (value === undefined) delete globalThis[key];
		else globalThis[key] = value;
	}
});

describe("currentScheme", () => {
	it("follows the scheme core gives application windows, whatever the browser prefers", () => {
		reader({ scheme: "dark", prefersDark: false });
		expect(currentScheme()).toBe("dark");
		reader({ scheme: "light", prefersDark: true });
		expect(currentScheme()).toBe("light");
	});

	// No choice made means "follow the browser", which is the fallback core's own interface takes.
	it("falls back to the browser's preference when nothing was chosen", () => {
		reader({ scheme: "", prefersDark: true });
		expect(currentScheme()).toBe("dark");
		reader({ scheme: "", prefersDark: false });
		expect(currentScheme()).toBe("light");
	});

	it("comes up light when there is neither a setting nor a browser to ask", () => {
		reader({ throws: true });
		expect(currentScheme()).toBe("light");
	});
});

describe("the classes a window opens with", () => {
	// `theme-dark` has to be in the list core's V1 constructor reads, or core adds `theme-light`.
	it("carries the marker, the window's own class and the theme", () => {
		reader({ scheme: "dark" });
		expect(windowClasses("relmap-app")).toEqual([WINDOW_CLASS, "relmap-app", "themed", "theme-dark"]);
	});

	it("adds the high-contrast class for a reader who asked for it", () => {
		reader({ scheme: "light", contrast: true });
		expect(themeClasses()).toEqual(["themed", "theme-light", HIGH_CONTRAST_CLASS]);
	});
});

describe("applyTheme", () => {
	it("moves a window from one theme to the other and says it did", () => {
		reader({ scheme: "dark" });
		const root = windowRoot([WINDOW_CLASS, "themed", "theme-light"]);
		expect(applyTheme(root)).toBe(true);
		expect(themesOn(root)).toEqual(["theme-dark"]);
	});

	// The answer decides whether a board repaints the colours it keeps legible on its ground.
	it("says nothing changed when nothing did", () => {
		reader({ scheme: "dark" });
		const root = windowRoot([WINDOW_CLASS, "themed", "theme-dark"]);
		expect(applyTheme(root)).toBe(false);
		expect(themesOn(root)).toEqual(["theme-dark"]);
	});

	it("leaves a window wearing one theme, even one that somehow wore both", () => {
		reader({ scheme: "dark" });
		const root = windowRoot([WINDOW_CLASS, "themed", "theme-light", "theme-dark"]);
		applyTheme(root);
		expect(themesOn(root)).toEqual(["theme-dark"]);
	});

	it("turns the high-contrast board on and off", () => {
		reader({ scheme: "light", contrast: true });
		const root = windowRoot([WINDOW_CLASS, "themed", "theme-light"]);
		expect(applyTheme(root)).toBe(true);
		expect(root.classes).toContain(HIGH_CONTRAST_CLASS);
		reader({ scheme: "light", contrast: false });
		expect(applyTheme(root)).toBe(true);
		expect(root.classes).not.toContain(HIGH_CONTRAST_CLASS);
	});

	it("leaves alone anything that is not an element", () => {
		reader({ scheme: "dark" });
		expect(applyTheme(null)).toBe(false);
		expect(applyTheme({})).toBe(false);
	});
});

describe("refreshOpenWindows", () => {
	it("re-themes every window of ours, and repaints only the ones whose theme changed", () => {
		reader({ scheme: "dark" });
		const stale = windowRoot([WINDOW_CLASS, "themed", "theme-light"], "11");
		const fresh = windowRoot([WINDOW_CLASS, "themed", "theme-dark"], "12");
		const apps = { 11: { refreshTheme: vi.fn() }, 12: { refreshTheme: vi.fn() } };
		globalThis.ui = { ...SAVED.ui, windows: apps };
		globalThis.document = { querySelectorAll: vi.fn(() => [stale, fresh]) };
		refreshOpenWindows();
		expect(globalThis.document.querySelectorAll).toHaveBeenCalledWith(`.${WINDOW_CLASS}`);
		expect(themesOn(stale)).toEqual(["theme-dark"]);
		expect(apps[11].refreshTheme).toHaveBeenCalledTimes(1);
		expect(apps[12].refreshTheme).not.toHaveBeenCalled();
	});

	it("does nothing where there is no document", () => {
		reader({ scheme: "dark" });
		delete globalThis.document;
		expect(() => refreshOpenWindows()).not.toThrow();
	});
});

describe("installThemeFollower", () => {
	it("re-themes open windows when core's interface setting changes, and for no other setting", () => {
		reader({ scheme: "dark" });
		const hooks = {};
		globalThis.Hooks = { ...SAVED.Hooks, on: (name, fn) => { hooks[name] = fn; } };
		const root = windowRoot([WINDOW_CLASS, "themed", "theme-light"], "3");
		globalThis.document = { querySelectorAll: () => [root] };
		installThemeFollower();
		hooks.clientSettingChanged("core.someOtherSetting");
		expect(themesOn(root)).toEqual(["theme-light"]);
		hooks.clientSettingChanged("core.uiConfig");
		expect(themesOn(root)).toEqual(["theme-dark"]);
	});

	it("follows the operating system between light and dark, for a reader who left it to the browser", () => {
		reader({ scheme: "" });
		let onChange = null;
		globalThis.matchMedia = () => ({ matches: false, addEventListener: (type, fn) => { if (type === "change") onChange = fn; } });
		globalThis.Hooks = { ...SAVED.Hooks, on: () => {} };
		const root = windowRoot([WINDOW_CLASS, "themed", "theme-light"], "4");
		globalThis.document = { querySelectorAll: () => [root] };
		installThemeFollower();
		expect(onChange).toBeTypeOf("function");
		globalThis.matchMedia = () => ({ matches: true, addEventListener() {} });
		onChange();
		expect(themesOn(root)).toEqual(["theme-dark"]);
	});
});
