import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
if (process.env.APP_URL === undefined) {
  try { loadEnvFile('.env'); } catch {}
}
const origin = new URL(process.env.APP_URL ?? 'http://127.0.0.1:3000').origin;
const credentials = JSON.parse(await readFile('.local/credentials.json', 'utf8'));

const login = await fetch(origin + '/api/auth/login', {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'hr@abc.example', password: credentials['hr@abc.example'] })
});
if (!login.ok) throw new Error(`LOGIN_FAILED: ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('LOGIN_COOKIE_MISSING');

async function call(route, options = {}) {
  const response = await fetch(origin + route, {
    ...options,
    headers: { Origin: origin, Cookie: cookie, ...options.headers },
    signal: AbortSignal.timeout(60000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`KB_API:${response.status}:${data.error?.code || JSON.stringify(data)}`);
  return data;
}

const docs = [];
for (let page = 1; ; page++) {
  const batch = await call('/api/knowledge?page=' + page);
  docs.push(...batch.items);
  if (docs.length >= batch.total) break;
}
console.log(`Found ${docs.length} knowledge documents.`);

// Step 1: Trigger reindex on all versions that are not READY
for (const doc of docs) {
  for (const version of doc.versions) {
    if (version.status !== 'READY') {
      console.log(`Triggering reindex for: "${doc.title}" version ${version.version} (${version.id})`);
      await call(`/api/knowledge/${doc.id}/reindex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: version.id })
      });
    }
  }
}

// Step 2: Poll until all versions are READY (or FAILED)
console.log('Waiting for background worker to process ingestion jobs...');
const deadline = Date.now() + 180000; // 3 minutes timeout
let allReady = false;

while (Date.now() < deadline) {
  let pending = 0;
  let failed = 0;
  let ready = 0;

  for (const doc of docs) {
    const detail = await call(`/api/knowledge/${doc.id}`);
    for (const v of detail.versions) {
      if (v.status === 'READY') {
        ready++;
      } else if (v.status === 'FAILED') {
        failed++;
        console.error(`Version ${v.id} of "${doc.title}" failed:`, v.job?.error_code);
      } else {
        pending++;
      }
    }
  }

  console.log(`Progress: ${ready} READY, ${pending} pending/processing, ${failed} failed.`);
  if (pending === 0) {
    allReady = (failed === 0);
    break;
  }
  await new Promise(r => setTimeout(r, 4000));
}

if (!allReady) {
  throw new Error('Not all document versions reached READY state within deadline.');
}

// Step 3: Publish all READY versions
console.log('Publishing READY versions...');
const published = [];
for (const doc of docs) {
  const detail = await call(`/api/knowledge/${doc.id}`);
  for (const v of detail.versions) {
    if (v.status === 'READY') {
      console.log(`Publishing "${doc.title}" version ${v.version}...`);
      const res = await call(`/api/knowledge/${doc.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: v.id })
      });
      published.push({
        id: doc.id,
        title: doc.title,
        version_id: v.id,
        active_version_id: res.active_version_id,
        status: res.status
      });
    }
  }
}

console.log(JSON.stringify({ status: 'ALL_PUBLISHED', count: published.length, published }, null, 2));
