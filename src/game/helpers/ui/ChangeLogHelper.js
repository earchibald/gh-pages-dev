// Loader for the changelog.json
define(['ash', 'game/GameGlobals', 'game/GlobalSignals', 'game/constants/GameConstants'],
function (Ash, GameGlobals, GlobalSignals, GameConstants) {

	var ChangeLogHelper = Ash.Class.extend({
		
		loadingSuccesfull: undefined,
		versions: null,
		
		constructor: function () { },

		loadVersion: function () {
			var helper = this;
			// The other asset requirejs does not cache-bust for us, and the one
			// that says which version this is. Served stale it reports the
			// previous release - so the number a player reads back to say a fix
			// has landed is the one number that cannot be trusted, and the
			// out-of-date warnings below are drawn from the same stale list.
			// Reuse the loader's own urlArgs, as TextLoader does.
			var url = 'changelog.json';
			var urlArgs = null;
			try {
				urlArgs = requirejs.s.contexts._.config.urlArgs;
			} catch (e) {
				urlArgs = null;
			}
			if (urlArgs) url += '?' + urlArgs;
			$.getJSON(url, function (json) {
				helper.loadingSuccessful = true;
				helper.versions = json.versions;
				var version = helper.getCurrentVersionNumber();
				log.i("Loaded version: " + version);
				GlobalSignals.changelogLoadedSignal.dispatch(true);
				helper.displayVersionWarnings();
			})
			.fail(function (jqxhr, textStatus, error) {
				helper.loadingSuccessful = false;
				helper.versions = [];
				log.w("Failed to load version.");
				var err = "";
				if (jqxhr && jqxhr.status) err += "[" + jqxhr.status + "] ";
				err += textStatus;
				if (error) err += ", " + error;
				GlobalSignals.changelogLoadedSignal.dispatch(false);
				if (!GameConstants.isMobileOverlayShown) {
					helper.displayVersionWarnings();
				}
			});
		},
		
		displayVersionWarnings: function () {
			if (GameConstants.isDebugVersion) return;
			var currentVersion = this.getCurrentVersion();
			if (!currentVersion || !currentVersion.final) {
				GameGlobals.uiFunctions.showInfoPopup(
					"Warning",
					"Looks like you are playing an unsupported version of Level 13.</br>Continue at your own risk or play the latest official version <a href='" + GameConstants.gameURL + "'>here</a>.",
					"Continue"
				);
			}
		},
		
		getCurrentVersionNumber: function () {
			var currentVersion = this.getCurrentVersion();
			if (currentVersion) {
				return this.getVersionNumber(currentVersion);
			}
			return "unknown";
		},
		
		getCurrentVersionDate: function () {
			var currentVersion = this.getCurrentVersion();
			if (currentVersion) {
				return currentVersion.final ? currentVersion.released : currentVersion.updated;
			}
			return "[no time stamp]";
		},
		
		getVersionNumber: function (version) {
			return version.version + " (" + version.phase + ")";
		},
		
		getCurrentVersion: function () {
			if (!this.versions) return null;
			
			var version = null;
			let i = 0;
			while (!version && i < this.versions.length) {
				if (this.versions[i].changes.length > 0) version = this.versions[i];
				i++;
			}
			return version;
		},
		
		getVersion: function (version) {
			for (let i = 0; i < this.versions.length; i++) {
				if (this.versions[i].version == version) {
					return this.versions[i];
				}
			}
			return null;
		},
		
		getVersionDigits: function (version) {
			var parts1 = version.split(" ");
			var parts2 = parts1[0].split(".");
			return { major: parts2[0], minor: parts2[1], patch: parts2[2] };
		},
		
		// true when version a has a lower major or minor than version b (patch and the
		// fork's mN build are ignored). Digits are compared as numbers, not strings.
		isOlderMajorMinor: function (a, b) {
			if (!a || !b) return false;
			let da = this.getVersionDigits(a);
			let db = this.getVersionDigits(b);
			let majorA = parseInt(da.major), majorB = parseInt(db.major);
			let minorA = parseInt(da.minor), minorB = parseInt(db.minor);
			if (isNaN(majorA) || isNaN(majorB) || isNaN(minorA) || isNaN(minorB)) return false;
			if (majorA != majorB) return majorA < majorB;
			return minorA < minorB;
		},

		isOldVersion: function (version) {
			if (!version) return true;
			
			var currentVersionNumber = this.getCurrentVersionNumber();
			var currentVersionDetails = this.getCurrentVersion();
			var requiredVersion = currentVersionDetails && currentVersionDetails.requiredVersion || currentVersionNumber;
			var requiredVersionDigits = this.getVersionDigits(requiredVersion);
			var compareVersionDigits = this.getVersionDigits(version);
			
			log.i("isOldVersion? " + version + ", current: " + currentVersionNumber + ", required: " + requiredVersion);
			if (!requiredVersionDigits) return false;
			if (!compareVersionDigits) return false;
			// Compare as one version, most significant digit first. The old check
			// compared each digit on its own, so 0.7.0 counted as older than the
			// required 0.6.1 (patch 0 < 1) and every 0.7.0 save got the "incompatible
			// version" prompt on each load.
			let required = [ parseInt(requiredVersionDigits.major), parseInt(requiredVersionDigits.minor), parseInt(requiredVersionDigits.patch) ];
			let compare = [ parseInt(compareVersionDigits.major), parseInt(compareVersionDigits.minor), parseInt(compareVersionDigits.patch) ];
			for (let i = 0; i < 3; i++) {
				if (isNaN(required[i]) || isNaN(compare[i])) return false;
				if (compare[i] != required[i]) return compare[i] < required[i];
			}
			return false;
		},
	
	});
	
	return ChangeLogHelper;
});
