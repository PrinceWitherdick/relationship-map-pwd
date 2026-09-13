import { describe, it, expect } from "vitest";
import { readCss, declarations, stripComments } from "../fakes/css.js";
import { contrastRatio, parseColor, ratioText } from "../fakes/contrast.js";
import { RELMAP_DASHES, RELMAP_DASH_DEFAULT, RELMAP_INKS } from "../../module/relmap/relmap-store.js";

// The eight colours a line on a relationship map can be drawn in, in both of Foundry's themes and on
// the high-contrast board.
//
// WHAT IS ACTUALLY AT STAKE. For a reader on a screen magnifier, a line that does not clear 3:1 is a
// line they cannot follow, and there is no fallback: the whole point of the board is which line goes
// where. The dash patterns are the belt to that braces (they carry the same distinction with no colour
// at all) and they are checked here too, because a palette that quietly lost them would look fine to
// everyone who could already see it.
//
// The dashes are painted ONLY on the high-contrast board: eighty lines in eight dot-and-dash patterns
// read as static rather than as a diagram, so an ordinary board is drawn solid. The tokens still all
// have to be there and still all have to differ, because the board that paints them is the board that
// cannot fall back on colour.

const CSS = readCss();

/** Every `--custom-property: value` a rule declares, as a Map. */
function customProperties(body) {
	const out = new Map();
	if (!body) return out;
	for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out.set(m[1].trim(), m[2].trim());
	return out;
}

const ROOT = declarations(CSS, ".relmap-window");
const BASE = customProperties(ROOT);
const DARK = customProperties(declarations(CSS, ".relmap-window.theme-dark"));
const CONTRAST = customProperties(declarations(CSS, ".relmap-window.relmap-high-contrast"));
const DARK_CONTRAST = customProperties(declarations(CSS, ".relmap-window.theme-dark.relmap-high-contrast"));

const inkToken = key => `--relmap-ink-${key}`;
const dashToken = key => `--relmap-dash-${key}`;

/**
 * The four boards a line can be drawn on, and what each one reads: a dark board takes what the dark
 * block re-declares and the base for the rest, and the high-contrast dark board takes its own block
 * first, then the light high-contrast block, then the dark block. That is the cascade the four
 * selectors make, spelled out.
 */
const BOARDS = {
	light: { floor: 3, read: name => BASE.get(name) },
	dark: { floor: 3, read: name => DARK.get(name) ?? BASE.get(name) },
	"light high-contrast": { floor: 4.5, read: name => CONTRAST.get(name) ?? BASE.get(name) },
	"dark high-contrast": {
		floor: 4.5,
		read: name => DARK_CONTRAST.get(name) ?? CONTRAST.get(name) ?? DARK.get(name) ?? BASE.get(name),
	},
};

/** Straight-line distance in sRGB: crude next to a real colour difference, and enough to catch a pair
 * of inks that have met. */
function distance(a, b) {
	const p = parseColor(a)?.rgb;
	const q = parseColor(b)?.rgb;
	expect(p, `could not parse ${a}`).toBeTruthy();
	expect(q, `could not parse ${b}`).toBeTruthy();
	return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe("the relationship map's inks", () => {
	it("finds the grounds it measures against in both themes, so the checks below mean something", () => {
		for (const [name, board] of Object.entries(BOARDS)) {
			expect(board.read("--relmap-page"), `${name} page`).toBeTruthy();
			expect(board.read("--relmap-panel"), `${name} panel`).toBeTruthy();
			expect(contrastRatio(board.read("--relmap-panel"), board.read("--relmap-page")), name).toBeLessThan(1.3);
		}
		expect(DARK.get("--relmap-page"), "the dark block re-declares the page").toBeTruthy();
	});

	// The join nothing else would notice breaking: the module offers eight keys, the stylesheet paints
	// eight, and a line whose ink has no token renders with no colour at all.
	it("paints exactly the inks the module offers, and no others", () => {
		const painted = [...ROOT.matchAll(/--relmap-ink-([a-z]+)\s*:/g)].map(m => m[1]);
		expect(painted.sort()).toEqual([...RELMAP_INKS].sort());
	});

	it("gives every ink a dash pattern as well as a colour", () => {
		for (const key of RELMAP_INKS) {
			expect(BASE.get(dashToken(key)), dashToken(key)).toBeTruthy();
		}
	});

	// Colour is never the only carrier. Two inks sharing a dash would leave those two told apart by hue
	// alone, which is exactly the case this palette exists to avoid.
	it("gives no two inks the same dash", () => {
		const dashes = RELMAP_INKS.map(key => BASE.get(dashToken(key)));
		expect(new Set(dashes).size).toBe(RELMAP_INKS.length);
	});

	for (const [name, board] of Object.entries(BOARDS)) {
		it(`clears ${board.floor}:1 against BOTH the page and the panel tone on the ${name} board`, () => {
			const page = board.read("--relmap-page");
			const panel = board.read("--relmap-panel");
			for (const key of RELMAP_INKS) {
				const value = board.read(inkToken(key));
				expect(value, inkToken(key)).toBeTruthy();
				expect(contrastRatio(value, page), `${key} on the page: ${ratioText(value, page)}`)
					.toBeGreaterThanOrEqual(board.floor);
				expect(contrastRatio(value, panel), `${key} on a panel: ${ratioText(value, panel)}`)
					.toBeGreaterThanOrEqual(board.floor);
			}
		});

		// Eight colours that are really seven are a board where two ties cannot be told apart. Lifting
		// inks to a higher floor on a dark ground walks neighbouring hues into each other, which is what
		// happened to rose and crimson before they were turned apart.
		it(`keeps the eight plainly apart from each other on the ${name} board`, () => {
			const inks = RELMAP_INKS.map(key => [key, board.read(inkToken(key))]);
			for (let i = 0; i < inks.length; i++) {
				for (let j = i + 1; j < inks.length; j++) {
					const apart = distance(inks[i][1], inks[j][1]);
					expect(apart, `${inks[i][0]} and ${inks[j][0]} are ${apart.toFixed(0)} apart`).toBeGreaterThan(40);
				}
			}
		});
	}

	it("raises every one of them on the high-contrast board, in both themes", () => {
		for (const key of RELMAP_INKS) {
			expect(CONTRAST.get(inkToken(key)), `${inkToken(key)} is not re-declared for high contrast`).toBeTruthy();
			expect(DARK_CONTRAST.get(inkToken(key)), `${inkToken(key)} is not re-declared for dark high contrast`).toBeTruthy();
		}
	});

	// Body text on both grounds, in both themes and on both boards. The faint step is only ever a glyph
	// or a disabled label, so it is held to the graphical bar.
	it("sets the words on the chrome at a contrast they can be read at", () => {
		for (const [name, board] of Object.entries(BOARDS)) {
			for (const ground of ["--relmap-page", "--relmap-panel"]) {
				const paper = board.read(ground);
				for (const [token, floor] of [
					["--relmap-text", 4.5], ["--relmap-text-body", 4.5], ["--relmap-text-secondary", 4.5],
					["--relmap-text-quiet", 4.5], ["--relmap-text-faint", 3],
				]) {
					const ink = board.read(token);
					expect(contrastRatio(ink, paper), `${token} on the ${name} ${ground}: ${ratioText(ink, paper)}`)
						.toBeGreaterThanOrEqual(floor);
				}
			}
		}
	});
});

describe("solid on an ordinary board, dashed where the pattern is needed", () => {
	const LINE = declarations(CSS, ".relmap-line");
	const DASHED = declarations(CSS, ".relmap-window.relmap-high-contrast .relmap-line");

	it("draws every line solid by default", () => {
		expect(LINE, ".relmap-line").toBeTruthy();
		expect(LINE).toMatch(/stroke-dasharray:\s*none\s*;/);
	});

	// The whole reason the tokens above are still worth having. Without this rule they are eight
	// carefully distinct patterns that nothing on any board ever paints.
	it("puts the patterns back on the high-contrast board", () => {
		expect(DASHED, ".relmap-window.relmap-high-contrast .relmap-line").toBeTruthy();
		expect(DASHED).toMatch(/stroke-dasharray:\s*var\(\s*--relmap-dash/);
	});

	// Both halves off ONE declaration per ink, so a colour and its dash cannot be set apart: the solid
	// rule and the high-contrast rule read the same `--relmap-dash` the pair sets.
	it("keeps each ink's colour and dash on the same declaration", () => {
		for (const key of RELMAP_INKS) {
			const pair = declarations(CSS, `.relmap-line--${key}`);
			expect(pair, key).toBeTruthy();
			expect(pair, key).toContain(`var(--relmap-ink-${key})`);
			expect(pair, key).toContain(`var(--relmap-dash-${key})`);
		}
	});
});

// ── The mark the reader made ────────────────────────────────────────────────
//
// A DIFFERENT QUESTION FROM THE EIGHT PATTERNS ABOVE, with the same answer shape, and the two have
// to be kept apart. An ink's dash is a COLOUR said a second time and is painted only under the
// high-contrast skin; this is a distinction somebody drew on purpose -- the rumour against the
// fact, the tie that was against the tie that is -- and it is painted on every skin.
//
// ⚠ AND THERE ARE THREE ANSWERS NOW, WHICH IS WHY THIS IS SWEPT RATHER THAN SPELLED OUT. Dotted was
// the whole of "not solid" for a while and it is the faintest a line gets; dashed is the middle
// answer. Every one of them the module offers has to be a token, a rule, and a pattern that reads
// as itself at all three weights -- and a fourth added to `RELMAP_DASHES` without any of that would
// be a stored answer drawn as a solid line, which is the map saying something false about a tie.
describe("the stroke the reader broke themselves", () => {
	// The keys that mean "not whole". `solid` is the absence of a modifier, not a pattern.
	const BROKEN = RELMAP_DASHES.filter(key => key !== RELMAP_DASH_DEFAULT);

	/** One half of a rhythm token: the mark, or the air after it. */
	const part = token => Number(BASE.get(token));

	/** The base rule, which is where every weight and both rhythms are now worked out. */
	const LINE = declarations(CSS, ".relmap-line");

	it("has more than one way to break a stroke, or none of this is a distinction", () => {
		expect(BROKEN.length).toBeGreaterThan(1);
	});

	it("gives every broken stroke a pattern and a rule that paints it", () => {
		for (const key of BROKEN) {
			expect(part(`--relmap-${key}-mark`), `${key} mark`).toBeGreaterThan(0);
			expect(part(`--relmap-${key}-air`), `${key} air`).toBeGreaterThan(0);
			const rule = declarations(CSS, `.relmap-line.is-${key}`);
			expect(rule, `.relmap-line.is-${key}`).toBeTruthy();
			expect(rule).toMatch(new RegExp(`stroke-dasharray:\\s*var\\(\\s*--relmap-${key}-rhythm`));
		}
	});

	// ⚠ THE WHOLE POINT OF HAVING TWO. A dashed line whose marks are the length of a dotted line's
	// dots is two patterns nobody at this table could tell apart -- and the reader who most needs
	// them told apart is the one who cannot resolve the colours either.
	//
	// ONCE, AND AT EVERY WEIGHT. It used to be swept over three hand-tuned pairs apiece; there is
	// one rhythm each now and every weight is that rhythm times the width being painted, so a ratio
	// that holds here holds at all of them by construction. The test below is what holds that
	// construction in place.
	it("keeps the dashes plainly longer than the dots", () => {
		expect(part("--relmap-dashed-mark")).toBeGreaterThan(part("--relmap-dotted-mark") * 3);
	});

	// ⚠ A ROUND CAP ADDS THE WHOLE STROKE WIDTH TO EVERY DASH AND TAKES IT OUT OF EVERY GAP, so a
	// line widened without its pattern opened up fuses into a lumpy solid -- at the exact moment the
	// reader picked it up to look at it.
	//
	// ⚠ AND THE NUMBER OF WEIGHTS IS NO LONGER FIXED, which is why this is a test about the
	// arithmetic rather than about a table of values. There were three (resting, lit, picked); there
	// are now those three times whatever percentage a reader has asked the strokes to be drawn at
	// (module/relmap/relmap-weights.js), and no table of hand-tuned pairs can cover a number chosen
	// at run time. So every rhythm is DERIVED from the width actually being painted, and what has to
	// hold is that derivation: both halves of both patterns multiplied by the painted width and
	// divided by the width they were measured at.
	it("works both rhythms out from the width actually being painted", () => {
		expect(LINE).toBeTruthy();
		expect(LINE).toMatch(/--relmap-line-w:\s*calc\(\s*var\(--relmap-weight\)/);
		expect(LINE).toMatch(/stroke-width:\s*var\(--relmap-line-w\)/);
		expect(part("--relmap-rhythm-at")).toBeGreaterThan(0);
		for (const key of BROKEN) {
			const rhythm = LINE.match(
				new RegExp(`--relmap-${key}-rhythm:([^;]*);`),
			)?.[1];
			expect(rhythm, `${key} rhythm`).toBeTruthy();
			for (const half of ["mark", "air"]) {
				expect(rhythm, `${key} ${half}`).toContain(`var(--relmap-${key}-${half})`);
			}
			// Times the painted width and divided by the width the rhythm was measured at, twice
			// over: the mark and the air both, or a heavier line gets fatter dots at the same
			// spacing, which is the fusing this exists to prevent.
			expect(rhythm.match(/var\(--relmap-line-w\)/g), `${key} width`).toHaveLength(2);
			expect(rhythm.match(/var\(--relmap-rhythm-at\)/g), `${key} divisor`).toHaveLength(2);
		}
	});

	// AND THE TWO WIDER WEIGHTS ARE NOW ONE NUMBER APIECE, which is the whole gain: a state that
	// restated a width and both patterns was three numbers that had to be kept in step, and the
	// rule saying so was a comment. Set the weight and everything else follows.
	it("gives the wider weights nothing to keep in step", () => {
		const resting = Number(LINE.match(/--relmap-weight:\s*([\d.]+)/)?.[1]);
		expect(resting).toBeGreaterThan(0);
		for (const [what, rule] of [
			["picked", declarations(CSS, ".relmap-line.is-picked")],
			["lit", declarations(CSS, ".relmap.is-lit .relmap-line.is-lit")],
		]) {
			expect(rule, what).toBeTruthy();
			const weight = Number(rule.match(/--relmap-weight:\s*([\d.]+)/)?.[1]);
			expect(weight, `${what} weight`).toBeGreaterThan(resting);
			// Nothing else: a width or a pattern restated here would be a second answer to a
			// question the base rule already derives from this one number.
			expect(rule, `${what} width`).not.toMatch(/stroke-width:/);
			expect(rule, `${what} pattern`).not.toMatch(/stroke-dasharray:/);
		}
	});

	// ⚠ THE READER'S OWN MARK WINS UNDER THE HIGH-CONTRAST SKIN TOO, which is the one place the two
	// kinds of dash meet. What it costs is stated where the field is declared: a broken line has
	// only its colour left saying which ink it is. The alternative was to silently not draw the one
	// mark the reader made by hand, for the reader who most needs marks drawn at all.
	it("keeps it under the high-contrast skin, where the ink's own pattern is painted", () => {
		for (const key of BROKEN) {
			const rule = declarations(CSS, `.relmap-window.relmap-high-contrast .relmap-line.is-${key}`);
			expect(rule, key).toBeTruthy();
			expect(rule).toMatch(new RegExp(`stroke-dasharray:\\s*var\\(\\s*--relmap-${key}-rhythm`));
		}
	});

	// AND THE CHOOSER DRAWS EACH OF THEM, which is how a reader picks one: the trigger shows the
	// stroke the line has and each row in the panel shows the one it stands for. `solid` is in this
	// sweep because the sample there IS the base rule -- a plain rule with no modifier.
	it("draws a sample of every stroke the chooser offers", () => {
		expect(declarations(CSS, ".relmap-tiebar-rule"), "the base sample").toBeTruthy();
		for (const key of BROKEN) {
			expect(declarations(CSS, `.relmap-tiebar-rule--${key}`), key).toBeTruthy();
		}
	});
});

// ── The ninth colour ────────────────────────────────────────────────────────
//
// A colour a reader picked in a system colour dialog, which is unlike the eight in the one way that
// matters here: there is no token for it, so there is nothing for the high-contrast skin to raise
// and nothing for the dash table to key off. What it gets instead is a dash pattern of its own and
// a best-effort darkening, and this holds the stylesheet to both -- because the promise made to the
// reader on the magnifier when this was built was that a custom line would still carry SOMETHING
// under that skin, and a rule quietly dropped here would break it silently.
describe("a colour nobody named", () => {
	const CUSTOM = declarations(CSS, ".relmap-line--custom");

	it("draws it from the property the renderer writes, not from a token", () => {
		expect(CUSTOM, ".relmap-line--custom").toBeTruthy();
		expect(CUSTOM).toContain("var(--relmap-ink-raw");
	});

	// Colour is never the only carrier, and a custom line cannot fall back on a token's pattern.
	it("gives it a dash of its own, unlike any of the eight", () => {
		const own = BASE.get("--relmap-dash-custom");
		expect(own, "--relmap-dash-custom").toBeTruthy();
		expect(CUSTOM).toContain("var(--relmap-dash-custom)");
		for (const key of RELMAP_INKS) {
			expect(BASE.get(dashToken(key)), `custom shares a dash with ${key}`).not.toBe(own);
		}
	});

	// ⚠ A BEST EFFORT AND NOT THE PROMISE THE EIGHT MAKE, which is exactly why it is worth pinning:
	// the eight are re-declared at a measured 4.5:1 and this cannot be, so what it must not do is
	// silently do nothing. Read off `--relmap-ink-raw` and never off `--relmap-ink`, which is the
	// property being set -- a declaration reading itself resolves to nothing and paints it black.
	it("takes it darker under the high-contrast skin, off the raw colour", () => {
		const lit = declarations(CSS, ".relmap-window.relmap-high-contrast .relmap-line--custom");
		expect(lit, "the high-contrast custom rule").toBeTruthy();
		expect(lit).toMatch(/--relmap-ink:\s*color-mix\(/);
		expect(lit).toContain("var(--relmap-ink-raw");
	});

	// And on the dark board the step goes the other way: towards white, which is where contrast is there.
	it("takes it lighter on the dark high-contrast board, off the raw colour", () => {
		const lit = declarations(CSS, ".relmap-window.theme-dark.relmap-high-contrast .relmap-line--custom");
		expect(lit, "the dark high-contrast custom rule").toBeTruthy();
		expect(lit).toMatch(/--relmap-ink:\s*color-mix\(/);
		expect(lit).toContain("#fff");
	});
});

// ── The writing field that is not on the bar ────────────────────────────────
//
// The tie bar has no text box on it: what a reader types is painted on the LINE (`_sayLine`). The
// field is still a real `input` -- nothing else gives an IME, a caret, a selection, paste or a
// screen reader anything to work with -- and it is hidden by CLIPPING, which is the only way of
// hiding an element that leaves it able to hold the focus. `display: none`, `visibility: hidden`
// or the `hidden` attribute would each take the focus away from it, and the field is focused the
// moment a line is clicked: that is the whole of "click a line and start typing".
describe("the writing field on the tie bar", () => {
	const FIELD = declarations(CSS, ".relmap-tiebar-words");

	it("is hidden by clipping rather than by anything that would kill the focus", () => {
		expect(FIELD, ".relmap-tiebar-words").toBeTruthy();
		expect(FIELD).toMatch(/clip-path:\s*inset\(/);
		expect(FIELD).not.toMatch(/display:\s*none/);
		expect(FIELD).not.toMatch(/visibility:\s*hidden/);
	});

	// Out of the bar's flex flow, so the presses do not sit a pixel further along than they look.
	it("takes no room on the bar", () => {
		expect(FIELD).toMatch(/position:\s*absolute/);
		expect(FIELD).toMatch(/width:\s*1px/);
		expect(FIELD).toMatch(/margin:\s*0/);
	});
});

describe("the captions, which are bare words written along their own lines", () => {
	const LAYER = declarations(CSS, ".relmap-labels");
	const LABEL = declarations(CSS, ".relmap-label");
	const WORDS = declarations(CSS, ".relmap-label-text");

	it("draws the captions in one layer over the whole board", () => {
		expect(LAYER, ".relmap-labels").toBeTruthy();
		expect(LAYER).toMatch(/position:\s*absolute/);
		expect(LAYER).toMatch(/inset:\s*0/);
	});

	// THE READER'S ANSWER, from the checkbox under the board: `_toggleLabels` marks the root, this
	// puts the captions away, and `_paintLineGaps` closes the holes cut in the strokes for words
	// that are no longer there.
	it("paints no captions at all once the reader turns the words off", () => {
		const lit = declarations(CSS, ".relmap.captions-off .relmap-labels-lit");
		expect(lit, "the lit layer").toBeTruthy();
		expect(lit, "the lit layer").toMatch(/display:\s*none/);
		const quiet = declarations(
			CSS, ".relmap.captions-off .relmap-label:not(.is-picked)",
		);
		expect(quiet, "every caption but the held one").toBeTruthy();
		expect(quiet, "every caption but the held one").toMatch(/display:\s*none/);
	});

	// ⚠ AND ZOOMING OUT IS NOT A SECOND WAY TO LOSE THEM. There used to be a `.captions-too-small`
	// rule here, written by the zoom, that took every caption away once the type fell under a
	// legibility floor. It went: a reader who zooms out to see the whole web is exactly the person
	// who wants to see WHERE the writing is, and the raster cost that justified it was paid off when
	// the words came off their rails and were set straight. Nothing in the sheet may hide a caption
	// on account of the scale.
	it("never hides a caption on account of the zoom", () => {
		// Comments stripped: the rule that went is described in one, up in the sheet.
		expect(stripComments(CSS)).not.toMatch(/captions-too-small/);
	});

	// ⚠ EXCEPT THE ONE THE READER IS HOLDING, and this is the rule the tie bar's writing depends on.
	// The bar has no text box on it any more: what somebody types is painted on the LINE, and a
	// whole board fitted into the window is under the legibility floor -- which is the zoom the map
	// OPENS at. Leaving their own words at three pixels while they wrote them would be typing into a
	// smudge. So `_paintCaptionZoom` marks the board `.captions-tiny` and hands the held caption
	// board pixels worked out from the scale (`CAPTION_READ_PX` divided by it), so those words stay
	// one size to read while the board shrinks under them. It hides nothing else.
	it("keeps the caption the reader is writing on, at a size they can read", () => {
		const held = declarations(
			CSS,
			".relmap.captions-tiny .relmap-label.is-picked .relmap-label-text",
		);
		expect(held, "the held caption").toBeTruthy();
		expect(held).toMatch(/font-size:\s*var\(--relmap-say-px/);
	});

	// ⚠ AND NEVER BY GIVING THE LAYER A TEXTURE. `will-change` does NOT make expensive glyphs
	// cheaper; it moves the cost to where the main thread blocks on it. A trace of the real window
	// showed 8.8 SECONDS of `Commit` across ten seconds, in blocks of a second and a half, ~100
	// frames dropped a second throughout. Without it the same raster runs on the worker threads and
	// Commit is ~2ms.
	it("never promotes the caption layer to a texture of its own", () => {
		expect(LAYER).not.toMatch(/will-change/);
		expect(LAYER).not.toMatch(/translateZ|translate3d/);
	});

	it("has no box behind the words", () => {
		expect(LABEL, ".relmap-label").toBeTruthy();
		// Nothing is drawn by a caption's group at all -- no fill, no border, no box. The words are
		// the whole of it, and the page tone they sit on is the halo below.
		expect(LABEL).not.toMatch(/background:\s*(?!none)/);
		expect(LABEL).not.toMatch(/border(-\w+)?:\s*(?!0|none)/);
	});

	// WHAT THE BOX WAS ACTUALLY DOING. Take the fill away and a caption crossing a stroke or a
	// portrait is unreadable, and there is a reader at this table on a magnifier for whom that is
	// not a small matter. The halo puts the same page tone behind the letters instead of behind a
	// rectangle, so the contrast the chip gave is exactly the contrast that is left.
	//
	// A STROKE UNDER THE FILL now the words are SVG, which is the same ring the eight stacked text
	// shadows were approximating and an exact one rather than an approximation.
	it("keeps the page tone behind the letters, as a halo", () => {
		expect(WORDS, ".relmap-label-text").toBeTruthy();
		expect(WORDS).toMatch(/paint-order:\s*stroke/);
		expect(WORDS).toMatch(/stroke:\s*var\(--relmap-page\)/);
	});

	// The caption layer covers the whole board. A target that size would swallow every click meant
	// for the faces and the captions underneath it, so the layer takes no pointer events and the
	// glyphs take them back -- which makes the aimable area the words the reader can actually see.
	it("aims at the writing and not at the layer over it", () => {
		expect(LAYER).toMatch(/pointer-events:\s*none\s*;/);
		expect(WORDS).toMatch(/pointer-events:\s*auto\s*;/);
	});

	// And the focus ring goes with it: an outline round a caption's BOUNDING BOX would be a
	// rectangle the size of the board with a sentence somewhere inside it. Marked on the words
	// instead, in a different COLOUR and a heavier WEIGHT -- never colour alone, for the reader on
	// a magnifier.
	it("marks a focused caption on its words rather than on its box", () => {
		expect(WORDS).toMatch(/outline:\s*none\s*;/);
		const lit = declarations(CSS, ".relmap-label-text:focus-visible");
		expect(lit, "focus-visible").toBeTruthy();
		expect(lit).toMatch(/stroke:\s*var\(--relmap-accent\)/);
		expect(lit).toMatch(/stroke-width:\s*4px/);
	});

	// ON the line rather than above it. A baseline sitting on the rail would put every caption a
	// half-line clear of its own stroke, and the gap cut in that stroke would be a hole underneath
	// the words instead of around them.
	it("sets the words on the line, centred on the anchor the gap was cut at", () => {
		expect(WORDS).toMatch(/dominant-baseline:\s*central/);
		expect(WORDS).toMatch(/text-anchor:\s*middle/);
	});

	// The board's own ground IS the page tone, so haloed body ink on it is the same measurement
	// the chip used to make. Said out loud here because it is the whole reason the halo is that
	// colour and not, say, the panel tone.
	it("halos in the tone the board is actually painted on", () => {
		const view = declarations(CSS, ".relmap-view");
		expect(view).toMatch(/background:\s*var\(--relmap-page\)/);
	});
});
