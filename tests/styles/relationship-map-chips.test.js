import { describe, it, expect } from "vitest";
import { ownRule, readCss, readRepo } from "../fakes/css.js";
import {
	RELMAP_CHIP_GAP_PX, RELMAP_CHIP_H_PX, RELMAP_CHIP_ROW_W, RELMAP_SUBTITLE_MAX_W, relmapSizeProperties,
} from "../../module/utils/relmap-geometry.js";

// TAG CHIPS ("Dead", "Noble") under a person's label, the bar that puts them on, and the bigger names
// they hang under. The geometry packs the pills and measures every outline round them, so the
// stylesheet draws them by the geometry's own numbers (`relmapSizeProperties`, which the window writes
// on its root) rather than by copies of them.

const SIZES = Object.fromEntries(relmapSizeProperties());

const CSS = readCss();
const HBS = readRepo("templates/dialogs/relationship-map.hbs");
const rule = selector => ownRule(CSS, selector);
const declared = (block, prop) => block?.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+);`))?.[1]?.trim() ?? null;

describe("a tag chip on the board", () => {
	const chip = rule(".relmap-chip");

	it("pins its height in board pixels, with a line-height of 1 and no vertical padding", () => {
		expect(chip).toBeTruthy();
		expect(SIZES["--relmap-chip-h"]).toBe(`${RELMAP_CHIP_H_PX}px`);
		expect(chip).toMatch(/height:\s*round\(var\(--relmap-chip-h\) \* var\(--relmap-chip-scale, 1\), 1px\)/);
		expect(declared(chip, "line-height")).toBe("1");
		expect(declared(chip, "padding")).toMatch(/^0 /);
		// A block and never a flex box: the trim below only reaches a block container's own lines.
		expect(declared(chip, "display")).toBe("inline-block");
		expect(declared(chip, "align-items")).toBeNull();
	});

	it("is drawn in the board's own font, so the measure the rows are packed by is the face painted", () => {
		expect(declared(chip, "font-family")).toBe("var(--relmap-font)");
		expect(declared(chip, "font-weight")).toBe("600");
		expect(declared(chip, "letter-spacing")).toBe("0.05em");
		expect(chip).toMatch(/font-size:\s*calc\(13px \* var\(--relmap-chip-scale, 1\)\)/);
	});

	it("draws each row the geometry laid out, never wrapping, at the geometry's gap and width", () => {
		expect(SIZES["--relmap-chip-row-w"]).toBe(`${RELMAP_CHIP_ROW_W}px`);
		expect(SIZES["--relmap-chip-gap"]).toBe(`${RELMAP_CHIP_GAP_PX}px`);
		expect(rule(".relmap-chip-row")).toMatch(/max-width:\s*calc\(var\(--relmap-chip-row-w\) \* var\(--relmap-chip-scale, 1\)\)/);
		expect(rule(".relmap-chip-row")).not.toMatch(/flex-wrap:\s*wrap/);
		expect(declared(rule(".relmap-chips"), "gap")).toBe("var(--relmap-chip-gap)");
		expect(declared(rule(".relmap-chips"), "margin")).toBe("var(--relmap-chip-gap) 0 0");
	});

	it("centres its word on its capitals, trimmed like the footer tools' labels", () => {
		expect(CSS).toMatch(/@supports \(text-box: trim-both cap alphabetic\) \{\s*\.relmap-chip \{\s*text-box: trim-both cap alphabetic;\s*padding-block: calc\(\(round\(var\(--relmap-chip-h\) \* var\(--relmap-chip-scale, 1\), 1px\) - 2px - 1cap\) \/ 2\);/);
		expect(CSS).not.toMatch(/\.relmap-chip-text \{[^}]*text-box/);
	});

	it("takes presses, so a chip's tooltip names it", () => {
		expect(CSS).toMatch(/\.relmap-subtitle,\s*\.relmap-chips \{ pointer-events: auto; \}/);
	});
});

describe("the names and labels the chips hang under", () => {
	it("sets names at 14px and labels at 13px, both on the names dial", () => {
		expect(rule(".relmap-name")).toMatch(/font-size:\s*calc\(14px \* var\(--relmap-name-scale, 1\)\)/);
		expect(rule(".relmap-subtitle")).toMatch(/font-size:\s*calc\(13px \* var\(--relmap-name-scale, 1\)\)/);
		expect(SIZES["--relmap-subtitle-w"]).toBe(`${RELMAP_SUBTITLE_MAX_W}px`);
		expect(rule(".relmap-subtitle")).toMatch(/max-width:\s*calc\(var\(--relmap-subtitle-w\) \* var\(--relmap-name-scale, 1\)\)/);
	});

	it("rounds both line heights to whole pixels, as the geometry does", () => {
		expect(SIZES["--relmap-name-line"]).toBe("21px");
		expect(SIZES["--relmap-subtitle-line"]).toBe("18px");
		expect(rule(".relmap-name")).toMatch(/line-height:\s*round\(var\(--relmap-name-line\) \* var\(--relmap-name-scale, 1\), 1px\)/);
		expect(rule(".relmap-subtitle")).toMatch(/line-height:\s*round\(var\(--relmap-subtitle-line\) \* var\(--relmap-name-scale, 1\), 1px\)/);
	});

	it("hangs the label and chips in one column a pixel under the name chip", () => {
		const under = rule(".relmap-under");
		expect(SIZES["--relmap-under-gap"]).toBe("3px");
		expect(under).toMatch(/top:\s*calc\(100% \+ var\(--relmap-under-gap\) \+ round\(var\(--relmap-name-line\) \* var\(--relmap-name-scale, 1\), 1px\)\)/);
		expect(declared(under, "flex-direction")).toBe("column");
	});

	it("paints people over the captions: the caption layers carry no z-index", () => {
		const layers = CSS.match(/\.relmap-labels,\s*\.relmap-labels-lit \{[^}]*\}/)?.[0] ?? "";
		expect(layers).toBeTruthy();
		expect(layers.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/z-index/);
	});
});

describe("the person bar's chips", () => {
	// The dial reaches a pill only inside the board's own rows, so the bar's pills (its worn row, the
	// form's preview) need nothing to stop it.
	it("keeps the bar's pills at their base size, whatever the names dial says", () => {
		expect(declared(rule(".relmap-chips"), "--relmap-chip-scale")).toBe("var(--relmap-name-scale, 1)");
		expect(rule(".relmap-chip")).not.toMatch(/--relmap-name-scale/);
		expect(rule("div.relmap-personbar")).not.toMatch(/--relmap-name-scale/);
	});

	it("states every property core's button rule sets on Add chip, in its one rule", () => {
		const own = rule(".relmap-personbar-add");
		for (const [prop, value] of [["width", "auto"], ["height", "24px"], ["min-height", "0"], ["flex", "none"], ["border-style", "dashed"], ["box-shadow", "none"], ["font-family", "inherit"]]) {
			expect(declared(own, prop), prop).toBe(value);
		}
		expect(HBS).toMatch(/class="relmap-personbar-add"/);
	});

	it("gives Save and Cancel the name field's height", () => {
		expect(HBS).toMatch(/class="relmap-chipform-row relmap-field-btns"/);
		const btns = CSS.match(/\.relmap-field-btns:has\([^{]*\) > button \{[^}]*\}/)?.[0] ?? "";
		expect(btns).toMatch(/align-self:\s*stretch/);
		expect(btns).toMatch(/height:\s*auto/);
	});
});

describe("the suggestion menu off Add chip", () => {
	it("is drawn in this stylesheet's tokens, which reach it on <body> through the window class", () => {
		const js = readRepo("module/utils/suggestion-menu.js");
		expect(js).toMatch(/menu\.className = "relmap-window relmap-popup relmap-suggestion-menu"/);
		expect(js).toMatch(/applyTheme\(menu\)/);
		expect(rule(".relmap-suggestion-menu")).toMatch(/background:\s*var\(--relmap-page\)/);
	});
});
