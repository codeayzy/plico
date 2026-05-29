import { invoke } from '@tauri-apps/api/core'

export type EditMode = 'text' | 'markdown'

export interface NoteMeta {
  id: string
  title: string
  mode: string
  updatedAt: number
}

export interface Note extends NoteMeta {
  content: string
}

interface Settings {
  fontSize: number
  lineHeight: number
  wordWrap: boolean
  activeId: string | null
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export async function loadNotes(): Promise<NoteMeta[]> {
  return invoke<NoteMeta[]>('list_notes')
}

export async function readNote(id: string): Promise<string> {
  return invoke<string>('read_note', { id })
}

export async function createNote(content?: string, mode?: EditMode): Promise<Note> {
  const id = generateId()
  const m = mode ?? 'text'
  const c = content ?? ''
  await invoke('save_note', { id, content: c, mode: m })
  return {
    id,
    title: getTitle(c),
    content: c,
    mode: m,
    updatedAt: Date.now(),
  }
}

export async function updateNote(id: string, updates: Partial<Pick<Note, 'content' | 'mode'>>): Promise<void> {
  if (updates.content !== undefined) {
    const mode = updates.mode ?? 'text'
    await invoke('save_note', { id, content: updates.content, mode })
  } else if (updates.mode !== undefined) {
    const content = await readNote(id)
    await invoke('save_note', { id, content, mode: updates.mode })
  }
}

export async function deleteNote(id: string): Promise<void> {
  await invoke('delete_note', { id })
}

export async function getActiveNote(): Promise<Note | null> {
  const settings = await loadSettings()
  const notes = await loadNotes()
  const activeId = settings.activeId

  if (activeId) {
    const found = notes.find(n => n.id === activeId)
    if (found) {
      const content = await readNote(found.id)
      return { ...found, content }
    }
  }

  if (notes.length > 0) {
    await saveSettings({ ...settings, activeId: notes[0].id })
    const content = await readNote(notes[0].id)
    return { ...notes[0], content }
  }

  return createNote()
}

export async function loadSettings(): Promise<Settings> {
  return invoke<Settings>('load_settings')
}

export async function saveSettings(settings: Settings): Promise<void> {
  await invoke('save_settings_cmd', { settings })
}

function getTitle(content: string): string {
  const first = content.split('\n').find(line => line.trim()) || ''
  const truncated = first.slice(0, 20)
  return truncated || '未命名文稿'
}
