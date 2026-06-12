import { useEffect, useState, useCallback, useRef } from 'react'
import api, { errMsg } from '../api.js'
import { useToast, Modal, ImageUpload } from '../components/ui.jsx'

// ============ 角色卡 ============
export function CharacterCardPanel({ groupId, templateFields }) {
  const toast = useToast()
  const [card, setCard] = useState({ name: '', portrait: null, attributes: {}, intro: '' })
  const [loaded, setLoaded] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    api.get(`/groups/${groupId}/my-character`).then(({ data }) => {
      if (data) setCard({ name: data.name, portrait: data.portrait, attributes: data.attributes || {}, intro: data.intro || '' })
      setLoaded(true)
    }).catch((e) => { toast(errMsg(e)); setLoaded(true) })
  }, [groupId])

  const setAttr = (k, v) => setCard((c) => ({ ...c, attributes: { ...c.attributes, [k]: v } }))

  const save = async () => {
    if (!card.name.trim()) return toast('角色名必填')
    try { await api.put(`/groups/${groupId}/my-character`, card); toast('已保存，角色已进入图鉴') }
    catch (e) { toast(errMsg(e)) }
  }

  const exportTxt = () => {
    const lines = [`角色名：${card.name}`, '']
    for (const f of templateFields) lines.push(`${f.name}：${card.attributes[f.name] ?? f.default ?? ''}`)
    lines.push('', `背景：${card.intro || ''}`)
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${card.name || 'character'}.txt`; a.click()
  }

  const importJson = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result)
        setCard((c) => ({
          name: obj.name ?? c.name,
          portrait: obj.portrait ?? c.portrait,
          attributes: obj.attributes ?? c.attributes,
          intro: obj.intro ?? c.intro,
        }))
        toast('已导入，记得保存')
      } catch { toast('JSON 解析失败') }
    }
    reader.readAsText(file); e.target.value = ''
  }

  if (!loaded) return <div className="muted">加载中…</div>
  return (
    <div className="col">
      <label>角色名 *</label>
      <input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
      <label>立绘</label>
      <ImageUpload value={card.portrait} onChange={(url) => setCard({ ...card, portrait: url })} label="上传立绘" hint="建议 720×1280（竖图 9:16），透明背景 PNG 最佳" />
      <div className="section-title">属性</div>
      {templateFields.length === 0 && <div className="muted" style={{ fontSize: 12 }}>该团未指定模板</div>}
      {templateFields.map((f) => (
        <div className="attr-row" key={f.name}>
          <span className="nm">{f.name}{f.type === 'percent' ? ' (%)' : ''}</span>
          {f.type === 'text' ? (
            <input value={card.attributes[f.name] ?? f.default ?? ''} onChange={(e) => setAttr(f.name, e.target.value)} />
          ) : (
            <input type="number" value={card.attributes[f.name] ?? f.default ?? ''} onChange={(e) => setAttr(f.name, e.target.value)} />
          )}
        </div>
      ))}
      <label>背景 / 备注</label>
      <textarea rows={3} value={card.intro} onChange={(e) => setCard({ ...card, intro: e.target.value })} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary sm" onClick={save}>保存</button>
        <button className="sm" onClick={() => fileRef.current?.click()}>导入 JSON</button>
        <button className="sm" onClick={exportTxt}>导出 TXT</button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={importJson} />
      </div>
    </div>
  )
}

// ============ 背包 ============
const SLOT_COUNT = 16
export function InventoryPanel({ groupId, members, me, invVer }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [menu, setMenu] = useState(null) // {item}
  const dragId = useRef(null)

  const load = useCallback(async () => {
    const { data } = await api.get(`/groups/${groupId}/inventory`)
    setItems(data)
  }, [groupId])
  useEffect(() => { load().catch((e) => toast(errMsg(e))) }, [load, invVer])

  const bySlot = {}
  items.forEach((it) => { bySlot[it.slot] = it })

  const onDrop = async (slot) => {
    const id = dragId.current; dragId.current = null
    if (id == null) return
    try { setItems(await (await api.post(`/groups/${groupId}/inventory/move`, { itemId: id, slot })).data); }
    catch (e) { toast(errMsg(e)); load() }
  }

  return (
    <div>
      <div className="bag-grid">
        {Array.from({ length: SLOT_COUNT }).map((_, slot) => {
          const it = bySlot[slot]
          return (
            <div
              key={slot}
              className={`bag-slot ${it ? 'filled' : ''}`}
              draggable={!!it}
              title={it ? `${it.name}\n${it.description || ''}` : ''}
              onDragStart={() => { if (it) dragId.current = it.id }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(slot)}
              onContextMenu={(e) => { e.preventDefault(); if (it) setMenu({ item: it }) }}
            >
              {it && <>
                {it.image && <img className="item-img" src={it.image} alt="" />}
                <span className={`nm ${it.image ? 'cap' : ''}`}>{it.name}</span>
                <span className="qty">×{it.quantity}</span>
              </>}
            </div>
          )
        })}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>左键拖拽整理 · 右键物品弹出菜单</div>

      {menu && (
        <ItemMenu
          groupId={groupId} item={menu.item} members={members} me={me}
          onClose={() => setMenu(null)} onDone={() => { setMenu(null); load() }}
        />
      )}
    </div>
  )
}

function ItemMenu({ groupId, item, members, me, onClose, onDone }) {
  const toast = useToast()
  const [tab, setTab] = useState(null) // discard | transfer
  const [qty, setQty] = useState(1)
  const [target, setTarget] = useState('')

  const discard = async () => {
    try { await api.post(`/groups/${groupId}/inventory/discard`, { itemId: item.id, quantity: Number(qty) }); onDone() }
    catch (e) { toast(errMsg(e)) }
  }
  const transfer = async () => {
    if (!target) return toast('请选择队友')
    try { await api.post(`/groups/${groupId}/inventory/transfer`, { itemId: item.id, quantity: Number(qty), toAccountId: Number(target) }); toast('已移交'); onDone() }
    catch (e) { toast(errMsg(e)) }
  }

  const mates = members.filter((m) => m.id !== me.id)
  return (
    <Modal title={item.name} onClose={onClose} width={340}>
      {item.image && <img src={item.image} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8, marginBottom: 8, background: 'var(--bg)' }} />}
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{item.description || '（无描述）'} · 持有 ×{item.quantity}</div>
      {!tab && (
        <div className="row">
          <button className="sm" onClick={() => setTab('discard')}>丢弃</button>
          <button className="sm" onClick={() => setTab('transfer')}>移交队友</button>
        </div>
      )}
      {tab === 'discard' && (
        <>
          <label>丢弃数量</label>
          <input type="number" min={1} max={item.quantity} value={qty} onChange={(e) => setQty(e.target.value)} />
          <div className="modal-actions">
            <button className="ghost" onClick={onClose}>取消</button>
            <button className="danger" onClick={discard}>确认丢弃</button>
          </div>
        </>
      )}
      {tab === 'transfer' && (
        <>
          <label>移交给</label>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">选择队友</option>
            {mates.map((m) => <option key={m.id} value={m.id}>{m.username}{m.role === 'kp' ? '（KP）' : ''}</option>)}
          </select>
          <label>数量</label>
          <input type="number" min={1} max={item.quantity} value={qty} onChange={(e) => setQty(e.target.value)} />
          <div className="modal-actions">
            <button className="ghost" onClick={onClose}>取消</button>
            <button className="primary" onClick={transfer}>移交</button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ============ 线索 ============
export function CluesPanel({ groupId, cluesVer }) {
  const toast = useToast()
  const [clues, setClues] = useState([])
  const [view, setView] = useState(null)
  const [noting, setNoting] = useState(null) // 正在记笔记的线索
  useEffect(() => {
    api.get(`/groups/${groupId}/clues`).then(({ data }) => setClues(data)).catch((e) => toast(errMsg(e)))
  }, [groupId, cluesVer])
  return (
    <div>
      {clues.length === 0 && <div className="muted">暂无线索</div>}
      {clues.map((c) => (
        <div className="list-item clue" key={c.id} onClick={() => setView(c)}>
          <button className="clue-note-btn" title="我的笔记（仅自己可见）"
            onClick={(e) => { e.stopPropagation(); setNoting(c) }}>📓</button>
          {c.image ? <img className="avatar" src={c.image} alt="" /> : <div className="avatar ph">📄</div>}
          <div><b>{c.title}</b></div>
        </div>
      ))}
      {view && (
        <Modal title={view.title} onClose={() => setView(null)} width={460}>
          {view.image && <img src={view.image} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: 10 }} />}
          <div style={{ whiteSpace: 'pre-wrap' }}>{view.description || '（无描述）'}</div>
        </Modal>
      )}
      {noting && <ClueNote groupId={groupId} clue={noting} onClose={() => setNoting(null)} />}
    </div>
  )
}

// 线索个人笔记（私有，玩家自由记录）
function ClueNote({ groupId, clue, onClose }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    api.get(`/groups/${groupId}/clues/${clue.id}/note`)
      .then(({ data }) => { setNote(data.note || ''); setLoaded(true) })
      .catch((e) => { toast(errMsg(e)); setLoaded(true) })
  }, [groupId, clue.id])
  const save = async () => {
    try { await api.put(`/groups/${groupId}/clues/${clue.id}/note`, { note }); toast('笔记已保存（仅自己可见）'); onClose() }
    catch (e) { toast(errMsg(e)) }
  }
  return (
    <Modal title={`线索笔记 · ${clue.title}`} onClose={onClose} width={460}>
      <label>我的笔记（仅自己可见，自由记录）</label>
      <textarea rows={8} value={note} disabled={!loaded}
        onChange={(e) => setNote(e.target.value)}
        placeholder="在这里记录你对这条线索的推理、疑点、联想…" />
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>取消</button>
        <button className="primary" onClick={save}>保存笔记</button>
      </div>
    </Modal>
  )
}

// ============ 人物图鉴 ============
export function FiguresPanel({ groupId, figures }) {
  const [view, setView] = useState(null)
  return (
    <div>
      {figures.length === 0 && <div className="muted">暂无角色</div>}
      {figures.map((f) => (
        <div className="figure-item" key={f.id} onClick={() => setView(f)}>
          {f.portrait ? <img className="avatar" src={f.portrait} alt="" /> : <div className="avatar ph">🎭</div>}
          <div>
            <b>{f.name}</b>
            <div className="muted" style={{ fontSize: 11 }}>{f.is_npc ? 'NPC' : (f.owner_name || '玩家角色')}</div>
          </div>
        </div>
      ))}
      {view && <FigureDetail groupId={groupId} figure={view} onClose={() => setView(null)} />}
    </div>
  )
}

function FigureDetail({ groupId, figure, onClose }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  useEffect(() => {
    api.get(`/groups/${groupId}/figures/${figure.id}/note`).then(({ data }) => setNote(data.note || ''))
  }, [groupId, figure.id])
  const saveNote = async () => {
    try { await api.put(`/groups/${groupId}/figures/${figure.id}/note`, { note }); toast('备注已保存（仅自己可见）') }
    catch (e) { toast(errMsg(e)) }
  }
  return (
    <Modal title={figure.name} onClose={onClose} width={460}>
      {figure.portrait && <img src={figure.portrait} alt="" style={{ maxHeight: 220, borderRadius: 8, display: 'block', margin: '0 auto 10px' }} />}
      {figure.intro && <div style={{ whiteSpace: 'pre-wrap', marginBottom: 10 }}>{figure.intro}</div>}
      <label>我的备注（仅自己可见）</label>
      <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="modal-actions">
        <button className="primary sm" onClick={saveNote}>保存备注</button>
      </div>
    </Modal>
  )
}

// ============ 骰点 ============
const QUICK = ['d4', 'd6', 'd8', 'd10', 'd20', 'd100']
export function DicePanel({ rollDice, allowHidden = false }) {
  const toast = useToast()
  const [expr, setExpr] = useState('')
  const [hidden, setHidden] = useState(false)
  const [hiddenResult, setHiddenResult] = useState('')

  const roll = async (e) => {
    const x = e || expr.trim()
    if (!x) return
    const res = await rollDice(x, allowHidden && hidden)
    if (res.error) return toast(res.error)
    if (res.hidden) setHiddenResult(`${res.text} = ${res.total}`)
  }

  return (
    <div>
      <div className="dice-grid">
        {QUICK.map((d) => <button className="dice-btn" key={d} onClick={() => roll(d)}>{d}</button>)}
      </div>
      <label>自定义表达式</label>
      <div className="row">
        <input value={expr} placeholder="如 2+2d8" onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') roll() }} />
        <button className="primary sm" onClick={() => roll()}>投掷</button>
      </div>
      {allowHidden && (
        <label className="row" style={{ marginTop: 8, cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          <span>暗骰（仅自己可见，不广播）</span>
        </label>
      )}
      {hiddenResult && <div className="dice-hidden" style={{ marginTop: 8 }}>🔒 {hiddenResult}</div>}
    </div>
  )
}
