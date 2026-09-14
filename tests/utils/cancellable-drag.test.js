import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Escape-to-cancel is ONE slot for the whole page, and every open map window's board arms and disarms
// it. These drive it through the capture listener it puts on `window`, which is wired lazily on the
// first drag and so needs a fresh copy of the module per test.

let keydown;

beforeEach(() => {
	vi.resetModules();
	keydown = null;
	globalThis.window = { addEventListener: (type, fn) => { if (type === "keydown") keydown = fn; } };
});

afterEach(() => {
	delete globalThis.window;
});

const load = () => import("../../module/utils/cancellable-drag.js");

function escape() {
	const ev = {
		key: "Escape", defaultPrevented: false, stopped: false,
		preventDefault() { ev.defaultPrevented = true; },
		stopPropagation() { ev.stopped = true; },
	};
	keydown?.(ev);
	return ev;
}

describe("Escape during a drag", () => {
	it("cancels the drag that is live, and swallows the key", async () => {
		const { beginCancellableDrag } = await load();
		const cancel = vi.fn();
		beginCancellableDrag(cancel);
		const ev = escape();
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(ev.stopped).toBe(true);
	});

	it("lets the key go once that drag has ended", async () => {
		const { beginCancellableDrag, endCancellableDrag } = await load();
		const cancel = vi.fn();
		beginCancellableDrag(cancel);
		endCancellableDrag(cancel);
		const ev = escape();
		expect(cancel).not.toHaveBeenCalled();
		expect(ev.stopped).toBe(false);
	});

	// Two map windows open: the second re-renders, its board's teardown runs its exit, and the drag
	// still under way on the first must keep its Escape. Lost, the key reaches core's dismiss.
	it("is not disarmed by another board's exit", async () => {
		const { beginCancellableDrag, endCancellableDrag } = await load();
		const mine = vi.fn();
		beginCancellableDrag(mine);
		endCancellableDrag(() => {});
		escape();
		expect(mine).toHaveBeenCalledTimes(1);
	});
});
