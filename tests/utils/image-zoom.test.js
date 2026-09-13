import { describe, it, expect } from "vitest";
import {
	anchoredOffset, centreOffset, clampPan, clampZoom, fitScale, stepZoom, wheelNotches,
	MIN_ZOOM, MAX_ZOOM, PAN_MARGIN, ZOOM_STEP,
} from "../../module/utils/image-zoom.js";

// The arithmetic the map's pan and zoom surface is built on. Everything here is a pure function of a few
// numbers, which is exactly why it is worth pinning: a viewer whose anchor maths is subtly wrong
// still opens, still zooms, and still looks fine in a screenshot — it just walks away from the
// cursor a little more with every notch, and nobody can say when it started.


describe("clampZoom", () => {
	it("holds the scale between the floor and the ceiling", () => {
		expect(clampZoom(0.001)).toBe(MIN_ZOOM);
		expect(clampZoom(500)).toBe(MAX_ZOOM);
		expect(clampZoom(1.5)).toBe(1.5);
	});

	// Each of these would otherwise reach `img.style.width` as a degenerate pixel count and the
	// picture would simply vanish, with nothing in the console to say why.
	it("answers 1 for anything that is not a usable number", () => {
		for (const bad of [0, -2, NaN, Infinity, undefined, null, "wide"]) {
			expect(clampZoom(bad), String(bad)).toBe(1);
		}
	});
});

describe("fitScale", () => {
	// The case it was built for: a page-sized diagram, opened in a normal window.
	it("fits a page-sized diagram to the shorter axis", () => {
		expect(fitScale({ imageWidth: 1400, imageHeight: 2000, viewWidth: 700, viewHeight: 600 }))
			.toBe(0.3);
	});

	// Fitting UP would blow a thumbnail across a maximised window and show nothing but its own
	// pixels, so fit means "no bigger than the window AND no bigger than the file".
	it("never enlarges a picture smaller than the window", () => {
		expect(fitScale({ imageWidth: 200, imageHeight: 200, viewWidth: 900, viewHeight: 900 }))
			.toBe(1);
	});

	// The state before the image has loaded and reported a natural size, and the state of a
	// window whose viewport has not been laid out yet.
	it("answers 1 while any measurement is still missing", () => {
		expect(fitScale({ imageWidth: 0, imageHeight: 0, viewWidth: 800, viewHeight: 600 })).toBe(1);
		expect(fitScale({ imageWidth: 800, imageHeight: 600, viewWidth: 0, viewHeight: 0 })).toBe(1);
		expect(fitScale()).toBe(1);
	});
});

describe("stepZoom", () => {
	it("moves one notch each way", () => {
		expect(stepZoom(1, 1)).toBeCloseTo(ZOOM_STEP, 10);
		expect(stepZoom(1, -1)).toBeCloseTo(1 / ZOOM_STEP, 10);
	});

	it("stops at the ends of its travel rather than running off", () => {
		expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
		expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
	});

	// A handful of notches from fit to legible, not a dozen: a chart that opens at 30% reaches
	// full size in nine, which is the difference between wheeling and grinding.
	it("reaches full size from a fitted flowchart in a handful of notches", () => {
		let scale = 0.3, notches = 0;
		while (scale < 1 && notches < 50) { scale = stepZoom(scale, 1); notches++; }
		expect(notches).toBeLessThanOrEqual(10);
	});

	// The half-notch a trackpad sends, which used to be read as a whole one either way.
	it("moves a fraction of a step for a fraction of a notch", () => {
		expect(stepZoom(1, 0.5)).toBeCloseTo(Math.sqrt(ZOOM_STEP), 10);
		expect(stepZoom(1, 0.5)).toBeLessThan(stepZoom(1, 1));
	});

	// Two halves land where one whole notch does, which is what makes a trackpad and a detent the
	// same gesture at different resolutions rather than two zooms that drift apart.
	it("adds up: two half notches are one whole one", () => {
		expect(stepZoom(stepZoom(1, 0.5), 0.5)).toBeCloseTo(stepZoom(1, 1), 10);
	});

	it("takes a caller's own step, for a board that wants a gentler wheel", () => {
		expect(stepZoom(1, 1, 1.08)).toBeCloseTo(1.08, 10);
		expect(stepZoom(1, -1, 1.08)).toBeCloseTo(1 / 1.08, 10);
		// A gentler step is a smaller jump, which is the whole reason it is there.
		expect(stepZoom(1, 1, 1.08)).toBeLessThan(stepZoom(1, 1));
	});

	// A step of 1 would multiply by nothing at all and a step of 0 would collapse the scale to the
	// floor. Both reach here only from a caller's typo, and neither is allowed to break the wheel.
	it("falls back to the shared step rather than trusting a nonsense one", () => {
		for (const bad of [0, 1, -2, NaN, null, undefined, "big"]) {
			expect(stepZoom(1, 1, bad)).toBeCloseTo(ZOOM_STEP, 10);
		}
	});
});

describe("wheelNotches", () => {
	// The desktop mouse this has always been sized for: one detent, one notch, up is in.
	it("reads a pixel-mode detent as a whole notch", () => {
		expect(wheelNotches({ deltaY: -100, deltaMode: 0 })).toBeCloseTo(1, 10);
		expect(wheelNotches({ deltaY: 100, deltaMode: 0 })).toBeCloseTo(-1, 10);
	});

	// The whole point: a trackpad's small deltas zoom by small amounts instead of a full step each.
	it("reads a trackpad's small delta as a small part of a notch", () => {
		expect(wheelNotches({ deltaY: -12 })).toBeCloseTo(0.12, 10);
		expect(wheelNotches({ deltaY: 4 })).toBeCloseTo(-0.04, 10);
	});

	// Firefox reports LINES, three to a detent. Divided by 100 this would be a wheel that does
	// nothing at all on one browser.
	it("reads a line-mode detent as a whole notch too", () => {
		expect(wheelNotches({ deltaY: -3, deltaMode: 1 })).toBeCloseTo(1, 10);
	});

	it("caps momentum and page-mode scrolling at one notch", () => {
		expect(wheelNotches({ deltaY: -800, deltaMode: 0 })).toBe(1);
		expect(wheelNotches({ deltaY: 3, deltaMode: 2 })).toBe(-1);
	});

	it("reads a still wheel as no zoom at all", () => {
		expect(wheelNotches({ deltaY: 0 })).toBe(0);
		expect(wheelNotches({ deltaY: NaN })).toBe(0);
		expect(wheelNotches()).toBe(0);
	});
});

describe("centreOffset", () => {
	it("puts a picture smaller than the window in the middle of it", () => {
		expect(centreOffset({ paintedWidth: 400, paintedHeight: 300, viewWidth: 800, viewHeight: 700 }))
			.toEqual({ x: 200, y: 200 });
	});

	// Negative is the ORDINARY case here, not an error: a fitted flowchart is the height of the
	// window and wider than it, so its left edge sits outside. A scroll position could not say this.
	it("hangs a picture larger than the window off both edges", () => {
		expect(centreOffset({ paintedWidth: 1200, paintedHeight: 700, viewWidth: 800, viewHeight: 700 }))
			.toEqual({ x: -200, y: 0 });
	});
});

describe("anchoredOffset", () => {
	// THE thing that makes a zoom viewer usable: the spot under the cursor stays under the cursor.
	it("keeps the point under the cursor under the cursor", () => {
		// The cursor is 100px into the view; the picture's left edge is 200px outside it, so the
		// cursor is over the point 300px along the picture. At double the scale that point is 600px
		// along, and it has to still be 100px into the view: 100 - 600.
		expect(anchoredOffset({ offset: -200, pointer: 100, from: 1, to: 2 })).toBe(-500);
		// And back again.
		expect(anchoredOffset({ offset: -500, pointer: 100, from: 2, to: 1 })).toBe(-200);
	});

	it("leaves the picture where it is when the scale does not change", () => {
		expect(anchoredOffset({ offset: -340, pointer: 120, from: 1.5, to: 1.5 })).toBe(-340);
	});

	// The old scroll-based version clamped its answer at zero, because a scroll position cannot go
	// negative. An offset can and must: that clamp would have stopped the picture at the window's
	// edge, which is the exact behaviour this model exists to be rid of.
	it("lets the picture sit past the window's top-left corner", () => {
		// Flush with the left edge, cursor 400px in, zoomed 4x about it: the point that was 400
		// along is now 1600 along, so the edge has to be 1200px outside the window.
		expect(anchoredOffset({ offset: 0, pointer: 400, from: 1, to: 4 })).toBe(-1200);
	});

	it("survives a degenerate scale rather than returning NaN", () => {
		expect(anchoredOffset({ offset: -120, pointer: 40, from: 0, to: 2 })).toBe(-120);
	});
});

describe("clampPan", () => {
	// The freedom that the whole model is for: a picture may hang as far off either edge as the
	// reader drags it, and nothing pulls it back to the window.
	it("leaves an ordinary drag entirely alone", () => {
		expect(clampPan({ offset: -3000, painted: 6000, view: 800 })).toBe(-3000);
		expect(clampPan({ offset: 500, painted: 6000, view: 800 })).toBe(500);
	});

	// ...but never so far that there is nothing left to grab. Without scrollbars, a picture that
	// left the window entirely would leave no evidence it was ever there.
	it("keeps a sliver in view at both ends of the travel", () => {
		// Dragged right, off the far edge: the picture's left edge stops PAN_MARGIN inside the view.
		expect(clampPan({ offset: 100000, painted: 6000, view: 800 })).toBe(800 - PAN_MARGIN);
		// Dragged left: its right edge (offset + painted) stops PAN_MARGIN inside.
		expect(clampPan({ offset: -100000, painted: 6000, view: 800 })).toBe(PAN_MARGIN - 6000);
	});

	// A picture or a window smaller than the margin would otherwise produce a low bound above the
	// high one, and the clamp would snap it to a single position it could never be dragged off.
	it("still gives a picture smaller than the margin somewhere to go", () => {
		const tiny = clampPan({ offset: 5, painted: 10, view: 30 });
		expect(tiny).toBe(5);
		expect(clampPan({ offset: 999, painted: 10, view: 30 })).toBe(20);
		expect(clampPan({ offset: -999, painted: 10, view: 30 })).toBe(0);
	});

	// Before layout there is no window to hold anything inside of, and clamping against a zero
	// width would drag every offset to the corner just as the fit was being computed.
	it("holds its peace until the window has a size", () => {
		expect(clampPan({ offset: -400, painted: 6000, view: 0 })).toBe(-400);
		expect(clampPan({ offset: -400, painted: 0, view: 800 })).toBe(-400);
		expect(clampPan({ offset: NaN, painted: 100, view: 800 })).toBe(0);
	});
});

