// Netlify Function (v2, native ES module) that serves the whole API through the Express app.
// It claims the /api/* path itself (see `config`), so no redirect rule is needed. Requests are
// converted to the event shape serverless-http understands, and its reply is converted back to a Response.
import serverless from 'serverless-http';
import app from '../../server/index.js';

const run = serverless(app);

export default async (req) => {
  const url = new URL(req.url);
  const body = ['GET', 'HEAD'].includes(req.method) ? null : await req.text();
  const result = await run({
    httpMethod: req.method,
    path: url.pathname,
    headers: Object.fromEntries(req.headers),
    queryStringParameters: Object.fromEntries(url.searchParams),
    body,
    isBase64Encoded: false,
  }, {});

  const headers = { ...(result.headers || {}) };
  delete headers['content-length']; // recomputed for the Response
  delete headers['transfer-encoding'];
  const noBody = [204, 205, 304].includes(result.statusCode);
  return new Response(noBody ? null : (result.body ?? ''), { status: result.statusCode, headers });
};

export const config = { path: '/api/*' };
