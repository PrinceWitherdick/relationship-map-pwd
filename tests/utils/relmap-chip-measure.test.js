import { describe, it, expect, afterEach, vi } from "vitest";
import { boardFontFamily, canvasChipMeasure } from "../../module/utils/relmap-chip-measure.js";
import { chipWidthPx, setChipTextMeasure } from "../../module/utils/relmap-geometry.js";

// A TAG CHIP'S WIDTH IN THE BOARD'S OWN FONT (utils/relmap-chip-measure.js): the board takes core's
// body font, which each system may change, so the pills are measured on a canvas in that face and the
// geometry's table is only the fallback.

/** A page whose root says `vars`, with a canvas that measures every character `perChar` wide. */
function fakeDoc({ vars = {}, perChar = 8, loaded = true } = {}) {
	const measured = [];
	const ctx = { font: "", measureText: text => { measured.push(ctx.font); return { width: [...text].length * perChar }; } };
	return {
		documentElement: {},
		defaultView: { getComputedStyle: () => ({ getPropertyValue: name => vars[name] ?? "" }) },
		createElement: () => ({ getContext: () => ctx }),
		fonts: { check: () => loaded },
		measured,
	};
}

afterEach(() => setChipTextMeasure(null));

describe("the board's font", () => {
	it("is core's body font, then its primary font, then Signika, as the stylesheet's token reads", () => {
		expect(boardFontFamily(fakeDoc({ vars: { "--font-body": "Roboto", "--font-primary": "Signika" } }))).toBe("Roboto");
		expect(boardFontFamily(fakeDoc({ vars: { "--font-primary": "Modesto" } }))).toBe("Modesto");
		expect(boardFontFamily(fakeDoc())).toBe("Signika, sans-serif");
	});
});

describe("measuring a pill's words", () => {
	it("measures at the pill's weight and size in that font, with its letter-spacing after every letter", () => {
		const doc = fakeDoc({ vars: { "--font-body": "Roboto" } });
		const measure = canvasChipMeasure(doc);
		expect(measure("DEAD")).toBeCloseTo(4 * 8 + 4 * 0.65);
		expect(doc.measured.at(-1)).toBe("600 13px Roboto");
	});

	it("reads the font off the page once per pass, and afresh on the next one", async () => {
		const vars = { "--font-body": "Roboto" };
		const doc = fakeDoc({ vars });
		let reads = 0;
		const getComputedStyle = doc.defaultView.getComputedStyle;
		doc.defaultView.getComputedStyle = el => { reads++; return getComputedStyle(el); };
		const measure = canvasChipMeasure(doc);
		measure("DEAD");
		measure("NOBLE");
		measure("KIN");
		expect(reads).toBe(1);
		await Promise.resolve();
		vars["--font-body"] = "Modesto";
		measure("DEAD");
		expect(reads).toBe(2);
		expect(doc.measured.at(-1)).toBe("600 13px Modesto");
	});

	it("answers nothing while the face is still loading, so the table stands in", () => {
		expect(canvasChipMeasure(fakeDoc({ loaded: false }))("DEAD")).toBeNull();
	});

	it("asks for a face that has not loaded, once, and says when it has", async () => {
		const doc = fakeDoc({ vars: { "--font-body": "Roboto" }, loaded: false });
		let land;
		doc.fonts.load = vi.fn(() => new Promise(done => { land = done; }));
		const onFaceLoaded = vi.fn();
		const measure = canvasChipMeasure(doc, { onFaceLoaded });
		expect(measure("DEAD")).toBeNull();
		expect(measure("NOBLE")).toBeNull();
		expect(doc.fonts.load).toHaveBeenCalledTimes(1);
		expect(doc.fonts.load).toHaveBeenCalledWith("600 13px Roboto");
		expect(onFaceLoaded).not.toHaveBeenCalled();
		doc.fonts.check = () => true;
		land();
		await Promise.resolve();
		await Promise.resolve();
		expect(onFaceLoaded).toHaveBeenCalledTimes(1);
		expect(measure("DEAD")).toBeCloseTo(4 * 8 + 4 * 0.65);
	});

	it("is no measure at all where there is no canvas", () => {
		expect(canvasChipMeasure({ createElement: () => ({ getContext: () => null }) })).toBeNull();
	});

	it("is what the geometry packs by once installed, rounded up a pixel, and the table otherwise", () => {
		const table = chipWidthPx({ name: "Dead" });
		setChipTextMeasure(canvasChipMeasure(fakeDoc({ perChar: 5 })));
		// border and padding 16, then ceil(4 x 5 + 4 x 0.65) + 1
		expect(chipWidthPx({ name: "Dead" })).toBe(16 + 23 + 1);
		expect(chipWidthPx({ name: "Dead", icon: "fa-skull" })).toBe(16 + 21 + 24);
		setChipTextMeasure(null);
		expect(chipWidthPx({ name: "Dead" })).toBe(table);
	});
});
