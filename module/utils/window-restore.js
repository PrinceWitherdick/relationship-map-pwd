// Reopen relationship map windows where they were when this client last reloaded.
//
// Foundry does not restore open windows across a refresh, and a table leaves its map open for the
// whole session. So this keeps a live registry of the open map windows, persists a snapshot of each
// (its geometry, whether it was minimized, where it sat in the stack, and which board was up) to a
// per-client setting, and opens each one again on ready.
//
// PER CLIENT ON PURPOSE: window layout is personal, not shared world state. The "Reopen maps after a
// reload" client setting turns it off.

import { getBooleanSetting, getObjectSetting, setSetting } from "../settings.js";

/**
 * The window class this follows, by NAME. AppV1 builds a window's render and close hooks out of
 * `constructor.name`, so a rename of the window would stop it being restored with no error anywhere;
 * tests/utils/window-restore.test.js holds the two together.
 */
export const RELMAP_WINDOW_CLASS = "RelationshipMapWindow";

const STATE_SETTING = "openWindowsState";
const TOGGLE_SETTING = "restoreWindowsOnReload";

/** How far apart the reopened windows are rendered, so several do not fight over one frame. */
const STAGGER_MS = 120;

// The map windows open right now, by the uuid of the map. Each window's LIVE position is read at
// persist time, because a window that has been dragged or resized never re-renders.
const openApps = new Map();
let saveTimer = null;

/** The world JournalEntry a window is over, or null for anything this should not follow. */
function trackedDoc(app) {
	// A board mounted inside something else has no window of its own to put back.
	if (app?.popOut === false) return null;
	const doc = app?.document;
	if (!doc?.uuid || doc.pack) return null;
	return doc;
}

/**
 * One window as it stands: whole-pixel geometry, its depth in the stack, whether it is minimized, and
 * which board is up. Null for a window that has not been placed yet.
 */
export function snapshotWindow(app) {
	const p = app?.position ?? {};
	const out = {};
	for (const key of ["left", "top", "width", "height"]) {
		if (Number.isFinite(p[key])) out[key] = Math.round(p[key]);
	}
	if (out.left === undefined && out.top === undefined) return null;
	if (Number.isFinite(p.zIndex)) out.zIndex = p.zIndex;
	if (app.minimized ?? app._minimized) out.minimized = true;
	// Which board of the map was up is as much a part of "where this window was" as its corner of the
	// screen: a table leaves one board open all session, and the window is open ON something.
	if (typeof app?.restorePageId === "string") out.pageId = app.restorePageId;
	return out;
}

function collectState() {
	const state = {};
	for (const [uuid, app] of openApps) {
		const snap = snapshotWindow(app);
		if (snap) state[uuid] = snap;
	}
	return state;
}

// Debounced: a drag or a burst of repaints should not hammer the setting. The unload flush below
// captures whatever the debounce has not written yet.
function schedulePersist() {
	if (!getBooleanSetting(TOGGLE_SETTING, true)) return;
	clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		Promise.resolve(setSetting(STATE_SETTING, collectState())).catch(() => {});
	}, 500);
}

// Client settings live in localStorage, so a write from `beforeunload` lands as the page tears down.
function flushNow() {
	if (!getBooleanSetting(TOGGLE_SETTING, true)) return;
	try {
		Promise.resolve(setSetting(STATE_SETTING, collectState())).catch(() => {});
	} catch (_err) { /* nothing to be done mid-unload */ }
}

function onRender(app) {
	const doc = trackedDoc(app);
	if (!doc) return;
	openApps.set(doc.uuid, app);
	schedulePersist();
}

function onClose(app) {
	const doc = trackedDoc(app);
	if (!doc) return;
	openApps.delete(doc.uuid);
	schedulePersist();
}

/**
 * Keep a stored position on this screen. A window saved at a larger resolution, or on another monitor,
 * must not reopen off the edge: the whole window stays on screen when it fits, and at the least its
 * title bar stays reachable.
 */
export function clampToViewport(pos, vw = globalThis.window?.innerWidth ?? 1920, vh = globalThis.window?.innerHeight ?? 1080) {
	const out = { ...pos };
	if (Number.isFinite(out.width)) out.width = Math.min(out.width, vw);
	if (Number.isFinite(out.height)) out.height = Math.min(out.height, vh);
	const w = Number.isFinite(out.width) ? out.width : 400;
	const h = Number.isFinite(out.height) ? out.height : 200;
	if (Number.isFinite(out.left)) out.left = Math.max(0, Math.min(out.left, vw - Math.min(w, vw)));
	if (Number.isFinite(out.top)) out.top = Math.max(0, Math.min(out.top, vh - Math.min(h, 40)));
	return out;
}

/**
 * Reopen every saved map window. Runs on ready; does nothing when the setting is off or nothing was
 * saved.
 *
 * BACK-MOST FIRST. Every window lands on top of the stack as it opens, so opening them in the order
 * they were stacked puts the one that was in front back in front.
 *
 * @param {Function} open  `(entry, options) => Application|null`, which opens one map window.
 */
export async function restoreOpenWindows(open) {
	if (!getBooleanSetting(TOGGLE_SETTING, true) || typeof open !== "function") return;
	const state = getObjectSetting(STATE_SETTING);
	const depth = uuid => (Number.isFinite(state[uuid]?.zIndex) ? state[uuid].zIndex : -Infinity);
	const uuids = Object.keys(state).sort((a, b) => depth(a) - depth(b));

	let i = 0;
	for (const uuid of uuids) {
		let doc = null;
		try { doc = await fromUuid(uuid); } catch (_err) { doc = null; }
		if (!doc) continue;
		// A map this reader can no longer see is left closed rather than tripping a permission error.
		if (doc.testUserPermission && !doc.testUserPermission(game.user, "LIMITED")) continue;
		const saved = state[uuid] ?? {};
		const pos = clampToViewport(saved);
		setTimeout(() => {
			try {
				const app = open(doc, {
					left: pos.left, top: pos.top, width: pos.width, height: pos.height,
					...(saved.pageId ? { pageId: saved.pageId } : {}),
				});
				if (saved.minimized) app?.openMinimized?.();
			} catch (err) {
				console.warn("Relationship Map | could not reopen a map window", uuid, err);
			}
		}, i++ * STAGGER_MS);
	}
}

/**
 * Follow the map windows as they open, close and move, and reopen them on ready.
 * Call once, from `init`.
 *
 * @param {Function} open  see `restoreOpenWindows`.
 */
export function installWindowRestore(open) {
	Hooks.on(`render${RELMAP_WINDOW_CLASS}`, app => onRender(app));
	Hooks.on(`close${RELMAP_WINDOW_CLASS}`, app => onClose(app));
	globalThis.window?.addEventListener?.("beforeunload", flushNow);
	Hooks.once("ready", () => restoreOpenWindows(open));
}
