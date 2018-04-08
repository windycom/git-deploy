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
const ansi2html = require('ansi2html');
const { mapAsync, makeCpAwaitable, deploymentStatus, removeBuild } = require('lib');
const { config, console } = require('lib/config');
const { BUILD_DATA, BUILD_LOG } = require('lib/constants');

const DEFAULT_TEMPLATE = 'src/html/index.tpl.html';
const DEFAULT_LOG_TEMPLATE = 'src/html/log.tpl.html';

// Path template files
let indexTemplate = null;
let logTemplate = null;

// Cached index.html
let indexHtml = null;

// Cached log.html
let logHtml = null;

//------------------------------------------------------------------------------
// Loads index.tpl.html
const loadIndexHtml = () =>
	Fs.readFile(indexTemplate, 'utf-8');

//------------------------------------------------------------------------------
// Loads log.tpl.html
const loadLogHtml = () =>
	Fs.readFile(logTemplate, 'utf-8');

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
// Returns content of log.tpl.html. Loads file if not loaded, or if DEBUG is true.
const getLogHtml = async () => {
	if (config.DEBUG) {
		return loadLogHtml();
	}
	logHtml = logHtml || await loadLogHtml();
	return logHtml;
};

//------------------------------------------------------------------------------
// For sorting builds.
const byMTime = (a, b) => b.mtime - a.mtime;

const byCommitTime = (a, b) => b.committime - a.committime;

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
		const path = Path.join(config.privatePath, repoName, targetId);
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
			committime: data.commit
				? (new Date(data.commit.timestamp)).toLocaleString()
				: (new Date(stats.mtimeMs)).toLocaleString(),
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
		const names = await Fs.readdir(Path.join(config.privatePath, name));
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
		const names = await Fs.readdir(config.privatePath);

		(await mapAsync(names, (name) => getProject(name, allBuilds))).filter(p => p);
		data.builds = allBuilds.sort(byCommitTime);
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
	const logHtml = await getLogHtml();
	try {
		const { repoName, targetId } = req.params;
		const logFile = Path.join(config.privatePath, repoName, targetId, BUILD_LOG);
		if (!Fs.existsSync(logFile)) {
			next(new createError.NotFound());
			return;
		}
		const content = await Fs.readFile(logFile, 'utf8');
		const log = ansi2html(content);
		res.append('Content-Type', 'text/html');
		res.send(Mustache.render(logHtml, {log})).end();
//		const log = Fs.createReadStream(logFile, { encoding: 'utf8' });
//		res.append('Content-Type', 'text/plain');
//		log.pipe(res);
	} catch (error) {
		console.error(error.message);
		next(new createError.NotFound());
	}
};

//------------------------------------------------------------------------------
// Renders dashboard.
const apiGetDashboard = async (req, res) => {
	try {
		const allBuilds = [];
		const names = await Fs.readdir(config.privatePath);

		const projects = (await mapAsync(names, (name) => getProject(name, allBuilds))).filter(p => p);
		const builds = allBuilds.sort(byCommitTime);
		res.send({ result: 0, projects }).end();
	} catch (error) {
		console.error(error);
		res.send({
			result: error.code || 1,
			error: {
				message: error.message || 'Unknown Error'
			}
		}).end();
	}
};

//------------------------------------------------------------------------------
// Module init.
module.exports = async (serviceConfig) => {
	indexTemplate = Path.resolve(config.root, serviceConfig.template || DEFAULT_TEMPLATE);
	logTemplate = Path.resolve(config.root, serviceConfig.log || DEFAULT_LOG_TEMPLATE);
	await loadIndexHtml();
	await loadLogHtml();

	const router = new express.Router();

	// bootstrap
	router.use(express.static(Path.join(config.root, 'node_modules', 'bootstrap', 'dist')));

	// own statics
	router.use(express.static(Path.join(config.root, 'src', 'html', 'static')));

	// logfiles
	router.get('/log/:repoName/:targetId', getLog);

	// index
	router.get('/', getDashboard);
	router.get('/projects', apiGetDashboard);

	// everything else: 404
	router.use('*', (req, res, next) => { next(new createError.NotFound()); });

	return router;
};
