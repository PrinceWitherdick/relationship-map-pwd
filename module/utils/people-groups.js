// Everybody in a world, sorted into lists a reader can find somebody in.
//
// THE PLAYER CHARACTERS FIRST, then one list per KIND of actor the system has (its own words for
// them: "Character", "NPC", "Vehicle", whatever the system calls them), then anybody on a board with
// no actor behind them at all. A module that knows nothing about the system it runs on cannot sort a
// town into residents and visitors, but every system already names its actor types, and a
// reader looking for "the smuggler" knows whether they are after a character or an NPC.
//
// EMPTY LISTS ARE NOT OFFERED. A rail with "Vehicles (0)" on it is a tab that can only disappoint.

import { byName, partyCharacters } from "./party.js";
import { format, localize } from "./i18n.js";

export const PEOPLE_GROUP_PLAYERS = "players";
export const PEOPLE_GROUP_OTHERS = "others";

/** The list for one actor type: its key, and the system's own name and icon for it. */
function typeGroup(type) {
	const key = `type:${type}`;
	const labelKey = globalThis.CONFIG?.Actor?.typeLabels?.[type];
	const named = labelKey ? localize(labelKey) : "";
	const label = named && named !== labelKey ? named : capitalize(type);
	const icon = globalThis.CONFIG?.Actor?.typeIcons?.[type] || "fa-user";
	return { key, label, hint: format("RELMAP.people.groupHints.type", { type: label }), icon };
}

/** The order the system declares its actor types in, which is the order its own create dialog uses. */
function typeOrder() {
	const declared = globalThis.game?.documentTypes?.Actor
		?? Object.keys(globalThis.game?.system?.documentTypes?.Actor ?? {});
	return (Array.isArray(declared) ? declared : []).filter(type => type !== "base");
}

/**
 * Who somebody is, in the few words a list of names has room for.
 *
 * For a player character, who plays them: the name a table actually uses for "that one". For anybody
 * else, the folder they are filed in, which is how a GM already sorts a world's people.
 */
export function personNote(actor) {
	if (!actor) return "";
	const users = globalThis.game?.users?.contents ?? [];
	const players = users.filter(user => !user?.isGM && (
		user?.character?.id === actor.id
		|| (actor.hasPlayerOwner && actor.testUserPermission?.(user, "OWNER"))
	));
	if (players.length) {
		return format("RELMAP.people.playedBy", { names: players.map(user => user.name).join(", ") });
	}
	return actor.folder?.name ?? "";
}

/**
 * Sort people into their lists, dropping the lists nobody is on.
 *
 * Each person keeps whatever fields they arrived with (a portrait, a note, the id the caller means to
 * get back); only `actor` is read here, and only to decide the list.
 *
 * @param {Array<{id: string, name: string, actor?: Actor|null}>} people
 * @returns {Array<{key: string, label: string, hint: string, icon: string, people: Array}>}
 */
export function groupPeople(people) {
	const party = new Set(partyCharacters().map(actor => actor.id));
	const groups = new Map();
	const groupFor = (key, make) => {
		if (!groups.has(key)) groups.set(key, { ...make(), people: [] });
		return groups.get(key);
	};

	for (const person of people ?? []) {
		const actor = person?.actor ?? null;
		let group;
		if (!actor) {
			group = groupFor(PEOPLE_GROUP_OTHERS, () => ({
				key: PEOPLE_GROUP_OTHERS,
				label: localize("RELMAP.people.groups.others"),
				hint: localize("RELMAP.people.groupHints.others"),
				icon: "fa-user",
			}));
		} else if (party.has(actor.id)) {
			group = groupFor(PEOPLE_GROUP_PLAYERS, () => ({
				key: PEOPLE_GROUP_PLAYERS,
				label: localize("RELMAP.people.groups.players"),
				hint: localize("RELMAP.people.groupHints.players"),
				icon: "fa-users",
			}));
		} else {
			group = groupFor(`type:${actor.type}`, () => typeGroup(actor.type));
		}
		group.people.push(person);
	}

	const order = typeOrder();
	const rank = key => {
		if (key === PEOPLE_GROUP_PLAYERS) return -1;
		if (key === PEOPLE_GROUP_OTHERS) return Number.MAX_SAFE_INTEGER;
		const at = order.indexOf(key.slice("type:".length));
		return at < 0 ? order.length : at;
	};
	return [...groups.values()]
		.sort((a, b) => (rank(a.key) - rank(b.key)) || a.label.localeCompare(b.label))
		.map(group => ({ ...group, people: [...group.people].sort(byName) }));
}

function capitalize(text) {
	const s = String(text ?? "");
	return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
