# Relationship Map - by PWD

A shared board of who knows whom, for [Foundry Virtual Tabletop](https://foundryvtt.com). Put your characters and NPCs on it as portraits, draw curved, labelled, coloured lines between them, and arrange it together: every player can draw on a map they can see, and every change reaches the whole table at once.

It works with any game system.

![A relationship map: portraits joined by coloured, captioned lines, with board tabs along the top and Add someone at the bottom](docs/images/relationship-map.webp)

## Features

- **Maps and boards.** A world can hold several maps, and each map can hold several named boards ("The Court", "The Docks", "Who owes whom"). Each board has its own people, its own lines and its own layout, and the same person can stand on more than one.
- **Drawn together.** Every player who can see a board can move people and draw lines on it. Changes are saved to the world and appear on everyone's screen straight away.
- **Hidden until shown.** A new board starts out as the GM's own. The GM shows it to the players with the eye on the board strip when it is ready.
- **The Party.** Each map gives itself a board called "The Party" and seats the player characters on it. Anybody who joins the party later is seated too. It remembers who it has seated, so taking somebody off the board sticks.
- **Lines that say something.** Click a line to write on it and choose its colour, which way it reads (one way, both ways, or neither), whether it is solid, dashed or dotted, and how big its words are. There are eight named colours, forty more in the palette, and colours of your own. The next line you draw on a map starts out in the pen you last used there.
- **A board that grows with its cast.** The board pans and zooms, grows as people are added, and keeps its captions clear of the faces and of each other. Rest on a face to light up that person's whole web.
- **Undo and redo** for your own changes on a board (Ctrl+Z, Ctrl+Shift+Z), never anybody else's.
- **Drawn for your eyes.** Three dials under the board make arrowheads, lines and words heavier or lighter for you alone, and a checkbox hides the captions. A client setting draws every board in high contrast, with a dash pattern per colour so colour is never the only thing telling two lines apart.
- **Light and dark.** Follows Foundry's own light or dark setting for application windows.
- **Out of the way.** Maps are kept out of the Journal sidebar list. A "Relationship Maps" button in the Journal sidebar opens the board you were last on, and map windows you leave open come back after a reload.

## Installation

In Foundry, open **Add-on Modules**, choose **Install Module**, and paste this manifest URL:

```
https://github.com/PrinceWitherdick/relationship-map-pwd/releases/latest/download/module.json
```

Then enable **Relationship Map - by PWD** in your world's module settings.

## Getting started

1. Open the **Journal** sidebar (the book tab) and press **Relationship Maps** at the top. In a world with no map yet, this makes the first one for you.

   ![The Journal sidebar tab, and the Relationship Maps button under Create Entry and Create Folder](docs/images/journal-sidebar-button.webp)

2. Drag actors from the **Actors** sidebar onto the board, or press **Add someone** under it.
3. Drag from the small link handle on a portrait to another portrait to draw a line. Click the line to write on it and style it.
4. Right-click a portrait to take that person off the board. Double-click it to open their sheet.
5. Use the strip above the board to add, rename, reorder, hide and delete boards. Use **Maps** on the window's title bar to switch maps or make another.

### Who can do what

| | Player | Trusted Player | GM |
|---|---|---|---|
| See and draw on a board the GM has shown | Yes | Yes | Yes |
| Add, rename, reorder and delete boards on a map | Yes | Yes | Yes |
| Make a new map | No | Yes | Yes |
| Hide or show a board | No | No | Yes |
| Delete a whole map | No | No | Yes |

Maps are ordinary journal entries owned by everyone at the table, which is what lets every player draw on them. Hidden boards are hidden from view, not encrypted: like anything hidden in Foundry, a determined player with the browser console can still read them.

### Settings

- **High-contrast relationship boards** (per user): stronger line colours, a dash pattern per colour, heavier rims.
- **Reopen relationship maps after a reload** (per user): on by default.

### For macros and other modules

```js
const api = game.modules.get("relationship-map-pwd").api;
api.open();              // the board you were last on
api.open("The Court");   // a map by name or id
api.choose();            // pick a map from a list
```

## Compatibility

Foundry VTT v13 and v14. No game system is required or assumed.

## Development

```
npm install
npm test
npm run lint
```

The tests run under [Vitest](https://vitest.dev) against the real templates and stylesheet, with small stand-ins for the Foundry globals.

## Credits

Built by PrinceWitherdick. The relationship map was first built for the [Stonetop system for Foundry VTT](https://github.com/PrinceWitherdick/stonetop-pwd) and has been rebuilt here as a module of its own. Created in collaboration with AI to facilitate quick development.

## License

The code is released under the [MIT License](LICENSE).
