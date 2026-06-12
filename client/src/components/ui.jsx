import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { uploadImage, errMsg } from '../api.js'

// ---------- Modal ----------
export function Modal({ title, children, onClose, width }) {
  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal" style={width ? { width } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  )
}

// ---------- Toast ----------
const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null)
  const timer = useRef(null)
  const show = useCallback((m) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 2600)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// ---------- 图片上传按钮 ----------
// hint：建议尺寸等灰色暗文提示
export function ImageUpload({ value, onChange, label = '上传图片', hint }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const url = await uploadImage(file)
      onChange(url)
    } catch (err) {
      toast(errMsg(err))
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }
  return (
    <div>
      <div className="row">
        <button type="button" className="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? '上传中…' : label}
        </button>
        {value && (
          <button type="button" className="sm ghost danger" onClick={() => onChange(null)}>
            清除
          </button>
        )}
      </div>
      {hint && <div className="upload-hint">{hint}</div>}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pick} />
      {value && <img className="uploaded-preview" src={value} alt="" />}
    </div>
  )
}
