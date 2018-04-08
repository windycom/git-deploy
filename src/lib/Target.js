const ActualTarget = require('lib/ActualTarget');

//==============================================================================
class Target {
	constructor(repository, config) {
		if ((typeof config.match === 'object') && (typeof config.match.exec === 'function')) {
			this.match = config.match.exec.bind(config.match);
		} else if (typeof config.match === 'function') {
			this.match = config.match.bind(config);
		} else {
			this.match = (ref) => (config.match === ref ? [ref] : null);
		}
		this._repository = repository;
		this._path = config.path;
		this.www = config.www;
		this.postupdate = config.postupdate;
		this.postremove = config.postremove;
		console.log(`NEW Target path ${this._path}`);
	}

	assertAllowed(token = null) {
		if (this.secret && (token !== this.secret)) {
			throw new Error('Invalid secret token.');
		}
	}

	createActual(action, info) {
		return new ActualTarget(this, action, info);
	}
}

module.exports = Target;
