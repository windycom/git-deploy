const pick = require('lodash/pick');

const ACTIONS = ['update', 'clean'];
const FIELDS = ['gitUrl', 'checkoutSha', 'message', 'request', 'commit'];

//==============================================================================
class ActualTarget {
	constructor(target, action, info) {
		Object.assign(this, pick(info, FIELDS));
		if (ACTIONS.indexOf(action) === -1) {
			throw new Error(`ActualTarget: Action needs to be one of "${ACTIONS.join('", "')}". Have ${action}`);
		}
		if (!this.gitUrl) {
			throw new Error(`ActualTarget: Missing or invalid option gitUrl`);
		}
		if (!this.checkoutSha) {
			throw new Error(`ActualTarget: Missing or invalid option checkoutSha`);
		}
		if (!this.commit) {
			this.commit = {
				id: null,
				timestamp: 0,
				message: '',
			};
		}
	}
}

module.exports = ActualTarget;
