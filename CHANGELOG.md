# Changelog

## 1.0.1

- Nothing is made for you any more. In a world with no collection yet, the Relationship Maps button asks what the first one is called, and a new collection starts with no maps in it. Add a map with New map or the + beside the map tabs.
- The Party map is gone: no map seats the player characters by itself. Existing "The Party" maps stay as ordinary maps.
- The last map in a collection can be deleted.
- Clearer names in the window: a tab is a map, and the set of maps it belongs to is a collection ("Rename collection", "Delete collection", "Collections").
- A collection with no maps you can see has nothing to draw on, and the Collections list counts its maps correctly. The Relationship Maps button opens a collection that has a map you can see, where there is one.
- Adding, deleting and reordering maps follows who owns the collection, so a player can start a map in a collection whose other maps are hidden from them.
- Changes no longer land on the wrong map or bring back somebody who was taken off: anything still being saved when its map is deleted, hidden or left is dropped, and an answer given in a chooser after the map changed underneath it is not used. Undo straight after moving somebody with the arrow keys undoes that move.
- An open map window updates its tools as soon as you are given, or lose, the right to edit the map.
- Two person choosers open at once each get a window of their own, pressing Relationship Maps twice quickly opens one name box and one map window, and opening a minimized map brings it back. The windows reopened after a reload are remembered separately for each world.
- Keys pressed on the board or its line bar stay there: Space no longer pauses the game, and Delete no longer deletes the tokens selected on the scene. Zooming while dragging or panning keeps the board under the cursor, and a line let go of over another window is not drawn.

## 1.0.0

First release as a module of its own. The relationship map was first built for the Stonetop system for Foundry VTT and has been rebuilt here to work with any game system.

- Relationship maps: portraits joined by curved, labelled, coloured lines, with a pan and zoom board that grows with its cast.
- Several named boards per map, each with its own people, lines and layout. Boards start hidden from players and the GM shows them one at a time.
- Every player can draw on a map they can see; changes reach the whole table at once.
- A "The Party" board on every map that seats the player characters by itself and remembers who it has seated, so taking somebody off it sticks.
- A tie bar over a clicked line for its words, colour, direction, stroke and caption size, with a 40-colour palette and colours of your own.
- Undo and redo per board, for your own changes only.
- Per-reader dials for how heavily arrowheads, lines and words are drawn, and a switch to hide captions.
- Light and dark themes that follow Foundry's own setting, and a high-contrast board with a dash pattern per colour.
- Maps stay out of the Journal sidebar; a "Relationship Maps" button there opens the board you were last on.
- Map windows reopen where you left them after a reload.
