'use strict';

/**
 * @module server
 * @author Arne Seib <arne.seib@windy.com>
 * Main entry point.
 */

require('require-rewrite')(__dirname);
const chalk = require('chalk');
const { loadConfig, console } = require('lib/config');
const runServer = require('runServer');

//------------------------------------------------------------------------------
const run = async () => {
	// load config
	const config = await loadConfig(process.argv[2] || 'default');
	console.log(`Config: ${chalk.whiteBright(config.__file)}.`);

	// update process
	process.env.NODE_ENV = config.NODE_ENV;
	console.log(`NODE_ENV: ${chalk.whiteBright(process.env.NODE_ENV)}.`);

	// run server
	return runServer(config);
};

//==============================================================================
run().then(() => { process.send && process.send('ready'); }).catch(error => {
	console.error(chalk.red(`✗ ${error.message}`));
	process.exit(1);
});
