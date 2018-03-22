'use strict';

/**
 * @module runServer
 * @author Arne Seib <arne.seib@windy.com>
 * Wrapper for running the server.
 */

const chalk = require('chalk');
const express = require('express');
const helmet = require('helmet');
const { mapAsync } = require('lib');
const { setConfig, config } = require('lib/config');

const app = express();

//------------------------------------------------------------------------------
// Promisify app.listen()
const listen = () => new Promise((resolve, reject) => {
	app.listen(config.port, config.bind, resolve).on('error', reject);
});

//------------------------------------------------------------------------------
// Load and run a service
const startService = async (service) => {
	const url = service.url;
	const name = service.name;
	process.stdout.write(chalk.whiteBright(`${name}:${url}`));
	const initService = require(`service/${name}`);
	app.use(url, await initService(service));
	process.stdout.write(chalk.green(`✓ `));
};

//------------------------------------------------------------------------------
// main
module.exports = async (options) => {
	process.stdout.write(chalk.yellow(`*** Booting server\n`));

	// validate and set config
	await setConfig(options);

	// some basic express setup
	process.stdout.write(chalk.yellow(`Initializing server... `));
	app.enable('trust proxy');
	app.set('etag', false);
	app.use(helmet({
		hsts: false,
		noCache: true,
	}));
	process.stdout.write(chalk.green(`✓ Ok.\n`));

	// load services
	process.stdout.write(chalk.yellow(`Loading services... `));
	await mapAsync(config.services, startService);

	// What's left now: 404
	app.all('*', (req, res) => { res.status(404).end(); });
	process.stdout.write(chalk.green(`\n✓ Ok.\n`));

	// listen
	process.stdout.write(chalk.yellow(`Starting server on ${config.bind}:${chalk.whiteBright(config.port)}... `));
	await listen();
	process.stdout.write(chalk.green(`✓ Ok.\n`));

	// done
	process.stdout.write(chalk.greenBright(`Server up and running.\n`));
};
