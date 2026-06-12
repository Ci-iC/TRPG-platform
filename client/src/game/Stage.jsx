import { useState, useEffect, useRef } from 'react'

// 悬浮层过渡：维护一个渲染列表，每条带相位(enter/leave)与唯一 uid。
// 出现=加 enter；撤下=把当前标记 leave；切换=旧标记 leave + 新加 enter（交叉淡入淡出）。
// leave 条目动画结束后靠 onAnimationEnd 自我移除——无共享 timer，快速操作也不会错乱。
function FadeStack({ data, dataKey, className, render }) {
  const [items, setItems] = useState([])     // [{ uid, data, phase }]
  const uid = useRef(0)
  const lastKey = useRef(null)               // 当前作为 enter 的目标 key

  useEffect(() => {
    if (dataKey === lastKey.current) return   // 目标没变，忽略(同 key 数据刷新不重播)
    lastKey.current = dataKey
    setItems((prev) => {
      const leaving = prev.map((it) => (it.phase === 'enter' ? { ...it, phase: 'leave' } : it))
      if (dataKey == null) return leaving      // 撤下：当前条目转为离场
      uid.current += 1
      return [...leaving, { uid: uid.current, data, phase: 'enter' }] // 切换/出现：新条目进场
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey])

  const removeLeft = (id) =>
    setItems((prev) => prev.filter((it) => !(it.uid === id && it.phase === 'leave')))

  if (items.length === 0) return null
  return (
    <>
      {items.map((it) => (
        <div
          key={it.uid}
          className={`${className} ${it.phase}`}
          onAnimationEnd={it.phase === 'leave' ? () => removeLeft(it.uid) : undefined}
        >
          {render(it.data)}
        </div>
      ))}
    </>
  )
}

// 中央舞台：场景图 + 悬浮层（人物/焦点）。立绘演出已抽到全屏浮层，不在此处。
export default function Stage({ scene, overlayChar, overlayFocus }) {
  return (
    <div className="stage">
      {/* 固定 16:9 画框：随窗口等比缩放并居中，场景图与悬浮层都装在框内 */}
      <div className="stage-frame">
        {scene ? (
          <img className="scene-img" src={scene.image} alt={scene.name} key={scene.id} />
        ) : (
          <div className="scene-empty">
            <div style={{ fontSize: 32 }}>🎬</div>
            <div>KP 尚未设置场景</div>
          </div>
        )}

        {/* 悬浮层一：人物（偏下左侧） */}
        <FadeStack
          data={overlayChar}
          dataKey={overlayChar ? `char-${overlayChar.characterId}` : null}
          className="overlay-character"
          render={(c) => (
            <>
              {c.portrait
                ? <img src={c.portrait} alt={c.name} />
                : <div className="avatar ph" style={{ width: 120, height: 160 }}>无立绘</div>}
              <div style={{ textAlign: 'center', marginTop: 6 }}>
                <span className="name">{c.name}</span>
              </div>
            </>
          )}
        />

        {/* 悬浮层二：焦点（偏下右侧） */}
        <FadeStack
          data={overlayFocus}
          dataKey={overlayFocus?.image ? `focus-${overlayFocus.image}` : null}
          className="overlay-focus"
          render={(f) => <img src={f.image} alt="焦点" />}
        />
      </div>
    </div>
  )
}
