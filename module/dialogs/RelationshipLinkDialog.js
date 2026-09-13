// WHO to draw a line on a relationship map to, and who to put on one.
//
// What a line SAYS is asked on the tie bar over the line itself (utils/relmap-tie-bar.js). What is
// left here is the people pickers, which are a different question and still a real one: choosing one
// face out of a whole world is exactly what a window with a search field is for.

import { pickPerson } from "./PersonPickerDialog.js";
import { groupPeople, personNote } from "../utils/people-groups.js";
import { portraitOrNone } from "../utils/portrait.js";
import { format, localize } from "../utils/i18n.js";

/**
 * Ask which person this is about, off a rail of lists.
 *
 * A ROW CARRIES ITS ACTOR, where there is one. That is what sorts the lists, and it is also the face on
 * the row: a column of names with a picture beside each is read at a glance where a column of identical
 * figures has to be read a line at a time. A person with no actor behind them is still offered, under
 * "Everyone else".
 */
export function pickPersonOnMap({
	options = [], title = "", buttonLabel = "", formatLabel = null, formatManyLabel = null,
	icon = "", multiple = false, hint = "",
} = {}) {
	const people = options.map(option => {
		const actor = option.actor ?? null;
		const portrait = portraitOrNone(actor?.img ?? option.img ?? "");
		return {
			id: option.id,
			name: option.name,
			// What a caller said about this person if it said anything, and otherwise who plays them
			// or the folder they are filed in. See personNote.
			hint: option.hint || personNote(actor),
			actor,
			img: portrait.src ?? "",
			imgStyle: portrait.style ?? "",
		};
	});
	return pickPerson({
		title: title || localize("RELMAP.linkPickTitle"),
		buttonLabel: buttonLabel || localize("RELMAP.choose"),
		formatLabel, formatManyLabel, icon, multiple, hint,
		groups: groupPeople(people),
	});
}

/**
 * Ask which person on the map to draw a line to.
 *
 * The button names the person once one is picked, and names the act rather than the press: the line
 * is drawn the moment this window closes, and "Draw a line to Maeve" is the promise it keeps.
 *
 * ONE ANSWER, where "who goes on the map" takes several. A line is between two people and what it says
 * is written on it afterwards, so half a dozen at once would be half a dozen blank lines.
 */
export function pickPersonToLink({ from = "", options = [] } = {}) {
	return pickPersonOnMap({
		options,
		title: from
			? format("RELMAP.linkFromTitle", { name: from })
			: localize("RELMAP.linkPickTitle"),
		icon: "fa-pen-nib",
		formatLabel: name => format("RELMAP.linkToNamed", { name }),
	});
}

/**
 * Ask who goes on the map. Settles on an ARRAY of ids, or null if the reader backed out.
 *
 * AS MANY AS THEY LIKE. A board is set up by putting a household or a faction on it, and asking one
 * name at a time meant reopening this window and typing into the find box again for every person. The
 * names are seated in one write, so it is also one step to undo.
 */
export function pickPersonToAdd({ options = [] } = {}) {
	return pickPersonOnMap({
		options,
		multiple: true,
		title: localize("RELMAP.addTitle"),
		hint: localize("RELMAP.addPickHint"),
		buttonLabel: localize("RELMAP.choose"),
		icon: "fa-user-plus",
		formatLabel: name => format("RELMAP.addNamed", { name }),
		formatManyLabel: count => format("RELMAP.addNamedCount", { count }),
	});
}
