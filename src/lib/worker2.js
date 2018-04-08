'use strict';

/**
 * @module worker
 * @author Arne Seib <arne.seib@windy.com>
 * Worker script for a deployment.
 */

require('require-rewrite')(__dirname);
const Fs = require('fs-extra');
const Path = require('path');
const net = require('net');
const chalk = require('chalk');
const { loadConfig, executeConfig, config } = require('lib/config');

let server = null;
let socketFile = null;

const SOCKET_PERMISSIONS = 0o700;

//------------------------------------------------------------------------------
// Promisified server.listen()
const listen = (...args) => new Promise((resolve, reject) => {
	server.listen(...args, resolve).on('error', reject);
});

//------------------------------------------------------------------------------
// Removes pid-file. Can't fail.
const cleanup = () => {
	try {
		if (socketFile) {
			Fs.unlinkSync(socketFile);
		}
	} catch (error) {
		console.warn(error.message);
	}
};

//------------------------------------------------------------------------------
// On process exit: Exit with code 1, cleanup will be performed.
const onTerminate = () => {
	console.log('*** Exit requested.');
	process.exit(1);
};

//------------------------------------------------------------------------------
process.on('exit', cleanup);
process.on('SIGINT', onTerminate);
process.on('SIGTERM', onTerminate);

//------------------------------------------------------------------------------
// Main.
const main = async () => {
	try {
		// load config
		const options = await loadConfig(process.argv[2] || 'default');
		console.log(`Config: ${chalk.whiteBright(options.__file)}.`);

		// validate and set options
		await executeConfig(options);

		// create socket
		socketFile = Path.join(config.socketPath, `${process.pid}.sock`);
		server = net.createServer((socket) => {
			socket.on('data', (c) => {
				console.log('data:', c.toString());
			});
			socket.on('end', () => {
				server.close();
			});
		});

		// and listen
		await listen(socketFile);
		await Fs.chmod(socketFile, SOCKET_PERMISSIONS);
	} catch (error) {
		console.log(error);
		process.exit(1);
	}
};

main();
