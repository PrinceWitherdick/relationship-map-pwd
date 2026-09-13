import { describe, it, expect } from "vitest";
import { NUDGE_FINE, NUDGE_STEP, dragTranslation } from "../../module/utils/relmap-drag.js";
import { isLiftedDrag } from "../../module/utils/cancellable-drag.js";

// The arithmetic behind moving a portrait, and the threshold that decides whether a press was a drag
// at all. The listener plumbing itself needs a DOM and is exercised through the gestures suite; what is
// provable here is the part that goes silently wrong.

describe("moving a portrait under the cursor", () => {
	// THE BUG THIS EXISTS TO CATCH. The board is scaled as a whole, so a hundred pixels of cursor is a
	// hundred pixels of BOARD only at 1:1. Miss the division and the portrait slides away from the
	// pointer faster the further in the reader has zoomed, which reads as the map fighting them.
	it("converts cursor travel into board travel at the current zoom", () => {
		expect(dragTranslation({ dx: 100, dy: 50, scale: 1 })).toEqual({ x: 100, y: 50 });
		expect(dragTranslation({ dx: 100, dy: 50, scale: 2 })).toEqual({ x: 50, y: 25 });
		expect(dragTranslation({ dx: 100, dy: 50, scale: 0.5 })).toEqual({ x: 200, y: 100 });
	});

	it("treats a missing or nonsense scale as 1:1 rather than dividing by zero", () => {
		for (const scale of [0, -2, NaN, null, undefined, "x"]) {
			expect(dragTranslation({ dx: 10, dy: 10, scale })).toEqual({ x: 10, y: 10 });
		}
		expect(dragTranslation()).toEqual({ x: 0, y: 0 });
	});
});

describe("the threshold a press has to cross", () => {
	// A small deliberate nudge on this board is a real edit, so the only threshold is the one that
	// tells a click from a drag.
	it("does not become a drag until the press has travelled", () => {
		expect(isLiftedDrag(0, 0)).toBe(false);
		expect(isLiftedDrag(2, 2)).toBe(false);
		expect(isLiftedDrag(5, 0)).toBe(true);
		expect(isLiftedDrag(0, 12)).toBe(true);
	});
});

describe("nudging from the keyboard", () => {
	// Every gesture needs a route that is not a drag, or the board is unusable to anyone who does not or
	// cannot drag one.
	it("offers a coarse step and a finer one, both small enough to aim with", () => {
		expect(NUDGE_STEP).toBeGreaterThan(NUDGE_FINE);
		expect(NUDGE_FINE).toBeGreaterThan(0);
		expect(NUDGE_STEP).toBeLessThanOrEqual(2);
	});
});
