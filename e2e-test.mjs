// 端到端核心闭环验证（针对运行中的后端 :4100）
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { io } = require('./client/node_modules/socket.io-client')

const ORIGIN = 'http://localhost:4100'
const BASE = ORIGIN + '/api'
const log = (...a) => console.log(...a)
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; log('  ✓', m) } else { fail++; log('  ✗ FAIL:', m) } }

async function api(path, { token, method = 'GET', body } = {}) {
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await r.text()
    let data = {}
    try { data = JSON.parse(text) } catch { log('    [非JSON响应]', r.status, text.slice(0, 120)) }
    return { status: r.status, data }
  } catch (e) {
    log('    [fetch 异常]', method, path, e.message)
    return { status: 0, data: {} }
  }
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(ORIGIN, { auth: { token }, transports: ['websocket'] })
    s.on('connect', () => resolve(s))
    s.on('connect_error', reject)
    setTimeout(() => reject(new Error('socket timeout')), 4000)
  })
}
const emitAck = (s, ev, p) => new Promise((res) => s.emit(ev, p, (r) => res(r || {})))

async function main() {
  log('1) 超管登录')
  const { data: adminLogin } = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin888' } })
  ok(adminLogin.token, '超管登录拿到 token')
  const A = adminLogin.token

  log('2) 创建玩家账号 alice')
  const uname = 'alice_' + Date.now()
  const { data: created } = await api('/admin/accounts', { token: A, method: 'POST', body: { username: uname, password: 'alice123' } })
  ok(created.id, '创建玩家账号')
  const { data: aliceLogin } = await api('/auth/login', { method: 'POST', body: { username: uname, password: 'alice123' } })
  ok(aliceLogin.token, 'alice 登录')
  const B = aliceLogin.token

  log('3) 超管开团（成为 KP）')
  const { data: tpls } = await api('/groups/templates', { token: A })
  const { data: group } = await api('/groups', { token: A, method: 'POST', body: { name: '测试团_' + Date.now(), intro: '冒烟测试', maxPlayers: 4, templateId: tpls[0]?.id } })
  ok(group.id, '开团成功 id=' + group.id)
  const G = group.id

  log('4) alice 申请加入')
  const { data: joinRes } = await api(`/groups/${G}/join`, { token: B, method: 'POST' })
  ok(joinRes.status === 'pending', '申请状态 pending')

  log('5) KP 查看并审批')
  const { data: reqs } = await api(`/groups/${G}/requests`, { token: A })
  ok(reqs.length === 1, '有 1 条待审批')
  const { status: apprStatus } = await api(`/groups/${G}/requests/${reqs[0].id}`, { token: A, method: 'POST', body: { action: 'approve' } })
  ok(apprStatus === 200, '审批通过')

  log('6) alice 拿到团快照')
  const { data: snap } = await api(`/groups/${G}`, { token: B })
  ok(snap.group?.id === G && !snap.isKP, 'alice 是成员、非 KP')

  log('7) KP 开始游戏')
  await api(`/groups/${G}/control/state`, { token: A, method: 'POST', body: { gameState: 'running' } })

  log('8) 双方建立 socket 并进房')
  const sa = await connect(A)
  const sb = await connect(B)
  await emitAck(sa, 'group:join', { groupId: G })
  const joinB = await emitAck(sb, 'group:join', { groupId: G })
  ok(joinB.ok, 'alice 进房成功')

  log('9) alice 发玩家行动 -> KP 应收到')
  const recvP = new Promise((res) => sa.once('message:new', res))
  const sendRes = await emitAck(sb, 'chat:send', { groupId: G, mode: 'action', content: '我推开门' })
  ok(sendRes.ok, 'alice 发言被接受')
  const msg = await Promise.race([recvP, new Promise((r) => setTimeout(() => r(null), 2500))])
  ok(msg && msg.type === 'player_action' && msg.content === '我推开门', 'KP 实时收到玩家行动')

  log('10) alice 骰点 2d6+1')
  const recvD = new Promise((res) => sa.once('message:new', res))
  const dice = await emitAck(sb, 'dice:roll', { groupId: G, expr: '2d6+1' })
  ok(dice.ok && typeof dice.total === 'number' && dice.total >= 3 && dice.total <= 13, '骰点结果合法 total=' + dice.total)
  const dmsg = await Promise.race([recvD, new Promise((r) => setTimeout(() => r(null), 2500))])
  ok(dmsg && dmsg.type === 'dice', 'KP 收到骰点广播')

  log('11) KP 暗骰（不广播）')
  const hid = await emitAck(sa, 'dice:roll', { groupId: G, expr: 'd100', hidden: true })
  ok(hid.ok && hid.hidden === true, '暗骰仅返回发起者')

  log('12) KP 建 NPC 并以 NPC 发言（带立绘 -> performance）')
  const { data: npc } = await api(`/groups/${G}/npcs`, { token: A, method: 'POST', body: { name: '神秘人', portrait: '/uploads/fake.png', intro: '测试 NPC' } })
  ok(npc.id, 'NPC 创建')
  const recvNpc = new Promise((res) => sb.once('message:new', res))
  await emitAck(sa, 'npc:speak', { groupId: G, npcId: npc.id, content: '你来了。' })
  const nmsg = await Promise.race([recvNpc, new Promise((r) => setTimeout(() => r(null), 2500))])
  ok(nmsg && nmsg.type === 'character_speech' && nmsg.meta?.performance === true, 'NPC 发言触发立绘演出标记')

  log('13) KP 上传场景并切换 -> alice 收到 scene:switch')
  const { data: scene } = await api(`/groups/${G}/scenes`, { token: A, method: 'POST', body: { image: '/uploads/scene1.png', name: '古宅大厅' } })
  ok(scene.id, '场景创建')
  const recvScene = new Promise((res) => sb.once('scene:switch', res))
  await api(`/groups/${G}/scene/switch`, { token: A, method: 'POST', body: { sceneId: scene.id } })
  const sc = await Promise.race([recvScene, new Promise((r) => setTimeout(() => r(null), 2500))])
  ok(sc && sc.scene?.id === scene.id, 'alice 实时收到场景切换')

  log('14) KP 发线索给 alice -> alice 可见')
  const { data: clue } = await api(`/groups/${G}/clues`, { token: A, method: 'POST', body: { title: '血迹', description: '地上的血迹' } })
  await api(`/groups/${G}/clues/${clue.id}/distribute`, { token: A, method: 'POST', body: { accountIds: [created.id] } })
  const { data: aliceClues } = await api(`/groups/${G}/clues`, { token: B })
  ok(aliceClues.some((c) => c.id === clue.id), 'alice 能看到分发的线索')

  log('15) KP 发物品给 alice -> alice 背包可见')
  await api(`/groups/${G}/inventory/grant`, { token: A, method: 'POST', body: { accountId: created.id, name: '钥匙', quantity: 1, description: '黄铜钥匙' } })
  const { data: bag } = await api(`/groups/${G}/inventory`, { token: B })
  ok(bag.some((i) => i.name === '钥匙'), 'alice 背包收到钥匙')

  log('16) 结束游戏（不可逆）')
  await api(`/groups/${G}/control/end`, { token: A, method: 'POST' })
  const { data: snap2 } = await api(`/groups/${G}`, { token: B })
  ok(snap2.group.status === 'ended', '团状态已结束')

  sa.close(); sb.close()
  log(`\n结果: ${pass} 通过, ${fail} 失败`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('测试异常:', e); process.exit(1) })
