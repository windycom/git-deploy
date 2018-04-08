'use strict';

/**
 * @module service/gitlab
 * @author Arne Seib <arne.seib@windy.com>
 * Gitlab hook handling.
 */

const bodyParser = require('body-parser');
const createError = require('http-errors');
const express = require('express');
const { requestHandler } = require('lib');
const { get } = require('lib/Repository');

// These are the only events the server is listening to:
const EVENTS = ['push', 'tag_push'];

//------------------------------------------------------------------------------
// Gitlab handler. Parses a gitlab webhook request and returns data for
// runDeployment().
const parseRequest = async (request, token) => {
	// check data sanity
	if (!request.repository) {
		throw new Error('Invalid data: Repository.');
	}

	if (!request.repository.git_ssh_url) {
		throw new Error('Invalid data: Url.');
	}

	if (!EVENTS.includes(request.object_kind)) {
		// can't handle that event
		throw new Error(`Can't handle event type ${request.object_kind}`);
	}

	// Target
	const target = get(request.project.path_with_namespace, request.ref);
	if (!target) {
		return null;
	}

	// check secret
	target.assertAllowed(token);

	// Check sha. Can be empty, when branch / tag gets deleted.
	// For now we ignore that, but it can be used to delete a build.
	if (!request.checkout_sha) {
		return null;
	}

	const commit = request.commits && request.commits[0];

	// set data from current request
	return target.createActual('update', {
		gitUrl: request.repository.git_ssh_url,
		checkoutSha: request.checkout_sha,
		message: request.message || '',
		request,
		commit,
	});
};

//------------------------------------------------------------------------------
// Checks for some headers. Also extracts the token and returns it for
// parseRequest().
const checkRequest = (req) => {
	const eventName = req.get('X-Gitlab-Event');
	if (!eventName) {
		return null;
	}
	return [req.get('X-Gitlab-Token')];
};

//------------------------------------------------------------------------------
// Module init.
module.exports = async () => {
	const router = new express.Router();

	// all post: hook
	router.post('/', bodyParser.json(), requestHandler(checkRequest, parseRequest));

	// everything else: 404
	router.use('*', (req, res, next) => { next(new createError.NotFound()); });
	return router;
};
