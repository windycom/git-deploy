'use strict';

/**
 * @module LConsole.js
 * @author Arne Seib <arne.seib@windy.com>
 * Simple console with log level support.
 */

const { Console } = require('console');

const NONE = 0;
const ERROR = 1;
const WARN = 2;
const INFO = 3;
const LOG = 4;
const DEBUG = 5;

//==============================================================================
class LConsole extends Console {
	constructor(logLevel = ERROR, stdout = process.stdout, stderr = process.stderr) {
		super(stdout, stderr);
		this.logLevel = logLevel;
		this.NONE = NONE;
		this.ERROR = ERROR;
		this.WARN = WARN;
		this.INFO = INFO;
		this.LOG = LOG;
		this.DEBUG = DEBUG;
	}

	log(...args) {
		if (this.logLevel >= LOG) {
			super.log(...args);
		}
	}

	debug(...args) {
		if (this.logLevel >= DEBUG) {
			super.debug(...args);
		}
	}

	info(...args) {
		if (this.logLevel >= INFO) {
			super.info(...args);
		}
	}

	warn(...args) {
		if (this.logLevel >= WARN) {
			super.warn(...args);
		}
	}

	error(...args) {
		if (this.logLevel >= ERROR) {
			super.error(...args);
		}
	}
}

LConsole.NONE = NONE;
LConsole.ERROR = ERROR;
LConsole.WARN = WARN;
LConsole.INFO = INFO;
LConsole.LOG = LOG;
LConsole.DEBUG = DEBUG;

module.exports = LConsole;
