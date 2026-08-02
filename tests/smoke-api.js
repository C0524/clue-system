/* eslint-disable no-console */

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const USERNAME = process.env.SMOKE_USERNAME || '';
const PASSWORD = process.env.SMOKE_PASSWORD || '';

function fail(msg, code = 1) {
  console.error('[SMOKE][FAIL]', msg);
  process.exit(code);
}

async function postJson(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    return { code: 500, msg: 'non-json', raw: text };
  }
}

async function main() {
  console.log('[SMOKE] BASE_URL =', BASE_URL);

  if (!USERNAME || !PASSWORD) {
    fail('请先设置环境变量 SMOKE_USERNAME 和 SMOKE_PASSWORD', 2);
  }

  const health = await fetch(BASE_URL + '/api/_health');
  if (!health.ok) fail('健康检查失败: /api/_health HTTP ' + health.status);
  console.log('[SMOKE] health ok');

  const login = await postJson(BASE_URL + '/api/login', { username: USERNAME, password: PASSWORD });
  if (!login || login.code !== 200 || !login.data || !login.data.auth) {
    fail('登录失败: ' + JSON.stringify(login));
  }
  const auth = login.data.auth;
  console.log('[SMOKE] login ok as', login.data.username, 'role=', login.data.role);

  const list = await postJson(BASE_URL + '/api/list', { page: 1, pageSize: 1 }, auth);
  if (!list || list.code !== 200) {
    fail('列表查询失败: ' + JSON.stringify(list));
  }

  const rows = list.data && Array.isArray(list.data.rows) ? list.data.rows : (Array.isArray(list.data) ? list.data : []);
  console.log('[SMOKE] list ok, rows=', rows.length);

  if (rows.length === 0) {
    console.log('[SMOKE] 无可更新线索，跳过 updateClue');
    console.log('[SMOKE] PASS');
    return;
  }

  const row = rows[0] || {};
  const id = row.id;
  if (!id) {
    console.log('[SMOKE] 首条记录无 id，跳过 updateClue');
    console.log('[SMOKE] PASS');
    return;
  }

  const updates = {
    content: typeof row.content === 'string' ? row.content : '',
  };

  const upd = await postJson(BASE_URL + '/api/updateClue', { id, updates }, auth);
  if (!upd || upd.code !== 200) {
    fail('updateClue 失败: ' + JSON.stringify(upd));
  }

  console.log('[SMOKE] updateClue ok, id=', id);
  console.log('[SMOKE] PASS');
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
