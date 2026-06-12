import { useEffect, useRef, useState } from 'react'
import { getSocket } from '../socket.js'

// 立绘演出层：全屏浮层，盖在整个 UI 之上。
// 严格排队逐条播放（预加载图片 → 滑入 → 气泡 → 停留 → 气泡消失 → 滑出）。
// 仅消费“实时”到达的 character_speech（带 portrait）消息，不回放历史。
export default function PerformanceLayer() {
  const [current, setCurrent] = useState(null) // { name, portrait, content }
  const [show, setShow] = useState(false)       // 立绘是否在位（控制滑入/滑出）
  const [bubble, setBubble] = useState(false)    // 气泡是否显示
  const queue = useRef([])
  const busy = useRef(false)
  const timers = useRef([])

  const wait = (ms) => new Promise((r) => { timers.current.push(setTimeout(r, ms)) })
  const preload = (src) =>
    new Promise((res) => {
      const img = new Image()
      img.onload = res
      img.onerror = res
      img.src = src
      // 兜底：最多等 1.2s，避免坏图卡住队列
      timers.current.push(setTimeout(res, 1200))
    })

  const playNext = async () => {
    if (busy.current) return
    const item = queue.current.shift()
    if (!item) return
    busy.current = true

    await preload(item.portrait)   // 图片就绪后再开演，避免滑入途中才加载导致卡顿
    setCurrent(item)
    setBubble(false)
    setShow(false)
    await wait(30)                 // 让初始(画面外)状态先提交一帧
    setShow(true)                  // 触发滑入
    await wait(560)                // 等滑入结束
    setBubble(true)                // 弹出气泡
    const stay = Math.max(1500, (item.content?.length || 0) * 150)
    await wait(stay)               // 停留
    setBubble(false)               // 气泡先消失
    await wait(280)
    setShow(false)                 // 立绘滑出
    await wait(560)
    setCurrent(null)
    busy.current = false
    playNext()                     // 继续队列
  }

  useEffect(() => {
    const socket = getSocket()
    const onMsg = (m) => {
      if (m.type !== 'character_speech') return
      const meta = m.meta || {}
      if (!meta.performance || !meta.portrait) return
      queue.current.push({ name: m.speaker_name, portrait: meta.portrait, content: m.content })
      playNext()
    }
    socket.on('message:new', onMsg)
    return () => { socket.off('message:new', onMsg); timers.current.forEach(clearTimeout); timers.current = [] }
  }, [])

  if (!current) return null
  return (
    <div className="perf-overlay">
      <div className={`perf-dim ${show ? 'in' : ''}`} />
      <img
        className={`perf-portrait ${show ? 'in' : ''}`}
        src={current.portrait}
        alt={current.name}
        draggable={false}
      />
      <div className={`perf-bubble ${bubble ? 'show' : ''}`}>
        <div className="who">{current.name}</div>
        <div className="say">{current.content}</div>
      </div>
    </div>
  )
}
