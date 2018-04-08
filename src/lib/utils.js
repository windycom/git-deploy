//------------------------------------------------------------------------------
// Flattens a path (replaces separators).
const flattenPath = (s, c = '-') => s.replace(/[/\\]/g, c);

//------------------------------------------------------------------------------
// Flattens a URL. Replaces separators both for subdomains and for paths.
const flattenUrl = (s, c = '-') => s.replace(/[/\\.]/g, c);

//------------------------------------------------------------------------------
// Wait for event `endEvent` to occur on `obj` and resolve the promise.
// Also check for error events, which will reject the promise.
const waitEvent = (obj, endEvent = 'end') => new Promise((resolve, reject) => {
	obj.once(endEvent, resolve);
	obj.once('error', reject);
});

module.exports.flattenPath = flattenPath;
module.exports.flattenUrl = flattenUrl;
module.exports.waitEvent = waitEvent;
