# Ballhog vs Archive · Version 3.3: shields, vfx, and more!

A local two-player p5.js platform fighter with four arenas, animated fighters, pickups, supers, and a new double jump and guard-heal ability.

## Play

Open `[index.html]` in a browser with an internet connection. The page loads p5.js 2.3.3 from jsDelivr. GitHub Pages can host the same files directly from the repository root.

All game menus are keyboard-controlled. The mouse cursor is hidden over the game and has no GUI interactions. In the study screen, press 1 for Math, 2 for Science, or 3 for Social Science.

## Controls

| Action | Player 1 · Ballhog | Player 2 · Archive |
| --- | --- | --- |
| Move | A / D | Left / Right arrows |
| Jump | W, then W again in the air | Up, then Up again in the air |
| Drop through a platform | S + W | Down + Up |
| Guard and heal | Hold S | Hold Down arrow |
| Attack | Hold E to charge, then release | N |
| Super | F | M |
| Restart after a round | Enter | Enter |

The guard blocks direct attacks and heals 12 health per second, but freezes movement and drains 42 super charge per second. A full meter lasts about 2.4 seconds. When the meter runs out, release the guard key before trying again.

Ballhog is slower and hits harder. Each hit he takes raises his damage by 15%. Archive moves and attacks faster. His attacks apply poison for 10 seconds; poison stacks up to four times, deals 0.9 damage per second per stack, and each poison tick adds super charge based on the active stack count.

Ballhog can charge E for up to 1.5 seconds; a full charge deals up to 2.5× damage. Green health orbs restore 20 health, and blue super orbs restore 40 super charge. The game is drawn in code and has no image assets.
