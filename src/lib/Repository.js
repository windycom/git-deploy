const { flattenPath, flattenUrl } = require('lib/utils');
const Target = require('lib/Target');

const repositories = new Map();

//==============================================================================
class Repository {
	constructor(name, config) {
		if (!config.path) {
			throw new Error(`Repository config needs a path property.`);
		}
		this.id = flattenUrl(config.path);
		if (repositories.has(this.id)) {
			throw new Error(`Repository with id ${this.id} exists already.`);
		}

		this.name = name;

		this.path = flattenPath(config.path);
		this.secret = config.secret;
		console.log(`NEW Repository(${this.id}) path ${this.path}`);
		this.targets = config.targets.map(target => new Target(this, target));
	}

	getTarget(ref) {
		for (const target of this.targets) {
			const match = target.match(ref);
			if (match) {
				return target;
			}
		}
		return null;
	}
}

//------------------------------------------------------------------------------
const init = (repos) => {
	for (const key of Object.keys(repos)) {
		const repo = new Repository(key, repos[key]);
		repositories.set(repo.id, repo);
	}
};

//------------------------------------------------------------------------------
const get = (id, ref = null) => {
	const repo = repositories.get(flattenUrl(id));
	return ref
		? repo && repo.getTarget(ref)
		: repo;
};

module.exports = init;
module.exports.get = get;
