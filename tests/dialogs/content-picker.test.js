import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// THE LABELLED NAME BOXES a new collection and its first map are asked for in. What is asserted is
// the contract the caller relies on: one window, a box per field under its own label, every value
// trimmed, a blank answered as "", a dismissal as null, and typed text never read as markup.

import { promptForLines, promptForText, promptForTexts, splitLines } from "../../module/dialogs/content-picker.js";

let asked;
const savedDocument = globalThis.document;
const savedApi = foundry.applications;

beforeEach(() => {
	asked = null;
	globalThis.document = { createElement: () => ({ innerHTML: "" }) };
	foundry.applications = {
		api: {
			DialogV2: {
				prompt: vi.fn(config => { asked = config; return Promise.resolve("answered"); }),
			},
		},
	};
});

afterEach(() => {
	globalThis.document = savedDocument;
	foundry.applications = savedApi;
});

const FIELDS = [
	{ name: "collection", label: "Collection", placeholder: "The campaign" },
	{ name: "map", label: "First map", placeholder: "The court" },
];

/** Press the confirm button on a form holding these values. */
function press(values) {
	const form = { elements: { namedItem: name => (name in values ? { value: values[name] } : null) } };
	return asked.ok.callback({}, { form });
}

describe("several names asked at once", () => {
	it("asks in one window, a labelled box per field, with the lead line above them", async () => {
		await promptForTexts({ title: "New relationship map", buttonLabel: "Make it", lead: "Name both.", fields: FIELDS });
		expect(foundry.applications.api.DialogV2.prompt).toHaveBeenCalledTimes(1);
		expect(asked.window.title).toBe("New relationship map");
		expect(asked.ok.label).toBe("Make it");
		expect(asked.rejectClose).toBe(false);
		const html = asked.content.innerHTML;
		expect(html).toContain("Name both.");
		expect(html.match(/<input /g)).toHaveLength(2);
		expect(html.indexOf('name="collection"')).toBeLessThan(html.indexOf('name="map"'));
		expect(html).toContain(">Collection<");
		expect(html).toContain(">First map<");
		expect(html).toContain('placeholder="The court"');
		expect(html).toContain('value=""');
	});

	// The module's dialog frame (styles/relationship-map.css `.relmap-dialog`) and its slate confirm.
	// An icon only when asked for: core draws an empty one as an icon all the same.
	it("wears this module's dialog frame, with the confirm in slate and the glyph it is given", async () => {
		await promptForTexts({ title: "t", buttonLabel: "b", icon: "fa-solid fa-plus", fields: FIELDS });
		expect(asked.classes).toEqual(expect.arrayContaining(["relmap-window", "relmap-dialog"]));
		expect(asked.ok.class).toBe("relmap-cta");
		expect(asked.window.icon).toBe("fa-solid fa-plus");
		await promptForText({ title: "t", buttonLabel: "b" });
		expect("icon" in asked.window).toBe(false);
	});

	it("answers every field by its name, trimmed, and a blank one as an empty string", async () => {
		await promptForTexts({ title: "t", buttonLabel: "b", fields: FIELDS });
		expect(press({ collection: "  The Court  ", map: "" })).toEqual({ collection: "The Court", map: "" });
		expect(press({ collection: "x" })).toEqual({ collection: "x", map: "" });
	});

	// Labels, values and placeholders can all be text somebody at the table typed.
	it("prints typed text as text, never as markup", async () => {
		await promptForTexts({
			title: "t", buttonLabel: "b", lead: "<b>lead</b>",
			fields: [{ name: "n", label: "<i>x</i>", value: '"><script>', placeholder: "<p>" }],
		});
		const html = asked.content.innerHTML;
		expect(html).not.toMatch(/<b>|<i>|<script>|<p>/);
		expect(html).toContain("&lt;b&gt;lead&lt;/b&gt;");
	});

	it("leaves the lead line out when there is none", async () => {
		await promptForTexts({ title: "t", buttonLabel: "b", fields: FIELDS });
		expect(asked.content.innerHTML).not.toContain("relmap-text-prompt-lead");
	});

	/** A text box that remembers the keydown listener it was given. */
	const box = () => {
		const it = { focus: vi.fn(), select: vi.fn(), keydown: null };
		it.addEventListener = vi.fn((type, fn) => { if (type === "keydown") it.keydown = fn; });
		return it;
	};

	it("puts the focus in the first box once the window is on screen", async () => {
		await promptForTexts({ title: "t", buttonLabel: "b", fields: FIELDS });
		const [first, second] = [box(), box()];
		const root = { querySelectorAll: vi.fn(() => [first, second]) };
		asked.render({}, { element: root });
		expect(root.querySelectorAll.mock.calls[0][0]).toContain("input");
		expect(first.focus).toHaveBeenCalled();
		expect(first.select).toHaveBeenCalled();
		expect(second.focus).not.toHaveBeenCalled();
	});

	// ⚠ ENTER IN THE FIRST BOX WOULD SUBMIT THE FORM, taking the second name as blank unseen.
	it("moves Enter down to the next box, and leaves Enter in the last box to confirm", async () => {
		await promptForTexts({ title: "t", buttonLabel: "b", fields: FIELDS });
		const [first, second] = [box(), box()];
		asked.render({}, { element: { querySelectorAll: () => [first, second] } });
		const enter = { key: "Enter", isComposing: false, preventDefault: vi.fn() };
		first.keydown(enter);
		expect(enter.preventDefault).toHaveBeenCalled();
		expect(second.focus).toHaveBeenCalled();
		expect(second.select).toHaveBeenCalled();
		expect(second.keydown).toBeNull();
		// Any other key, or an Enter that finishes an input-method composition, is left alone.
		const typing = { key: "a", preventDefault: vi.fn() };
		first.keydown(typing);
		const composing = { key: "Enter", isComposing: true, preventDefault: vi.fn() };
		first.keydown(composing);
		expect(typing.preventDefault).not.toHaveBeenCalled();
		expect(composing.preventDefault).not.toHaveBeenCalled();
	});
});

describe("one name asked", () => {
	it("is the same window with one box, answering a string, or null when dismissed", async () => {
		const answer = promptForText({ title: "Rename", buttonLabel: "Save", value: "Old" });
		expect(asked.content.innerHTML).toContain('name="relmapText"');
		expect(asked.content.innerHTML).toContain('value="Old"');
		expect(press({ relmapText: "  New  " })).toEqual({ relmapText: "New" });
		// The window resolves to the callback's answer; the stub resolves "answered", which has no box.
		await expect(answer).resolves.toBeNull();
		foundry.applications.api.DialogV2.prompt.mockResolvedValueOnce({ relmapText: "New" });
		await expect(promptForText({ title: "t", buttonLabel: "b" })).resolves.toBe("New");
		foundry.applications.api.DialogV2.prompt.mockResolvedValueOnce(null);
		await expect(promptForText({ title: "t", buttonLabel: "b" })).resolves.toBeNull();
	});
});

// THE TAGS UNDER A NAME, asked for as a few lines in one box. The contract the window relies on: the
// box opens on the lines it was given, what comes back is the lines typed (trimmed, blanks dropped)
// with the choice beside them, null for a dismissal, and typed text is never read as markup.
describe("a few lines asked for in one box", () => {
	it("opens on the lines it was given, one per line, and never reads them as markup", async () => {
		await promptForLines({
			title: "Tags for Elena", buttonLabel: "Save", lines: ["the Elder", "<b>deceased</b>"],
			hint: "One per line.", placeholder: "The Iron Knight",
		});
		expect(foundry.applications.api.DialogV2.prompt).toHaveBeenCalledTimes(1);
		expect(asked.window.title).toBe("Tags for Elena");
		expect(asked.ok.label).toBe("Save");
		expect(asked.rejectClose).toBe(false);
		const html = asked.content.innerHTML;
		expect(html).toContain('<textarea name="relmapLines" rows="3" autofocus');
		expect(html).toContain("the Elder\n&lt;b&gt;deceased&lt;/b&gt;</textarea>");
		expect(html).not.toContain("<b>");
		expect(html).toContain('placeholder="The Iron Knight"');
		expect(html).toContain(">One per line.</p>");
	});

	it("answers the lines typed, trimmed, with the blank ones dropped, and no choice where none was asked", async () => {
		await promptForLines({ title: "Tags", buttonLabel: "Save" });
		expect(asked.content.innerHTML).not.toContain("fieldset");
		expect(press({ relmapLines: "  the Elder \n\n deceased\r\n   \n" })).toEqual({ lines: ["the Elder", "deceased"], choice: null });
		expect(press({ relmapLines: "" })).toEqual({ lines: [], choice: null });
		expect(press({})).toEqual({ lines: [], choice: null });
	});

	// ONE CHOICE OFF A SHORT ROW with the lines (where the name and tags stand): a fieldset of radios
	// under the hint, the caller's value checked where it is one of the options and the first otherwise,
	// and the answer carries the lines and the choice together.
	it("asks one choice off a row of radios under the lines, and answers both together", async () => {
		const choice = { label: "Where <they> go", name: "relmapSide", value: "right", options: [
			{ value: "below", label: "Below" }, { value: "above", label: "Above" },
			{ value: "left", label: "Left" }, { value: "right", label: "Right" },
		] };
		await promptForLines({ title: "Tags", buttonLabel: "Save", hint: "One per line.", choice });
		const html = asked.content.innerHTML;
		expect(html).toContain('<legend class="relmap-text-prompt-label">Where &lt;they&gt; go</legend>');
		expect(html.match(/<input type="radio" name="relmapSide"/g)).toHaveLength(4);
		expect(html).toContain('<input type="radio" name="relmapSide" value="right" checked><span>Right</span>');
		expect(html.match(/ checked>/g)).toHaveLength(1);
		expect(html.indexOf("relmapLines")).toBeLessThan(html.indexOf("One per line."));
		expect(html.indexOf("One per line.")).toBeLessThan(html.indexOf("relmap-text-prompt-choice"));
		expect(press({ relmapLines: "a\nb", relmapSide: "left" })).toEqual({ lines: ["a", "b"], choice: "left" });
		// A form that says nothing about the row answers what was checked when it opened.
		expect(press({ relmapLines: "" })).toEqual({ lines: [], choice: "right" });
	});

	it("checks the first option when the value it is given is none of them", async () => {
		await promptForLines({ title: "Tags", buttonLabel: "Save", choice: {
			label: "Where", name: "relmapSide", value: "sideways",
			options: [{ value: "below", label: "Below" }, { value: "above", label: "Above" }],
		} });
		expect(asked.content.innerHTML).toContain('value="below" checked>');
		expect(asked.content.innerHTML.match(/ checked>/g)).toHaveLength(1);
		expect(press({})).toEqual({ lines: [], choice: "below" });
	});

	// The caret goes to the END of what is there: a reader adding a line must not type over the first.
	it("puts the caret after the last line rather than selecting everything", async () => {
		await promptForLines({ title: "Tags", buttonLabel: "Save", lines: ["the Elder"] });
		const box = { value: "the Elder", focus: vi.fn(), setSelectionRange: vi.fn() };
		asked.render({}, { element: { querySelector: () => box } });
		expect(box.focus).toHaveBeenCalled();
		expect(box.setSelectionRange).toHaveBeenCalledWith(9, 9);
	});

	it("splits lines the same way on its own", () => {
		expect(splitLines("a\nb")).toEqual(["a", "b"]);
		expect(splitLines(null)).toEqual([]);
	});
});
