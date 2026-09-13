// Auto-scavenge: the scavenger ability that keeps scavenging for the player.
//
// The Auto button (shift-N) turns the mode on. While it is on this system
// starts a scavenge every time the scavenge cooldown for the current sector
// ends. It waits while a popup is open, the player is busy or an action is
// still running; it turns itself off when the ability leaves the party, the
// player enters a camp, a fight starts, a scavenge ends in an injury, or
// scavenging is no longer possible once the cooldown is over (no stamina,
// sector picked clean, no vision, fainted).
//
// The on/off flag lives in gameState.uiStatus.isAutoScavenging so that
// PlayerActionFunctions.scavenge can skip the result popup. GameState resets
// it on load, so the mode never survives a reload.
define([
	'ash',
	'game/GameGlobals',
	'game/GlobalSignals',
	'game/constants/ExplorerConstants',
	'game/constants/LogConstants',
	'game/constants/PlayerActionConstants',
	'game/constants/ExplorationConstants',
	'game/nodes/PlayerLocationNode',
	'game/components/sector/SectorFeaturesComponent',
	'game/components/sector/SectorStatusComponent',
	'game/nodes/player/PlayerStatsNode',
	'game/nodes/PlayerPositionNode',
	'game/components/player/ExplorersComponent',
], function (Ash, GameGlobals, GlobalSignals, ExplorerConstants, LogConstants, PlayerActionConstants, ExplorationConstants, PlayerLocationNode, SectorFeaturesComponent, SectorStatusComponent, PlayerStatsNode, PlayerPositionNode, ExplorersComponent) {

	let AutoScavengeSystem = Ash.System.extend({

		ACTION: "scavenge",

		playerStatsNodes: null,
		playerPosNodes: null,
		playerLocationNodes: null,

		constructor: function () { },

		addToEngine: function (engine) {
			this.engine = engine;
			this.playerStatsNodes = engine.getNodeList(PlayerStatsNode);
			this.playerPosNodes = engine.getNodeList(PlayerPositionNode);
			this.playerLocationNodes = engine.getNodeList(PlayerLocationNode);
			GlobalSignals.add(this, GlobalSignals.toggleAutoScavengeSignal, this.toggle);
			GlobalSignals.add(this, GlobalSignals.explorersChangedSignal, this.checkAvailable);
			GlobalSignals.add(this, GlobalSignals.playerEnteredCampSignal, this.checkAvailable);
			GlobalSignals.add(this, GlobalSignals.fightStartedSignal, this.onFightStarted);
			GlobalSignals.add(this, GlobalSignals.actionRewardsCollectedSignal, this.onRewardsCollected);
			GlobalSignals.add(this, GlobalSignals.gameResetSignal, this.onGameReset);
		},

		removeFromEngine: function (engine) {
			GlobalSignals.removeAll(this);
			this.playerStatsNodes = null;
			this.playerPosNodes = null;
			this.playerLocationNodes = null;
			this.engine = null;
		},

		update: function (time) {
			if (!this.isActive()) return;
			if (GameGlobals.gameState.isPaused) return;
			if (!this.playerStatsNodes.head || !this.playerPosNodes.head) return;

			if (!this.isAvailable()) {
				this.stop("Auto-scavenge stopped.");
				return;
			}

			// the sector has shown its hand: past the reveal threshold the resources
			// row reads "(None)", so more scavenging here is stamina for nothing
			if (this.isSectorKnownEmpty()) {
				this.stop("Auto-scavenge stopped: nothing to find here.");
				return;
			}

			// a bag with less than one unit of room would turn every find into a
			// leave-something-behind popup
			if (this.isBagFull()) {
				this.stop("Auto-scavenge stopped: the bag is full.");
				return;
			}

			if (GameGlobals.uiFunctions.popupManager.hasOpenPopup()) return;
			if (GameGlobals.playerHelper.isBusy()) return;
			if (GameGlobals.playerActionFunctions.currentAction) return;
			if (GameGlobals.playerActionsHelper.getCooldownForCurrentLocation(this.ACTION) > 0) return;

			if (GameGlobals.playerActionsHelper.checkAvailability(this.ACTION, false)) {
				GameGlobals.playerActionFunctions.startAction(this.ACTION);
				return;
			}

			this.stop(this.getStopReason());
		},

		isActive: function () {
			return GameGlobals.gameState.uiStatus.isAutoScavenging === true;
		},

		// an explorer with the ability is in the party and the player is outside
		isAvailable: function () {
			if (!this.playerStatsNodes || !this.playerStatsNodes.head) return false;
			if (!this.playerPosNodes || !this.playerPosNodes.head) return false;
			if (this.playerPosNodes.head.position.inCamp) return false;
			let explorersComponent = this.playerStatsNodes.head.entity.get(ExplorersComponent);
			if (!explorersComponent) return false;
			let party = explorersComponent.getParty();
			for (let i = 0; i < party.length; i++) {
				if (party[i].abilityType == ExplorerConstants.abilityType.AUTO_SCAVENGE) return true;
			}
			return false;
		},

		// the same rule UIOutLevelSystem.getResourcesFoundText uses to print "(None)":
		// no resource known here, the sector scavenged to the reveal threshold, and
		// nothing scavengeable in it at all
		isSectorKnownEmpty: function () {
			if (!this.playerLocationNodes || !this.playerLocationNodes.head) return false;
			let sector = this.playerLocationNodes.head.entity;
			let features = sector.get(SectorFeaturesComponent);
			let status = sector.get(SectorStatusComponent);
			if (!features || !status) return false;
			if (GameGlobals.sectorHelper.getLocationKnownResources(sector).length > 0) return false;
			if (status.getScavengedPercent() < ExplorationConstants.THRESHOLD_SCAVENGED_PERCENT_REVEAL_NO_RESOURCES) return false;
			return features.resourcesScavengable.getTotal() <= 0;
		},

		// BagSystem keeps usedCapacity current every tick
		isBagFull: function () {
			let nodes = GameGlobals.playerHelper.playerResourcesNodes;
			if (!nodes || !nodes.head) return false;
			let bag = nodes.head.bag;
			if (!bag || !bag.totalCapacity) return false;
			return bag.totalCapacity - bag.usedCapacity < 1;
		},

		toggle: function () {
			if (this.isActive()) {
				this.stop(null);
			} else if (this.isAvailable()) {
				this.setActive(true);
			}
		},

		setActive: function (isActive) {
			isActive = isActive === true;
			if (this.isActive() === isActive) return;
			GameGlobals.gameState.uiStatus.isAutoScavenging = isActive;
			GlobalSignals.autoScavengeChangedSignal.dispatch(isActive);
		},

		stop: function (message) {
			if (!this.isActive()) return;
			this.setActive(false);
			if (message) GameGlobals.playerHelper.addLogMessage(LogConstants.getUniqueID(), message);
		},

		// the fight itself still runs; auto mode is off once it is over
		onFightStarted: function () {
			this.stop("Auto-scavenge stopped: got into a fight.");
		},

		// rewards are the ResultVO the player just collected (popup or flyout)
		onRewardsCollected: function (rewards) {
			if (!this.isActive()) return;
			if (this.hasInjury(rewards)) this.stop("Auto-scavenge stopped: injured.");
		},

		hasInjury: function (rewards) {
			if (!rewards) return false;
			if (rewards.gainedExplorerInjuries && rewards.gainedExplorerInjuries.length > 0) return true;
			return typeof rewards.getGainedInjuries === "function" && rewards.getGainedInjuries().length > 0;
		},

		checkAvailable: function () {
			if (this.isActive() && !this.isAvailable()) this.stop("Auto-scavenge stopped.");
		},

		// called after the cooldown is over and checkAvailability said no
		getStopReason: function () {
			let helper = GameGlobals.playerActionsHelper;
			let reqs = helper.checkRequirements(this.ACTION, false);
			if (reqs.value < 1) {
				let reason = reqs.reason || {};
				let text = typeof reason === "string" ? reason : (reason.textKey || "");
				if (text.indexOf("scavenged clean") >= 0) return "Auto-scavenge stopped: nothing left to scavenge here.";
				return "Auto-scavenge stopped.";
			}
			if (helper.checkCosts(this.ACTION, false) < 1) return "Auto-scavenge stopped: not enough stamina.";
			return "Auto-scavenge stopped.";
		},

		onGameReset: function () {
			GameGlobals.gameState.uiStatus.isAutoScavenging = false;
		},

	});

	return AutoScavengeSystem;
});
