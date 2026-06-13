// 按消息类型渲染一行对话
export default function MessageLine({ m }) {
  switch (m.type) {
    case 'character_speech':
      return (
        <div className="msg-line msg-character">
          <span className="who">{m.speaker_name}：</span>
          {m.content}
        </div>
      )
    case 'player_action':
      return <div className="msg-line msg-action">{m.speaker_name} {m.content}</div>
    case 'dice': {
      const lv = m.meta?.level
      return <div className={`msg-line msg-dice${lv ? ` lv-${lv}` : ''}`}>🎲 {m.content}</div>
    }
    case 'broadcast':
      return <div className="msg-line msg-broadcast">📢 {m.content}</div>
    case 'scene_change':
      return <div className="msg-scene">— {m.content} —</div>
    default:
      return <div className="msg-line">{m.content}</div>
  }
}
