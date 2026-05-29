import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { listen } from '@tauri-apps/api/event'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { markdown as cmMarkdown, markdownLanguage } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { go } from '@codemirror/lang-go'
import { php } from '@codemirror/lang-php'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import {
  loadNotes,
  getActiveNote,
  createNote,
  updateNote,
  deleteNote,
  loadSettings,
  saveSettings,
  type Note,
  type NoteMeta,
  type EditMode,
} from '../stores/notes'
import './index.css'

// 配置 marked 使用 highlight.js
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
      const highlighted = hljs.highlight(text, { language }).value
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
    },
  },
})

const DEFAULT_FONT_SIZE = 18
const DEFAULT_LINE_HEIGHT = 1.2
const DEFAULT_WORD_WRAP = true

const baseTheme = EditorView.theme({
  '&': { height: '100%' },
  '&.cm-focused': { outline: 'none' },
})

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: 'bold', fontSize: '1.4em', color: '#1a1a1a' },
  { tag: tags.heading2, fontWeight: 'bold', fontSize: '1.2em', color: '#1a1a1a' },
  { tag: tags.heading3, fontWeight: 'bold', fontSize: '1.1em', color: '#1a1a1a' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.link, color: '#1565c0', textDecoration: 'underline' },
  { tag: tags.url, color: '#1565c0' },
  { tag: tags.monospace, fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)' },
  { tag: tags.quote, color: '#a68a64', fontStyle: 'italic' },
  { tag: tags.comment, color: '#a0a1a7', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#a626a4' },
  { tag: tags.string, color: '#50a14f' },
  { tag: tags.number, color: '#986801' },
  { tag: tags.bool, color: '#986801' },
  { tag: tags.null, color: '#986801' },
  { tag: tags.propertyName, color: '#4078f2' },
  { tag: tags.variableName, color: '#e45649' },
  { tag: tags.typeName, color: '#c18401' },
  { tag: tags.className, color: '#c18401' },
  { tag: tags.operator, color: '#383a42' },
  { tag: tags.punctuation, color: '#383a42' },
  { tag: tags.bracket, color: '#383a42' },
  { tag: tags.meta, color: '#4078f2' },
  { tag: tags.processingInstruction, color: '#a68a64' },
  { tag: tags.definition(tags.variableName), color: '#e45649' },
  { tag: tags.function(tags.variableName), color: '#4078f2' },
  { tag: tags.labelName, color: '#a626a4' },
  { tag: tags.separator, color: '#a0a1a7' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: '#a0a1a7' },
  { tag: tags.inserted, color: '#50a14f' },
  { tag: tags.deleted, color: '#e45649' },
  { tag: tags.changed, color: '#986801' },
])

function getLangExtension(mode: string) {
  switch (mode) {
    case 'javascript': return javascript()
    case 'typescript': return javascript({ typescript: true })
    case 'json': return json()
    case 'python': return python()
    case 'java': return java()
    case 'cpp': return cpp()
    case 'css': return css()
    case 'html': return html()
    case 'rust': return rust()
    case 'sql': return sql()
    case 'xml': return xml()
    case 'go': return go()
    case 'php': return php()
    case 'markdown': return cmMarkdown({ base: markdownLanguage })
    default: return []
  }
}

export default function Editor() {
  const [note, setNote] = useState<Note | null>(null)
  const [showDrawer, setShowDrawer] = useState(false)
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  const [wordWrap, setWordWrap] = useState(DEFAULT_WORD_WRAP)
  const [lineHeight, setLineHeight] = useState(DEFAULT_LINE_HEIGHT)
  const [showSettings, setShowSettings] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const cmRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const noteIdRef = useRef<string>('')
  const syncingScroll = useRef(false)
  const [mdSplit, setMdSplit] = useState(50)
  const draggingRef = useRef(false)

  useEffect(() => {
    async function init() {
      try {
        const settings = await loadSettings()
        setFontSize(settings.fontSize)
        setWordWrap(settings.wordWrap)
        setLineHeight(settings.lineHeight)
      } catch { /* settings load failed, use defaults */ }

      // 优先检查通过命令行/macOS 打开的文件
      try {
        const opened = await invoke<{ path: string; content: string; mode: string } | null>('get_opened_file')
        if (opened && opened.content) {
          const newNote = await createNote(opened.content, opened.mode as EditMode)
          setNote(newNote)
          noteIdRef.current = newNote.id
          setNotes(await loadNotes())
          return
        }
      } catch { /* ignore */ }

      // 没有打开的文件，加载上次的笔记
      try {
        const active = await getActiveNote()
        if (!active) return
        setNote(active)
        noteIdRef.current = active.id
        const notesList = await loadNotes()
        setNotes(notesList)
      } catch { /* ignore */ }
    }
    init().finally(() => {
      getCurrentWindow().show().catch(() => {})
    })

    return () => {
      clearTimeout(saveTimerRef.current)
      viewRef.current?.destroy()
    }
  }, [])

  const debouncedSave = useCallback((id: string, content: string, mode: string) => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateNote(id, { content, mode: mode as EditMode })
        const updated = await loadNotes()
        setNotes(updated)
      } catch { /* ignore save errors */ }
    }, 300)
  }, [])

  const handleChange = useCallback((v: EditorView) => {
    const content = v.state.doc.toString()
    setNote(prev => prev ? { ...prev, content } : null)
    if (noteIdRef.current && note) {
      debouncedSave(noteIdRef.current, content, note.mode)
    }
  }, [debouncedSave, note])

  const cmTheme = useMemo(
    () => EditorView.theme({
      '&': { fontSize: `${fontSize}px` },
      '.cm-scroller': { lineHeight: `${lineHeight}` },
    }),
    [fontSize, lineHeight]
  )

  const wrapExtension = useMemo(
    () => wordWrap ? EditorView.lineWrapping : [],
    [wordWrap]
  )

  // 创建 / 重建 CodeMirror
  useEffect(() => {
    if (!cmRef.current || !note) return
    viewRef.current?.destroy()

    const state = EditorState.create({
      doc: note.content,
      extensions: [
        baseTheme,
        cmTheme,
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        wrapExtension,
        history(),
        getLangExtension(note.mode),
        syntaxHighlighting(highlightStyle),
        EditorView.scrollMargins.of(() => ({ bottom: 72 })),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          { key: 'Mod-s', run: () => { handleExport(); return true } },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) handleChange(update.view)
        }),
        EditorView.theme({ '.cm-content': { color: 'rgba(0,0,0,0.75)' } }),
      ],
    })

    viewRef.current = new EditorView({ state, parent: cmRef.current })
    setTimeout(() => viewRef.current?.focus(), 50)

    return () => { viewRef.current?.destroy(); viewRef.current = null }
  }, [note?.id, note?.mode, fontSize, lineHeight, wordWrap])

  // Markdown 模式下编辑区和预览区同步滚动
  useEffect(() => {
    if (note?.mode !== 'markdown') return
    const view = viewRef.current
    const preview = previewRef.current
    if (!view || !preview) return

    const scroller = view.scrollDOM
    const scrollSource = { current: null as 'editor' | 'preview' | null }
    let timer = 0

    const syncToPreview = () => {
      if (scrollSource.current === 'preview') return
      scrollSource.current = 'editor'
      const max = scroller.scrollHeight - scroller.clientHeight
      const ratio = max > 0 ? scroller.scrollTop / max : 0
      preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight)
      clearTimeout(timer)
      timer = window.setTimeout(() => { scrollSource.current = null }, 80)
    }

    const syncToEditor = () => {
      if (scrollSource.current === 'editor') return
      scrollSource.current = 'preview'
      const max = preview.scrollHeight - preview.clientHeight
      const ratio = max > 0 ? preview.scrollTop / max : 0
      scroller.scrollTop = ratio * (scroller.scrollHeight - scroller.clientHeight)
      clearTimeout(timer)
      timer = window.setTimeout(() => { scrollSource.current = null }, 80)
    }

    scroller.addEventListener('scroll', syncToPreview)
    preview.addEventListener('scroll', syncToEditor)
    return () => {
      scroller.removeEventListener('scroll', syncToPreview)
      preview.removeEventListener('scroll', syncToEditor)
      clearTimeout(timer)
    }
  }, [note?.mode, note?.id, fontSize, lineHeight])

  const handleExport = async () => {
    if (!note) return
    const content = viewRef.current?.state.doc.toString() ?? note.content
    try {
      const modeExtMap: Record<string, string> = {
        markdown: '.md', javascript: '.js', typescript: '.ts', json: '.json',
        python: '.py', java: '.java', cpp: '.cpp', css: '.css', html: '.html',
        rust: '.rs', sql: '.sql', xml: '.xml', go: '.go', php: '.php',
      }
      const ext = modeExtMap[note.mode] ?? '.txt'
      const outputPath = await invoke<string>('export_file', { content, ext })
      await invoke('show_in_folder', { path: outputPath })
    } catch { /* export failed */ }
  }

  const handleNewNote = async () => {
    try {
      const newNote = await createNote()
      setNote(newNote)
      noteIdRef.current = newNote.id
      const notesList = await loadNotes()
      setNotes(notesList)
      setShowDrawer(false)
      setTimeout(() => viewRef.current?.focus(), 50)
    } catch { /* ignore */ }
  }

  const handleSwitchNote = async (id: string) => {
    try {
      const notesList = await loadNotes()
      const found = notesList.find(n => n.id === id)
      if (!found) return
      const content = await invoke<string>('read_note', { id })
      const switched: Note = { ...found, content }
      setNote(switched)
      noteIdRef.current = switched.id
      const settings = await loadSettings()
      await saveSettings({ ...settings, activeId: id })
      setShowDrawer(false)
      setTimeout(() => viewRef.current?.focus(), 50)
    } catch { /* ignore */ }
  }

  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteId(id)
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await deleteNote(deleteId)
      const updatedNotes = await loadNotes()
      setNotes(updatedNotes)
      if (note?.id === deleteId) {
        if (updatedNotes.length > 0) {
          const content = await invoke<string>('read_note', { id: updatedNotes[0].id })
          const active: Note = { ...updatedNotes[0], content }
          setNote(active)
          const settings = await loadSettings()
          await saveSettings({ ...settings, activeId: updatedNotes[0].id })
        } else {
          const newNote = await createNote()
          setNote(newNote)
          setNotes(await loadNotes())
        }
      }
    } catch { /* ignore */ }
    setDeleteId(null)
  }

  const handleToggleMode = async () => {
    if (!note) return
    const newMode: EditMode = note.mode === 'text' ? 'markdown' : 'text'
    try {
      await updateNote(note.id, { mode: newMode })
      setNote(prev => prev ? { ...prev, mode: newMode } : null)
    } catch { /* ignore */ }
  }

  const handleToggleWrap = async () => {
    const next = !wordWrap
    setWordWrap(next)
    try {
      const s = await loadSettings()
      await saveSettings({ ...s, wordWrap: next })
    } catch { /* ignore */ }
  }

  const handleFontSize = async (size: number) => {
    setFontSize(size)
    try {
      const s = await loadSettings()
      await saveSettings({ ...s, fontSize: size })
    } catch { /* ignore */ }
  }

  const handleLineHeight = async (lh: number) => {
    setLineHeight(lh)
    try {
      const s = await loadSettings()
      await saveSettings({ ...s, lineHeight: lh })
    } catch { /* ignore */ }
  }

  const handleDividerDown = (e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    const mdView = (e.currentTarget as HTMLElement).parentElement!
    const onStart = (moveE: MouseEvent) => {
      if (!draggingRef.current) return
      const rect = mdView.getBoundingClientRect()
      const pct = ((moveE.clientX - rect.left) / rect.width) * 100
      setMdSplit(Math.min(80, Math.max(20, pct)))
    }
    const onEnd = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onStart)
      document.removeEventListener('mouseup', onEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onStart)
    document.addEventListener('mouseup', onEnd)
  }

  // Tauri 拖拽事件
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((e) => {
      const event = e.payload
      if (event.type === 'enter') {
        setDragOver(true)
      } else if (event.type === 'leave') {
        setDragOver(false)
      } else if (event.type === 'drop') {
        setDragOver(false)
        const paths = event.paths
        if (!paths.length) return
        (async () => {
          for (const path of paths) {
            try {
              const content = await invoke<string>('read_file_as_text', { path })
              if (!content) continue
              const ext = path.split('.').pop()?.toLowerCase()
              const mode: EditMode = ext === 'md' || ext === 'markdown' ? 'markdown' : 'text'
              const newNote = await createNote(content, mode)
              setNote(newNote)
              noteIdRef.current = newNote.id
              setNotes(await loadNotes())
            } catch { /* ignore unreadable files */ }
          }
        })()
      }
    })
    return () => { unlisten.then(f => f()) }
  }, [])

  // 监听 macOS Finder 打开文件事件
  useEffect(() => {
    const unlisten = listen<{ path: string; content: string; mode: string }>('file-opened', async (event) => {
      const { content, mode } = event.payload
      if (!content) return
      try {
        const newNote = await createNote(content, mode as EditMode)
        setNote(newNote)
        noteIdRef.current = newNote.id
        setNotes(await loadNotes())
      } catch { /* ignore */ }
    })
    return () => { unlisten.then(f => f()) }
  }, [])

  const formatTime = (ts: number) => {
    const now = Date.now()
    const diff = now - ts
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  if (!note) return null

  const mdHtml = note.mode === 'markdown'
    ? DOMPurify.sanitize(marked(viewRef.current?.state.doc.toString() ?? note.content) as string)
    : ''

  return (
    <div className="editor">
      <div className="editor-main">
        {note.mode === 'markdown' ? (
          <div className="editor-md-view">
            <div className="editor-cm-wrapper" ref={cmRef} style={{ width: `${mdSplit}%` }} />
            <div className="editor-md-divider" onMouseDown={handleDividerDown} />
            <div ref={previewRef} className="editor-md-preview" style={{ width: `${100 - mdSplit}%` }} dangerouslySetInnerHTML={{ __html: mdHtml }} />
          </div>
        ) : (
          <div className="editor-cm-wrapper" ref={cmRef} />
        )}

        {/* 浮动底栏 */}
        <div className="editor-toolbar">
          <button className="editor-toolbar-btn" onClick={() => setShowDrawer(true)} title="文稿列表">☰</button>
          <div className="editor-toolbar-sep" />
          <button className="editor-toolbar-btn" onClick={handleNewNote} title="新建文稿">＋</button>
          <div className="editor-toolbar-sep" />
          <button
            className={`editor-toolbar-btn ${note.mode === 'markdown' ? 'active' : ''}`}
            onClick={handleToggleMode}
            title={note.mode === 'markdown' ? '切换纯文本' : '切换 Markdown'}
          >M↓</button>
          <div className="editor-toolbar-sep" />
          <button
            className={`editor-toolbar-btn ${wordWrap ? 'active' : ''}`}
            onClick={handleToggleWrap}
            title={wordWrap ? '关闭自动换行' : '开启自动换行'}
          >↩</button>
          <div className="editor-toolbar-sep" />
          <button
            className="editor-toolbar-btn editor-toolbar-fontsize"
            onClick={() => setShowSettings(prev => !prev)}
            title="字号与行距设置"
          >{fontSize}</button>
          <div className="editor-toolbar-sep" />
          <button className="editor-toolbar-btn" onClick={handleExport} title="导出文件">↓</button>
        </div>

        {/* 字号/行距弹窗 */}
        {showSettings && (
          <div className="editor-settings-backdrop" onClick={() => setShowSettings(false)}>
            <div className="editor-settings-popup" onClick={e => e.stopPropagation()}>
              <label className="editor-settings-row">
                <span className="editor-settings-label">字号</span>
                <input
                  type="range" min={10} max={32} step={1}
                  value={fontSize}
                  onChange={e => handleFontSize(Number(e.target.value))}
                  className="editor-settings-slider"
                />
                <span className="editor-settings-value">{fontSize}</span>
              </label>
              <label className="editor-settings-row">
                <span className="editor-settings-label">行距</span>
                <input
                  type="range" min={0.8} max={3.0} step={0.1}
                  value={lineHeight}
                  onChange={e => handleLineHeight(Number(e.target.value))}
                  className="editor-settings-slider"
                />
                <span className="editor-settings-value">{lineHeight.toFixed(1)}</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* 拖放遮罩 */}
      {dragOver && (
        <div className="editor-drop-overlay">
          <div className="editor-drop-hint">松开以读取文件内容</div>
        </div>
      )}

      {/* 抽屉 */}
      {showDrawer && (
        <>
          <div className="editor-drawer-overlay" onClick={() => setShowDrawer(false)} />
          <div className="editor-drawer">
            <div className="editor-drawer-header">
              <span>文稿列表</span>
              <button className="editor-drawer-close" onClick={() => setShowDrawer(false)}>✕</button>
            </div>
            <div className="editor-drawer-list">
              {notes.map(n => (
                <div
                  key={n.id}
                  className={`editor-drawer-item ${n.id === note.id ? 'active' : ''}`}
                  onClick={() => handleSwitchNote(n.id)}
                >
                  <div className="editor-drawer-item-info">
                    <div className="editor-drawer-item-title">{n.title}</div>
                    <div className="editor-drawer-item-time">{formatTime(n.updatedAt)}</div>
                  </div>
                  <span className="editor-drawer-delete" onClick={(e) => handleDeleteNote(n.id, e)}>删除</span>
                </div>
              ))}
            </div>
            <div className="editor-drawer-footer">
              <button className="editor-drawer-new" onClick={handleNewNote}>＋ 新建文稿</button>
            </div>
          </div>
        </>
      )}

      {/* 删除确认弹窗 */}
      {deleteId && (
        <div className="editor-confirm-overlay" onClick={() => setDeleteId(null)}>
          <div className="editor-confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="editor-confirm-text">确定删除这篇文稿吗？</div>
            <div className="editor-confirm-actions">
              <button className="editor-confirm-cancel" onClick={() => setDeleteId(null)}>取消</button>
              <button className="editor-confirm-ok" onClick={confirmDelete}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
