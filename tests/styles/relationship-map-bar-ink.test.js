import { describe, it, expect } from "vitest";
import { readCss, declarations, readRepo, stripComments } from "../fakes/css.js";

// HOW THE RELATIONSHIP MAP'S SMALL CONTROLS ARE SIZED AND CENTRED.
//
// Every rule asserted here is the kind a browser renders without complaint and no screenshot diff
// catches: a box that collapses when its label goes, and a glyph that sits a pixel and a half off the
// middle of its button.

const CSS = readCss();

/** The value one selector declares for one property, across every rule that names it. */
function declared(selector, property) {
	const body = declarations(CSS, selector);
	if (body === null) return null;
	const found = [...body.matchAll(new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+);`, "g"))];
	return found.length ? found[found.length - 1][1].trim().replace(/\s+/g, " ") : null;
}

// ── The two glyph-only buttons at the far end of the footer ─────────────────────────────────────────
//
// Undo and redo carry no words: the curved arrows are the pair every program draws them with, and
// WHICH change a press would take back is in the tooltip and the accessible name, which no button
// label could have held anyway. What that costs is a box that no longer sizes itself sensibly, and
// two separate faults follow from it -- both of the kind this file exists for, in that a browser
// renders them without complaint and no screenshot diff is going to fail:
//
//   1. THE BOX COLLAPSES. Every button here is as tall as its label's line box plus its
//      padding; with no label the box falls back to the icon's own line box, measured 23px against
//      31.4px for "Add someone" beside it -- a pair of small buttons floating in a taller row.
//   2. THE GLYPH SITS OFF CENTRE. Core's `body.game .app button > i` carries `margin-right: 3px`
//      to space an icon from the label that normally follows it, and with no label that margin is
//      welded to the right of the box being centred: the arrow paints ~1.5px LEFT of the middle.
//
// Both are fixed by arithmetic rather than by a pixel count, which is what makes them assertable
// here: the icon is given a content box of exactly the line box a label would have made (1.6em)
// in BOTH axes, and the padding is evened to 0.25em on all four sides, so the border box comes out
// square on its own -- the same 1.6em + 0.5em each way, plus a border that adds equally to each.
//
// Measured against core's own stylesheet (`relmap-history-square.mjs`): 31.391 x
// 31.391 at root 16, square to 0.000 at root 14, 20 and 24 as well, each time within 0.000 of the
// height of the tool beside it, with the icon's box dead on the button's centre in both axes.
describe("the square the history buttons are, having no words in them", () => {
	const PAIR = ".relmap-history .relmap-tool";

	it("evens the padding up, so the box is as tall as the row and as wide as it is tall", () => {
		// The ordinary tool padding is `0.25em 0.7em`: the 0.7em is the room a LABEL needs beside
		// its icon, and it is exactly what would make these two oblong.
		expect(declared(PAIR, "padding")).toBe("0.25em");
	});

	it("gives the glyph the square box a label's line box would have made", () => {
		// 1.6em each way, which is `line-height: 1.6` on `.relmap-tool` said as a length:
		// the content box then matches a labelled button's in the one axis and is square in both.
		expect(declared(`${PAIR} > i`, "width")).toBe("1.6em");
		expect(declared(`${PAIR} > i`, "height")).toBe("1.6em");
		expect(declared(`${PAIR} > i`, "line-height")).toBe("1.6");
		expect(declared(".relmap-tool", "line-height")).toBe("1.6");
	});

	it("takes core's icon-to-label margin back off, on every side", () => {
		// `margin: 0` rather than `margin-right: 0`, so a core change to any other side lands the
		// same way. Same fix, same reason, as `.relmap-page-tool > i`.
		expect(declared(`${PAIR} > i`, "margin")).toBe("0");
		expect(declared(".relmap-page-tool > i", "margin")).toBe("0");
	});

	it("centres the glyph's own box rather than a stretched column", () => {
		expect(declared(PAIR, "justify-items")).toBe("center");
	});

	it("is aimed at buttons that really do have nothing in them but an icon", () => {
		// The arithmetic above is only right while these two carry no label: put one back and the
		// icon keeps a 1.6em box while the word runs out of the square. So the markup is held to
		// it here, where the reason lives.
		const markup = stripComments(readRepo("templates/dialogs/relationship-map.hbs"));
		const pair = markup.match(/<span class="relmap-history">[\s\S]*?<\/span>/)[0];
		expect(pair).toContain('data-relmap-action="undo"');
		expect(pair).toContain('data-relmap-action="redo"');
		expect(pair).not.toContain("<span>");
	});
});

// ── The tie bar's presses, which have the same fault for the same reason ────────────────────
//
// The strip that appears over a line the reader has clicked is seven controls, and not one of them
// puts a word after its icon: four glyph-only arrow squares, a glyph-only rubber, and three
// triggers whose caret comes LAST. Core's `body.game .app button > i { margin-right: 3px }` is on
// every one of those icons, so `justify-content: center` was centring a box with 3px of nothing
// welded to its right and every glyph on the bar painted about 1.5px left of where it belongs.
// Measured at 8x against the real Pro webfont (`relmap-tiebar-centre.mjs`): -1.531, -1.563, -1.531
// and -1.563px on the four arrows, -1.445, -1.695 and -1.547px on the three triggers. Zeroed, all
// of them land within 0.23px of centre at root 14 and 16 alike.
//
// The rubber had a SECOND fault on top of it, and one that leant the other way: it is `border-box`
// and 26px wide like the six beside it, and it carried `padding-left` alone -- room between the
// glyph and the divider rule it hangs off -- which narrows the content box and shoves it right.
// The trash printed 0.75px RIGHT of centre in a row of presses that were all 1.5px left. Evening
// the padding up costs no width, because it is spent inside a box whose size is already fixed.
//
// Guarded here rather than left to a screenshot for the reason the rest of this file exists: a
// browser renders all of it without complaint, and one and a half pixels is exactly the size of
// fault that reads as "the icons look off" without ever looking like a number.
describe("the icons on the tie bar, which carry no labels either", () => {
	const ICONS = [
		".relmap-tiebar-btn > i",
		".relmap-tiebar-inkopen > i",
		".relmap-tiebar-dashopen > i",
		".relmap-tiebar-sizeopen > i",
	];

	it.each(ICONS)("takes core's icon-to-label margin off %s, on every side", selector => {
		// `margin: 0` rather than `margin-right: 0`, so a core change to any other side lands the
		// same way. Same fix, same reason, as `.relmap-page-tool > i` above.
		expect(declared(selector, "margin")).toBe("0");
	});

	it("pads the rubber on both sides, so its own divider gap does not push the glyph over", () => {
		// Not `padding: 0 0.35em`: the button's shorthand `padding: 0` is inherited from
		// `.relmap-tiebar-btn`, and what matters is that the two sides MATCH.
		const left = declared(".relmap-tiebar-rub", "padding-left");
		const right = declared(".relmap-tiebar-rub", "padding-right");
		expect(left).toBe("0.35em");
		expect(right).toBe(left);
	});

	it("is aimed at presses that really do have no word after the icon", () => {
		// The whole correction is only right while these carry no trailing label: put one back and
		// core's margin is doing the job it was written for again. So the markup is held to it here.
		//
		// The seven presses that stand ON the bar, and not the rows in the panels underneath: those
		// hold `<span>` samples rather than `<i>` glyphs, so core's rule never reaches them, and the
		// one that does carry an icon (`inkpop-add`) puts a WORD after it and wants the margin kept.
		const markup = stripComments(readRepo("templates/dialogs/relationship-map.hbs"));
		const PRESSES = /data-relmap-tie="(?:dir|rub|inkopen|dashopen|sizeopen)"/;
		const found = [...markup.matchAll(/<button[\s\S]*?<\/button>/g)]
			.map(match => match[0]).filter(button => PRESSES.test(button));
		// Five and not seven: the four arrows are one {{#each}} over RELMAP_DIRS in the template.
		expect(found).toHaveLength(5);
		for (const button of found) {
			// Every press on the bar ends in either its icon or the mark that stands for its answer,
			// never in words -- except the size trigger, whose number IS its answer and is written
			// between the two icons rather than after either. Those are on `data-relmap-tie-mark`.
			const inside = button.replace(/^<button[\s\S]*?>/, "").replace(/<\/button>$/, "")
				.replace(/<span[^>]*data-relmap-tie-(?:mark|name)[\s\S]*?<\/span>/g, "");
			expect(inside.replace(/<[^>]*>/g, "").trim(), button).toBe("");
		}
	});
});

// ── The one filled button on that row ──────────────────────────────────────────────────────────
//
// "Add someone" is the only press in this window that puts somebody NEW on the board, and the only
// one painted rather than left as an ordinary tool. WHAT it is painted with is the point of this
// block: the shared slate primary token set, the same one every confirm, submit and call to action
// in the system spends, so a colour retuned once reaches here too. A hand-mixed blue would look
// right on the day it was written and drift away from everything else afterwards, and nothing
// about that fails loudly.
describe("the slate fill on Add someone", () => {
	const ADD = ".relmap-add";
	const HOVER = `${ADD}:hover`;

	it("spends the shared primary tokens and mixes no colour of its own", () => {
		expect(declared(ADD, "background")).toBe("var(--relmap-cta-bg)");
		expect(declared(ADD, "border-color")).toBe("var(--relmap-cta-border)");
		expect(declared(ADD, "color")).toBe("var(--relmap-cta-text)");
		expect(declared(HOVER, "background")).toBe("var(--relmap-cta-bg-hover)");
	});

	// A filled button leaves a reader on the keyboard nowhere for a focus ring to read against the
	// row, so the hover state is worn on focus as well as under the pointer.
	it("answers to the keyboard as well as to the pointer", () => {
		expect(declarations(CSS, `${ADD}:focus-visible`))
			.toBe(declarations(CSS, HOVER));
	});

	// ⚠ COLOUR ONLY. Every measurement that keeps this button level with the two square history
	// buttons beside it belongs to `.relmap-tool`; a padding or a line-height repeated
	// here would be a second set of numbers to keep in step, and the row would go out of true
	// silently the first time one of them was changed and the other was not.
	it("leaves the geometry to the tool rule it shares the row with", () => {
		for (const property of ["padding", "line-height", "min-height", "display", "gap"]) {
			expect(declared(ADD, property), property).toBeNull();
		}
	});

	// The history pair used to stand LAST, and carried a rule on its leading edge to set itself
	// apart from the tool before it. With the filled button at the end of the row instead, that
	// border would hang off the left-hand end of the group with nothing on its far side -- so it
	// came off, and the fill is what separates the two halves now. Held here because a border put
	// back "to tidy the row up" would look deliberate and be wrong.
	it("is what sets the history pair apart, now that the rule between them is gone", () => {
		expect(declared(".relmap-history", "border-inline-start")).toBeNull();
		expect(declared(".relmap-history", "padding-inline-start")).toBeNull();
	});
});

// ── The two presses that ride on a portrait ────────────────────────────────────────────────────
//
// The link handle and the trash bin sit on the corners of a 72px face, each a 22px DISC, and they
// have core's icon-to-label margin on them exactly like every other glyph-only button in this
// window. On a circle it reads worse than it does anywhere else: a chain link or a trash can a
// pixel and a half off the middle of a round button looks like a badly drawn button, where the same
// error inside a square tool reads as nothing much. That is how it was reported, from a screenshot
// of a single portrait.
//
// Measured at 8x against the real webfont (`relmap-node-btn-centre.mjs`, which shoots the node once
// with an integer clip and expresses the button rects and the ink bounds in that one coordinate
// system): both glyphs printed 1.563px LEFT of their button's centre. Zeroed, both land 0.063px off
// it, and the vertical was 0.188px throughout -- swept at root 14, 16, 18, 20 and 24, one figure,
// unmoving, because these two are sized in WHOLE pixels (11px in a 22px box) and stay there at
// every UI scale. That is why they take no `translateY` where `.relmap-page-tool > i`
// needs one.
describe("the link and the trash on a portrait, which carry no labels either", () => {
	it.each([".relmap-handle > i", ".relmap-bin > i"])(
		"takes core's icon-to-label margin off %s, on every side", selector => {
			// `margin: 0` rather than `margin-right: 0`, so a core change to any other side lands
			// the same way. Same fix, same reason, as `.relmap-page-tool > i` above.
			expect(declared(selector, "margin")).toBe("0");
		});

	it("keeps both buttons square, so there is a centre to be off in the first place", () => {
		// A disc: the width, the height and the 50% radius together. Any one of the three changed
		// on its own turns the correction above into an offset of a different size.
		for (const selector of [".relmap-handle", ".relmap-bin"]) {
			expect(declared(selector, "width"), selector).toBe("22px");
			expect(declared(selector, "height"), selector).toBe("22px");
			expect(declared(selector, "border-radius"), selector).toBe("50%");
			expect(declared(selector, "padding"), selector).toBe("0");
			// ⚠ WHOLE PIXELS, WHICH IS WHY NO VERTICAL NUDGE IS NEEDED. A glyph sized in `em`
			// inside a box fixed in `px` lands on a different fraction at every font scale, and
			// the offset then swings about and cannot be corrected by any one number (see the
			// comment on `.relmap-page-tool > i` in the stylesheet). Both of these are
			// deaf to the setting in both quantities, so the rounding is the same every time.
			expect(declared(selector, "font-size"), selector).toBe("11px");
		}
	});

	it("is aimed at presses that really do have nothing in them but an icon", () => {
		// The whole correction is only right while these carry no label: put a word after the
		// icon and core's margin is doing the job it was written for again.
		const markup = stripComments(readRepo("templates/dialogs/partials/relationship-map-board.hbs"));
		const found = [...markup.matchAll(/<button[\s\S]*?<\/button>/g)].map(match => match[0])
			.filter(button => /class="relmap-(?:handle|bin)"/.test(button));
		expect(found).toHaveLength(2);
		for (const button of found) {
			const inside = button.replace(/^<button[\s\S]*?>/, "").replace(/<\/button>$/, "");
			expect(inside.replace(/<[^>]*>/g, "").trim(), button).toBe("");
		}
	});
});
