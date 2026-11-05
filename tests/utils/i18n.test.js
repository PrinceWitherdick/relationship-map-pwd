import { afterEach, describe, expect, it } from "vitest";
import { listOf } from "../../module/utils/i18n.js";

// A few names in a row inside a localized sentence ("Played by Alex, Sam"; "Elena, the Elder,
// deceased") were joined with a literal ", " that no translator could reach. They go through the
// world's own list formatter where there is one, and the comma stands in where there is not.
describe("a list of names in a sentence", () => {
	const table = globalThis.game.i18n;
	afterEach(() => { globalThis.game.i18n = table; });

	it("joins with the plain comma where the client has no list formatter, as the tests' table has none", () => {
		expect(listOf(["Elena", "the Elder", "deceased"])).toBe("Elena, the Elder, deceased");
		expect(listOf(["Alone"])).toBe("Alone");
		expect(listOf([])).toBe("");
		expect(listOf(null)).toBe("");
	});

	it("asks Foundry's list formatter for a short list of units, so another tongue gets its own mark", () => {
		const asked = [];
		globalThis.game.i18n = {
			...table,
			getListFormatter: options => { asked.push(options); return new Intl.ListFormat("ja", options); },
		};
		expect(listOf(["A", "B", "C"])).toBe("A B C");
		expect(asked).toEqual([{ style: "short", type: "unit" }]);
		// And in English the formatter says exactly what the comma said, so nothing at the table changes.
		globalThis.game.i18n = { ...table, getListFormatter: options => new Intl.ListFormat("en", options) };
		expect(listOf(["Elena", "the Elder", "deceased"])).toBe("Elena, the Elder, deceased");
	});
});
