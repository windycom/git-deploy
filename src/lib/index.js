'use strict';

/**
 * @module lib
 * @author Arne Seib <arne.seib@windy.com>
 * Lots of business logic.
 */

const Fs = require('fs-extra');
const Path = require('path');
const createError = require('http-errors');
const { fork, spawn } = require('child_process');
const { config, console } = require('lib/config');
const { BUILD_LOG, BUILD_DATA, BUILD_PID } = require('lib/constants');

// For interpolation of match result
const REPLACE_EXPRESSION = /([^%]?)%([0-9]+)/g;

// Make rm -rf a bit safer: Min number of parts a path must contain to be accepted.
const MIN_PATH_PARTS_FOR_SAFE_RM = 3;

//------------------------------------------------------------------------------
// Replaces interpolations with result from match (%1, %2 etc)
const replaceFromMatch = (str, matches) => str
	.replace(REPLACE_EXPRESSION, (all, before, index) =>
		before + matches[parseInt(index, 10)])
	.replace('%%', '%');

//------------------------------------------------------------------------------
// Makes a child process awaitable.
const makeCpAwaitable = (cp) => new Promise((resolve, reject) => {
	cp.on('exit', (code, signal) => {
		if (code === 0) {
			return resolve(code);
		}
		const error = new Error(`Code: ${code}, sig: ${signal}`);
		error.name = 'ProcessExitError';
		error.code = code;
		error.signal = signal;
		return reject(error);
	});
	cp.on('error', reject);
});

//------------------------------------------------------------------------------
// Execute target's match and process result
const evalTarget = (target, ref) => {
	const { match } = target;
	if ((typeof match === 'object') && (typeof match.exec === 'function')) {
		return match.exec(ref);
	}
	if (typeof match === 'function') {
		return match(ref);
	}
	return match === ref ? [ref] : null;
};

//------------------------------------------------------------------------------
// Flattens a path (replaces separators).
const flattenPath = (s, c = '-') => s.replace(/[/\\]/g, c);

//------------------------------------------------------------------------------
// Flattens a URL. Replaces separators both for subdomains and for paths.
const flattenUrl = (s, c = '-') => s.replace(/[/\\.]/g, c);

//------------------------------------------------------------------------------
// Finds a matching target for the key/ref-combination, and if found, sets
// data for deployment.
// Caller must still add gitUrl, checkoutSha, action and message
const getTarget = (key, ref) => {
	const repoConfig = config.repos[key];
	if (!repoConfig) {
		return null;
	}

	for (const target of repoConfig.targets) {
		const match = evalTarget(target, ref);
		if (match) {
			const repo = {
				// Name: pure name from `name`-property or key
				name: repoConfig.name || key,
			};
			// ID: Flat path
			repo.path = flattenPath(repo.name);

			// ID: Flat url
			repo.id = flattenUrl(repo.name);

			const result = {
				repo,
				ref,
				postupdate: target.postupdate,
				postremove: target.postremove,
				secret: repoConfig.secret || config.secret,
			};

			// raw target name
			result.name = replaceFromMatch(target.path, match);

			// ID: Flat path
			result.path = flattenPath(result.name);

			// ID: Flat url
			result.id = flattenUrl(result.name);

			const targetFullPath = Path.join(repo.path, result.path);
			result.url = `${repo.id}-${result.id}`;

			// resolved paths
			result.privatePath = Path.resolve(config.privatePath, targetFullPath);
			result.publicPath = Path.resolve(config.publicPath, targetFullPath);
			result.checkoutPath = Path.join(result.privatePath, 'src');

			// Does this have a frontend?
			result.wwwSrcPath = target.www
				? Path.resolve(result.checkoutPath, target.www)
				: null;
			result.wwwDstPath = result.wwwSrcPath
				? Path.join(config.wwwPath, result.url)
				: null;

			return result;
		}
	}
	return null;
};

//------------------------------------------------------------------------------
// Checks if process with pid is still running.
const isAlive = async (pid) => {
	try {
		await makeCpAwaitable(spawn('kill', ['-0', pid]));
		return true;
	} catch (error) { /**/ }
	return false;
};

//------------------------------------------------------------------------------
// Returns a status object, if a deployment is running for privatePath.
// Returns false if no deployment is running.
const deploymentStatus = async (privatePath) => {
	const pidFile = Path.join(privatePath, BUILD_PID);
	if (!Fs.existsSync(pidFile)) {
		return false;
	}
	const stats = await Fs.stat(pidFile);
	const pid = parseInt(await Fs.readFile(pidFile, 'utf8'), 10) || 0;
	return {
		pid,
		started: stats.mtimeMs,
		alive: pid && await isAlive(pid),
	};
};

//------------------------------------------------------------------------------
// Runs a deployment task. Spawns a new process.
const runDeployment = async (deployment) => {
	const { privatePath, publicPath } = deployment;
	await Fs.ensureDir(privatePath);
	await Fs.ensureDir(publicPath);

	// check if already running
	const status = await deploymentStatus(privatePath);
	if (status) {
		throw new Error(`Deployment process (${status.pid}) already in progress for ${privatePath}. Process is idling for ${(status.idleTime / 1000).toFixed(1)}s`);
	}
	// Write pid 0, actual pid will be written later.
	const pidFile = Path.join(privatePath, BUILD_PID);
	await Fs.writeFile(pidFile, '0', 'utf8');

	const datafileName = Path.join(publicPath, BUILD_DATA);
	const logfileName = Path.join(publicPath, BUILD_LOG);

	let logfileStream = null;

	try {
		// Create process, initially suspended.
		const worker = fork(Path.join(__dirname, 'worker.js'), [ datafileName ], {
			cwd: privatePath,
			env: process.env,
			stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
		});
		await Fs.writeFile(pidFile, worker.pid, 'utf8');

		// write deployment data
		await Fs.writeJson(datafileName, deployment);

		// create logfile
		logfileStream = Fs.createWriteStream(logfileName);
		worker.stdout.pipe(logfileStream, { end: false });
		worker.stderr.pipe(logfileStream, { end: false });

		// and go
		const promise = makeCpAwaitable(worker);
		worker.send('run');
		await promise;
	} catch (error) {
		console.error(error.message);
	} finally {
		try {
			await Fs.unlink(pidFile);
		} catch (error) { /**/ }
		if (logfileStream) {
			logfileStream.end();
			logfileStream = null;
		}
	}
};

//------------------------------------------------------------------------------
// Creates a handler for hook requests. First checkRequest is run. If that returns
// falsy, a 404 is returned.
// Otherwise parseRequest is called with the arguments returned by checkRequest,
// and if a valid deployment is returned, it is executed.
const requestHandler = (checkRequest, parseRequest) => async (req, res, next) => {
	const args = checkRequest(req);
	if (!args) {
		next(new createError.NotFound());
		return;
	}
	let deployment = null;
	try {
		deployment = await parseRequest(req.body, ...args);
		if (!deployment) {
			// Don't treat this as error. This simply means: We ignore the request.
			res.status(201).end();
			return;
		}
		// Finish request first
		res.status(200).send('Deployment scheduled.');
	} catch (error) {
		console.error(error.message);
		res.status(error.statusCode || 500).send({
			error: error.message,
		}).end();
		return;
	}

	// Now run deployment.
	try {
		await runDeployment(deployment);
	} catch (error) {
		console.error(error.message);
	}
};

//------------------------------------------------------------------------------
// Completely remove a build.
const ensureSafeForRmRf = (path) => {
	path = Path.normalize(path);
	const count = path.split(Path.sep).length;
	if (count < MIN_PATH_PARTS_FOR_SAFE_RM) {
		throw new Error(`Refuse to rm -rf on "${path}": Path does not contain enough parts.`);
	}
};

//------------------------------------------------------------------------------
// Completely remove a build.
const removeBuild = async (fullName, targetUrl) => {
	const privatePath = Path.join(config.privatePath, fullName);
	const publicPath = Path.join(config.publicPath, fullName);
	const wwwDstPath = targetUrl
		? Path.join(config.wwwPath, targetUrl)
		: null;
	// remove link if any
	if (wwwDstPath) {
		try {
			await Fs.unlink(wwwDstPath);
		} catch (error) { /**/ }
	}

	ensureSafeForRmRf(privatePath);
	ensureSafeForRmRf(publicPath);
	try {
		await Fs.emptyDir(privatePath);
		await Fs.rmdir(privatePath);
		await Fs.emptyDir(publicPath);
		await Fs.rmdir(publicPath);
	} catch (error) { /**/ }
};

//------------------------------------------------------------------------------
// Asynchronous array.map
const mapAsync = async (ar, cb, thisArg = null) => {
	const ret = ar.slice();
	for (let n = 0; n < ret.length; n++) {
		ret[n] = await cb.call(thisArg, ret[n], n, ar);
	}
	return ret;
};

module.exports.makeCpAwaitable = makeCpAwaitable;
module.exports.getTarget = getTarget;
module.exports.deploymentStatus = deploymentStatus;
module.exports.requestHandler = requestHandler;
module.exports.removeBuild = removeBuild;
module.exports.mapAsync = mapAsync;
