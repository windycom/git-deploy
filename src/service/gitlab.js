'use strict';

/**
 * @module service/gitlab
 * @author Arne Seib <arne.seib@windy.com>
 * Gitlab hook handling.
 */

const bodyParser = require('body-parser');
const createError = require('http-errors');
const express = require('express');
const { requestHandler, getTarget } = require('lib');

// These are the only events the server is listening to:
const EVENTS = ['push', 'tag_push'];

//------------------------------------------------------------------------------
// Gitlab handler. Parses a gitlab webhook request and returns data for
// runDeployment().
const parseRequest = async (body, token) => {
	// check data sanity
	if (!body.repository) {
		throw new Error('Invalid data: Repository.');
	}

	if (!body.repository.git_ssh_url) {
		throw new Error('Invalid data: Url.');
	}

	if (!EVENTS.includes(body.object_kind)) {
		// can't handle that event
		throw new Error(`Can't handle event type ${body.object_kind}`);
	}

	// Target
	const name = body.project.path_with_namespace;
	const target = getTarget(name, body.ref);
	if (!target) {
		return null;
	}

	// check secret
	if (target.secret && (token !== target.secret)) {
		throw new Error('Invalid secret token.');
	}

	// Check sha. Can be empty, when branch / tag gets deleted.
	// For now we ignore that, but it can be used to delete a build.
	if (!body.checkout_sha) {
		return null;
	}

	// set data from current request
	target.gitUrl = body.repository.git_ssh_url;
	target.checkoutSha = body.checkout_sha;
	target.action = 'update';
	target.message = body.message || '';

	return target;
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
