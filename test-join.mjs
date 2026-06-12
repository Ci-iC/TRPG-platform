import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { io } = require('./client/node_modules/socket.io-client')

const ORIGIN = 'http://localhost:4100'
const BASE = ORIGIN + '/api'
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗ FAIL:', m) } }
async function api(path, { token, method = 'GET', body } = {}) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}
const connect = (token) => new Promise((res, rej) => { const s = io(ORIGIN, { auth: { token }, transports: ['websocket'] }); s.on('connect', () => res(s)); s.on('connect_error', rej); setTimeout(() => rej(new Error('timeout')), 4000) })
const emitAck = (s, ev, p) => new Promise((r) => s.emit(ev, p, (x) => r(x || {})))

async function main() {
  const A = (await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin888' } })).data.token
  const uname = 'p_' + Date.now()
  await api('/admin/accounts', { token: A, method: 'POST', body: { username: uname, password: 'p123' } })
  const P = (await api('/auth/login', { method: 'POST', body: { username: uname, password: 'p123' } })).data.token
  const G = (await api('/groups', { token: A, method: 'POST', body: { name: '加入测试_' + Date.now(), maxPlayers: 4, templateId: 1 } })).data.id
  await api(`/groups/${G}/control/state`, { token: A, method: 'POST', body: { gameState: 'running' } })
  console.log('准备完成 groupId=' + G)

  // KP socket 进入团房间（join:request 走账号房间，member:update 走团房间）
  const sa = await connect(A); await emitAck(sa, 'group:join', { groupId: G })
  const sp = await connect(P)

  console.log('1) 玩家申请前 my_status 应为 null')
  let list = (await api('/groups', { token: P })).data
  let g = list.find((x) => x.id === G)
  ok(g && g.my_status === null, 'my_status=null')

  console.log('2) 玩家申请 -> KP 实时收到 join:request')
  const reqEvt = new Promise((r) => sa.once('join:request', r))
  await api(`/groups/${G}/join`, { token: P, method: 'POST' })
  const evt = await Promise.race([reqEvt, new Promise((r) => setTimeout(() => r(null), 2500))])
  ok(evt && evt.groupId === G, 'KP 收到 join:request, applicant=' + evt?.applicant)

  console.log('3) 申请后 my_status=pending, KP 看到 pending_count=1')
  g = (await api('/groups', { token: P })).data.find((x) => x.id === G)
  ok(g.my_status === 'pending', 'my_status=pending')
  g = (await api('/groups', { token: A })).data.find((x) => x.id === G)
  ok(g.pending_count === 1, 'KP pending_count=1')

  console.log('4) KP 审批通过 -> 玩家实时收到 join:result, 团房收到 member:update')
  const { data: reqs } = await api(`/groups/${G}/requests`, { token: A })
  ok(reqs.length === 1, 'KP /requests 1 条')
  const resultEvt = new Promise((r) => sp.once('join:result', r))
  const memberEvt = new Promise((r) => sa.once('member:update', r))
  await api(`/groups/${G}/requests/${reqs[0].id}`, { token: A, method: 'POST', body: { action: 'approve' } })
  const rr = await Promise.race([resultEvt, new Promise((r) => setTimeout(() => r(null), 2500))])
  ok(rr && rr.approved === true, '玩家收到 join:result approved=true')
  const mm = await Promise.race([memberEvt, new Promise((r) => setTimeout(() => r(null), 2500))])
  ok(mm !== null, 'KP 团房收到 member:update')

  console.log('5) 审批后玩家 my_status=approved')
  g = (await api('/groups', { token: P })).data.find((x) => x.id === G)
  ok(g.my_status === 'approved', 'my_status=approved')

  sa.close(); sp.close()
  // 清理
  await api(`/groups/${G}/control/end`, { token: A, method: 'POST' })
  console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('异常:', e); process.exit(1) })
