define([
	'module',
	'jquery/jquery-3.7.1.min',
	'core/ConsoleLogger',
	'game/level13',
	'game/constants/GameConstants',
	'text/Text',
	'text/TextBuilder',
	'text/lang/LangEnglish'
], function (module, jQuery, ConsoleLogger, Level13, GameConstants, Text, TextBuilder, LangEnglish) {
	'use strict';

	function Level13App() {

		this.initialise = function (config) {
			let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent);

			GameConstants.isMobile = isMobileDevice;
			// Mobile port: the layout is mobile-optimized, so the "not optimized
			// for mobile" overlay is never shown.
			GameConstants.isMobileOverlayShown = false;

			// Dev functions are on for local work, /gh-pages-agent-test and /gh-pages-dev,
			// and off for stage and prod (see GameConstants.isLocalDevBuild).
			// isDebugVersion is deliberately left alone: it changes worldgen retries and
			// fires debugger statements, and the candidate has to behave like the release.
			let isLocalDevBuild = GameConstants.isLocalDevBuild();

			GameConstants.isDebugVersion = config.isDebugVersion;
			GameConstants.isCheatsEnabled = config.isCheatsEnabled || isLocalDevBuild;
			GameConstants.isAutosaveEnabled = config.isAutosaveEnabled;
			ConsoleLogger.logInfo = config.isDebugOutputEnabled || isLocalDevBuild;
			
			if (config.isTrackingEnabled) {
				try {
					// init GlitchTip for error tracking
					Sentry.init({
						dsn: "https://d29c47d03c8a4b17b9fd914320b105ea@app.glitchtip.com/12081",
						tracesSampleRate: 0.01,
						environment: config.isDebugVersion ? "development" : "production",
  						release: "l13-" + config.version,
					});
				} catch (e) {
					log.w("error tracking not initialized");
				}
			}
			
			Text.isDebugMode = config.isDebugVersion;
			Text.language = LangEnglish;
			TextBuilder.isDebugMode = config.isDebugVersion;
			TextBuilder.language = LangEnglish;

			GameConstants.STARTTimeStart = new Date().getTime();
			GameConstants.STARTTimeNow = function () {
				return new Date().getTime() - this.STARTTimeStart;
			}

			var level13 = new Level13(config.plugins);

			if (GameConstants.isCheatsEnabled) {
				window.app = level13;
			}
		};

	}

	new Level13App().initialise(module.config());
});
