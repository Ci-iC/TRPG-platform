import { useEffect, useState, useCallback } from 'react'
import api, { errMsg } from '../api.js'
import { useToast, Modal, ImageUpload } from '../components/ui.jsx'

// ============ 左侧：玩家面板 ============
export function PlayerPanelKP({ groupId, members, online, templateFields }) {
  const [view, setView] = useState(null) // account
  const onlineSet = new Set(online)
  const players = members.filter((m) => m.role !== 'kp')
  return (
    <div className="panel-body scroll">
      <div className="section-title">团内成员（{players.length}）</div>
      {players.length === 0 && <div className="muted">还没有玩家加入</div>}
      {players.map((m) => (
        <div className="list-item" key={m.id} onClick={() => setView(m)}>
          <div style={{ flex: 1 }}>
            <b>{m.username}</b>
            <div className={onlineSet.has(m.id) ? 'online' : 'offline'} style={{ fontSize: 11 }}>
              ● {onlineSet.has(m.id) ? '在线' : '离线'}
            </div>
          </div>
        </div>
      ))}
      {view && (
        <PlayerDetail
          groupId={groupId} player={view} templateFields={templateFields}
          onClose={() => setView(null)}
        />
      )}
    </div>
  )
}

function PlayerDetail({ groupId, player, templateFields, onClose }) {
  const toast = useToast()
  const [tab, setTab] = useState('card')
  const [card, setCard] = useState(null)
  const [items, setItems] = useState([])
  const [grant, setGrant] = useState({ name: '', quantity: 1, description: '', image: null })

  const loadCard = useCallback(async () => {
    const { data } = await api.get(`/groups/${groupId}/players/${player.id}/character`)
    setCard(data || { name: '', portrait: null, attributes: {}, intro: '' })
  }, [groupId, player.id])
  const loadItems = useCallback(async () => {
    const { data } = await api.get(`/groups/${groupId}/players/${player.id}/inventory`)
    setItems(data)
  }, [groupId, player.id])

  useEffect(() => { loadCard().catch((e) => toast(errMsg(e))) }, [loadCard])
  useEffect(() => { if (tab === 'bag') loadItems().catch((e) => toast(errMsg(e))) }, [tab, loadItems])

  const setAttr = (k, v) => setCard((c) => ({ ...c, attributes: { ...c.attributes, [k]: v } }))
  const saveCard = async () => {
    try { await api.put(`/groups/${groupId}/players/${player.id}/character`, card); toast('已保存') }
    catch (e) { toast(errMsg(e)) }
  }
  const doGrant = async () => {
    if (!grant.name.trim()) return toast('物品名必填')
    try {
      await api.post(`/groups/${groupId}/inventory/grant`, { accountId: player.id, ...grant, quantity: Number(grant.quantity) })
      toast('已发放'); setGrant({ name: '', quantity: 1, description: '', image: null }); loadItems()
    } catch (e) { toast(errMsg(e)) }
  }

  return (
    <Modal title={`玩家：${player.username}`} onClose={onClose} width={480}>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`sm ${tab === 'card' ? 'primary' : ''}`} onClick={() => setTab('card')}>人物卡</button>
        <button className={`sm ${tab === 'bag' ? 'primary' : ''}`} onClick={() => setTab('bag')}>背包</button>
      </div>
      {tab === 'card' && card && (
        <div className="col">
          <label>角色名</label>
          <input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
          <label>立绘</label>
          <ImageUpload value={card.portrait} onChange={(url) => setCard({ ...card, portrait: url })} label="上传立绘" hint="建议 720×1280（竖图 9:16），透明背景 PNG 最佳" />
          {templateFields.map((f) => (
            <div className="attr-row" key={f.name}>
              <span className="nm">{f.name}</span>
              <input value={card.attributes?.[f.name] ?? f.default ?? ''} onChange={(e) => setAttr(f.name, e.target.value)} />
            </div>
          ))}
          <label>背景</label>
          <textarea rows={2} value={card.intro || ''} onChange={(e) => setCard({ ...card, intro: e.target.value })} />
          <button className="primary sm" onClick={saveCard}>保存人物卡</button>
        </div>
      )}
      {tab === 'bag' && (
        <div>
          <div className="section-title">当前背包</div>
          {items.length === 0 && <div className="muted">空</div>}
          {items.map((it) => (
            <div className="list-item" key={it.id} style={{ cursor: 'default' }}>
              {it.image ? <img className="avatar" src={it.image} alt="" /> : <div className="avatar ph">🎒</div>}
              <div style={{ flex: 1 }}><b>{it.name}</b> ×{it.quantity}
                <div className="muted" style={{ fontSize: 11 }}>{it.description}</div></div>
            </div>
          ))}
          <div className="divider" />
          <div className="section-title">发放物品</div>
          <input placeholder="物品名" value={grant.name} onChange={(e) => setGrant({ ...grant, name: e.target.value })} />
          <div className="field-row" style={{ marginTop: 6 }}>
            <input type="number" min={1} placeholder="数量" value={grant.quantity} onChange={(e) => setGrant({ ...grant, quantity: e.target.value })} />
            <input placeholder="描述" value={grant.description} onChange={(e) => setGrant({ ...grant, description: e.target.value })} />
          </div>
          <label style={{ marginTop: 6 }}>物品立绘</label>
          <ImageUpload value={grant.image} onChange={(url) => setGrant({ ...grant, image: url })} label="上传物品立绘" hint="建议方图，背包格子按比例裁切显示" />
          <button className="primary sm" style={{ marginTop: 8 }} onClick={doGrant}>发放</button>
        </div>
      )}
    </Modal>
  )
}

// ============ 场景库 ============
export function SceneTab({ groupId, currentSceneId }) {
  const toast = useToast()
  const [scenes, setScenes] = useState([])
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    const { data } = await api.get(`/groups/${groupId}/scenes`)
    setScenes(data)
  }, [groupId])
  useEffect(() => { load().catch((e) => toast(errMsg(e))) }, [load])

  const add = async (url) => {
    if (!url) return
    try { await api.post(`/groups/${groupId}/scenes`, { image: url, name }); setName(''); load() }
    catch (e) { toast(errMsg(e)) }
  }
  const switchTo = async (s) => {
    try { await api.post(`/groups/${groupId}/scene/switch`, { sceneId: s.id }) }
    catch (e) { toast(errMsg(e)) }
  }
  const clearScene = async () => {
    try { await api.post(`/groups/${groupId}/scene/clear`) }
    catch (e) { toast(errMsg(e)) }
  }
  const del = async (s, e) => {
    e.stopPropagation()
    try { await api.delete(`/groups/${groupId}/scenes/${s.id}`); load() }
    catch (e) { toast(errMsg(e)) }
  }

  return (
    <div className="panel-body">
      <div className="row">
        <div className="section-title" style={{ margin: 0 }}>场景图库（点击切换）</div>
        <span className="spacer" />
        {currentSceneId && <button className="sm" onClick={clearScene}>撤下场景</button>}
      </div>
      <div className="scene-thumbs" style={{ marginTop: 8 }}>
        {scenes.map((s) => (
          <div key={s.id} className={`scene-thumb ${s.id === currentSceneId ? 'active' : ''}`} onClick={() => switchTo(s)}>
            <img src={s.image} alt={s.name} />
            <button className="sm danger del" onClick={(e) => del(s, e)}>×</button>
          </div>
        ))}
      </div>
      <div className="divider" />
      <label>新增场景（可先填名称）</label>
      <input placeholder="场景名（可选）" value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ marginTop: 6 }}>
        <ImageUpload value={null} onChange={add} label="上传场景图" hint="建议 1920×1080（横图 16:9），铺满舞台背景" />
      </div>
    </div>
  )
}

// ============ 悬浮控制 ============
export function OverlayTab({ groupId, figures, overlayChar, overlayFocus }) {
  const toast = useToast()
  const [focusLib, setFocusLib] = useState([])

  const post = async (path, body, okMsg) => {
    try { await api.post(`/groups/${groupId}/${path}`, body); if (okMsg) toast(okMsg) }
    catch (e) { toast(errMsg(e)) }
  }
  const loadFocus = useCallback(async () => {
    const { data } = await api.get(`/groups/${groupId}/focus-images`)
    setFocusLib(data)
  }, [groupId])
  useEffect(() => { loadFocus().catch((e) => toast(errMsg(e))) }, [loadFocus])

  const addFocus = async (url) => {
    if (!url) return
    try { await api.post(`/groups/${groupId}/focus-images`, { image: url }); loadFocus() }
    catch (e) { toast(errMsg(e)) }
  }
  const delFocus = async (f, e) => {
    e.stopPropagation()
    try { await api.delete(`/groups/${groupId}/focus-images/${f.id}`); loadFocus() }
    catch (e) { toast(errMsg(e)) }
  }

  const activeCharId = overlayChar?.characterId
  const activeFocusImg = overlayFocus?.image

  return (
    <div className="panel-body">
      {/* 人物悬浮：从图鉴素材里点选 */}
      <div className="row">
        <div className="section-title" style={{ margin: 0 }}>人物悬浮（玩家端偏下左侧）</div>
        <span className="spacer" />
        {activeCharId && <button className="sm" onClick={() => post('overlay/character', { characterId: null }, '已撤下')}>撤下</button>}
      </div>
      <div className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>来自人物图鉴，点击立绘即激活</div>
      <div className="scene-thumbs">
        {figures.filter((f) => f.portrait).map((f) => (
          <div key={f.id} className={`scene-thumb ${activeCharId === f.id ? 'active' : ''}`}
            style={{ aspectRatio: '3/4' }} title={f.name}
            onClick={() => post('overlay/character', { characterId: f.id }, `已激活：${f.name}`)}>
            <img src={f.portrait} alt={f.name} />
          </div>
        ))}
      </div>
      {figures.filter((f) => f.portrait).length === 0 && <div className="muted" style={{ fontSize: 12 }}>图鉴里还没有带立绘的角色</div>}

      <div className="divider" />

      {/* 焦点悬浮：素材库点选 */}
      <div className="row">
        <div className="section-title" style={{ margin: 0 }}>焦点悬浮（玩家端偏下右侧）</div>
        <span className="spacer" />
        {activeFocusImg && <button className="sm" onClick={() => post('overlay/focus', { image: null }, '已撤下')}>撤下</button>}
      </div>
      <div className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>点击素材即激活</div>
      <div className="scene-thumbs">
        {focusLib.map((f) => (
          <div key={f.id} className={`scene-thumb ${activeFocusImg === f.image ? 'active' : ''}`}
            onClick={() => post('overlay/focus', { image: f.image }, '焦点已激活')}>
            <img src={f.image} alt="" />
            <button className="sm danger del" onClick={(e) => delFocus(f, e)}>×</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <ImageUpload value={null} onChange={addFocus} label="上传焦点素材" hint="建议 800×800（方图），如道具特写、关键物件" />
      </div>
    </div>
  )
}

// ============ NPC 管理 + 以 NPC 发言 ============
export function NpcTab({ groupId, figures }) {
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const npcs = figures.filter((f) => f.is_npc)

  const del = async (n) => {
    if (!confirm(`删除 NPC「${n.name}」？`)) return
    try { await api.delete(`/groups/${groupId}/npcs/${n.id}`) } catch (e) { toast(errMsg(e)) }
  }

  return (
    <div className="panel-body">
      <div className="row">
        <div className="section-title" style={{ margin: 0 }}>NPC 列表</div>
        <span className="spacer" />
        <button className="sm primary" onClick={() => setEditing({ name: '', portrait: null, intro: '', attributes: {} })}>+ 新建</button>
      </div>
      <div className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>
        在此管理 NPC（立绘 / 描述）。发言请到下方对话框选择身份，带立绘的 NPC 发言会触发演出。
      </div>
      {npcs.length === 0 && <div className="muted" style={{ fontSize: 12 }}>还没有 NPC，点「+ 新建」创建。</div>}
      {npcs.map((n) => (
        <div className="figure-item" key={n.id} style={{ cursor: 'default' }}>
          {n.portrait ? <img className="avatar" src={n.portrait} alt="" /> : <div className="avatar ph">🎭</div>}
          <div style={{ flex: 1 }}><b>{n.name}</b></div>
          <button className="sm" onClick={() => setEditing(n)}>编辑</button>
          <button className="sm ghost danger" onClick={() => del(n)}>删</button>
        </div>
      ))}
      {editing && <NpcEditor groupId={groupId} npc={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function NpcEditor({ groupId, npc, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: npc.name || '', portrait: npc.portrait || null, intro: npc.intro || '', notes: npc.attributes?.notes || '' })
  const save = async () => {
    if (!form.name.trim()) return toast('NPC 名必填')
    const body = { name: form.name.trim(), portrait: form.portrait, intro: form.intro, attributes: { notes: form.notes } }
    try {
      if (npc.id) await api.put(`/groups/${groupId}/npcs/${npc.id}`, body)
      else await api.post(`/groups/${groupId}/npcs`, body)
      toast('已保存'); onClose()
    } catch (e) { toast(errMsg(e)) }
  }
  return (
    <Modal title={npc.id ? '编辑 NPC' : '新建 NPC'} onClose={onClose} width={420}>
      <label>名称</label>
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <label>立绘</label>
      <ImageUpload value={form.portrait} onChange={(url) => setForm({ ...form, portrait: url })} label="上传立绘" hint="建议 720×1280（竖图 9:16），透明背景 PNG 最佳" />
      <label>文字描述（图鉴展示）</label>
      <textarea rows={3} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} />
      <label>属性笔记（自由填写）</label>
      <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>取消</button>
        <button className="primary" onClick={save}>保存</button>
      </div>
    </Modal>
  )
}

// ============ 线索管理 ============
export function ClueTab({ groupId, members, cluesVer }) {
  const toast = useToast()
  const [clues, setClues] = useState([])
  const [creating, setCreating] = useState(null)
  const [distributing, setDistributing] = useState(null)

  const load = useCallback(async () => {
    const { data } = await api.get(`/groups/${groupId}/clues`)
    setClues(data)
  }, [groupId])
  useEffect(() => { load().catch((e) => toast(errMsg(e))) }, [load, cluesVer])

  return (
    <div className="panel-body">
      <div className="row">
        <div className="section-title" style={{ margin: 0 }}>线索卡</div>
        <span className="spacer" />
        <button className="sm primary" onClick={() => setCreating({ title: '', image: null, description: '' })}>+ 新建</button>
      </div>
      {clues.map((c) => (
        <div className="list-item" key={c.id} style={{ cursor: 'default' }}>
          {c.image ? <img className="avatar" src={c.image} alt="" /> : <div className="avatar ph">📄</div>}
          <div style={{ flex: 1 }}>
            <b>{c.title}</b>
            <div className="muted" style={{ fontSize: 11 }}>
              {Array.isArray(c.recipients) && c.recipients.length
                ? (c.recipients.includes(null) ? '已分发：全体' : `已分发：${c.recipients.length} 人`)
                : '未分发'}
            </div>
          </div>
          <button className="sm" onClick={() => setDistributing(c)}>分发</button>
        </div>
      ))}
      {creating && <ClueEditor groupId={groupId} onClose={() => setCreating(null)} onDone={() => { setCreating(null); load() }} />}
      {distributing && (
        <DistributeClue groupId={groupId} clue={distributing} members={members}
          onClose={() => setDistributing(null)} onDone={() => { setDistributing(null); load() }} />
      )}
    </div>
  )
}

function ClueEditor({ groupId, onClose, onDone }) {
  const toast = useToast()
  const [form, setForm] = useState({ title: '', image: null, description: '' })
  const save = async () => {
    if (!form.title.trim()) return toast('标题必填')
    try { await api.post(`/groups/${groupId}/clues`, form); toast('已创建'); onDone() }
    catch (e) { toast(errMsg(e)) }
  }
  return (
    <Modal title="新建线索卡" onClose={onClose} width={420}>
      <label>标题</label>
      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <label>图片（道具 / 地图 / 文件）</label>
      <ImageUpload value={form.image} onChange={(url) => setForm({ ...form, image: url })} hint="建议宽度 ≥ 800px，长图可竖向滚动查看" />
      <label>文字描述</label>
      <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>取消</button>
        <button className="primary" onClick={save}>创建</button>
      </div>
    </Modal>
  )
}

function DistributeClue({ groupId, clue, members, onClose, onDone }) {
  const toast = useToast()
  const players = members.filter((m) => m.role !== 'kp')
  const [sel, setSel] = useState(new Set())
  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s) }
  const distribute = async (all) => {
    try {
      await api.post(`/groups/${groupId}/clues/${clue.id}/distribute`, { accountIds: all ? 'all' : Array.from(sel) })
      toast('已分发'); onDone()
    } catch (e) { toast(errMsg(e)) }
  }
  return (
    <Modal title={`分发「${clue.title}」`} onClose={onClose} width={360}>
      <button className="primary" style={{ width: '100%', marginBottom: 10 }} onClick={() => distribute(true)}>分发给全体</button>
      <div className="section-title">或指定玩家</div>
      {players.map((m) => (
        <label key={m.id} className="row" style={{ cursor: 'pointer', marginBottom: 4 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
          <span>{m.username}</span>
        </label>
      ))}
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>取消</button>
        <button className="primary" disabled={sel.size === 0} onClick={() => distribute(false)}>分发给所选</button>
      </div>
    </Modal>
  )
}
