import { describe, it, expect } from "vitest";
import { readCss, readRepo, declarations, declared } from "../fakes/css.js";

// CORE'S CREATE ACTOR DIALOG IN THIS MODULE'S FRAME (utils/create-person.js), and what the frame
// must leave alone.

const RAW = readRepo("styles/relationship-map.css");
const CSS = readCss();

describe("the Create Actor dialog's skin", () => {
	// A FONT AWESOME GLYPH IS A CSS ESCAPE, and an escape written through a shell that eats one
	// backslash lands as a raw control byte: `\f234` became a form feed, which CSS reads as a newline,
	// so the string was thrown away and the title bar lost its icon with nothing to say so.
	it("holds no control characters a shell could have left for an escape", () => {
		const stray = [];
		RAW.split("\n").forEach((line, i) => {
			for (const ch of line) {
				const code = ch.charCodeAt(0);
				if ((code < 0x20 && ch !== "\t" && ch !== "\r") || code === 0x7f) {
					stray.push(`line ${i + 1}: U+${code.toString(16).padStart(4, "0")}`);
				}
			}
		});
		expect(stray).toEqual([]);
	});

	it("draws the user-plus glyph before the title", () => {
		const body = declarations(CSS, ".relmap-create-person-dialog .window-header .window-title::before");
		expect(body).toBeTruthy();
		expect(declared(body, "content")).toBe(String.raw`"\f234"`);
	});

	// A system's own creation dialog wears the same classes, but has no core `.dialog-content` or
	// `.form-footer` to take back the padding the skin moves inwards.
	it("gives a system's own creation form its padding back", () => {
		const body = declarations(CSS, ".relmap-create-person-dialog.application .window-content:not(:has(> .dialog-form))");
		expect(body).toBeTruthy();
		expect(declared(body, "padding")).toBe("revert-layer");
	});
});
