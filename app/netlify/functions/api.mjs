// Netlify Function that serves the whole API by wrapping the Express app.
// netlify.toml rewrites /api/* to /.netlify/functions/api/api/*; basePath strips the function prefix
// so Express sees the normal /api/... routes.
import serverless from 'serverless-http';
import app from '../../server/index.js';

export const handler = serverless(app, { basePath: '/.netlify/functions/api' });
