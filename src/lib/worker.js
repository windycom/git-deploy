'use strict';

/**
 * @module worker
 * @author Arne Seib <arne.seib@windy.com>
 * Worker script for a deployment.
 */

require('require-rewrite')(__dirname);
const Fs = require('fs-extra');
const Path = require('path');
const { spawn, fork } = require('child_process');
const { makeCpAwaitable } = require('lib');
const { BUILD_PID } = require('lib/constants');

// Global: Path to build.json
let datafileName = null;

// Global: Content of build.json
let deployData = null;

//------------------------------------------------------------------------------
// Removes pid-file. Can't fail.
const removePidFile = () => {
	try {
		const pidFile = Path.join(deployData.privatePath, BUILD_PID);
		Fs.unlinkSync(pidFile);
	} catch (error) {
		console.warn(error.message);
	}
};

//------------------------------------------------------------------------------
// Run git with args.
const git = (...args) => makeCpAwaitable(spawn('git', args, {
	cwd: process.cwd(),
	stdio: 'inherit',
}));

//------------------------------------------------------------------------------
// Run a node script (via fork()) with args.
const node = (cmd, ...args) => makeCpAwaitable(fork(cmd, args, {
	cwd: process.cwd(),
	env: Object.assign({
		GIT_DEPLOY_DATA_FILE: datafileName,
	}, process.env),
	stdio: 'inherit',
}));

//------------------------------------------------------------------------------
// Run raw command (via spawn()) with args.
const run = (cmd, ...args) => makeCpAwaitable(spawn(cmd, args, {
	cwd: process.cwd(),
	env: Object.assign({
		GIT_DEPLOY_DATA_FILE: datafileName,
	}, process.env),
	shell: true,
	stdio: 'inherit',
}));

//------------------------------------------------------------------------------
// Fetch and checkout a certain ref.
const resetRepo = async (checkoutPath, ref) => {
	// CHANGE WORK DIR: repository
	process.chdir(checkoutPath);

	console.log(`> git fetch origin`);
	await git(`fetch`, `origin`);
	console.log(`\n> git reset --hard ${ref}`);
	await git('reset', '--hard', ref);
	console.log(`\n> git submodule update --init --recursive`);
	await git('submodule', 'update', '--init', '--recursive');
	console.log(``);
};

//------------------------------------------------------------------------------
// Clone repo.
const cloneRepo = async (path, url) => {
	const cwd = Path.dirname(path);
	// CHANGE WORK DIR: repository's PARENT
	process.chdir(cwd);
	const basename = Path.basename(path);
	console.log(`> git clone --recursive ${url} ${basename}`);
	await git('clone', '--recursive', url, basename);
	console.log(``);

	// CHANGE WORK DIR: repository
	process.chdir(path);
};

//------------------------------------------------------------------------------
// For post-xxx-commands. Run a list of commands one by one.
const runCommands = async (commands) => {
	commands = Array.isArray(commands)
		? commands
		: [commands];
	for (const cmd of commands) {
		const args = Array.isArray(cmd)
			? cmd
			: [cmd];
		const runner = args[0].match(/\.js$/)
			? node
			: run;
		await runner(...args);
	}
};

//------------------------------------------------------------------------------
// Completely remove a build.
const deleteBuild = async () => {
	const { privatePath, publicPath, wwwDstPath, postremove } = deployData;
	try {
		await Fs.emptyDir(privatePath);
		await Fs.rmdir(privatePath);
		await Fs.emptyDir(publicPath);
		await Fs.rmdir(publicPath);
	} catch (error) { /**/ }

	// remove link if any
	try {
		await Fs.unlink(wwwDstPath);
	} catch (error) { /**/ }

	if (postremove) {
		await runCommands(postremove);
	}
};

//------------------------------------------------------------------------------
// Creates a build. Either clones or updates a repository, and runs any
// post commands.
const createBuild = async () => {
	const { checkoutPath, gitUrl, checkoutSha, wwwSrcPath, wwwDstPath, postupdate } = deployData;

	// create destination path
	const parentPath = Path.dirname(checkoutPath);
	await Fs.ensureDir(parentPath);

	// clone if target does not exist...
	if (!Fs.existsSync(checkoutPath)) {
		await cloneRepo(checkoutPath, gitUrl);
	}

	// ...and checkout...
	await resetRepo(checkoutPath, checkoutSha);

	// ...and run post script...
	if (postupdate) {
		// CHANGE WORK DIR: repository
		process.chdir(checkoutPath);
		await runCommands(postupdate);
	}

	// ...and finally link into www
	if (wwwSrcPath) {
		console.log(`> linking ${wwwSrcPath} into ${wwwDstPath}`);
		await Fs.ensureSymlink(wwwSrcPath, wwwDstPath);
	}
};

//------------------------------------------------------------------------------
// Main.
const main = async () => {
	try {
		if (process.argv.length < 3) {
			throw new Error(`Missing datafile argument.`);
		}
		const start = Date.now();

		// load datafile
		datafileName = process.argv[2];
		deployData = await Fs.readJson(datafileName);

		// check data
		if (!deployData.privatePath) {
			throw new Error(`Invalid or missing privatePath: ${deployData.privatePath}`);
		}
		if (!deployData.publicPath) {
			throw new Error(`Invalid or missing publicPath: ${deployData.publicPath}`);
		}
		if (!deployData.checkoutPath) {
			throw new Error(`Invalid or missing checkoutPath: ${deployData.checkoutPath}`);
		}
		if (!deployData.gitUrl) {
			throw new Error(`Invalid or missing gitUrl: ${deployData.gitUrl}`);
		}
		if (!deployData.checkoutSha) {
			throw new Error(`Invalid or missing checkoutSha: ${deployData.checkoutSha}`);
		}
		if (!deployData.action) {
			throw new Error(`Invalid or missing action: ${deployData.action}`);
		}

		// make sure folders exist
		await Fs.ensureDir(deployData.privatePath);
		await Fs.ensureDir(deployData.publicPath);

		// CHANGE WORK DIR: private path
		process.chdir(deployData.privatePath);

		// handle action
		switch (deployData.action) {
			case 'create':
			case 'update':
				await createBuild();
				break;
			case 'remove':
			case 'delete':
				await deleteBuild();
				break;
			default:
				throw new Error(`Invalid action ${deployData.action}`);
		}

		const duration = ((Date.now() - start) / 1000).toFixed(2);
		console.log(`*** Build finished in ${duration} seconds. ***`);
	} catch (error) {
		console.log(error);
		console.log(`*** Build failed ***`);
		process.exit(1);
	}
};

//------------------------------------------------------------------------------
// On process exit: Remove pid-file and exit (in case of a signal handler).
const cleanExit = () => {
	console.error(`*** Build canceled ***`);
	removePidFile();
	process.exit(1);
};

//------------------------------------------------------------------------------
process.on('exit', removePidFile);
process.on('SIGINT', cleanExit);
process.on('SIGTERM', cleanExit);

// If running as a child process, wait for the 'run'-message. Otherwise run
// immediately.
if (process.channel) {
	process.once('message', (m) => {
		if (m !== 'run') {
			throw new Error('Invalid message');
		}
		main();
	});
} else {
	main();
}
