import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import type Express from 'express';

import { handleCreateUser, handleLoginUser } from './endpoints/user.js';
import { handleUpdateGhConfig } from './endpoints/github-sync.js'; // Import the new handler

import fs from 'fs';
import { handlePush } from './endpoints/replicache-push.js';
import { handlePull } from './endpoints/replicache-pull.js';
import { handlePoke } from './endpoints/handle-poke.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const portEnv = parseInt(process.env.PORT || '');
const port = Number.isInteger(portEnv) ? portEnv : 8080;
const host = process.env.HOST ?? '0.0.0.0';

const default_dist = path.join(__dirname, '../dist/dist');

// dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();

const errorHandler = (
  err: Error,
  _req: Express.Request,
  res: Express.Response,
  next: Express.NextFunction,
) => {
  res.status(500).send(err.message);
  next(err);
};

app.use(express.urlencoded({ extended: true }), express.json(), errorHandler);

app.post('/api/replicache/push', handlePush);
app.post('/api/replicache/pull', handlePull);
app.get('/api/replicache/poke', handlePoke);

app.post('/api/entangle/user', handleCreateUser);
app.post('/api/entangle/user/login', handleLoginUser);
app.post('/api/entangle/user/ghconfig', handleUpdateGhConfig);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(default_dist));
  app.get('/health', (_: Express.Request, res: Express.Response) => {
    res.send('ok');
  });
  app.use('*', (_req, res) => {
    const index = path.join(default_dist, 'index.html');
    const html = fs.readFileSync(index, 'utf8');
    res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
  });
  app.listen(port, host, () => {
    console.log(
      `Replicache is listening on ${host}:${port} -- ${default_dist}`,
    );
  });
} else {
  app.listen(port, host, () => {
    console.log(`Server listening on ${host}:${port}`);
  });
}