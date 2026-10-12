// Escape-to-cancel for a pointer drag, and the one threshold that turns a press into a drag.

/** How far a press must travel before it becomes a drag. Below this it stays a click. */
const DRAG_THRESHOLD = 4;

/** Whether a press has travelled far enough to stop being a click and become a drag. */
export function isLiftedDrag(dx, dy) {
	return Math.hypot(dx, dy) >= DRAG_THRESHOLD;
}

// The gestures Escape can cancel, latest last: `{ cancel, owns }`. A STACK and not one slot, because a
// gesture can start while another holds Escape (a drag in one map window while a "Draw lines" pick is
// up in another), and when the later one ends the earlier must get Escape back. Cleared by the last
// one out, a pick left the key to core's dismiss, which closed the window.
const cancellables = [];
let escapeWatcherWired = false;

// Escape must be SWALLOWED, not merely default-prevented. Foundry's KeyboardManager binds keydown on
// `window` in the bubble phase and never looks at `defaultPrevented`
// (client/helpers/interaction/keyboard-manager.mjs), and its `hasFocus` bail only counts
// INPUT/SELECT/TEXTAREA, contentEditable, a BUTTON inside a form, or an explicit
// data-keyboard-focus. So Escape pressed mid-drag would otherwise reach core's "dismiss" binding and
// close every open window: the safe way to abandon a drag would be the most destructive key on the
// board. Stopping propagation from a capture-phase listener on window means core's bubble-phase
// listener on the same node never runs.
//
// ONE listener, wired lazily on the first drag and never removed. Per-drag add and remove would leak
// a global Escape swallower on any drag whose teardown was missed.
function ensureEscapeWatcher() {
	if (escapeWatcherWired || typeof window === "undefined") return;
	escapeWatcherWired = true;
	window.addEventListener("keydown", ev => {
		if (ev.key !== "Escape") return;
		// The latest gesture that claims this key. One that only claims an Escape aimed at its own
		// window (a pick, held with no button down) lets one meant for somewhere else go by.
		const i = cancellables.findLastIndex(entry => !entry.owns || entry.owns(ev));
		if (i < 0) return;
		ev.preventDefault();
		ev.stopPropagation();
		const [{ cancel }] = cancellables.splice(i, 1);
		cancel();
	}, true);
}

/**
 * Arm Escape-to-cancel for the drag that is starting, wiring the watcher on first use.
 *
 * `owns(ev)`, when given, narrows which Escapes are this gesture's: one it returns false for goes by
 * untouched, to the next gesture down or to core. A drag (button held) leaves it out and takes any.
 */
export function beginCancellableDrag(cancel, { owns = null } = {}) {
	endCancellableDrag(cancel);
	cancellables.push({ cancel, owns });
	ensureEscapeWatcher();
}

/**
 * Disarm Escape-to-cancel. Safe to call when no drag is live, so it can sit in a shared exit.
 *
 * ⚠ ONLY THE DRAG IT IS HANDED, when it is handed one. There is one stack for the whole page and a
 * board per open map window, and every board's exit calls this -- including the teardown a re-render
 * runs. Cleared unconditionally, a second map window re-rendering mid-drag took Escape away from the
 * drag under way in the first, and that Escape went on to core's dismiss and closed every window.
 */
export function endCancellableDrag(cancel = null) {
	if (!cancel) { cancellables.length = 0; return; }
	const i = cancellables.findIndex(entry => entry.cancel === cancel);
	if (i >= 0) cancellables.splice(i, 1);
}
