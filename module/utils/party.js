// Who the player characters are, in a world this module knows nothing else about.
//
// A system decides what a player character IS, and every system decides differently: dnd5e calls
// them `character` beside `npc`, `vehicle` and `group`; other systems have one actor type for
// everybody, or five. So this asks the two things every Foundry world can answer, in order:
//
//  1. THE CHARACTER EACH PLAYER HAS BEEN GIVEN (User Configuration, "Character"). That is a person
//     at the table saying "this one is mine", and it is the most reliable answer there is.
//  2. EVERY OTHER ACTOR A PLAYER OWNS, OF THE SAME KINDS. A table that never assigns characters
//     still gives each player ownership of their own sheet. Kept to the actor types the assigned
//     characters already have, so a player's horse, familiar or ship does not join the party; when
//     nobody has an assigned character, a type called `character` is taken as that kind if the
//     system has one, and failing that every player-owned actor counts.
//
// The person chooser lists whoever this returns under "Player characters" (utils/people-groups.js).
// A guess that includes one actor too many costs nothing more than a name in the wrong list.

/**
 * @returns {Array<Actor>} the party, by name, ties broken by id so every client agrees on the order.
 */
export function partyCharacters() {
	const actors = globalThis.game?.actors?.contents ?? [];
	const users = globalThis.game?.users?.contents ?? [];

	const assigned = users
		.filter(user => !user?.isGM && user?.character)
		.map(user => user.character)
		.filter(actor => actor?.id && !actor.pack);

	let kinds = new Set(assigned.map(actor => actor.type));
	if (!kinds.size) {
		const types = globalThis.game?.system?.documentTypes?.Actor;
		const known = types ? Object.keys(types) : [];
		kinds = known.includes("character") ? new Set(["character"]) : null;
	}

	const owned = actors.filter(actor => actor?.hasPlayerOwner && (!kinds || kinds.has(actor.type)));

	const byId = new Map();
	for (const actor of [...assigned, ...owned]) {
		if (actor?.id && !byId.has(actor.id)) byId.set(actor.id, actor);
	}
	return [...byId.values()].sort(byName);
}

/** Is this actor one of the party, by the same rule? */
export function isPartyMember(actor) {
	if (!actor?.id) return false;
	return partyCharacters().some(member => member.id === actor.id);
}

function byName(a, b) {
	const an = String(a?.name ?? "");
	const bn = String(b?.name ?? "");
	return an === bn ? String(a?.id ?? "").localeCompare(String(b?.id ?? "")) : an.localeCompare(bn);
}
