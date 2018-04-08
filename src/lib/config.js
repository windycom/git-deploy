'use strict';

/**
 * @module config.js
 * @author Arne Seib <arne.seib@windy.com>
 * Loads, validates and augments config.
 */

const Fs = require('fs-extra');
const Path = require('path');
const LConsole = require('lib/LConsole');

// Static config object.
module.exports.config = {
	root: Path.resolve(__dirname, '..', '..'),
};

// Console with loglevel support
module.exports.console = new LConsole();

// Locations to look for config files:
module.exports.CONFIG_LOCATIONS = [
	'./config',
];

// Possible extensions, in order of precedence
module.exports.CONFIG_EXTENSIONS = [
	'.local.js',
	'.local.conf.js',
	'.js',
	'.conf.js',
];

// Default settings.
const DEFAULTS = {
	port: 8080,
	bind: '127.0.0.1',
	NODE_ENV: 'production',
	LOG_LEVEL: 'error',
	DEBUG: false,
	mode: 'path',
	dataPath: '~/git-deploy',
};

//------------------------------------------------------------------------------
// Merge defaults and validate config.
const validateConfig = async (config) => {
	// some defaults
	config = Object.assign({}, DEFAULTS, config);

	// and check
	if (!config.services || typeof config.services !== 'object') {
		throw new Error(`Invalid config.services or not an object.`);
	}

	config.dataPath = Path.resolve(module.exports.config.root, config.dataPath);
	config.privatePath = Path.resolve(config.dataPath, config.privatePath || '.data');
	await Fs.ensureDir(config.privatePath);

	config.wwwPath = Path.resolve(config.dataPath, config.wwwPath || 'www');
	await Fs.ensureDir(config.wwwPath);

	config.socketPath = Path.join(config.privatePath, 'sockets');
	await Fs.ensureDir(config.socketPath);

	const logLevel = LConsole[config.LOG_LEVEL.toUpperCase()];
	if (isNaN(logLevel)) {
		throw new Error(`Invalid config.logLevel: ${config.LOG_LEVEL}.`);
	}
	module.exports.console.logLevel = logLevel;

	if (!config.repos || typeof config.repos !== 'object') {
		throw new Error(`Invalid config.repos or not an object.`);
	}

	return config;
};

//------------------------------------------------------------------------------
// Accepts an external object to copy to config.
// Creates the repository map.
module.exports.executeConfig = async (config) => {
	Object.assign(module.exports.config, await validateConfig(config));
	require('lib/Repository')(module.exports.config.repos);
};

//------------------------------------------------------------------------------
// Finds and loads a config file. Returns validated config.
module.exports.loadConfig = async (name,
	locations = module.exports.CONFIG_LOCATIONS,
	variants = module.exports.CONFIG_EXTENSIONS) => {
	locations = locations
		.map(p => Path.resolve(module.exports.config.root, p))
		.filter(p => Fs.existsSync(p));
	for (const location of locations) {
		for (const ext of variants) {
			const file = Path.join(location, `${name}${ext}`);
			if (Fs.existsSync(file)) {
				const config = require(file); // eslint-disable-line
				config.__file = file;
				config.__name = name;
				return validateConfig(config);
			}
		}
	}
	throw new Error(`No valid configuration found. Searched for:
\t${name}${variants.join(`\n\t${name}`)}\nin:
\t${locations.join('\n\t')}`);
};

