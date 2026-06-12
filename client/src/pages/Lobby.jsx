import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { errMsg } from '../api.js'
import { useAuth } from '../auth.jsx'
import { getSocket } from '../socket.js'
import { Modal, useToast, ImageUpload } from '../components/ui.jsx'

export default function Lobby() {
  const { account, logout } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [groups, setGroups] = useState([])
  const [mine, setMine] = useState([])
  const [templates, setTemplates] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [requestsFor, setRequestsFor] = useState(null) // 正在审批的团

  const load = useCallback(async () => {
    // 各自独立加载：任一接口失败不影响其它列表
    const [g, m, t] = await Promise.allSettled([
      api.get('/groups'),
      api.get('/groups/mine'),
      api.get('/groups/templates'),
    ])
    if (g.status === 'fulfilled') setGroups(g.value.data); else toast('团列表加载失败：' + errMsg(g.reason))
    if (m.status === 'fulfilled') setMine(m.value.data)
    if (t.status === 'fulfilled') setTemplates(t.value.data)
  }, [toast])

  useEffect(() => { load() }, [load])

  // 实时：有人申请加入（KP）/ 我的申请有结果（玩家）→ 刷新列表
  useEffect(() => {
    const socket = getSocket()
    const onReq = ({ applicant }) => { toast(`${applicant} 申请加入你的团`); load() }
    const onResult = ({ approved }) => { toast(approved ? '你的加入申请已通过！' : '你的加入申请被拒绝'); load() }
    socket.on('join:request', onReq)
    socket.on('join:result', onResult)
    return () => { socket.off('join:request', onReq); socket.off('join:result', onResult) }
  }, [load, toast])

  const join = async (g) => {
    try {
      const { data } = await api.post(`/groups/${g.id}/join`)
      if (data.status === 'approved') nav(`/game/${g.id}`)
      else { toast('已提交申请，等待 KP 审批'); load() }
    } catch (e) { toast(errMsg(e)) }
  }

  // 我作为 KP 的各团待审批数（来自全部团列表）
  const pendingById = {}
  groups.forEach((g) => { if (g.kp_id === account.id) pendingById[g.id] = g.pending_count })

  return (
    <div>
      <div className="topbar">
        <span className="brand">跑团平台 · 大厅</span>
        <span className="spacer" />
        <span className="muted">{account.username}</span>
        {account.isSuperAdmin && <button className="sm" onClick={() => nav('/admin')}>超管后台</button>}
        <button className="sm" onClick={() => setShowPwd(true)}>修改密码</button>
        <button className="sm ghost" onClick={() => { logout(); nav('/login') }}>退出</button>
      </div>

      <div className="lobby-hero">
        <div>
          <h1>欢迎回来，{account.username}</h1>
          <p>选择一个团进入，或开启属于你的故事。</p>
        </div>
        <span className="spacer" />
        <button className="primary" onClick={() => setShowCreate(true)}>+ 开团</button>
      </div>

      <div className="page" style={{ paddingTop: 8 }}>
        {mine.length > 0 && (
          <>
            <div className="lobby-section">
              <h2>我参与的团</h2>
              <span className="count">{mine.length}</span>
            </div>
            <div className="grid-groups" style={{ marginBottom: 28 }}>
              {mine.map((m) => {
                const pending = pendingById[m.id] || 0
                const ended = m.status === 'ended'
                return (
                  <div className={`group-card-v2 ${ended ? 'ended' : 'ongoing'}`} key={m.id}>
                    <div className="gc-band" style={m.cover ? { backgroundImage: `url(${m.cover})` } : undefined}>
                      {m.is_kp && <span className="tag kp">KP</span>}
                      <span className={`tag ${ended ? 'ended' : 'ongoing'}`}>{ended ? '已结束' : '进行中'}</span>
                    </div>
                    <div className="gc-body">
                      <h3 className="gc-title">{m.name}</h3>
                      <div className="gc-meta"><span className="gc-kp">👤 KP：{m.kp_name}</span></div>
                      <div className="gc-actions">
                        <button className="primary" onClick={() => nav(`/game/${m.id}`)}>进入</button>
                        {m.is_kp && (
                          <button className={pending ? 'primary' : ''} onClick={() => setRequestsFor(m)}>
                            审批{pending ? ` (${pending})` : ''}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="lobby-section">
          <h2>全部团</h2>
          <span className="count">{groups.length}</span>
          <span className="spacer" />
          <button className="sm" onClick={() => load()}>↻ 刷新</button>
        </div>
        <div className="grid-groups">
          {groups.map((g) => {
            const full = g.member_count >= g.max_players
            const ended = g.status === 'ended'
            const isKP = g.kp_id === account.id
            const status = g.my_status // approved | pending | rejected | null
            const pct = Math.min(100, Math.round((g.member_count / Math.max(1, g.max_players)) * 100))
            return (
              <div className={`group-card-v2 ${ended ? 'ended' : 'ongoing'}`} key={g.id}>
                <div className="gc-band" style={g.cover ? { backgroundImage: `url(${g.cover})` } : undefined}>
                  {isKP && <span className="tag kp">KP</span>}
                  <span className={`tag ${ended ? 'ended' : 'ongoing'}`}>{ended ? '已结束' : '进行中'}</span>
                </div>
                <div className="gc-body">
                  <h3 className="gc-title">{g.name}</h3>
                  <div className="gc-intro">{g.intro || '（暂无简介）'}</div>
                  <div className="gc-divider" />
                  <div className="gc-meta">
                    <span className="gc-kp">👤 {g.kp_name}</span>
                    <span className="spacer" />
                    <span className="gc-count">👥 {g.member_count}/{g.max_players}</span>
                  </div>
                  <div className="gc-bar"><div className="gc-bar-fill" style={{ width: `${pct}%` }} /></div>
                  {status === 'approved' ? (
                    <div className="gc-actions">
                      <button className="primary" onClick={() => nav(`/game/${g.id}`)}>进入</button>
                      {isKP && g.pending_count > 0 && (
                        <button className="primary" style={{ flex: '0 0 auto' }} onClick={() => setRequestsFor(g)}>审批 ({g.pending_count})</button>
                      )}
                    </div>
                  ) : status === 'pending' ? (
                    <div className="gc-actions"><button disabled>已申请，等待审批</button></div>
                  ) : (
                    <div className="gc-actions">
                      <button disabled={ended || full} onClick={() => join(g)}>
                        {ended ? '已结束' : full ? '人数已满' : status === 'rejected' ? '再次申请' : '申请加入'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {groups.length === 0 && <div className="muted">还没有团，点右上「开团」创建第一个吧。</div>}
        </div>
      </div>

      {showCreate && (
        <CreateGroup
          templates={templates}
          onClose={() => setShowCreate(false)}
          onCreated={(g) => { setShowCreate(false); nav(`/game/${g.id}`) }}
        />
      )}
      {showPwd && <ChangePassword onClose={() => setShowPwd(false)} />}
      {requestsFor && (
        <JoinRequests group={requestsFor} onClose={() => setRequestsFor(null)} onChange={load} />
      )}
    </div>
  )
}

// KP 审批加入申请
export function JoinRequests({ group, onClose, onChange }) {
  const toast = useToast()
  const [reqs, setReqs] = useState([])
  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/groups/${group.id}/requests`)
      setReqs(data)
    } catch (e) { toast(errMsg(e)) }
  }, [group.id, toast])
  useEffect(() => { load() }, [load])

  const act = async (m, action) => {
    try {
      await api.post(`/groups/${group.id}/requests/${m.id}`, { action })
      toast(action === 'approve' ? `已同意 ${m.username}` : `已拒绝 ${m.username}`)
      await load()
      onChange?.()
    } catch (e) { toast(errMsg(e)) }
  }

  return (
    <Modal title={`「${group.name}」加入申请`} onClose={onClose} width={400}>
      {reqs.length === 0 && <div className="muted">暂无待审批申请</div>}
      {reqs.map((m) => (
        <div className="list-item" key={m.id} style={{ cursor: 'default' }}>
          <div style={{ flex: 1 }}>
            <b>{m.username}</b>
            <div className="muted" style={{ fontSize: 11 }}>{new Date(m.created_at).toLocaleString('zh-CN')}</div>
          </div>
          <button className="primary sm" onClick={() => act(m, 'approve')}>同意</button>
          <button className="sm ghost danger" onClick={() => act(m, 'reject')}>拒绝</button>
        </div>
      ))}
    </Modal>
  )
}

function CreateGroup({ templates, onClose, onCreated }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [intro, setIntro] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const [cover, setCover] = useState(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!name.trim()) return toast('请填写团名')
    setBusy(true)
    try {
      const { data } = await api.post('/groups', {
        name: name.trim(), intro, maxPlayers: Number(maxPlayers),
        templateId: templateId || null, cover,
      })
      onCreated(data)
    } catch (e) { toast(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <Modal title="开团" onClose={onClose}>
      <label>团名 *</label>
      <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <label>房间封面</label>
      <ImageUpload value={cover} onChange={setCover} label="上传封面" hint="建议横图（如 16:9），展示在大厅卡片顶部" />
      <label>简介</label>
      <textarea rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} />
      <div className="field-row">
        <div>
          <label>人数上限</label>
          <input type="number" min={1} max={20} value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} />
        </div>
        <div>
          <label>人物卡模板</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">（不限）</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>取消</button>
        <button className="primary" disabled={busy} onClick={create}>创建并进入</button>
      </div>
    </Modal>
  )
}

function ChangePassword({ onClose }) {
  const toast = useToast()
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const submit = async () => {
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword })
      toast('密码已修改')
      onClose()
    } catch (e) { toast(errMsg(e)) }
  }
  return (
    <Modal title="修改密码" onClose={onClose} width={360}>
      <label>原密码</label>
      <input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
      <label>新密码（至少 4 位）</label>
      <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>取消</button>
        <button className="primary" onClick={submit}>确定</button>
      </div>
    </Modal>
  )
}
