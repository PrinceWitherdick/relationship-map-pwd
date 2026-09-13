// The sheet a relationship map's JournalEntry opens as: a bouncer, not a window.
//
// WHY THIS EXISTS. Every map is a JournalEntry. Its rows are kept out of the Journal sidebar, but it
// can still be reached the way any entry can: a content link, or a macro that renders `entry.sheet`.
// Left alone, that opens Foundry's prose editor on pages that hold nothing but a graph in their
// flags, a blank window that looks like the map is broken.
//
// So the entry carries `flags.core.sheetClass` naming this class, and this class opens the real
// board (dialogs/RelationshipMapWindow.js) and closes itself without ever painting.
//
// WHY IT IS A SEPARATE CLASS FROM THE WINDOW. `DocumentSheetConfig.registerSheet` stores the class
// and core constructs it as `new cls(document, options)` — it has to be a DocumentSheet.
// RelationshipMapWindow is a RelmapDialog, which is a plain Application, so it cannot be
// registered and the two jobs cannot be one class.
//
// ⚠ THE CLASS NAME IS PART OF A CONTRACT. It is half of the registration id that
// `flags.core.sheetClass` stores on every map in every world (RELMAP_SHEET_CLASS, which
// relationship-map.js checks at init). Renaming this class orphans every existing map onto
// Foundry's generic sheet, silently, with no error anywhere.

import { openRelationshipMap } from "../dialogs/RelationshipMapWindow.js";

/**
 * Built from the V1 base the caller resolves, rather than importing one.
 *
 * V13 ships both `foundry.appv1.sheets.JournalSheet` and the V2 `JournalEntrySheet`, and which of
 * them exists is a property of the core the world is running. relationship-map.js resolves it once
 * at init and hands it in, so there is one place that knows.
 */
export function createRelationshipMapEntrySheetClass(Base) {
	return class RelationshipMapSheet extends Base {
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["relmap-window", "relmap-bounce"],
				width: 420,
				height: 200,
			});
		}

		/**
		 * Open the board instead of rendering.
		 *
		 * `super._render` is never called, so nothing of this sheet is ever inserted into the
		 * document — which is what makes it a bouncer rather than a window that flashes. The close
		 * still runs, so core's own bookkeeping (the document's `_sheet`, the apps registry) is
		 * left tidy.
		 */
		async _render(_force, options = {}) {
			// The options are forwarded WHOLE, not dropped, and two different things ride in them.
			//
			// The geometry, because a caller that renders `doc.sheet` at a position is asking for the
			// board there, and `doc.sheet` for a map is THIS. A bouncer that ignored its options would
			// put that board in the middle of the screen at its default size.
			//
			// And `pageId`, which is core's own option and names one of the map's boards. A map is
			// several named pages (module/relmap/relmap-doc.js), each a JournalEntryPage, and a content
			// link to one of them sends `{pageId}` through here. Forwarded rather than picked out by
			// name, because the day core adds another of these is not a day this bouncer should have to
			// be edited.
			this._board = openRelationshipMap(this.document, options);
			// Not awaited inside the render: closing an Application from inside its own render is
			// how AppV1 gets left with a half-registered app. A task of its own lets this return
			// first. Its failure is swallowed on purpose — the board is already open, and a window
			// that could not close itself is not something to put in front of the reader.
			Promise.resolve()
				.then(() => this.close())
				.catch(err => console.warn("Relationship Map | relationship map bouncer could not close", err));
		}

		/**
		 * Forwarded to the board, because the board is the only window there is.
		 *
		 * A caller that minimizes the sheet straight after rendering it is asking about the board. This
		 * sheet painted nothing and is about to close, and the board it opened has not finished its
		 * first render, and `Application#minimize` does nothing at all for a window that is not on
		 * screen yet, silently. So the request is handed to the board, which holds it until it has
		 * something to minimize.
		 */
		async minimize() {
			return this._board?.openMinimized?.();
		}
	};
}
