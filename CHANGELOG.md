# Changelog

## Unreleased

- A group shrunk to its smallest size by a corner stays where the corner put it, instead of jumping to the middle of its people.
- If a map window fails to open, pressing the button again opens it after a few seconds, instead of doing nothing until Foundry is reloaded.

## 1.2.1

- Resize a group: click its name or outline and drag one of the four corner handles that appear. Hold Shift for a perfect square or circle. A group can be made bigger than its people, or smaller, though never smaller than one person.
- Shrinking a group past somebody takes them out of it when you let go. While you drag, the people who will stay are ringed in the group's colour. A shrink that would leave nobody in the group is refused. The new size and anyone taken out are one undo step.

## 1.2.0

- Easier ways to draw a line. Hold Alt and drag from anywhere on a portrait to draw a line out of it instead of moving them. The portrait's tooltip says so.
- Draw lines: a new button under the map that makes every portrait a handle. Drag from one person to another, or click one and then the other (Enter works too), to join them. The person picked gets a double ring and a line follows the pointer to whoever you click next. The button stays on for the next line, and on other maps too. Press it again or Escape to turn it off; Escape with somebody picked only lets them go.
- The line you are dragging out starts at the edge of the portrait and stops at the edge of the person it is over, instead of running from the middle of the first face.
- The link handle and the trash can on a portrait are bigger and easier to hit, and sit further out so a press on the face still moves the person. While they are hidden they no longer catch a press meant for a line or a neighbouring face.
- Escape goes to the right thing when two things are waiting for it, such as a drag in one map window while a line is half picked in another.

## 1.1.1

- Making a collection now names its first map too, in the same window, and the map window opens on that map. Before, a new collection arrived empty and you had to press New map and name a map again.
- A group's name grows and shrinks with the map's text-size setting, and its outline makes room for it: at any size the name stays clear of the faces under it and of the name of a group drawn inside it.
- A change made straight after an undo is always an undo step of its own, rather than folding into the step below it.
- The module's dialogs have a look of their own instead of Foundry's default: a slate title bar with an icon, the map's own paper colours in light and dark, clearer text boxes, and the confirm button in slate at the right of a footer. This covers Add someone, New person, naming and renaming maps and collections, choosing a collection, and every "are you sure".
- An "are you sure" opens as a narrow window with its question wrapped over a few lines, rather than one line stretched across most of the screen.

## 1.1.0

- The map has no invisible edge any more: a person can be put down on the open paper around it and stays there, and the view takes in everybody who is off it.
- Several people at once: Shift-click faces (or Shift+Enter), or Shift-drag a box on open paper, to select them. Drag any of them or use the arrow keys to move them all, as one undo step. A plain click on paper or Escape lets go.
- Named groups: the new Group button draws a box or an oval around some people with a name on it ("The hunters"). With people selected it groups them at once; otherwise drag a box around the people to put in it. The outline follows its members, groups may overlap or sit inside one another, and dragging a group's name moves everyone in it. Deleting a group leaves its people on the map.
- A group's bar sets its name, its colour (one of the eight, or any colour with the + picker), a box or oval, and a solid or dashed outline, and puts the selected people in or takes them out. Undo and redo cover all of it.
- In high contrast a group is drawn unfilled with a heavier outline in its colour's own dash pattern.
- New person: makes an actor with Foundry's Create Actor dialog and puts them on the map. Players see it where their role may create actors, and an actor a player makes this way is visible to everyone.

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
- Arrowheads on curved lines reach the portrait, and captions are placed the same way for every player whatever language they use.
- Names and captions show in tooltips exactly as typed, and text cut to its length limit never breaks an emoji in half.

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
