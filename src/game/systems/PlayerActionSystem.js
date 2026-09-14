// Manages player actions that have a duration
define([
	'ash',
	'game/GameGlobals',
	'game/constants/GameConstants',
	'game/constants/PlayerActionConstants',
	'game/nodes/PlayerActionNode',
], function (Ash, GameGlobals, GameConstants, PlayerActionConstants, PlayerActionNode) {
	var PlayerActionSystem = Ash.System.extend({
	
		playerActionNodes: null,
		
		gameState: null,

		constructor: function () {
			this.playerActionFunctions = GameGlobals.playerActionFunctions;
		},

		addToEngine: function (engine) {
			this.engine = engine;
			this.playerActionNodes = engine.getNodeList(PlayerActionNode);
		},

		removeFromEngine: function (engine) {
			this.playerActionNodes = null;
			this.engine = null;
		},

		update: function (time) {
			if (GameGlobals.gameState.isPaused) return;
			var extraUpdateTime = GameGlobals.gameState.frameExtraUpdateTime;
			for (var node = this.playerActionNodes.head; node; node = node.next) {
				this.updateNode(node, extraUpdateTime);
			}
		},

		// Diagnostic (2026-09-13): a caravan once came back within a minute of
		// leaving on a 10 minute trip and the cause was never reproduced. Any action
		// that completes in under half its planned duration leaves a record here,
		// in the console and on gameState.earlyActionCompletions (last 10), so the
		// next occurrence can be read off instead of guessed at.
		noteEarlyCompletion: function (actionVO, now, extraUpdateTime) {
			if (!actionVO || !actionVO.action || !actionVO.startTime) return;
			let baseId = PlayerActionConstants.getBaseActionID(actionVO.action);
			let planned = PlayerActionConstants.getDuration(actionVO.action, baseId);
			if (!planned || planned <= 0) return;
			let elapsed = (now - actionVO.startTime) / 1000;
			if (elapsed >= planned / 2) return;
			let record = {
				action: actionVO.action,
				plannedSeconds: Math.round(planned),
				elapsedSeconds: Math.round(elapsed),
				extraTimeThisFrame: Math.round(extraUpdateTime || 0),
				gameSpeedCamp: GameConstants.gameSpeedCamp,
				startedAt: new Date(actionVO.startTime).toISOString(),
				completedAt: new Date(now).toISOString(),
			};
			log.w("[action-timing] early completion: " + JSON.stringify(record));
			let list = GameGlobals.gameState.earlyActionCompletions || [];
			list.push(record);
			while (list.length > 10) list.shift();
			GameGlobals.gameState.earlyActionCompletions = list;
		},

		updateNode: function (node, extraUpdateTime) {
			// TODO handle actions that completed while offline better (correct timestamp for log message, add resources from caravans etc silently)

			extraUpdateTime = extraUpdateTime || 0;
			let now = new Date().getTime();
			let newDict = {};
			let newList = [];
			let actionsToPerform = [];
			
			if (extraUpdateTime != 0) {
				if (extraUpdateTime > 120) log.w("[action-timing] applying " + Math.round(extraUpdateTime) + "s of extra time to " + node.playerActions.endTimeStampList.length + " pending action(s)");
				node.playerActions.applyExtraTime(extraUpdateTime);
			}
			
			for (let i = 0; i < node.playerActions.endTimeStampList.length; i++) {
				let timeStamp = node.playerActions.endTimeStampList[i];
				let actionVO = node.playerActions.endTimeStampToActionDict[timeStamp];
				if (!actionVO) continue;
				if (timeStamp > now) {
					newDict[timeStamp] = actionVO;
					newList.push(timeStamp);
				} else {
					actionsToPerform.push(actionVO);
				}
			}
			
			node.playerActions.endTimeStampToActionDict = newDict;
			node.playerActions.endTimeStampList = newList;
			
			for (let i = 0; i < actionsToPerform.length; i++) {
				let actionVO = actionsToPerform[i];
				this.noteEarlyCompletion(actionVO, now, extraUpdateTime);
				if (actionVO.action) {
					let sector = GameGlobals.levelHelper.getSectorByPositionVO(actionVO.position);
					this.playerActionFunctions.performAction(actionVO.action, actionVO.param, sector, actionVO.deductedCosts);
				}
			}
		},
	});

	return PlayerActionSystem;
});
