# Ash & Iron

**Act I · The Hollow Bell**

The bell beneath Gloamwatch has rung for the first time in a century. Follow the cinder road, recover the seals of ash and iron, and silence the Bellworn before the dead reach the gates.

Ash & Iron is an original single-player isometric 3D action RPG. Act I follows a complete quest through Gloamwatch, Cinderwood, the Reliquary, and Ashen Belfry.

## Play

Download [Ash-and-Iron.html](https://github.com/thongntit/ash-and-iron/releases/download/v1.0.0/Ash-and-Iron.html) and open it in a current desktop browser with WebGL 2. The game runs offline. Your journey saves in that browser, so keep the file in the same location to continue. Desktop mouse and keyboard are the primary controls. On a touch screen, tap the world to move, attack, or interact and use the buttons in the HUD for skills.

| Action | Controls |
| --- | --- |
| Move | Click the ground, WASD, or arrow keys |
| Attack | Click an enemy to engage or press **F** to attack toward the cursor |
| Class skill | **Q** or right click |
| Dodge | **Space** toward movement or the cursor |
| Use a healing draught | **R** |
| Interact | Click a character, shrine, or gate, or press **E** nearby |
| Open menus | **I** inventory, **C** character, **J** journal, **M** map, **Esc** pause |

Choose the **Warden** for melee cleaves, the **Ember Witch** for ranged fire and area damage, or the **Hollow Scout** for piercing arrows. Walk over loot to pick it up, then equip it from the inventory. Spend talent points from the character screen. Smith Oren buys and sells gear, and the rest shrine at Gloamwatch restores life and refills the first three draught slots. The gold diamond on the map points to the next quest objective.

## Build and test

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

`dist/index.html` is the web build entry point and `dist/Ash-and-Iron.html` is the standalone download. Use `npm run preview` to serve the web build locally. The campaign tests check the complete quest and boss fight, saved progress, all three classes, and death recovery. The Chromium tests exercise the production build and the offline HTML.

The world runs in Three.js with an orthographic camera, modeled terrain and characters, dynamic lighting, and 3D combat effects. The game uses Web Audio for ambience and effects. The title illustration was generated for the game. Cinzel and Inter are distributed under the SIL Open Font License, with notices in [the fonts directory](public/fonts).
