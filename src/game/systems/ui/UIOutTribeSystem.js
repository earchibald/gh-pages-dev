define([
	'ash',
	'text/Text',
	'game/GameGlobals',
	'game/GlobalSignals',
	'game/constants/UIConstants',
	'game/constants/PlayerActionConstants',
	'game/constants/CampConstants',
	'game/constants/OccurrenceConstants',
	'game/constants/WorldConstants',
	'game/nodes/sector/CampNode',
	'game/nodes/PlayerPositionNode',
	'game/nodes/player/PlayerStatsNode',
	'game/nodes/tribe/TribeUpgradesNode',
	'game/components/common/PositionComponent',
	'game/components/common/ResourcesComponent',
	'game/components/common/ResourceAccumulationComponent',
	'game/components/player/HopeComponent',
	'game/components/type/LevelComponent',
	'game/components/sector/SectorFeaturesComponent',
	'game/components/sector/improvements/SectorImprovementsComponent',
	'game/components/sector/events/RecruitComponent',
	'game/components/sector/events/TraderComponent',
	'game/components/sector/events/RaidComponent',
	'game/components/sector/events/VisitorComponent',
	'game/components/sector/OutgoingCaravansComponent'
], function (
	Ash, Text, GameGlobals, GlobalSignals, UIConstants, PlayerActionConstants, CampConstants, OccurrenceConstants, WorldConstants,
	CampNode, PlayerPositionNode, PlayerStatsNode, TribeUpgradesNode,
	PositionComponent, ResourcesComponent, ResourceAccumulationComponent, HopeComponent, LevelComponent, SectorFeaturesComponent, SectorImprovementsComponent, RecruitComponent, TraderComponent, RaidComponent, VisitorComponent, OutgoingCaravansComponent
) {
	var UIOutTribeSystem = Ash.System.extend({

		engine: null,

		campNodes: null,
		sortedCampNodes: null,
		playerPosNodes: null,
		playerStatsNodes: null,
		tribeUpgradesNodes: null,

		campNotificationTypes: {
			NONE: "none",
			EVENT_RAID_ONGOING: "event_raid-ongoing",
			EVENT_RAID_RECENT: "event_raid-recent",
			EVENT_TRADER: "event_trader",
			EVENT_RECRUIT: "event_recruit",
			EVENT_VISITOR: "event_visitor",
			EVENT_REFUGEES: "event_refugees",
			EVENT_DISEASE: "event_disease",
			EVENT_DISASTER_RECENT: "EVENT_DISASTER_RECENT",
			EVENT_ACCIDENT_RECENT: "event_accident_recent",
			POP_UNASSIGNED: "population-unassigned",
			POP_DECREASING: "population-decreasing",
			POP_DISABLED: "population-disabled",
			SUNLIT: "sunlit",
			POP_INCREASING: "population-increasing",
			BUILDING_DAMAGED: "building-damaged",
			EVENT_OUTGOING_CARAVAN: "outoing-caravan",
			STATUS_NON_REACHABLE_BY_TRADERS: "not-reachable-by-traders",
			POP_NO_GARDENERS: "no-gardeners",
			POP_NO_CHEMISTS: "no-chemists",
			POP_NO_RUBBERMAKERS: "no-rubbermakers",
		},

		constructor: function () {
			this.initElements();
			return this;
		},

		addToEngine: function (engine) {
			this.engine = engine;
			this.campNodes = engine.getNodeList(CampNode);
			this.playerPosNodes = engine.getNodeList(PlayerPositionNode);
			this.playerStatsNodes = engine.getNodeList(PlayerStatsNode);
			this.tribeUpgradesNodes = engine.getNodeList(TribeUpgradesNode);
			GlobalSignals.add(this, GlobalSignals.campBuiltSignal, this.onCampBuilt);
			GlobalSignals.add(this, GlobalSignals.slowUpdateSignal, this.slowUpdate);
			GlobalSignals.add(this, GlobalSignals.tabChangedSignal, this.onTabChanged);
			GlobalSignals.add(this, GlobalSignals.openGoPopupSignal, this.onOpenGoPopup);
			GlobalSignals.add(this, GlobalSignals.popupShownSignal, this.onPopupShown);
			GlobalSignals.add(this, GlobalSignals.popupClosedSignal, this.onPopupClosed);

			// the hotkey system acts on keyup, but the go popup must exist before the
			// keyup so a fast "G13" keeps its digits - so the letter is caught on
			// keydown here and the registered hotkey serves as the fallback
			$(document).on("keydown.tribego", $.proxy(this.onDocumentKeyDown, this));

			this.sortCampNodes();
		},

		removeFromEngine: function (engine) {
			this.engine = null;
			this.campNodes = null;
			this.playerPosNodes = null;
			$(document).off("keydown.tribego");
			$(document).off("keydown.gopopup");
			GlobalSignals.removeAll(this);
		},
		
		initElements: function () {
			for (let i = WorldConstants.CAMPS_TOTAL; i > WorldConstants.CAMP_ORDINAL_GROUND; i--) {
				this.createCampRow(i, this.getCampRowID(i));
			}
			this.createLevel14Row();
			for (let i = 1; i <= WorldConstants.CAMP_ORDINAL_GROUND; i++) {
				this.createCampRow(i, this.getCampRowID(i));
			}

			$("#go-popup-close").click(function () {
				GameGlobals.uiFunctions.popupManager.closePopup("go-popup");
			});
		},

		// GO POPUP (hotkey G or T on this tab): type a level number, ENTER presses that camp's Go button

		onDocumentKeyDown: function (e) {
			let oe = e.originalEvent || e;
			if (oe.repeat) return;
			if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
			let code = oe.code;
			if (code != "KeyG" && code != "KeyT") return;
			if (!GameGlobals.gameState.settings.hotkeysEnabled) return;
			if (GameGlobals.gameState.uiStatus.currentTab != GameGlobals.uiFunctions.elementIDs.tabs.world) return;
			if (GameGlobals.uiFunctions.popupManager.hasOpenPopup()) return;
			let tagName = e.target ? e.target.tagName : null;
			if (tagName == "INPUT" || tagName == "TEXTAREA" || tagName == "SELECT") return;
			this.onOpenGoPopup();
		},

		onOpenGoPopup: function () {
			// the letter's keydown opens the popup and its keyup fires the registered
			// hotkey fallback before the popup reads as open, so guard with a flag
			if (this.isGoPopupOpen) return;
			this.isGoPopupOpen = true;
			this.goPopupValue = "";
			this.goPopupPendingConfirm = false;
			this.updateGoPopupValue();
			$("#go-popup-desc").text(this.getGoPopupHintText());
			GameGlobals.uiFunctions.showSpecialPopup("go-popup", { isDismissable: true });
			// bound at open, not when the popup becomes visible: digits typed while
			// the popup is still fading in must land in the value, not be dropped
			$(document).on("keydown.gopopup", $.proxy(this.onGoPopupKeyDown, this));
		},

		onGoPopupKeyDown: function (e) {
			let oe = e.originalEvent || e;
			let code = oe.code;
			let digit = null;
			if (code.indexOf("Digit") == 0) digit = code.substring(5);
			if (code.indexOf("Numpad") == 0 && code.length == 7) digit = code.substring(6);
			if (digit != null && digit >= "0" && digit <= "9") {
				e.preventDefault();
				if (this.goPopupValue.length < 2) {
					this.goPopupValue += digit;
					this.updateGoPopupValue();
				}
				return;
			}
			if (code == "Backspace") {
				e.preventDefault();
				this.goPopupValue = this.goPopupValue.substring(0, this.goPopupValue.length - 1);
				this.updateGoPopupValue();
				return;
			}
			if (code == "ArrowUp" || code == "ArrowDown") {
				e.preventDefault();
				if (oe.repeat && this.isGoPopupRolling()) return;
				this.stepGoPopupLevel(code == "ArrowUp" ? 1 : -1);
				return;
			}
			if (code == "Enter" || code == "NumpadEnter") {
				e.preventDefault();
				// closing before the fade-in marks the popup visible leaves it stuck
				// (see the craft popup); remember the ENTER and act once it is shown
				if (!this.isGoPopupInteractive()) {
					this.goPopupPendingConfirm = true;
					return;
				}
				this.confirmGoPopup();
				return;
			}
		},

		isGoPopupInteractive: function () {
			if (!$("#go-popup").is(":visible")) return false;
			if ($("#go-popup").attr("data-visible") != "true") return false;
			if (GameGlobals.uiFunctions.popupManager.isClosing("go-popup")) return false;
			return true;
		},

		getGoPopupHintText: function () {
			return "Type a level number or press \u2191 \u2193, then press ENTER.";
		},

		// levels that have a camp, lowest first; the arrow keys walk this list
		getGoPopupCampLevels: function () {
			let levels = [];
			for (var node = this.campNodes.head; node; node = node.next) {
				levels.push(node.entity.get(PositionComponent).level);
			}
			levels.sort(function (a, b) { return a - b; });
			return levels;
		},

		// ARROW UP picks the nearest camp above the shown level, ARROW DOWN the
		// nearest below; an empty value starts from the player's own level. The
		// list does not wrap: at the top or bottom camp the key does nothing
		stepGoPopupLevel: function (direction) {
			let levels = this.getGoPopupCampLevels();
			if (levels.length < 1) return;
			let current = parseInt(this.goPopupValue, 10);
			if (isNaN(current)) {
				current = this.playerPosNodes.head ? this.playerPosNodes.head.position.level : levels[0];
			}
			let target = null;
			if (direction > 0) {
				for (let i = 0; i < levels.length; i++) {
					if (levels[i] > current) { target = levels[i]; break; }
				}
			} else {
				for (let i = levels.length - 1; i >= 0; i--) {
					if (levels[i] < current) { target = levels[i]; break; }
				}
			}
			if (target == null) return;
			this.goPopupValue = String(target);
			this.updateGoPopupValue(direction);
		},

		isGoPopupRolling: function () {
			return $("#go-popup-value .go-popup-digit-out").length > 0;
		},

		// direction: 0 or undefined for a plain replace (typing), +1 / -1 for a
		// roll. On a roll the old number slides out and the new one slides in
		// from the side the player moved towards, like a column of floors
		updateGoPopupValue: function (direction) {
			let text = this.goPopupValue.length > 0 ? this.goPopupValue : "\u2013";
			let $value = $("#go-popup-value");
			let $current = $value.children(".go-popup-digit").not(".go-popup-digit-out");
			if (!direction) {
				$value.children(".go-popup-digit-out").remove();
				if ($current.length < 1) {
					$value.append("<span class='go-popup-digit'></span>");
					$current = $value.children(".go-popup-digit");
				}
				if ($current.text() != text) $current.text(text);
				this.updateGoPopupStatus();
				return;
			}
			$value.children(".go-popup-digit-out").remove();
			let dirClass = direction > 0 ? "go-popup-digit-up" : "go-popup-digit-down";
			$current.removeClass("go-popup-digit-in go-popup-digit-up go-popup-digit-down");
			$current.addClass("go-popup-digit-out " + dirClass);
			$current.one("animationend", function () { $(this).remove(); });
			// a hidden tab fires no animationend, so never leave the old number behind
			setTimeout(function () { $current.remove(); }, 400);
			let $next = $("<span class='go-popup-digit go-popup-digit-in " + dirClass + "'></span>");
			$next.text(text);
			$value.append($next);
			this.updateGoPopupStatus();
		},

		// readiness line under the typed number: is that camp's Go button usable right
		// now, and if not, why (busy with another action, cooldown, not enough
		// stamina). Refreshed every tick while the popup is open so the busy
		// countdown ticks down; the underlying button ignores clicks while disabled,
		// so without this line an ENTER that does nothing looks like a broken key
		getGoPopupStatus: function () {
			let level = parseInt(this.goPopupValue, 10);
			if (isNaN(level)) return null;
			if (!this.playerPosNodes.head) return null;
			let node = this.getCampNodeForLevel(level);
			if (!node) return { isReady: false, text: "No camp on level " + level };
			let playerLevel = this.playerPosNodes.head.position.level;
			if (playerLevel == level) return { isReady: false, text: "You are already on level " + level };

			let campOrdinal = GameGlobals.gameState.getCampOrdinal(level);
			let action = "move_camp_global_" + campOrdinal;
			let helper = GameGlobals.playerActionsHelper;

			let reqsResult = helper.checkRequirements(action, false);
			if (reqsResult.value < 1) {
				return { isReady: false, text: "Waiting: " + Text.t(reqsResult.reason) };
			}

			let isLocationAction = PlayerActionConstants.isLocationAction(action);
			let locationKey = GameGlobals.gameState.getActionLocationKey(isLocationAction, this.playerPosNodes.head.position);
			let cooldownTotal = PlayerActionConstants.getCooldown(action);
			let cooldownLeft = GameGlobals.gameState.getActionCooldown(action, locationKey, cooldownTotal);
			if (cooldownLeft) {
				return { isReady: false, text: "Waiting: cooldown " + Math.ceil(cooldownLeft) + "s" };
			}

			let costs = helper.getCosts(action) || {};
			for (let key in costs) {
				if (helper.checkCost(action, key) >= 1) continue;
				let name = UIConstants.getCostDisplayName(key).toLowerCase();
				let text = "Not enough " + name;
				if (key == "stamina") {
					let have = Math.floor(GameGlobals.playerHelper.getCurrentStamina());
					let need = Math.ceil(costs[key]);
					text += " (" + have + " / " + need + ")";
				}
				return { isReady: false, text: text };
			}

			return { isReady: true, text: "Ready (stamina " + Math.ceil(costs.stamina || 0) + ")" };
		},

		updateGoPopupStatus: function () {
			let $status = $("#go-popup-status");
			if ($status.length < 1) return;
			let status = this.getGoPopupStatus();
			let text = status ? status.text : "";
			if ($status.text() != text) $status.text(text);
			$status.toggleClass("warning", !!status && !status.isReady);
			$status.toggleClass("go-popup-status-ready", !!status && status.isReady);
		},

		confirmGoPopup: function () {
			let level = parseInt(this.goPopupValue, 10);
			if (isNaN(level)) {
				GameGlobals.uiFunctions.popupManager.closePopup("go-popup");
				return;
			}
			let node = this.getCampNodeForLevel(level);
			if (!node) {
				$("#go-popup-desc").text("There is no camp on level " + level + ".");
				this.goPopupValue = "";
				this.updateGoPopupValue();
				return;
			}
			let playerLevel = this.playerPosNodes.head.position.level;
			if (playerLevel == level) {
				$("#go-popup-desc").text("You are already on level " + level + ".");
				this.goPopupValue = "";
				this.updateGoPopupValue();
				return;
			}
			// a disabled Go button swallows the click, so keep the popup open and let
			// the status line explain what the jump is waiting on
			let status = this.getGoPopupStatus();
			if (status && !status.isReady) {
				this.updateGoPopupStatus();
				return;
			}
			let campOrdinal = GameGlobals.gameState.getCampOrdinal(level);
			GameGlobals.uiFunctions.popupManager.closePopup("go-popup");
			$("#out-action-move-camp-" + campOrdinal).click();
		},

		getCampNodeForLevel: function (level) {
			for (var node = this.campNodes.head; node; node = node.next) {
				if (node.entity.get(PositionComponent).level == level) return node;
			}
			return null;
		},

		// each Go button's chip shows the full key sequence for its row (G13).
		// The level is world data, so the chip is set here and not in createCampRow,
		// and the manual hint entry keeps updateHotkeyHints rewriting it, not clearing it
		updateCampRowGoHint: function (rowID, level) {
			let $goBtn = $("#camp-overview tr#" + rowID + " .camp-overview-btn button");
			if ($goBtn.length < 1) return;
			let goHint = "G" + level;
			GameGlobals.uiFunctions.manualHotkeyHints[$goBtn.attr("action")] = goHint;
			let $goHintElement = $goBtn.children(".hotkey-hint");
			if ($goHintElement.length < 1) {
				$goBtn.append("<div class='hotkey-hint hide-in-small-layout'></div>");
				$goHintElement = $goBtn.children(".hotkey-hint");
			}
			if ($goHintElement.text() != goHint) $goHintElement.text(goHint);
			$goHintElement.toggleClass("hidden", !GameGlobals.gameState.settings.hotkeysEnabled);
		},

		onPopupShown: function () {
			if (!this.isGoPopupOpen) return;
			if (!this.goPopupPendingConfirm) return;
			this.goPopupPendingConfirm = false;
			this.confirmGoPopup();
		},

		onPopupClosed: function (popupID) {
			if (popupID == "go-popup") {
				this.isGoPopupOpen = false;
				this.goPopupPendingConfirm = false;
				$(document).off("keydown.gopopup");
			}
		},

		update: function () {
			if (GameGlobals.gameState.uiStatus.isHidden) return;
			this.updateBubble();
			if (this.isGoPopupOpen) this.updateGoPopupStatus();
		},

		slowUpdate: function () {
			if (GameGlobals.gameState.uiStatus.isHidden) return;
			var isActive = GameGlobals.gameState.uiStatus.currentTab === GameGlobals.uiFunctions.elementIDs.tabs.world;
			this.updateNodes(isActive);
		},

		refresh: function () {
			$("#tab-header h2").text(Text.t("ui.main.tab_tribe_header"));
			
			GameGlobals.uiFunctions.toggle($("#camp-overview tr.camp-overview-camp"), false);
			
			this.updateNodes(true);
			this.updateMessages();
			
			GameGlobals.uiFunctions.toggle(".camp-overview-lvl14", GameGlobals.gameState.numCamps > 8);
			$(".camp-overview-lvl14 hr").toggleClass("warning", GameGlobals.levelHelper.getLevelBuiltOutImprovementsCount(14, improvementNames.tradepost_connector) <= 0);
		},
		
		updateNodes: function (isActive) {
			this.alerts = {};
			this.notifications = {};
			this.campsWithAlert = 0;
			
			for (let i = 0; i < this.sortedCampNodes.length; i++) {
				this.updateNode(this.sortedCampNodes[i], isActive);
			}

			if (isActive) {
				GameGlobals.uiFunctions.updateInfoCallouts("#camp-overview");
			}
		},

		updateBubble: function () {
			let bubbleNumber = this.campsWithAlert;
			if (!GameGlobals.gameState.hasSeenTab(GameGlobals.uiFunctions.elementIDs.tabs.world)) bubbleNumber = "!";
			GameGlobals.uiFunctions.updateBubble("#switch-world .bubble", this.bubbleNumber, bubbleNumber);
			this.bubbleNumber = bubbleNumber;
		},

		updateMessages: function () {
			// pick one
			let vosbyprio = [];
			let highestprio = -1;
			for (let lvl in this.notifications) {
				for (let i = 0; i < this.notifications[lvl].length; i++) {
					let type = this.notifications[lvl][i];
					let prio = this.getNotificationPriority(type);
					if (!vosbyprio[prio]) vosbyprio[prio] = [];
					if (highestprio < 0 || prio < highestprio) highestprio = prio;
					vosbyprio[prio].push({ lvl: lvl, type: type });
				}
			}

			// show
			let msg = { key: "ui.tribe.status_no_news_message" }
			if (highestprio > 0) {
				let selection = vosbyprio[highestprio];
				let vo = selection[Math.floor(Math.random() * selection.length)];
				msg = this.getNotificationMessage(vo.type, vo.lvl) || msg;
			}

			GameGlobals.uiFunctions.setText("#world-message", msg.key, msg.options);
		},

		updateNode: function (node, isActive) {
			if (!node.entity) return;
			
			var camp = node.camp;
			var level = node.entity.get(PositionComponent).level;
			var campOrdinal = GameGlobals.gameState.getCampOrdinal(level);
			
			this.updateCampNotifications(node);

			var isAlert = this.alerts[level].length > 0;
			if (isAlert) this.campsWithAlert++;

			if (!isActive) return;

			var rowID = this.getCampRowID(campOrdinal);
			var row = $("#camp-overview tr#" + rowID);
			
			GameGlobals.uiFunctions.toggle(row, true);

			if (row.length < 1) {
				log.w("camp row missing: " + campOrdinal);
				return;
			}

			// Update row
			this.updateCampRowMisc(node, rowID, isAlert, this.alerts[level]);
			this.updateCampRowResources(node, rowID);
			this.updateCampRowStats(node, rowID);
		},

		updateCampNotifications: function (node) {
			var camp = node.camp;
			var level = node.entity.get(PositionComponent).level;
			
			let featuresComponent = node.entity.get(SectorFeaturesComponent);
			var caravansComponent = node.entity.get(OutgoingCaravansComponent);
			var playerPosComponent = this.playerPosNodes.head.position;
			var isPlayerInCampLevel = level === playerPosComponent.level;

			this.alerts[level] = [];
			this.notifications[level] = [];

			let hasTrader = GameGlobals.campHelper.hasEvent(node.entity, OccurrenceConstants.campOccurrenceTypes.trader);
			let hasRecruit = GameGlobals.campHelper.hasEvent(node.entity, OccurrenceConstants.campOccurrenceTypes.recruit);
			let hasNewVisitor = GameGlobals.campHelper.hasNewEvent(node.entity, OccurrenceConstants.campOccurrenceTypes.visitor);
			let hasRefugees = GameGlobals.campHelper.hasEvent(node.entity, OccurrenceConstants.campOccurrenceTypes.refugees);
			let hasDisease = GameGlobals.campHelper.hasEvent(node.entity, OccurrenceConstants.campOccurrenceTypes.disease);
			let hasRaid = GameGlobals.campHelper.hasEvent(node.entity, OccurrenceConstants.campOccurrenceTypes.raid);

			let recentEventThreshold = 60 * 30;

			let secondsSinceLastRaid = camp.lastRaid ? Math.floor((new Date() - camp.lastRaid.timestamp) / 1000) : 0;
			let hasRecentRaid = camp.lastRaid && !camp.lastRaid.wasVictory && camp.lastRaid.isValid() && secondsSinceLastRaid < recentEventThreshold;

			let secondsSinceLastEvent = camp.lastEvent ? Math.floor((new Date() - camp.lastEvent.timestamp) / 1000) : 0;
			let hasRecentAccident = camp.lastEvent && camp.lastEvent.type == OccurrenceConstants.campOccurrenceTypes.accident && secondsSinceLastEvent < recentEventThreshold;
			let hasRecentDisaster = camp.lastEvent && camp.lastEvent.type == OccurrenceConstants.campOccurrenceTypes.disaster && secondsSinceLastEvent < recentEventThreshold;

			let unAssignedPopulation = camp.getFreePopulation();
			
			let improvements = node.entity.get(SectorImprovementsComponent);
			let hasDamagedBuildings = improvements.hasDamagedBuildings();
			
			let numCaravans = caravansComponent.outgoingCaravans.length;

			if (!isPlayerInCampLevel) {
				if (hasRaid) {
					this.notifications[level].push(this.campNotificationTypes.EVENT_RAID_ONGOING);
				}
				if (hasRecentRaid) {
					this.notifications[level].push(this.campNotificationTypes.EVENT_RAID_RECENT);
				}
				if (hasRecentAccident) {
					this.notifications[level].push(this.campNotificationTypes.EVENT_ACCIDENT_RECENT);
				}
				if (hasRecentDisaster) {
					this.notifications[level].push(this.campNotificationTypes.EVENT_DISASTER_RECENT);
				}
				if (hasRecruit) {
					this.alerts[level].push(this.campNotificationTypes.EVENT_RECRUIT);
					this.notifications[level].push(this.campNotificationTypes.EVENT_RECRUIT);
				}
				if (hasNewVisitor) {
					this.alerts[level].push(this.campNotificationTypes.EVENT_VISITOR);
					this.notifications[level].push(this.campNotificationTypes.EVENT_VISITOR);
				}
				if (hasRefugees) {
					this.alerts[level].push(this.campNotificationTypes.EVENT_REFUGEES);
					this.notifications[level].push(this.campNotificationTypes.EVENT_REFUGEES);
				}
				if (hasDisease) {
					this.notifications[level].push(this.campNotificationTypes.EVENT_DISEASE);
				}
				if (hasTrader) {
					this.alerts[level].push(this.campNotificationTypes.EVENT_TRADER);
					this.notifications[level].push(this.campNotificationTypes.EVENT_TRADER);
				}
				if (unAssignedPopulation > 0) {
					this.alerts[level].push(this.campNotificationTypes.POP_UNASSIGNED);
					this.notifications[level].push(this.campNotificationTypes.POP_UNASSIGNED);
				}
				if (hasDamagedBuildings) {
					this.alerts[level].push(this.campNotificationTypes.BUILDING_DAMAGED);
					this.notifications[level].push(this.campNotificationTypes.BUILDING_DAMAGED);
				}
				if (camp.populationChangePerSecWithoutCooldown < 0) {
					this.alerts[level].push(this.campNotificationTypes.POP_DECREASING);
					this.notifications[level].push(this.campNotificationTypes.POP_DECREASING);
				}
				if (camp.getDisabledPopulation() > 0) {
					this.notifications[level].push(this.campNotificationTypes.POP_DISABLED);
				}
				if (featuresComponent.sunlit && improvements.getCount(improvementNames.sundome) <= 0) {
					this.notifications[level].push(this.campNotificationTypes.SUNLIT);
				}
				if (camp.populationChangePerSecWithoutCooldown > 0) {
					this.notifications[level].push(this.campNotificationTypes.POP_INCREASING);
				}
				if (numCaravans > 0) {
					this.notifications[level].push(this.campNotificationTypes.EVENT_OUTGOING_CARAVAN);
				}
				if (GameGlobals.campHelper.getMaxWorkers(node.entity, "gardener") > 0 && camp.assignedWorkers.gardener < 1) {
					this.notifications[level].push(this.campNotificationTypes.POP_NO_GARDENERS);
				}
				else if (GameGlobals.campHelper.getMaxWorkers(node.entity, "rubbermaker") > 0 && camp.assignedWorkers.rubbermaker < 1) {
					this.notifications[level].push(this.campNotificationTypes.POP_NO_RUBBERMAKERS);
				}
				else if (GameGlobals.campHelper.getMaxWorkers(node.entity, "chemist") > 0 && camp.assignedWorkers.chemist < 1) {
					this.notifications[level].push(this.campNotificationTypes.POP_NO_CHEMISTS);
				}
			}
			
			if (level > 14 && !GameGlobals.levelHelper.isCampReachableByTribeTraders(node.entity)) {
				this.notifications[level].push(this.campNotificationTypes.STATUS_NON_REACHABLE_BY_TRADERS)
			}
		},

		createCampRow: function (campOrdinal, rowID) {

			var rowHTML = "<tr id='" + rowID + "' class='camp-overview-camp'>";
			var btnID = "out-action-move-camp-" + campOrdinal;
			var btnAction = "move_camp_global_" + campOrdinal;
			rowHTML += "<td class='camp-overview-level'><div class='camp-overview-level-container lvl13-box-1'></div></td>";
			rowHTML += "<td class='camp-overview-name hide-in-small-layout'><span class='label info-callout-target info-callout-target-side'></span></td>";
			rowHTML += "<td class='camp-overview-population list-amount hide-in-small-layout nowrap'><span class='value'></span><span class='change-indicator'></span></td>";
			rowHTML += "<td class='camp-overview-robots list-amount hide-in-small-layout nowrap'><span class='value'></span><span class='change-indicator'></span></td>";
			rowHTML += "<td class='camp-overview-reputation list-amount hide-in-small-layout nowrap'><span class='value'></span><span class='change-indicator'></span></td>";
			rowHTML += "<td class='camp-overview-raid list-amount hide-in-small-layout'><span class='value'></span></span></td>";
			rowHTML += "<td class='camp-overview-disease list-amount hide-in-small-layout'><span class='value'></span></span></td>";
			rowHTML += "<td class='camp-overview-storage list-amount'></td>";
			rowHTML += "<td class='camp-overview-production'>";
			for(let key in resourceNames) {
				let name = resourceNames[key];
				if (name == resourceNames.robots) continue;
				rowHTML += UIConstants.createResourceIndicator(name, false, rowID + "-" + name, false, true, false, false) + " ";
			}
			rowHTML += "</td>";
			
			rowHTML += "<td class='camp-overview-stats nowrap hide-in-small-layout'>";
			rowHTML += "<span class='camp-overview-stats-evidence hide-in-small-layout info-callout-target info-callout-target-small'>";
			rowHTML += "<span class='icon'><img src='img/stat-evidence.png' alt='evidence'/></span><span class='change-indicator'></span> ";
			rowHTML += "</span> ";
			rowHTML += "<span class='camp-overview-stats-rumours hide-in-small-layout info-callout-target info-callout-target-small'>";
			rowHTML += "<span class='icon'><img src='img/stat-rumours.png' alt='rumours'/></span><span class='change-indicator'></span> ";
			rowHTML += "</span>";
			rowHTML += "<span class='camp-overview-stats-hope hide-in-small-layout info-callout-target info-callout-target-small'>";
			rowHTML += "<span class='icon'><img src='img/stat-hope.png' alt='hope'/></span><span class='change-indicator'></span> ";
			rowHTML += "</span>";
			rowHTML += "</td>";

			rowHTML += "<td class='camp-overview-btn'><button class='btn-mini action action-move' id='" + btnID + "' action='" + btnAction + "'>Go</button></td>";
			rowHTML += "<td class='camp-overview-camp-bubble'><div class='bubble info-callout-target info-callout-target-small' description=''>!</div></td>";

			rowHTML += "</tr>";
			$("#camp-overview").append(rowHTML);
		},
		
		createLevel14Row: function () {
			var rowHTML = "<tr class='camp-overview-special-row'>";
			rowHTML += "<td class='camp-overview-lvl14' colspan=10><hr></td>";
			rowHTML += "</tr>";
			$("#camp-overview").append(rowHTML);
		},

		updateCampRowMisc: function (node, rowID, isAlert, alerts) {
			var camp = node.camp;
			var level = node.entity.get(PositionComponent).level;
			var playerPosComponent = this.playerPosNodes.head.position;
			var isPlayerInCampLevel = level === playerPosComponent.level;
			var unAssignedPopulation = camp.getFreePopulation();
			var improvements = node.entity.get(SectorImprovementsComponent);
			var levelComponent = GameGlobals.levelHelper.getLevelEntityForSector(node.entity).get(LevelComponent);
			var resources = node.entity.get(ResourcesComponent);
			var resourceAcc = node.entity.get(ResourceAccumulationComponent);

			$("#camp-overview tr#" + rowID).toggleClass("current", isPlayerInCampLevel);
			GameGlobals.uiFunctions.toggle("#camp-overview tr#" + rowID + " .camp-overview-btn button", !isPlayerInCampLevel);
			$("#camp-overview tr#" + rowID + " .camp-overview-name .label").text(camp.campName);
			$("#camp-overview tr#" + rowID + " .camp-overview-name .label").attr("description", camp.campName);
			GameGlobals.uiFunctions.toggle("#camp-overview tr#" + rowID + " .camp-overview-camp-bubble .bubble", isAlert);
			
			this.updateCampRowGoHint(rowID, level);

			$("#camp-overview tr#" + rowID + " .camp-overview-level-container").text(level);
			$("#camp-overview tr#" + rowID + " .camp-overview-level-container").toggleClass("lvl-container-camp-normal", levelComponent.habitability >= 1);
			$("#camp-overview tr#" + rowID + " .camp-overview-level-container").toggleClass("lvl-container-camp-outpost", levelComponent.habitability < 1);

			var alertDesc = "";
			for (let i = 0; i < alerts.length; i++) {
				alertDesc += this.getAlertDescription(alerts[i]);
				if (i !== alerts.length - 1) alertDesc += "<br/>";
			}
			UIConstants.updateCalloutContent("#camp-overview tr#" + rowID + " .camp-overview-camp-bubble .bubble", alertDesc, true);
			
			var maxPopulation = CampConstants.getHousingCap(improvements);
			$("#camp-overview tr#" + rowID + " .camp-overview-population .value").text(Math.floor(camp.population) + "/" + maxPopulation + (unAssignedPopulation > 0 ? " (" + unAssignedPopulation + ")" : ""));
			$("#camp-overview tr#" + rowID + " .camp-overview-population .value").toggleClass("warning", camp.populationChangePerSecWithoutCooldown < 0);
			this.updateChangeIndicator($("#camp-overview tr#" + rowID + " .camp-overview-population .change-indicator"), camp.populationChangePerSecWithoutCooldown);
			
			let showRobots = GameGlobals.gameState.unlockedFeatures.resource_robots || false;
			$("#camp-overview tr#" + rowID + " .camp-overview-robots").toggleClass("list-amount", showRobots);
			$("#camp-overview tr#" + rowID + " .camp-overview-robots").toggleClass("nowidth", !showRobots);
			if (showRobots) {
				let robots = resources.resources.robots || 0;
				let maxRobots = GameGlobals.campHelper.getRobotStorageCapacity(node.entity);
				let robotsAccumulationRaw = resourceAcc.getChange(resourceNames.robots);
				let robotsAccumulation = robots <= maxRobots || robotsAccumulationRaw < 0 ? robotsAccumulationRaw : 0;
				$("#camp-overview tr#" + rowID + " .camp-overview-robots .value").text(maxRobots > 0 ? Math.floor(robots) + "/" + maxRobots : "-");
				this.updateChangeIndicator($("#camp-overview tr#" + rowID + " .camp-overview-robots .change-indicator"), robotsAccumulation, false, robots <= 0);
			} else {
				this.updateChangeIndicator($("#camp-overview tr#" + rowID + " .camp-overview-robots .change-indicator"), false, false, true);
			}

			var reputationComponent = node.reputation;
			let reputationValue = UIConstants.roundValue(reputationComponent.value, true, true);
			$("#camp-overview tr#" + rowID + " .camp-overview-reputation .value").text(reputationValue);
			$("#camp-overview tr#" + rowID + " .camp-overview-reputation .value").toggleClass("warning", reputationComponent.targetValue < 1);
			this.updateChangeIndicator($("#camp-overview tr#" + rowID + " .camp-overview-reputation .change-indicator"), reputationComponent.accumulation);
			
			var soldiers = camp.assignedWorkers.soldier || 0;
			var soldierLevel = GameGlobals.upgradeEffectsHelper.getWorkerLevel("soldier", this.tribeUpgradesNodes.head.upgrades);
			var raidDanger = OccurrenceConstants.getRaidDanger(improvements, camp.population, soldiers, soldierLevel, levelComponent.raidDangerFactor);
			var raidWarning = raidDanger > CampConstants.REPUTATION_PENALTY_DEFENCES_THRESHOLD;
			$("#camp-overview tr#" + rowID + " .camp-overview-raid .value").text(UIConstants.roundValue(raidDanger * 100) + "%");
			$("#camp-overview tr#" + rowID + " .camp-overview-raid .value").toggleClass("warning", raidWarning);

			let hasHerbs = GameGlobals.campHelper.hasHerbs(node.entity);
			let hasMedicine = GameGlobals.campHelper.hasMedicine(node.entity);
			let apothecaryLevel = GameGlobals.upgradeEffectsHelper.getWorkerLevel("apothecary", this.tribeUpgradesNodes.head.upgrades);
			let diseaseChance = OccurrenceConstants.getDiseaseOutbreakChance(camp.population, hasHerbs, hasMedicine, apothecaryLevel);
			let diseaseWarning = diseaseChance > CampConstants.REPUTATION_PENALTY_DEFENCES_THRESHOLD;
			$("#camp-overview tr#" + rowID + " .camp-overview-disease .value").text(UIConstants.roundValue(diseaseChance * 100) + "%");
			$("#camp-overview tr#" + rowID + " .camp-overview-disease .value").toggleClass("warning", diseaseWarning);
			
			var hasTradePost = improvements.getCount(improvementNames.tradepost) > 0;
			var storageText = resources.storageCapacity;
			if (!hasTradePost) {
				storageText = "(" + resources.storageCapacity + ")";
			}
			$("#camp-overview tr#" + rowID + " .camp-overview-storage").text(storageText);
		},
		
		updateCampRowResources: function (node, rowID) {
			// TODO updateResourceIndicatorCallout is a performance bottleneck
			var resources = node.entity.get(ResourcesComponent);
			var resourceAcc = node.entity.get(ResourceAccumulationComponent);
			for (let key in resourceNames) {
				let name = resourceNames[key];
				if (name == resourceNames.robots) continue;
				var amount = Math.floor(resources.resources[name]);
				var change = resourceAcc.resourceChange.getResource(name);
				var storage = GameGlobals.resourcesHelper.getCurrentCampStorage(node.entity);
				var indicatorID = "#" + rowID + "-" + name;
				UIConstants.updateResourceIndicator(
					indicatorID,
					amount,
					change,
					storage,
					true,
					false,
					false,
					name === resourceNames.food || name === resourceNames.water,
					Math.abs(change) > 0.0001,
					false
				);
				UIConstants.updateResourceIndicatorCallout("#" + rowID + "-" + name, name, resourceAcc.getSources(name));
			}
		},
		
		updateCampRowStats: function (node, rowID) {
			var level = node.entity.get(PositionComponent).level;
			
			var evidenceComponent = this.playerStatsNodes.head.evidence;
			var evidenceChange = evidenceComponent.accumulationPerCamp[level] || 0;
			GameGlobals.uiFunctions.toggle($("#camp-overview tr#" + rowID + " .camp-overview-stats-evidence"), evidenceChange > 0);
			this.updateChangeIndicator($("#camp-overview tr#" + rowID + " .camp-overview-stats-evidence .change-indicator"), evidenceChange);
			UIConstants.updateCalloutContent("#camp-overview tr#" + rowID + " .camp-overview-stats-evidence", "evidence: " + UIConstants.roundValue(evidenceChange, true, true, 1000), true);
			
			var rumoursComponent = this.playerStatsNodes.head.rumours;
			var rumoursChange = rumoursComponent.accumulationPerCamp[level] || 0;
			GameGlobals.uiFunctions.toggle($("#camp-overview tr#" + rowID + " .camp-overview-stats-rumours"), rumoursChange > 0);
			this.updateChangeIndicator($("#camp-overview tr#" + rowID + " .camp-overview-stats-rumours .change-indicator"), rumoursChange);
			UIConstants.updateCalloutContent("#camp-overview tr#" + rowID + " .camp-overview-stats-rumours", "rumours: " + UIConstants.roundValue(rumoursChange, true, true, 1000), true);
			
			var hopeComponent = this.playerStatsNodes.head.entity.get(HopeComponent);
			var hopeChange = hopeComponent ? hopeComponent.accumulationPerCamp[level] || 0 : 0;
			GameGlobals.uiFunctions.toggle($("#camp-overview tr#" + rowID + " .camp-overview-stats-hope"), hopeChange > 0);
			this.updateChangeIndicator($("#camp-overview tr#" + rowID + " .camp-overview-stats-hope .change-indicator"), hopeChange);
			UIConstants.updateCalloutContent("#camp-overview tr#" + rowID + " .camp-overview-stats-hope", "hope: " + UIConstants.roundValue(hopeChange, true, true, 1000), true);
		},

		getAlertDescription: function (notificationType) {
			switch (notificationType) {
				case this.campNotificationTypes.EVENT_RAID_ONGOING: return "raid";
				case this.campNotificationTypes.EVENT_TRADER: return "trader";
				case this.campNotificationTypes.EVENT_RECRUIT: return "recruit";
				case this.campNotificationTypes.EVENT_REFUGEES: return "refugees";
				case this.campNotificationTypes.EVENT_DISEASE: return "disease";
				case this.campNotificationTypes.EVENT_VISITOR: return "visitor";
				case this.campNotificationTypes.POP_UNASSIGNED: return "unassigned workers";
				case this.campNotificationTypes.POP_DECREASING: return "population decreasing";
				case this.campNotificationTypes.BUILDING_DAMAGED: return "damaged building";
				case this.campNotificationTypes.EVENT_OUTGOING_CARAVAN: return "outgoing caravan";
				default: return "";
			}
		},

		getNotificationMessage: function (notificationType, level) {
			let campNode = GameGlobals.campHelper.getCampNodeForLevel(level);
			let campComponent = campNode.camp;
			let options = { level: level };

			switch (notificationType) {
				case this.campNotificationTypes.EVENT_RAID_RECENT:
					options.timeSince = UIConstants.getTimeSinceText(campComponent.lastRaid.timestamp);
					return { key: "ui.tribe.status_raid_message", options: options };

				case this.campNotificationTypes.EVENT_DISASTER_RECENT:
					options.timeSince = UIConstants.getTimeSinceText(campComponent.lastRaid.timestamp);
					return { key: "ui.tribe.status_disaster_message", options: options };

				case this.campNotificationTypes.EVENT_ACCIDENT_RECENT:
					options.timeSince = UIConstants.getTimeSinceText(campComponent.lastRaid.timestamp);
					return { key: "ui.tribe.status_accident_message", options: options };
					
				case this.campNotificationTypes.EVENT_TRADER:
					let traderComponent = campNode.entity.get(TraderComponent);
					if (!traderComponent || !traderComponent.caravan) return "";
					options.traderName = traderComponent.caravan.name;
					return { key: "ui.tribe.status_trader_message", options: options };
				
				case this.campNotificationTypes.EVENT_OUTGOING_CARAVAN:
					let caravansComponent = campNode.entity.get(OutgoingCaravansComponent);
					if (!caravansComponent || caravansComponent.outgoingCaravans.length < 1) return null;
					let caravan = caravansComponent.outgoingCaravans[0];
					let timeLeft = GameGlobals.tribeHelper.getTimeLeftForOutgoingCaravan(caravan);
					options.timeUntil = UIConstants.getTimeToNum(timeLeft, true);
					return { key: "ui.tribe.status_outgoing_caravan_message", options: options };
					
				case this.campNotificationTypes.EVENT_RECRUIT: 
					return { key: "ui.tribe.status_recruit_message", options: options };
				case this.campNotificationTypes.EVENT_VISITOR: 
					let visitorComponent = campNode.entity.get(VisitorComponent);
					options.characterType = visitorComponent.visitorType;
					return { key: "ui.tribe.status_visitor_message", options: options };
				case this.campNotificationTypes.EVENT_REFUGEES: 
					return { key: "ui.tribe.status_refugees_message", options: options };
				case this.campNotificationTypes.EVENT_DISEASE: 
					return { key: "ui.tribe.status_disease_message", options: options };
				case this.campNotificationTypes.POP_UNASSIGNED: 
					return { key: "ui.tribe.status_unassigned_workers_message", options: options };
				case this.campNotificationTypes.POP_DECREASING: 
					return { key: "ui.tribe.status_population_decreasing_message", options: options };
				case this.campNotificationTypes.SUNLIT: 
					return { key: "ui.tribe.status_sunlit_message", options: options };
				case this.campNotificationTypes.POP_DISABLED: 
					return { key: "ui.tribe.status_population_disabled_message", options: options };
				case this.campNotificationTypes.POP_INCREASING: 
					return { key: "ui.tribe.status_population_increasing_message", options: options };
				case this.campNotificationTypes.POP_NO_GARDENERS: 
					return { key: "ui.tribe.status_unused_greenhouse_message", options: options };
				case this.campNotificationTypes.POP_NO_RUBBERMAKERS: 
					return { key: "ui.tribe.status_unused_plantation_message", options: options };
				case this.campNotificationTypes.POP_NO_CHEMISTS: 
					return { key: "ui.tribe.status_unused_refinery_message", options: options };
				case this.campNotificationTypes.BUILDING_DAMAGED: 
					return { key: "ui.tribe.status_damaged_buildings_message", options: options };
				case this.campNotificationTypes.STATUS_NON_REACHABLE_BY_TRADERS: 
					return { key: "ui.tribe.status_no_trade_message", options: options };
				default: return null;
			}
		},

		// smaller number -> higher prio
		getNotificationPriority: function (notificationType) {
			switch (notificationType) {
				case this.campNotificationTypes.POP_DECREASING: return 1;
				case this.campNotificationTypes.EVENT_RAID_ONGOING: return 2;
				case this.campNotificationTypes.EVENT_RAID_RECENT: return 3;
				case this.campNotificationTypes.BUILDING_DAMAGED: return 4;
				case this.campNotificationTypes.EVENT_TRADER: return 5;
				case this.campNotificationTypes.EVENT_RECRUIT: return 6;
				case this.campNotificationTypes.EVENT_DISASTER_RECENT: return 7;
				case this.campNotificationTypes.EVENT_ACCIDENT_RECENT: return 8;
				case this.campNotificationTypes.POP_UNASSIGNED: return 9;
				case this.campNotificationTypes.EVENT_DISEASE: return 10;
				case this.campNotificationTypes.EVENT_VISITOR: return 11;
				case this.campNotificationTypes.EVENT_REFUGEES: return 12;
				case this.campNotificationTypes.STATUS_NON_REACHABLE_BY_TRADERS: return 13;
				case this.campNotificationTypes.SUNLIT: return 14;
				case this.campNotificationTypes.EVENT_OUTGOING_CARAVAN: return 15;
				case this.campNotificationTypes.POP_NO_GARDENERS: return 16;
				case this.campNotificationTypes.POP_NO_RUBBERMAKERS: return 17;
				case this.campNotificationTypes.POP_NO_CHEMISTS: return 18;
				case this.campNotificationTypes.POP_DISABLED: return 19;
				case this.campNotificationTypes.POP_INCREASING: return 20;
				default: return 13;
			}
		},

		updateChangeIndicator: function (indicator, accumulation, showWarning, hideCompletely) {
			GameGlobals.uiFunctions.toggle(indicator, !hideCompletely);
			indicator.toggleClass("indicator-increase", accumulation > 0);
			indicator.toggleClass("indicator-even", accumulation === 0);
			indicator.toggleClass("indicator-decrease", !showWarning && accumulation < 0);
		},
		
		sortCampNodes: function () {
			// todo don't do the first loop on every update?
			var nodes = [];
			for (var node = this.campNodes.head; node; node = node.next) {
				nodes.push(node);
			}
			nodes.sort(function (a, b) {
				var levela = a.entity.get(PositionComponent).level;
				var levelb = b.entity.get(PositionComponent).level;
				return levelb - levela;
			});
			this.sortedCampNodes = nodes;
		},
		
		getCampRowID: function (campOrdinal) {
			return "summary-camp-" + campOrdinal;
		},

		onTabChanged: function () {
			this.sortCampNodes();
			if (GameGlobals.gameState.uiStatus.currentTab === GameGlobals.uiFunctions.elementIDs.tabs.world) {
				this.refresh();
			}
		},
		
		onCampBuilt: function () {
			if (GameGlobals.gameState.uiStatus.isHidden) return;
			this.sortCampNodes();
			this.refresh();
		},

	});

	return UIOutTribeSystem;
});
