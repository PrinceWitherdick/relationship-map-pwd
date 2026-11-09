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

	// In the plate, under the name chip (whose line is its height): the 3px from the face to the label,
	// less the name's own 2px gap above it, which is the pixel.
	it("hangs the label and chips in one column a pixel under the name chip", () => {
		const under = rule(".relmap-under");
		expect(SIZES["--relmap-under-gap"]).toBe("3px");
		expect(SIZES["--relmap-name-gap"]).toBe("2px");
		expect(declared(under, "margin-top")).toBe("calc(var(--relmap-under-gap) - var(--relmap-name-gap))");
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
		expect(declared(rule(".relmap-chips"), "--relmap-chip-scale")).toBe("1");
		expect(rule(".relmap-chip")).not.toMatch(/--relmap-name-scale/);
		expect(rule("div.relmap-personbar")).not.toMatch(/--relmap-name-scale/);
	});

	it("states every property core's button rule sets on Add chip, in its one rule", () => {
		const own = rule(".relmap-personbar-add");
		for (const [prop, value] of [["width", "auto"], ["height", "calc(var(--relmap-chip-h) * var(--relmap-chip-scale, 1))"], ["min-height", "0"], ["flex", "none"], ["border-style", "dashed"], ["box-shadow", "none"], ["font-family", "inherit"]]) {
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

// THE LABEL BAR, LAID OUT LIKE A SMALL WINDOW: a title, the body, and a foot with Save. The four sides are
// radios and Italic a checkbox, each with its word; the words are trimmed to their capitals so they centre
// on what is beside them (measured in Foundry 14 at 1x, 1.25x and 1.5x with the text-centring audit).
describe("the label bar", () => {
	it("has a title with a close, a body, and Save alone in its foot", () => {
		expect(HBS).toMatch(/<div class="relmap-personbar-head">\s*<span class="relmap-personbar-title"><\/span>\s*<button type="button" class="relmap-personbar-close" data-relmap-pbar="close"/);
		expect(HBS).toMatch(/<div class="relmap-personbar-foot">\s*<button type="button" class="relmap-personbar-save" data-relmap-pbar="save"><i class="fas fa-check" aria-hidden="true"><\/i><span>[^<]*<\/span><\/button>\s*<\/div>/);
		expect(declared(rule(".relmap-personbar-foot"), "justify-content")).toBe("flex-end");
		expect(rule(".relmap-personbar-foot")).toMatch(/border-top:\s*1px solid var\(--relmap-rule\)/);
		expect(rule(".relmap-personbar-head")).toMatch(/border-bottom:\s*1px solid var\(--relmap-rule\)/);
	});

	it("gives the title and the foot a shade of their own, and moves the bar by its title", () => {
		const shade = "color-mix(in srgb, var(--relmap-text-body) 8%, var(--relmap-panel))";
		expect(declared(rule(".relmap-personbar-head"), "background")).toBe(shade);
		expect(declared(rule(".relmap-personbar-foot"), "background")).toBe(shade);
		expect(declared(rule(".relmap-personbar-head"), "cursor")).toBe("move");
		expect(declared(rule(".relmap-personbar-head"), "touch-action")).toBe("none");
	});

	// The title is trimmed to its capitals, and its clip (for the ellipsis) cut off the tops of tall letters.
	it("keeps the tops of the title's letters inside its clip", () => {
		const title = rule(".relmap-personbar-title");
		expect(declared(title, "padding-block")).toBe("0.3em");
		expect(declared(title, "margin-block")).toBe("-0.3em");
	});

	it("draws Italic's checkbox at the radios' size, not core's 20px", () => {
		const box = rule('div.relmap-personbar .relmap-personbar-body .relmap-personbar-italic > input[type="checkbox"]');
		expect(declared(box, "--checkbox-size")).toBe("14px");
		expect(declared(box, "width")).toBe("14px");
		expect(declared(box, "height")).toBe("14px");
	});

	it("lets the label box fill the bar's width", () => {
		expect(declared(rule("textarea.relmap-personbar-field"), "width")).toBe("100%");
	});

	it("asks the side with four radios in a row spaced with gap, core's list margins off", () => {
		const radios = HBS.match(/<label class="relmap-personbar-side">\s*<input type="radio" data-relmap-pbar="side" value="\{\{this\.key\}\}">/g) ?? [];
		expect(radios).toHaveLength(1);
		expect(HBS).toMatch(/<ul class="relmap-personbar-side-list" role="presentation">/);
		expect(declared(rule(".relmap-personbar-side-list > li"), "margin")).toBe("0");
		const row = rule(".relmap-personbar-side-list");
		expect(declared(row, "display")).toBe("flex");
		expect(declared(row, "gap")).toBe("4px 14px");
	});

	// Core nudges a radio 2px down for a text baseline; in this flex row the words then stood 2px high.
	it("takes core's nudge off the side radios", () => {
		expect(declared(rule('.relmap-personbar-side > input[type="radio"]'), "top")).toBe("0");
	});

	it("makes Italic a checkbox with its word", () => {
		expect(HBS).toMatch(/<label class="relmap-personbar-italic">\s*<input type="checkbox" data-relmap-pbar="italic" checked>\s*<span>/);
	});

	it("centres every word on what stands beside it, trimmed to its capitals", () => {
		expect(CSS).toMatch(/\.relmap-personbar-side,\s*\.relmap-personbar-italic \{[^}]*align-items:\s*center;/);
		expect(CSS).toMatch(/@supports \(text-box: trim-both cap alphabetic\) \{\s*:is\(\.relmap-personbar-side, \.relmap-personbar-italic, \.relmap-personbar-save\) > span,\s*\.relmap-personbar-title \{ text-box: trim-both cap alphabetic; \}/);
		expect(CSS).toMatch(/div\.relmap-personbar button\.relmap-personbar-save \{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;/);
	});
});

// AUDIT 2026-11-08, in Foundry 14 at 1x, 1.25x and 1.5x: Add chip's word stood 1px high and the chip
// form's Cancel and Save 0.5px high, each a flex box centring its word's line box. Trimmed, they centre.
describe("the words on Add chip and the chip form's buttons", () => {
	it("are trimmed to their capitals, each in a span the button centres", () => {
		expect(CSS).toMatch(/@supports \(text-box: trim-both cap alphabetic\) \{\s*\.relmap-personbar-add > \.relmap-chip-text,\s*\.relmap-chipform-btn > span \{ text-box: trim-both cap alphabetic; \}/);
		expect(HBS).toMatch(/data-relmap-pbar="chipcancel"><span>[^<]*<\/span><\/button>/);
		expect(HBS).toMatch(/data-relmap-pbar="chipsave"><span>[^<]*<\/span><\/button>/);
	});

	it("draws the worn chips in the bar smaller than the board's, with a smaller x", () => {
		// Set on the row, so Add chip beside the worn chips is drawn at the same size, and as tall.
		expect(declared(rule(".relmap-personbar-chips"), "--relmap-chip-scale")).toBe("0.85");
		expect(rule(".relmap-personbar-add")).toMatch(/height:\s*round\(var\(--relmap-chip-h\) \* var\(--relmap-chip-scale, 1\), 1px\)/);
		const off = rule(".relmap-personbar-chipoff");
		expect(declared(off, "width")).toBe("16px");
		expect(declared(off, "font-size")).toBe("11px");
	});
});
