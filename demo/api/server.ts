import { createServer } from 'node:http';

import { handleRequest } from './routes.js';

const port = Number(process.env.PORT ?? process.env.DEMO_API_PORT ?? 4001);
const host = process.env.DEMO_API_HOST ?? (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

const server = createServer(handleRequest);

server.listen(port, host, () => {
  console.log(`[demo-api] listening on http://${host}:${port}`);
});
