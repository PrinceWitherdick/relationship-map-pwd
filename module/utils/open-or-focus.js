// Open a singleton Application, or bring the already-open one to the front
// instead of stacking a duplicate. `id` is the Application's defaultOptions.id;
// `open` mints (and renders) a fresh instance when none is showing.
//
// Returns the live Application either way (bringToTop itself returns nothing), so a caller
// that drives the window after opening it — a progress panel being fed by a background job —
// gets the same handle whether it opened the window or found it.
//
// ⚠ A WINDOW STILL OPENING IS OPEN. Core files a V1 window in `ui.windows` only part-way through its
// first render, and a window whose render awaits something of its own before that (the relationship
// map does) is neither there nor `rendered` for the length of the wait. Two opens inside that breath
// each found nothing and each minted a window with the same DOM id: two frames stacked on one another,
// every world hook wired twice, and closing one leaving its twin standing underneath. It takes nothing
// unusual to get there -- two callers awaiting the one new-collection box resume back to back -- so the
// window minted for an id is remembered until it has either rendered or given up.
import { findOpenApp } from "./open-windows.js";

/** The window each id last minted, for the breath before core can find it. */
const opening = new Map();

/** Minted and asked to render, and not yet drawn, closed or failed. */
function stillOpening(app) {
	const states = app?.constructor?.RENDER_STATES;
	if (!states) return false;
	const state = app._state ?? app.state;
	return state === states.NONE || state === states.RENDERING;
}

export function openOrFocus(id, open) {
	// Both registries: a V1 app lives in ui.windows, an ApplicationV2 in
	// foundry.applications.instances. Looking in only one turns this silently into
	// "always open a second copy" the day the app it guards is migrated.
	const existing = findOpenApp(w => w.id === id);
	if (existing?.rendered) {
		opening.delete(id);
		// A MINIMIZED WINDOW IS IN FRONT OF NOBODY. `bringToTop` only restacks it, so the press that
		// asked for it left a collapsed title bar and looked as though it had done nothing. Core's own
		// `render(true)` restores one first, and so does this.
		if (existing.minimized ?? existing._minimized) existing.maximize?.();
		existing.bringToTop();
		return existing;
	}
	const pending = opening.get(id);
	if (stillOpening(pending)) return pending;
	const app = open();
	if (app) opening.set(id, app);
	else opening.delete(id);
	return app;
}
