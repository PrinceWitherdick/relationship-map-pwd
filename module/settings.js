// Every setting this module registers, and the tolerant readers the rest of it goes through.
//
// ALL OF THEM ARE THE READER'S OWN except none. Which board somebody last had open, how big they like
// the writing on a line, how heavily they want the board drawn, whether it is drawn for high contrast
// and whether their windows come back after a reload are facts about one pair of eyes at one screen.
// The map itself lives in JournalEntry documents the whole table owns (relmap/relmap-doc.js), so
// nothing here is shared, and nothing here needs a GM to write it.

import { MODULE_ID } from "./module-id.js";

/** Called once, from the `init` hook. `onHighContrast` repaints any board already open. */
export function registerSettings({ onHighContrast = null } = {}) {
	// Which relationship board this client last had open, so opening "the map" goes straight there
	// instead of asking. Nested by world id, because a client setting has no world in its
	// localStorage key. Shape: { "<worldId>": { entryId, pageId } }. See relmap/relmap-last.js.
	game.settings.register(MODULE_ID, "lastRelationshipBoard", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// How big this client last asked the writing on a line to be, in board pixels, so the next line
	// they draw is set in it. NOT nested by world: how big somebody likes their type is the same fact
	// in every world. Zero means they never said. See relmap/relmap-size.js.
	game.settings.register(MODULE_ID, "lastCaptionSize", {
		scope: "client",
		config: false,
		type: Number,
		default: 0,
	});

	// How heavily this client wants a board drawn: the arrowheads, the strokes and the writing, each
	// as a whole percentage. Shape: { head, line, word }. See relmap/relmap-weights.js.
	game.settings.register(MODULE_ID, "relmapWeights", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});

	// The board drawn for a reader who cannot rely on colour: the eight line colours raised to 4.5:1,
	// each drawn with its own dash pattern, and a heavier rim round every face.
	game.settings.register(MODULE_ID, "highContrast", {
		name: "RELMAP.settings.highContrast.name",
		hint: "RELMAP.settings.highContrast.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false,
		onChange: value => onHighContrast?.(value),
	});

	// Whether a map window left open is opened again, where it was, after this client reloads.
	game.settings.register(MODULE_ID, "restoreWindowsOnReload", {
		name: "RELMAP.settings.restoreWindows.name",
		hint: "RELMAP.settings.restoreWindows.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
	});

	// Internal: the map windows open right now, rewritten as they open, close and move.
	game.settings.register(MODULE_ID, "openWindowsState", {
		scope: "client",
		config: false,
		type: Object,
		default: {},
	});
}

/** A setting's value. Throws on a key this world never registered, as core does. */
export function getSetting(key) {
	return game.settings.get(MODULE_ID, key);
}

/** Write a setting. */
export function setSetting(key, value) {
	return game.settings.set(MODULE_ID, key, value);
}

/**
 * A plain-object setting, read tolerantly: `{}` rather than a throw when the key is not registered
 * (a unit test, or a call made before `init`), and `{}` rather than a surprise when the stored value
 * is a scalar or an array.
 */
export function getObjectSetting(key) {
	try {
		const value = globalThis.game?.settings?.get?.(MODULE_ID, key);
		return value && typeof value === "object" && !Array.isArray(value) ? value : {};
	} catch (_) {
		return {};
	}
}

/**
 * A boolean setting, read tolerantly: `fallback` rather than a throw when the key is not registered,
 * and `fallback` rather than a surprise when the stored value is not a boolean.
 */
export function getBooleanSetting(key, fallback = false) {
	try {
		const value = globalThis.game?.settings?.get?.(MODULE_ID, key);
		return typeof value === "boolean" ? value : fallback;
	} catch (_) {
		return fallback;
	}
}

/** The world this client is in, for nesting a client setting that must not leak between worlds. */
export function worldKey() {
	return globalThis.game?.world?.id ?? "";
}

/**
 * Write a setting whose FAILURE IS NOT WORTH TELLING ANYONE ABOUT: the "remember what this reader was
 * doing" records. Losing one costs the reader one re-pick, so it goes to the console and never to a
 * notification.
 *
 * BOTH WAYS IT CAN FAIL are caught, because `game.settings.set` can throw synchronously (no such
 * setting, no world yet) as well as reject.
 *
 * @returns {Promise|null} The write in flight, or null when it failed on the spot.
 */
export function setSettingQuietly(key, value, message) {
	try {
		return Promise.resolve(setSetting(key, value)).catch(err => console.error(message, err));
	} catch (err) {
		console.error(message, err);
		return null;
	}
}
