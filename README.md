# Level 13

Level 13 is an text-based incremental science fiction browser adventure where the player must survive in a dark, decayed City, (re-)discover old and new technologies, and rebuild a civilization that has collapsed.

The game is in active development. It is a personal side project but has also received some fixes from the community along the way. Bug reports and feedback are very welcome, but please check the [contributing guidelines](docs/CONTRIBUTING.md) first.

## Quick Links
* Play the game [here](https://nroutasuo.github.io/level13/)
* Read about how to report bugs, suggest features, or submit fixes to the project in the [contributing guidelines](docs/CONTRIBUTING.md)
* Chat about the game or get help on the [discussions page](https://github.com/nroutasuo/level13/discussions), the [subreddit](https://www.reddit.com/r/level13/), or the [Discord server](https://discord.gg/BzMbATyKph)

## Mobile Port and Release Pipeline (fork branches)

This fork is a mobile port of the game. It plays at phone widths with full
feature parity: tap-to-open info callouts, long-press action previews, touch
pan and pinch zoom on maps, a scrollable tab bar, a log drawer, and
touch-sized controls. Design notes: `docs/superpowers/specs/2026-08-02-mobile-port-design.md`.

The published branches form a promotion chain. Every branch carries the same
tree and the same deploy workflow, so each promotion is a fast-forward. The
site path is the hosting repo's name.

| Branch | Hosting repo | Site | Dev flags | How changes arrive |
|---|---|---|---|---|
| `gh-pages-agent-test` | earchibald/gh-pages-agent-test | <https://earchibald.github.io/gh-pages-agent-test/> | on | the agent commits here; humans test on `./serve.sh` (localhost:8414) |
| `gh-pages-dev` | earchibald/gh-pages-dev | <https://earchibald.github.io/gh-pages-dev/> | on | fast-forward from `gh-pages-agent-test` once approved, no PR |
| `gh-pages-stage` | earchibald/gh-pages-stage and earchibald/level13-mobile | <https://earchibald.github.io/gh-pages-stage/> and <https://earchibald.github.io/level13-mobile/> | off | PR from `gh-pages-dev` |
| `gh-pages` | earchibald/level13 | <https://earchibald.github.io/level13/> | off | PR from `gh-pages-stage`, which may bundle several dev PRs |

Emergency patches may land directly on `gh-pages-stage` or any branch below
it, never directly on `gh-pages`. `gh-pages-mobile` is retired: it publishes
nowhere, and `gh-pages-stage` serves its old `/level13-mobile` path so player
saves there (namespaced by path) keep working.

Publishing: the workflow only deploys in a branch's hosting repo, so push the
branch to `origin` (earchibald/level13, source of truth, deploys nothing) and
then to its hosting remote(s):

    git push origin gh-pages-agent-test && git push agent gh-pages-agent-test
    git push origin gh-pages-dev        && git push dev   gh-pages-dev
    git push origin gh-pages-stage      && git push stage gh-pages-stage && git push mobile gh-pages-stage
    git push origin gh-pages                                    # prod, after the PR merges

Bump the fork version (`0.7.0.mN` in `changelog.json`, `urlArgs` in
`src/config.js`, the `?v=` CSS links in `index.html` and `changelog.html`, and
`CACHE_VERSION` in `sw.js`) in the same commit as a change, so a deploy can be
told apart from a cached page.

## Game Overview

### Features

* Survival and exploration
* Base-building and resource-management
* Randomly generated maps
* Items, equipment and environmental hazards
* Technologies that slowly unlock new aspects of the game

## Code Overview

The project uses [jQuery](https://jquery.com/), [Require.js](http://requirejs.org/), and [Ash.js](https://github.com/brejep/ash-js) and is structured according to an entity system framework into entities, components and systems.

### Branches
* **master** is a development branch and can contain unfinished and buggy features
* **gh-pages** is more stable and contains whatever is currently live

### Entities and Components

All game data is stored in various [Components](https://github.com/nroutasuo/level13/tree/master/src/game/components) that are attached to entities such as the player or a sector. Entities are simply containers for Components. The [EntityCreator](https://github.com/nroutasuo/level13/blob/master/src/game/EntityCreator.js) gives a good overview of what kind of entities have what kind of components.

### Systems

Various independent [Systems](https://github.com/nroutasuo/level13/tree/master/src/game/systems) use and change data on Components and make stuff happen in the game. They generate resources, update movement options, resolve fights and so on. Each area of the UI is taken care of by its own [UI system](https://github.com/nroutasuo/level13/tree/master/src/game/systems/ui).

### Player Actions

Everything that the player can do in the game - mainly button clicks - are called "player actions". Each action has an associated name, costs, requirements, cooldown and so on. The [PlayerActionFunctions](https://github.com/nroutasuo/level13/blob/master/src/game/PlayerActionFunctions.js) class contains a function for each action and handles their results. Various helpers take care of checking requirements, deducting costs, unifying random encounters and so on.

### World Creator

At the start of a new game, a seed value is assigned to the game. The [World Creator](https://github.com/nroutasuo/level13/tree/master/src/worldcreator) generates a unique world based on this seed and only the seed needs to be saved between sessions.

![samplelevel2](/docs/samplelevel2.PNG)  ![samplelevel3](/docs/samplelevel3.PNG)

(Sample level structure)

The world is generated in roughly the following steps:
* [WorldGenerator](https://github.com/nroutasuo/level13/blob/master/src/worldcreator/WorldGenerator.js) determines rough structure of the entire world and important points like camp and passage locations
* [LevelGenerator](https://github.com/nroutasuo/level13/blob/master/src/worldcreator/LevelGenerator.js) adds more details to each level
* [StructureGenerator](https://github.com/nroutasuo/level13/blob/master/src/worldcreator/StructureGenerator.js) determines the structure of each level, placing sectors and paths according to constraints set in the previous steps
* [SectorGenerator](https://github.com/nroutasuo/level13/blob/master/src/worldcreator/SectorGenerator.js) populates the sectors with features like resources, item stashes, environmental hazards, movement blockers etc

Two important units for balancing the world are the camp ordinal and the level ordinal. Level 13 where the player always starts has level ordinal 1 and camp ordinal 1.

## Other games

Level 13 is heavily inspired by [A Dark Room]( http://adarkroom.doublespeakgames.com/). Other great text-based and / or incremental games that the game owes much inspiration to include:

* [Kittens Game](http://bloodrizer.ru/games/kittens/)
* [Shark Game](http://cirri.al/sharks/)
* [Crank](https://faedine.com/games/crank/b39/)
* [CivClicker](http://civclicker.sourceforge.net/civclicker/civclicker.html)
* [Prosperity](https://home.prosperity-game.com/)
