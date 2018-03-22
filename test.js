'use strict';

require('require-rewrite')(__dirname);
const Fs = require('fs-extra');
const chalk = require('chalk');
const request = require('request');
const { loadConfig, console } = require('lib/config');

//------------------------------------------------------------------------------
const run = async () => {
	if (process.argv.length < 3) {
		console.log(`Usage: node test <testfile> [<configname>]`);
		process.exit(1);
	}
	const testFile = process.argv[2];
	const configName = process.argv.length > 3
		? process.argv[3]
		: 'default';

	const config = await loadConfig(configName);
	process.env.NODE_ENV = config.NODE_ENV;
	console.log(`Config: ${chalk.whiteBright(config.__file)}.`);
	console.log(`NODE_ENV: ${chalk.whiteBright(process.env.NODE_ENV)}.`);
	const gitlabService = config.services.find(service => service.name === 'gitlab');
	const gitlabUrl = gitlabService && gitlabService.url;
	if (!gitlabUrl) {
		throw new Error(`Invalid or missing services.gitlab`);
	}

	const testData = await Fs.readJson(testFile);
	request.post({
		url: `http://127.0.0.1:${config.port}${gitlabUrl}`,
		headers: testData.header,
		body: testData.body,
		json: true,
	}, () => {
		console.log('');
	}).pipe(process.stdout);
};

//==============================================================================
run().catch(error => {
	console.log(chalk.red(`✗ ${error.message}`));
	process.exit(1);
});
