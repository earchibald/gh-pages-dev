# Auto-scavenge explorer ability — design

**Release:** 0.7.0.m1. The 0.7 line marks the first content addition to the fork. Later builds count up in the `.mN` series so they never collide with an upstream version.

## Summary

| Item | Decision |
|---|---|
| Ability | New explorer ability type `auto_scavenge`, class scavenger. Binary: the level does nothing. |
| Pool | Joins `ExplorerConstants.abilityType`, so `getAvailableAbilityTypes` gives it the same weight as every other non-animal ability. Unlocks at camp ordinal 2. Not a valid robot ability. |
| Button | `#out-action-auto-scavenge`, label "Auto", sits right after Scavenge in `#out-sector-bar-actions`. Shown only when an explorer with the ability is in the party and the Scavenge button is shown. |
| Hotkey | Shift-N, scoped to the out tab, listed as "Auto-scavenge". The button shows the ⇧N badge. |
| Lit state | Class `selected` on the button while auto mode is on. |
| Behaviour | On: if scavenge is available now, scavenge, then stay on. While on, every tick: wait if a popup is open, the player is busy, or the scavenge cooldown is running; when the cooldown ends, scavenge again. |
| Stops | Player presses the button or Shift-N; the ability leaves the party; the player enters a camp; a fight starts (any outcome); a scavenge injures the player or an explorer; less than one unit of bag capacity remains; `checkAvailability("scavenge")` fails once the cooldown is over (stamina, sector depleted, no vision, fainted). A log line says why. |
| Result popups | Auto-mode scavenges skip the result popup unless the rewards force one (bag full, special finds). The pause on a popup does not turn auto off. |
| State | `gameState.uiStatus.isAutoScavenging`. It is reset to false on load, so the mode never survives a reload. |
| Save format | Unchanged. An explorer with the new ability is an ordinary `ExplorerVO` with a new `abilityType` string. Older builds load it and treat the type as a scout with no bonus. |
| Pre-update backup | On the first load of a save whose major.minor is lower than the build's, a popup offers a copy (text) and a download (text file) of the save as it was before load. The build also keeps that text in localStorage as the `preupdate` save slot. |

## Ability

`ExplorerConstants.abilityType.AUTO_SCAVENGE = "auto_scavenge"`.

- `getExplorerTypeForAbilityType` → `SCAVENGER`.
- `getUnlockCampOrdinal` → 2.
- `isValidRobotAbility` → false (unchanged list).
- `getExplorerItemBonus` has no case for it. The bonus helpers only see item bonus types, so the total bonus is 0 and the comparison tools treat the explorer as neutral.
- Strings: `ui.characters.explorer_ability_type_auto_scavenge_name` = "auto-scavenging"; `ui.characters.explorer_ability_type_auto_scavenge_description` = "keeps scavenging on their own until you stop, run out of stamina or the sector is picked clean".

## AutoScavengeSystem

New file `src/game/systems/AutoScavengeSystem.js`, added at `SystemPriorities.update` after `StaminaSystem`.

```
isAvailable():  party has an explorer with AUTO_SCAVENGE, player not in camp
toggle():       isAvailable ? setActive(!active) : setActive(false)
setActive(v):   uiStatus.isAutoScavenging = v; dispatch autoScavengeChangedSignal
update():
  if !active return
  if !isAvailable → stop("Auto-scavenge stopped.")
  if popupManager.hasOpenPopup() return
  if playerHelper.isBusy() return
  if playerActionFunctions.currentAction return
  if getCooldownForCurrentLocation("scavenge") > 0 return
  if checkAvailability("scavenge") → startAction("scavenge")
  else → stop(reason)
```

`stop(reason)` picks the message from the failed check: costs → "Auto-scavenge stopped: not enough stamina."; sector requirement → "Auto-scavenge stopped: nothing left to scavenge here."; other → "Auto-scavenge stopped.".

Signals: `GlobalSignals.toggleAutoScavengeSignal` (hotkey and button → system), `GlobalSignals.autoScavengeChangedSignal` (system → UI).

`PlayerActionFunctions.scavenge` passes `showResultPopup = !uiModeMinimialExplorationPopups && !uiStatus.isAutoScavenging`.

## UI

`UIOutLevelSystem.updateOutActionButtons` (the block that toggles `#out-action-sca`) toggles `#out-action-auto-scavenge` on `showScavenge && autoScavengeSystem.isAvailable()` and sets `selected` from `uiStatus.isAutoScavenging`. It also re-renders on `autoScavengeChangedSignal` and `explorersChangedSignal`.

Markup:

```html
<button class="action-location btn-toggle" id="out-action-auto-scavenge">Auto<span class="hotkey-hint">&#8679;N</span></button>
```

CSS: `button.btn-toggle.selected` uses the highlight border and text colour so it reads as lit in both themes.

## Pre-update backup

`GameManager.getSaveObject` already reads the compressed default slot. When `save.version` has a lower major or minor than the build, it stores `{ version, data }` on `this.preUpdateBackup` and copies the data to the `preupdate` slot. After `gameShownSignal`, `UIOutManageSaveSystem` shows `#save-backup-popup`:

- Title "Game updated", text naming both versions and saying the save below is the one from before this load.
- Read-only textarea with the compressed save string.
- Buttons Copy (clipboard), Download (`level13-save-before-<version>.txt`), Continue.

The popup is shown once per build major.minor. The flag lives in localStorage under the same namespace prefix the save slots use.

## Testing

Headless Playwright (see the craft menu test in the scratchpad for the recipe): load usersave, patch an auto-scavenge explorer into the party, teleport outside, press Shift-N, and check: button lit, a scavenge fires, `numTimesScavenged` climbs after the cooldown, the button unlights when stamina is drained, and the backup popup appears once for a 0.6 save.
