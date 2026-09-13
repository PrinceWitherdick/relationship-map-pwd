import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
	RELMAP_GROUND_FALLBACK, RELMAP_INK_ACROSS, RELMAP_INK_CUSTOM, RELMAP_INK_FLOOR,
	RELMAP_INK_PRESETS,
	contrast, deepenInk, inkPaint, legibleHex, luminance, normalizeHex, parseColour,
} from "../../module/relmap/relmap-ink.js";
import { RELMAP_INKS } from "../../module/relmap/relmap-store.js";
import { readCss, declarations } from "../fakes/css.js";

// THE NINTH COLOUR: one a reader picked for themselves, and the two things that stand between it and
// the board.
//
// WHAT IS ACTUALLY AT STAKE, and it is not tidiness. The eight named inks are vetted once, by people,
// and held at 3:1 by tests/styles/relationship-map-inks.test.js. A colour out of a system colour dialog
// is vetted by nothing at all, and for a reader on a screen magnifier a line under that bar is a line
// they cannot follow, on a board whose entire content is which line goes where. So there are two
// gates, and this file is both of them:
//
//   `normalizeHex`, which decides what may reach a `style` attribute at all. It is the only place in
//   this feature where a value somebody typed becomes markup.
//
//   `deepenInk`, which decides what may be SEEN. It never refuses (a refusal takes the choice away and
//   hands back nothing): it walks the colour along its own hue until it clears the floor.

const rgbHue = ([r, g, b]) => {
	const [rr, gg, bb] = [r / 255, g / 255, b / 255];
	const max = Math.max(rr, gg, bb);
	const d = max - Math.min(rr, gg, bb);
	if (!d) return 0;
	const h = max === rr ? 60 * (((gg - bb) / d) % 6)
		: max === gg ? 60 * (((bb - rr) / d) + 2)
		: 60 * (((rr - gg) / d) + 4);
	return ((h % 360) + 360) % 360;
};

/** The grounds a board is painted on in each theme, as the guard reads them with no document. */
const GROUNDS = [
	parseColour(RELMAP_GROUND_FALLBACK.light.page),
	parseColour(RELMAP_GROUND_FALLBACK.light.panel),
];
const DARK = [
	parseColour(RELMAP_GROUND_FALLBACK.dark.page),
	parseColour(RELMAP_GROUND_FALLBACK.dark.panel),
];
const worstOn = grounds => hex => Math.min(...grounds.map(ground => contrast(parseColour(hex), ground)));
const worst = worstOn(GROUNDS);
const worstDark = worstOn(DARK);

describe("what may become a colour on the board", () => {
	it("takes a hex the colour input actually hands back", () => {
		expect(normalizeHex("#A1263A")).toBe("#a1263a");
	});

	// A reader typing into the picker's text field writes these, and the element itself accepts them.
	it("expands the three-digit form somebody types", () => {
		expect(normalizeHex("#0AF")).toBe("#00aaff");
	});

	// ⚠ THE GATE BETWEEN A TYPED VALUE AND A `style` ATTRIBUTE. Everything this lets through is written
	// onto the board as CSS, so anything that is not exactly a colour is refused rather than repaired.
	it("refuses everything that is not one, rather than guessing", () => {
		for (const said of [
			"red", "rgb(1,2,3)", "#abcd", "#12345g", "", null, undefined, 0,
			"#a1263a; background:url(x)", "url(#x)", "var(--relmap-page)",
		]) {
			expect(normalizeHex(said), String(said)).toBe("");
		}
	});

	// The two notations this feature meets: a hex from the picker, and the `hsl()` every ink token in
	// the stylesheet is declared in, which is what `getComputedStyle` gives back for one.
	it("reads the notation the ink tokens are written in", () => {
		expect(parseColour("hsl(0deg 0% 100%)").map(Math.round)).toEqual([255, 255, 255]);
		expect(parseColour("hsl(350deg 62% 39%)").map(Math.round)).toEqual([161, 38, 58]);
		expect(parseColour("nonsense")).toBeNull();
	});

	it("does the WCAG sums the rest of this file rests on", () => {
		expect(luminance([255, 255, 255])).toBeCloseTo(1, 5);
		expect(luminance([0, 0, 0])).toBeCloseTo(0, 5);
		expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
	});
});

describe("a colour too pale to follow", () => {
	// The whole promise: nothing a reader picks is ever thrown away, and nothing unreadable is ever
	// drawn. Both halves, on the same colour.
	it("deepens a pale one until it clears the floor, and says it did", () => {
		const pale = "#ffe680";
		expect(worst(pale)).toBeLessThan(RELMAP_INK_FLOOR);
		const { hex, nudged, ratio } = deepenInk(pale, { grounds: GROUNDS });
		expect(nudged).toBe(true);
		expect(ratio).toBeGreaterThanOrEqual(RELMAP_INK_FLOOR);
		expect(worst(hex)).toBeGreaterThanOrEqual(RELMAP_INK_FLOOR);
	});

	// ⚠ THE COLOUR THEY CHOSE, NOT A COLOUR WE CHOSE. Somebody who picks a pale yellow wants a yellow
	// line; only the lightness moves, which is why this checks the hue and not the hex.
	it("keeps the hue it was given and moves only the lightness", () => {
		const { hex } = deepenInk("#ffe680", { grounds: GROUNDS });
		expect(rgbHue(parseColour(hex))).toBeCloseTo(rgbHue(parseColour("#ffe680")), 0);
	});

	it("leaves a colour that already reads exactly as it was", () => {
		const { hex, nudged } = deepenInk("#a1263a", { grounds: GROUNDS });
		expect(nudged).toBe(false);
		expect(hex).toBe("#a1263a");
	});

	// Deepening is what gets STORED, so it is read back and deepened again on every later open. A pass
	// that moved the colour a second time would walk a line darker every time it was looked at.
	it("settles, so a colour does not creep darker each time it is read", () => {
		const once = deepenInk("#ffe680", { grounds: GROUNDS }).hex;
		const twice = deepenInk(once, { grounds: GROUNDS });
		expect(twice.nudged).toBe(false);
		expect(twice.hex).toBe(once);
	});

	// A refusal the caller has to handle. Answering black would paint a line in a colour nobody picked.
	it("hands back nothing at all for something that is not a colour", () => {
		expect(deepenInk("banana", { grounds: GROUNDS })).toMatchObject({ hex: "", nudged: false });
	});

	// The direction is asked of the paper rather than assumed, so the same code serves the dark board,
	// where the way to gain contrast is UP.
	it("lightens instead of darkening when the paper is dark", () => {
		const { hex, nudged } = deepenInk("#221a2e", { grounds: DARK });
		expect(nudged).toBe(true);
		expect(luminance(parseColour(hex))).toBeGreaterThan(luminance(parseColour("#221a2e")));
		expect(worstDark(hex)).toBeGreaterThanOrEqual(RELMAP_INK_FLOOR);
	});
});

describe("how a stored ink is drawn", () => {
	it("sends one of the eight to its class and writes no colour", () => {
		expect(inkPaint("rose")).toEqual({ inkKey: "rose", inkHex: "" });
		expect(inkPaint("rose", { grounds: DARK })).toEqual({ inkKey: "rose", inkHex: "" });
	});

	it("sends a colour of the reader's own to the custom class, carrying itself", () => {
		expect(inkPaint("#a1263a")).toEqual({ inkKey: RELMAP_INK_CUSTOM, inkHex: "#a1263a" });
	});

	// ⚠ THE STORED HEX WAS CHECKED ON WHOEVER CHOSE IT'S PAPER, and the reader looking at it may be on the
	// other theme. A deep charcoal picked on the light board is no line at all on the dark one.
	it("shows a colour chosen on one theme at a tone the other can follow, without rewriting it", () => {
		const charcoal = "#1c1e22";
		expect(inkPaint(charcoal, { grounds: GROUNDS }).inkHex).toBe(charcoal);
		const onDark = inkPaint(charcoal, { grounds: DARK }).inkHex;
		expect(onDark).not.toBe(charcoal);
		expect(worstDark(onDark)).toBeGreaterThanOrEqual(RELMAP_INK_FLOOR);
	});

	it("gives the same tone back every time it is asked", () => {
		expect(legibleHex("#1c1e22", DARK)).toBe(legibleHex("#1c1e22", DARK));
		expect(legibleHex("not a colour", DARK)).toBe("");
	});
});

// ⚠ THE GUARD MEASURES AGAINST A COPY OF THE PAPER when there is no document to ask, which is every test
// in this file and the very first render. A copy that drifted from the real thing would be a guard
// passing colours against a page nobody has, and it would never fail anywhere else.
describe("the paper the guard measures against", () => {
	const tokens = selector => {
		const body = declarations(readCss(), selector) ?? "";
		return name => body.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();
	};

	it("matches the light theme's own grounds", () => {
		const token = tokens(".relmap-window");
		expect(token("--relmap-page")).toBe(RELMAP_GROUND_FALLBACK.light.page);
		expect(token("--relmap-panel")).toBe(RELMAP_GROUND_FALLBACK.light.panel);
	});

	it("matches the dark theme's own grounds", () => {
		const token = tokens(".relmap-window.theme-dark");
		expect(token("--relmap-page")).toBe(RELMAP_GROUND_FALLBACK.dark.page);
		expect(token("--relmap-panel")).toBe(RELMAP_GROUND_FALLBACK.dark.panel);
	});
});

// ── The forty the palette offers ────────────────────────────────────────────
//
// ⚠ THE WHOLE CLAIM THIS LIST MAKES is that a swatch shows the colour that lands on the board. A colour
// edited by eye looks perfectly reasonable in the panel and paints a line a reader on a magnifier cannot
// follow, so every one of them is measured here, against the same grounds and the same floor `deepenInk`
// uses.
describe("the colours the palette offers that nobody named", () => {
	const HEXES = RELMAP_INK_PRESETS.map(one => one.hex);

	it("offers a whole grid of them, every one a hex this feature can store", () => {
		expect(HEXES.length).toBe(40);
		expect(HEXES.length % RELMAP_INK_ACROSS).toBe(0);
		for (const hex of HEXES) expect(normalizeHex(hex), hex).toBe(hex);
	});

	it("clears the floor against BOTH the page and the panel tone of the light board", () => {
		for (const hex of HEXES) {
			expect(worst(hex), `${hex} measures ${worst(hex).toFixed(2)}:1`)
				.toBeGreaterThanOrEqual(RELMAP_INK_FLOOR);
		}
	});

	// The half of the promise that a contrast check alone would not catch: a colour that clears the
	// floor only by being deepened on arrival is one whose swatch lies about the line.
	it("is left exactly as it is by the guard on the light board, so no swatch lies about it", () => {
		for (const hex of HEXES) {
			const { hex: out, nudged } = deepenInk(hex, { grounds: GROUNDS });
			expect(nudged, `${hex} had to be deepened`).toBe(false);
			expect(out).toBe(hex);
		}
	});

	// On the dark board every swatch is SHOWN at the tone its line is drawn at (`legibleHex`), so what
	// has to hold there is that the tone shown can be followed, and is still that colour.
	it("is shown on the dark board at a tone that can be followed, in its own hue", () => {
		for (const hex of HEXES) {
			const shown = legibleHex(hex, DARK);
			expect(worstDark(shown), `${hex} is shown as ${shown}`).toBeGreaterThanOrEqual(RELMAP_INK_FLOOR);
			const [start, end] = [parseColour(hex), parseColour(shown)];
			if (Math.max(...start) - Math.min(...start) > 40) {
				const turned = Math.abs(rgbHue(start) - rgbHue(end));
				expect(Math.min(turned, 360 - turned), `${hex} changed hue`).toBeLessThan(6);
			}
		}
	});

	// Two swatches the same colour are one swatch and one dead cell. Measured as a plain rgb distance,
	// which is crude and is the point: it catches a duplicate and a near-duplicate.
	it("gives no two of them the same colour, or near enough to be", () => {
		const rgb = HEXES.map(parseColour);
		for (let i = 0; i < rgb.length; i += 1) {
			for (let j = i + 1; j < rgb.length; j += 1) {
				const apart = Math.hypot(...rgb[i].map((v, at) => v - rgb[j][at]));
				expect(apart, `${HEXES[i]} and ${HEXES[j]} are ${apart.toFixed(0)} apart`)
					.toBeGreaterThan(20);
			}
		}
	});

	// ⚠ AND NONE OF THEM MAY BE ONE OF THE EIGHT WEARING A HEX. A preset sitting on top of a named ink
	// looks identical in the palette and draws a WORSE line: no dash pattern of its own, and no retuning
	// on the high-contrast board.
	it("stands clear of all eight named inks, which draw a better line", () => {
		const root = declarations(readCss(), ".relmap-window");
		for (const key of RELMAP_INKS) {
			const named = parseColour(
				root.match(new RegExp(`--relmap-ink-${key}\\s*:\\s*([^;]+);`))?.[1]?.trim(),
			);
			expect(named, `--relmap-ink-${key}`).toBeTruthy();
			for (const hex of HEXES) {
				const apart = Math.hypot(...parseColour(hex).map((v, at) => v - named[at]));
				expect(apart, `${hex} is ${apart.toFixed(0)} from ${key}`).toBeGreaterThan(20);
			}
		}
	});

	// ⚠ THE KEYS ARE NAMES AND NOTHING ELSE, and a missing one is a swatch whose tooltip reads "undefined",
	// on a palette where the tooltip is the whole of what a reader who chooses by reading has left.
	it("names every one of them, and reuses none of the eight's names", () => {
		const lang = JSON.parse(readFileSync("languages/en.json", "utf8"));
		const said = lang.RELMAP.inkPresets ?? {};
		const eight = RELMAP_INKS.map(key => lang.RELMAP.inks[key]);
		expect(Object.keys(said).length).toBe(RELMAP_INK_PRESETS.length);
		for (const { key } of RELMAP_INK_PRESETS) {
			expect(said[key], `RELMAP.inkPresets.${key}`).toBeTruthy();
			expect(eight, `${key} is one of the eight's names`).not.toContain(said[key]);
		}
		expect(new Set(Object.values(said)).size).toBe(RELMAP_INK_PRESETS.length);
	});
});

// ⚠ THE ARROW KEYS, HELD TO THE GRID THEY WALK. Up and Down in the palette step by a row, and a row is
// `RELMAP_INK_ACROSS`, so a stylesheet laid out to some other width leaves the keyboard moving
// diagonally through the colours, which nothing using a mouse would ever notice.
describe("how wide the palette is laid out", () => {
	const GRID = declarations(readCss(), ".relmap-inkpop-grid");

	it("paints the grid at exactly the width the arrow keys step by", () => {
		expect(GRID, ".relmap-inkpop-grid").toBeTruthy();
		expect(GRID).toMatch(
			new RegExp(`grid-template-columns:\\s*repeat\\(${RELMAP_INK_ACROSS},`),
		);
	});
});
