define( function () {

	let GameConstants = {

		gameSpeedCamp: 1,
		gameSpeedExploration: 1,
		
		isDebugVersion: false,
		isCheatsEnabled: false,
		isAutosaveEnabled: true,

		uiModeMinimialExplorationPopups: false,

		cheatModeBlueprints: false,
		cheatModeSupplies: false,
		cheatModeCampProduction: false,
		cheatModeHazards: false,

		SAVE_SLOT_DEFAULT: "default",
		SAVE_SLOT_BACKUP: "backup",
		SAVE_SLOT_LOADED: "loaded",
		SAVE_SLOT_PREUPDATE: "preupdate", // the save as it was before a newer major.minor first loaded it
		SAVE_SLOT_USER_1: "user1",
		SAVE_SLOT_USER_2: "user2",
		SAVE_SLOT_USER_3: "user3",

		gameStatUnits: {
			general: "general",
			seconds: "seconds",
			steps: "steps",
			level: "level",
		},
		
		gameURL: window.location.origin + window.location.pathname.replace(/\/$/, ""),

		// Dev functions belong to local work and to the two lowest deployments.
		// The site path is the hosting repo's name, so the deployment is read from
		// the first path segment: /gh-pages-agent-test and /gh-pages-dev get the
		// flags, /gh-pages-stage, /level13-mobile and /level13 (prod) do not - a
		// stage that plays differently from prod is not testing what ships.
		// config.js still never needs hand-editing to get cheats while developing.
		devFlagPathSegments: ["gh-pages-agent-test", "gh-pages-dev"],

		isLocalDevBuild: function () {
			let host = window.location.hostname;
			if (host === "localhost" || host === "127.0.0.1" || host === "") return true;
			let segment = "";
			try {
				let parts = window.location.pathname.split("/").filter(part => part.length > 0);
				if (parts.length > 0) segment = parts[0];
			} catch (ex) {
				segment = "";
			}
			return this.devFlagPathSegments.indexOf(segment) >= 0;
		},

		getFeedbackLinksHTML: function () {
			let result = "";
			var a = [ "level13game", "gmail.com" ];
			result += "<a href='https://github.com/nroutasuo/level13' target='github'>github</a>";
			result += " | ";
			result += "<a href='https://www.reddit.com/r/level13' target='reddit'>reddit</a>";
			result += " | ";
			result += "<a href='https://discord.gg/BzMbATyKph' target='discord'>discord</a>";
			result += " | ";
			result += "<a href='mailto:" + a.join("@") + "' rel='noopener noreferrer'>email</a>";
			return result;
		}

	};
	return GameConstants;
});
