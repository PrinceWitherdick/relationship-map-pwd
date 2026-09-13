// "The Party": a board of its own, seated with the player characters.
//
// WHAT IT IS AND WHY IT IS A PAGE. Nobody should have to put the party on a map by hand, so every map
// gives itself a board called "The Party" and seats the player characters on it. It could have been a
// computed VIEW; it is a real page instead because a page can be ARRANGED. A face stays where somebody
// drags it and a line drawn between two of them stays drawn, and none of that survives a board that
// works itself out again on every open.
//
// ⚠ TWO RULES, AND BOTH ARE ABOUT NOT UNDOING SOMEBODY'S WORK.
//  • It only ever ADDS. It never removes a person, never draws or removes a line, and never moves
//    anybody who is already placed.
//  • It REMEMBERS WHO IT HAS HANDED OVER. Who counts as a player character is a guess in a module that
//    knows nothing about the system it runs on (utils/party.js), and a guess that includes one actor
//    too many must cost one removal, once. So every identity the board has been handed is written
//    down beside the graph, and the automatic pass offers only people it has never handed over.
//    Taking somebody off therefore sticks; dragging them back on, or "Add someone", is the way back.
//
// The mark that says "this map has had its party board" lives on the ENTRY (see relmap-doc.js), so
// deleting the board is an answer that stands.

import { nodeIdentity, seatArrivals } from "./relmap-store.js";

/**
 * The flag, on the ENTRY, that says this map has already been given its party board.
 *
 * ⚠ ON THE ENTRY AND NOT ON THE PAGE, which is the whole of what makes the board deletable. A mark
 * on the page vanishes with the page, so "never made" and "made and then deleted" would read the same
 * and the next open would put it straight back.
 */
export const RELMAP_PARTY_MARK = "partyBoard";

/**
 * The flag, on the PAGE, that says which board is the party board, and holds its ledger:
 * `{ seated: [identity, ...] }`.
 *
 * BY A FLAG AND NOT BY ITS NAME. The page is renameable like any other, and a table that calls it
 * "The Six" or "Us" must not thereby get a second one on the next open.
 */
export const RELMAP_PARTY_FLAG = "relationshipPartyBoard";

/**
 * What seating or topping up the party board would ADD to a graph, and the ledger to write beside it.
 *
 * PURE, and separate from the writing, so what the caller reports is what was actually built.
 *
 * WHO IS OFFERED A SEAT: a party member who is not on the board AND has never been handed to it.
 *
 * WHAT THE LEDGER HOLDS: everybody the board was handed before, everybody it seats now, and every
 * party member already standing on it. The last group is somebody the table dragged on by hand,
 * who is accounted for all the same, so taking them off is as final as taking off anybody the board
 * seated itself.
 *
 * @param {object} graph  the board as it stands, normalized. `emptyGraph()` when creating.
 * @param {Array<{id, uuid, name, img}>} pcs  the party, in the order they should be seated.
 * @param {object} [opts]
 * @param {string[]} [opts.seated]  the ledger as it stands.
 * @param {Function} newId  id minter, injected so the result is testable.
 * @returns {{nodes: object, seated: string[], addedPeople: number}}
 */
export function partyBoardPlan(graph, pcs = [], { seated = [] } = {}, newId = () => foundry.utils.randomID()) {
	const onBoard = new Set(Object.values(graph?.nodes ?? {}).map(nodeIdentity));
	const handed = new Set((seated ?? []).filter(key => typeof key === "string" && key));
	const party = (pcs ?? []).filter(pc => pc?.uuid);

	const arriving = party.filter(pc => {
		const key = nodeIdentity(pc);
		return !onBoard.has(key) && !handed.has(key);
	});
	const seating = seatArrivals(graph, arriving, newId);

	const ledger = new Set(handed);
	for (const pc of party) {
		const key = nodeIdentity(pc);
		if (onBoard.has(key)) ledger.add(key);
	}
	for (const key of seating.seated) ledger.add(key);

	return { nodes: seating.nodes, seated: [...ledger], addedPeople: seating.seated.length };
}
