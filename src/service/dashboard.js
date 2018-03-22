'use strict';

/**
 * @module service/dashboard
 * @author Arne Seib <arne.seib@windy.com>
 * Frontend.
 */

const Path = require('path');
const Fs = require('fs-extra');
const { exec } = require('child_process');
const Mustache = require('mustache');
const createError = require('http-errors');
const express = require('express');
const { mapAsync, makeCpAwaitable, deploymentStatus, removeBuild } = require('lib');
const { config, console } = require('lib/config');
const { BUILD_DATA, BUILD_LOG } = require('lib/constants');

const DEFAULT_TEMPLATE = 'src/html/index.tpl.html';

// Path template file
let indexTemplate = null;

// Cached index.html
let indexHtml = null;


//------------------------------------------------------------------------------
// Loads index.tpl.html
const loadIndexHtml = () =>
	Fs.readFile(indexTemplate, 'utf-8');

//------------------------------------------------------------------------------
// Returns content of index.tpl.html. Loads file if not loaded, or if DEBUG is true.
const getIndexHtml = async () => {
	if (config.DEBUG) {
		return loadIndexHtml();
	}
	indexHtml = indexHtml || await loadIndexHtml();
	return indexHtml;
};

//------------------------------------------------------------------------------
// For sorting builds.
const byMTime = (a, b) => b.mtime - a.mtime;

//------------------------------------------------------------------------------
// Cancels a running build.
const cancelBuild = async (fullName) => {
	const progress = await deploymentStatus(Path.join(config.privatePath, fullName));
	if (progress && progress.alive) {
		await makeCpAwaitable(exec(`kill -2 ${progress.pid}`));
		return {
			body: `Build canceled.`,
			type: 'success',
		};
	}
	return {
		body: `Build not running.`,
		type: 'warning',
	};
};

//------------------------------------------------------------------------------
// Deletes an existing build completely.
const deleteBuild = async (fullName) => {
	await removeBuild(fullName);
	return {
		body: `Build removed.`,
		type: 'success',
	};
};

//------------------------------------------------------------------------------
// Compiles info about a build. targetId is the folder name for the build.
const getBuild = async (repoName, targetId, allBuilds) => {
	try {
		const path = Path.join(config.publicPath, repoName, targetId);
		const dataFile = Path.join(path, BUILD_DATA);
		const logFile = Path.join(path, BUILD_LOG);
		const data = await Fs.readJson(dataFile);
		const stats = await Fs.stat(logFile);
		const ret = {
			repoName: data.repo.name,
			path: Path.join(data.repo.path, data.path),
			name: data.name,
			id: data.id,
			url: data.url,
			logUrl: `log/${data.repo.path}/${data.path}`,
			mtime: stats.mtime,
			message: (data.message || '').replace('\r', '').replace('\n', '<br>'),
			progress: null,
			frontend: !!data.wwwSrcPath,
			ts: (new Date(stats.mtimeMs)).toLocaleString(),
		};

		const progress = await deploymentStatus(Path.join(config.privatePath, repoName, targetId));
		if (progress && progress.alive) {
			ret.progress = `Building for ${((Date.now() - progress.started) / 1000).toFixed(1)} seconds`;
			// Also disable link
			ret.frontend = false;
		}

		allBuilds.push(ret);
		return ret;
	} catch (error) {
		console.error(error);
		return null;
	}
};

//------------------------------------------------------------------------------
const getProject = async (name, allBuilds) => {
	try {
		const names = await Fs.readdir(Path.join(config.publicPath, name));
		const builds = (await mapAsync(names, (buildName) => getBuild(name, buildName, allBuilds)))
			.filter(b => b);
		return {
			name,
			builds,
		};
	} catch (error) {
		console.error(error);
		return null;
	}
};

//------------------------------------------------------------------------------
// Renders dashboard.
const getDashboard = async (req, res) => {
	const data = {};
	const indexHtml = await getIndexHtml();
	try {
		let message = null;
		// Handle any command first
		if (req.query.cancel) {
			message = await cancelBuild(req.query.cancel);
		} else if (req.query.delete) {
			message = await deleteBuild(req.query.delete);
		}
		if (message) {
			res.append('Location', `?type=${message.type}&body=${encodeURIComponent(message.body)}`);
			res.status(303).end();
			return;
		}
		if (req.query.type && req.query.body) {
			data.message = {
				type: req.query.type,
				body: req.query.body,
			};
		}

		const allBuilds = [];
		const names = await Fs.readdir(config.publicPath);

		(await mapAsync(names, (name) => getProject(name, allBuilds))).filter(p => p);
		data.builds = allBuilds.sort(byMTime);
	} catch (error) {
		console.error(error);
		data.message = {
			type: 'danger',
			body: error.message || 'Unknown Error',
		};
	}
	res.append('Content-Type', 'text/html');
	res.send(Mustache.render(indexHtml, data)).end();
};

//------------------------------------------------------------------------------
// Returns a logfile.
const getLog = async (req, res, next) => {
	try {
		const repoName = req.params.repoName;
		const targetId = req.params.targetId;
		const logFile = Path.join(config.publicPath, repoName, targetId, BUILD_LOG);
		if (!Fs.existsSync(logFile)) {
			next(new createError.NotFound());
			return;
		}
		const log = Fs.createReadStream(logFile, { encoding: 'utf8' });
		res.append('Content-Type', 'text/plain');
		log.pipe(res);
	} catch (error) {
		console.error(error.message);
		next(new createError.NotFound());
	}
};

//------------------------------------------------------------------------------
// Module init.
module.exports = async (serviceConfig) => {
	indexTemplate = Path.resolve(config.root, serviceConfig.template || DEFAULT_TEMPLATE);
	await loadIndexHtml();

	const router = new express.Router();

	// bootstrap
	router.use(express.static(Path.join(config.root, 'node_modules', 'bootstrap', 'dist')));

	// own statics
	router.use(express.static(Path.join(config.root, 'src', 'html', 'static')));

	// logfiles
	router.get('/log/:repoName/:targetId', getLog);

	// index
	router.get('/', getDashboard);

	// everything else: 404
	router.use('*', (req, res, next) => { next(new createError.NotFound()); });

	return router;
};
