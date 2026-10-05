import { describe, it, expect } from "vitest";
import { readCss, declarations } from "../fakes/css.js";

// HOW TALL A PRESS IN A DIALOG'S FOOTER IS.
//
// Every modal this module opens wears `.relmap-dialog`, and its footer is one of two: core's
// `.form-footer` (every DialogV2, core's Create Actor included) or the people chooser's
// `.relmap-rail-nav`. Both are meant to be as tall as their padding makes them, so the same press
// is one height in every window and no taller than the field above it.
//
// Core sizes a button by `--button-size` TWICE, as `height` and as `min-height`, and in a DialogV2
// footer that size is 1.25 field heights: 40px against a 32px field. Undoing `height` alone leaves
// the floor standing, and the footer comes out the heavier half of a two-line question. A browser
// renders that without complaint, which is why it is asserted here.

const CSS = readCss();

/** The value one selector declares for one property, across every rule that names it. */
function declared(selector, property) {
	const body = declarations(CSS, selector);
	if (body === null) return null;
	const found = [...body.matchAll(new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+);`, "g"))];
	return found.length ? found[found.length - 1][1].trim().replace(/\s+/g, " ") : null;
}

describe("dialog footer buttons", () => {
	for (const selector of [".relmap-dialog .form-footer button", ".relmap-rail-nav button"]) {
		it(`take their height from their padding: ${selector}`, () => {
			expect(declared(selector, "height")).toBe("auto");
			expect(declared(selector, "min-height")).toBe("0");
		});
	}
});
