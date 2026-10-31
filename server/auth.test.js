import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import test from 'node:test';

import { authRoutes, currentUser } from './auth.js';

const DB_PATH = path.join(import.meta.dirname, 'data', 'db.json');
const ORIGINAL_DB = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH, 'utf8') : null;

function writeDb(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use(currentUser);
  authRoutes(app);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const port = server.address().port;
  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

async function postJson(port, body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : { raw: await response.text() };

  return { status: response.status, payload };
}

test('login returns the same generic error for missing team and wrong password', async () => {
  writeDb({ users: [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', username: 'alpha', password: 'correct' }], submissions: [] });

  const { port, close } = await createServer();
  try {
    const missingTeam = await postJson(port, { username: 'missing', password: 'any' });
    const wrongPassword = await postJson(port, { username: 'alpha', password: 'wrong' });

    assert.equal(missingTeam.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(missingTeam.payload, { error: 'Invalid team name or password.' });
    assert.deepEqual(wrongPassword.payload, { error: 'Invalid team name or password.' });
    assert.deepEqual(Object.keys(missingTeam.payload), Object.keys(wrongPassword.payload));
  } finally {
    await close();
  }
});

test('login succeeds for valid credentials', async () => {
  writeDb({ users: [{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', username: 'alpha', password: 'correct' }], submissions: [] });

  const { port, close } = await createServer();
  try {
    const response = await postJson(port, { username: 'alpha', password: 'correct' });

    assert.equal(response.status, 200);
    assert.deepEqual(response.payload, { username: 'alpha' });
  } finally {
    await close();
  }
});

test.after(() => {
  if (ORIGINAL_DB === null) {
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    return;
  }
  writeDb(JSON.parse(ORIGINAL_DB));
});
