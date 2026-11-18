// Netlify Function that serves the whole API by wrapping the Express app.
// This entry file is CommonJS on purpose: Netlify's function wrapper require()s it, and Node cannot
// require() an ES module. The app itself is an ES module, so it is loaded with a dynamic import().
// netlify.toml rewrites /api/* to /.netlify/functions/api/api/*; basePath strips the function prefix
// so Express sees the normal /api/... routes.
const serverless = require('serverless-http');

let cached;
exports.handler = async (event, context) => {
  if (!cached) {
    cached = import('../../server/index.js').then((m) => serverless(m.default, { basePath: '/.netlify/functions/api' }));
  }
  return (await cached)(event, context);
};
