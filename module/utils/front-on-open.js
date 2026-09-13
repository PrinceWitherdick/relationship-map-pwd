/**
 * Brings a Foundry Application to the front *once, as it opens*, using Foundry's own window stacking
 * (`bringToTop`). A window opened from another opens above it, but unlike a forced high z-index, or an
 * observer that re-raises it, it does NOT stay on top: it takes part in normal stacking afterwards, so
 * any window the reader brings forward later can sit over it.
 *
 * ONCE means once per open, not once per render. See `apply()`: a re-render is not an appearance, and
 * treating it as one makes a window jump the stack whenever anything writes to the data behind it.
 */
export class FrontOnOpen {
	/** @param {Application} app */
	constructor(app) {
		this._app = app;
		// Whether this window has been floated for its CURRENT time on screen. Reset by stop(), so a
		// window that is closed and reopened floats again.
		this._raised = false;
	}

	/**
	 * Float the window on top as it opens, via Foundry's native window stacking.
	 *
	 * Once per open, and that guard is the point of the method rather than an optimization. Callers
	 * hang this off `_render`, and an AppV1 window re-renders for reasons that have nothing to do with
	 * the reader looking at it: a change somebody else made to the map, a hook, a theme switch. Raising
	 * every time turns "float as it opens" into "jump in front whenever anything changes".
	 *
	 * Nothing is lost by not re-raising: Foundry brings a window to the top when the reader clicks into
	 * it, so the window somebody is actually using is already there.
	 */
	apply() {
		const app = this._app;
		const el = app?.element?.jquery ? app.element[0] : app?.element;
		// No frame yet: leave `_raised` alone, so the render that does paint one still floats it.
		if (!el || this._raised) return;
		this._raised = true;
		(app.bringToTop ?? app.bringToFront)?.call(app);
	}

	start() {
		// One-time positioning: float the window on top as it appears. No event or MutationObserver
		// guards, so the window is free to fall behind other windows the reader brings forward.
		this.apply();
	}

	stop() {
		// Native stacking needs no cleanup. This only re-arms apply() for the next open.
		this._raised = false;
	}
}
