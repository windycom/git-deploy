'use strict';

module.exports = {
	NODE_ENV: 'production',
	LOG_LEVEL: 'error',
	DEBUG: false,

	// Port the server is listening on.
	port: 8080,

	// Bind to specific interface (0.0.0.0 for all).
	bind: '127.0.0.1',

	// Path where to store data (checkout, build-logs etc)
	dataPath: '/opt/git-deploy',

	// Private data: Repositories, pid-files etc.
	// Resolved against dataPath.
	privatePath: '.data',

	// WWW-Root. A build's output will be linked here.
	// Resolved against dataPath.
	// See also target.www.
	wwwPath: 'www',

	// Run the following services. At least gitlab is required.
	// Dashboard and builds are optional. It's preferable to serve the builds
	// via an external webserver.
	// Each entry contains a name, that must resolve to a file in src/service.
	// Also it contains the URL the service is mounted under.
	services: [
		{
			name: 'gitlab',
			url: '/hooks/gitlab',
		},
		{
			name: 'dashboard',
			url: '/dashboard',
			// optional: Specify a template (mustache) for index.html
			template: 'src/html/index.tpl.html',
		},
		//{ name: 'builds', url: '/' },
	],

	// Repository configuration. Each entry's key must be the full name gitlab
	// sends, means: <username>/<repositoryname>.
	repos: {
		// Key is the human readable name.
		'fancy-app': {
			// Full path as it will appear in the hook data (`project.path_with_namespace`
			// for gitlab). The result will be path-flattened, so it contains no path
			// separators anymore, we want a flat folder structure.
			// Means: `myaccount/fancy-app` becomes `myaccount-fancy-app`.
			path: 'myaccount/fancy-app',

			// If given, use that secrect.
			secret: '00000000-0000-0000-0000-000000000000',

			// Targets. Each target is checked against the ref sent with the hook,
			// and the first matching is used.
			targets: [
				{
					// Regular expression to match current ref against.
					match: /^refs\/tags\/rc(.+)$/,

					// Path can contain interpolations from the match (%1, %2 etc) and
					// creates a folder structure in config.publicPath and config.wwwPath.
					// The path will be combined from the name of the repo and this
					// expression here. It will be slugified to contain no slashes or dots,
					// so it does not contain any structural information, neither for subdomains
					// nor for paths.
					path: '%1',

					// Where to find the actual build results. If not set, no link will be
					// created (e.g. backends).
					www: 'build',

					// Scripts to run after updating.
					// Can be a single string, or an array.
					// If an entry refers to a .js-file, the script is run via fork().
					// Otherwise the command is run in a shell via spawn().
					// If an entry is an array, it's run as [cmd, ...args].
					// Means: These both are possible:
					postupdate: [
						'npm install --production',
						['npm', 'prune', '--production'],
					],
				},
			],
		},
	},
};
