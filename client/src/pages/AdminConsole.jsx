import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { errMsg } from '../api.js'
import { useAuth } from '../auth.jsx'
import { Modal, useToast } from '../components/ui.jsx'

export default function AdminConsole() {
  const { account } = useAuth()
  const nav = useNavigate()
  const [tab, setTab] = useState('accounts')

  if (!account?.isSuperAdmin) {
    return <div className="page"><div className="card">无权访问。<button onClick={() => nav('/')}>返回大厅</button></div></div>
  }

  return (
    <div>
      <div className="topbar">
        <span className="brand">超级管理员后台</span>
        <button className="sm" onClick={() => setTab('accounts')} disabled={tab === 'accounts'}>账号管理</button>
        <button className="sm" onClick={() => setTab('templates')} disabled={tab === 'templates'}>人物卡模板</button>
        <span className="spacer" />
        <button className="sm ghost" onClick={() => nav('/')}>返回大厅</button>
      </div>
      <div className="page">
        {tab === 'accounts' ? <Accounts /> : <Templates />}
      </div>
    </div>
  )
}

function Accounts() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [resetFor, setResetFor] = useState(null)

  const load = useCallback(async () => {
    const { data } = await api.get('/admin/accounts')
    setList(data)
  }, [])
  useEffect(() => { load().catch((e) => toast(errMsg(e))) }, [load])

  const toggle = async (a) => {
    try { await api.patch(`/admin/accounts/${a.id}/active`, { active: !a.is_active }); load() }
    catch (e) { toast(errMsg(e)) }
  }

  return (
    <div className="card">
      <div className="row">
        <h3 style={{ margin: 0 }}>账号列表</h3>
        <span className="spacer" />
        <button className="primary sm" onClick={() => setShowNew(true)}>+ 新建账号</button>
      </div>
      <div className="divider" />
      {list.map((a) => (
        <div className="list-item" key={a.id} style={{ cursor: 'default' }}>
          <div style={{ flex: 1 }}>
            <b>{a.username}</b>
            {a.is_super_admin && <span className="tag kp" style={{ marginLeft: 8 }}>超管</span>}
            {!a.is_active && <span className="tag ended" style={{ marginLeft: 8 }}>已禁用</span>}
          </div>
          {!a.is_super_admin && (
            <>
              <button className="sm" onClick={() => setResetFor(a)}>重置密码</button>
              <button className="sm" onClick={() => toggle(a)}>{a.is_active ? '禁用' : '启用'}</button>
            </>
          )}
        </div>
      ))}
      {showNew && <NewAccount onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load() }} />}
      {resetFor && <ResetPwd acc={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  )
}

function NewAccount({ onClose, onDone }) {
  const toast = useToast()
  const [username, setU] = useState('')
  const [password, setP] = useState('')
  const submit = async () => {
    try { await api.post('/admin/accounts', { username: username.trim(), password }); toast('账号已创建'); onDone() }
    catch (e) { toast(errMsg(e)) }
  }
  return (
    <Modal title="新建账号" onClose={onClose} width={360}>
      <label>用户名</label>
      <input value={username} onChange={(e) => setU(e.target.value)} autoFocus />
      <label>初始密码</label>
      <input value={password} onChange={(e) => setP(e.target.value)} />
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>取消</button>
        <button className="primary" onClick={submit}>创建</button>
      </div>
    </Modal>
  )
}

function ResetPwd({ acc, onClose }) {
  const toast = useToast()
  const [newPassword, setNew] = useState('')
  const submit = async () => {
    try { await api.post(`/admin/accounts/${acc.id}/reset-password`, { newPassword }); toast('密码已重置'); onClose() }
    catch (e) { toast(errMsg(e)) }
  }
  return (
    <Modal title={`重置「${acc.username}」的密码`} onClose={onClose} width={360}>
      <label>新密码（至少 4 位）</label>
      <input value={newPassword} onChange={(e) => setNew(e.target.value)} autoFocus />
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>取消</button>
        <button className="primary" onClick={submit}>确定</button>
      </div>
    </Modal>
  )
}

const FIELD_TYPES = [
  { v: 'number', t: '数值' },
  { v: 'text', t: '文本' },
  { v: 'percent', t: '百分比' },
]

function Templates() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    const { data } = await api.get('/admin/templates')
    setList(data)
  }, [])
  useEffect(() => { load().catch((e) => toast(errMsg(e))) }, [load])

  const del = async (t) => {
    if (!confirm(`删除模板「${t.name}」？`)) return
    try { await api.delete(`/admin/templates/${t.id}`); load() } catch (e) { toast(errMsg(e)) }
  }

  return (
    <div className="card">
      <div className="row">
        <h3 style={{ margin: 0 }}>人物卡模板</h3>
        <span className="spacer" />
        <button className="primary sm" onClick={() => setEditing({ name: '', fields: [] })}>+ 新建模板</button>
      </div>
      <div className="divider" />
      {list.map((t) => (
        <div className="list-item" key={t.id} style={{ cursor: 'default' }}>
          <div style={{ flex: 1 }}>
            <b>{t.name}</b>
            <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{t.fields.length} 个字段</span>
          </div>
          <button className="sm" onClick={() => setEditing(t)}>编辑</button>
          <button className="sm ghost danger" onClick={() => del(t)}>删除</button>
        </div>
      ))}
      {editing && <TemplateEditor tpl={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function TemplateEditor({ tpl, onClose, onSaved }) {
  const toast = useToast()
  const [name, setName] = useState(tpl.name)
  const [fields, setFields] = useState(tpl.fields || [])

  const update = (i, key, val) => setFields(fields.map((f, idx) => idx === i ? { ...f, [key]: val } : f))
  const add = () => setFields([...fields, { name: '', type: 'number', default: '' }])
  const remove = (i) => setFields(fields.filter((_, idx) => idx !== i))

  const save = async () => {
    if (!name.trim()) return toast('模板名必填')
    const clean = fields.filter((f) => f.name.trim())
    try {
      if (tpl.id) await api.put(`/admin/templates/${tpl.id}`, { name: name.trim(), fields: clean })
      else await api.post('/admin/templates', { name: name.trim(), fields: clean })
      toast('已保存'); onSaved()
    } catch (e) { toast(errMsg(e)) }
  }

  return (
    <Modal title={tpl.id ? '编辑模板' : '新建模板'} onClose={onClose} width={520}>
      <label>模板名</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 COC七版 / DND5E" />
      <div className="section-title">字段</div>
      {fields.map((f, i) => (
        <div className="row" key={i} style={{ marginBottom: 6 }}>
          <input placeholder="字段名" value={f.name} onChange={(e) => update(i, 'name', e.target.value)} style={{ flex: 2 }} />
          <select value={f.type} onChange={(e) => update(i, 'type', e.target.value)} style={{ flex: 1 }}>
            {FIELD_TYPES.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
          </select>
          <input placeholder="默认值" value={f.default} onChange={(e) => update(i, 'default', e.target.value)} style={{ flex: 1 }} />
          <button className="sm ghost danger" onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <button className="sm" onClick={add}>+ 添加字段</button>
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>取消</button>
        <button className="primary" onClick={save}>保存</button>
      </div>
    </Modal>
  )
}
