use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    id: String,
    title: String,
    mode: String,
    updated_at: u64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    font_size: f64,
    line_height: f64,
    word_wrap: bool,
    active_id: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            font_size: 18.0,
            line_height: 1.2,
            word_wrap: true,
            active_id: None,
        }
    }
}

fn get_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
}

fn notes_dir(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("notes")
}

fn settings_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join("settings.json")
}

fn ensure_notes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = get_data_dir(app)?;
    let dir = notes_dir(&data_dir);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

fn get_title(content: &str) -> String {
    let first = content
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("");
    let truncated: String = first.chars().take(20).collect();
    if truncated.is_empty() {
        "未命名文稿".to_string()
    } else {
        truncated
    }
}

fn mode_to_ext(mode: &str) -> &str {
    match mode {
        "markdown" => ".md",
        _ => ".txt",
    }
}

fn ext_to_mode(ext: &str) -> &str {
    match ext {
        "md" | "markdown" => "markdown",
        _ => "text",
    }
}

fn file_updated_at(path: &PathBuf) -> u64 {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn find_note_file(dir: &PathBuf, id: &str) -> Option<PathBuf> {
    fs::read_dir(dir).ok()?.find_map(|entry| {
        let path = entry.ok()?.path();
        if path.file_stem()?.to_str()? == id && path.is_file() {
            Some(path)
        } else {
            None
        }
    })
}

#[tauri::command]
fn list_notes(app: tauri::AppHandle) -> Result<Vec<NoteMeta>, String> {
    let dir = ensure_notes_dir(&app)?;
    let mut notes: Vec<NoteMeta> = Vec::new();

    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let title = get_title(&content);
        let mode = ext_to_mode(ext).to_string();
        let updated_at = file_updated_at(&path);

        notes.push(NoteMeta {
            id,
            title,
            mode,
            updated_at,
        });
    }

    notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(notes)
}

#[tauri::command]
fn read_note(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let dir = ensure_notes_dir(&app)?;
    let path = find_note_file(&dir, &id)
        .ok_or_else(|| format!("Note {} not found", id))?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_note(app: tauri::AppHandle, id: String, content: String, mode: String) -> Result<(), String> {
    let dir = ensure_notes_dir(&app)?;
    // 如果 mode 变了，删旧文件
    if let Some(old_path) = find_note_file(&dir, &id) {
        let old_ext = old_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let new_ext = mode_to_ext(&mode).trim_start_matches('.');
        if old_ext != new_ext {
            let _ = fs::remove_file(&old_path);
        }
    }
    let filename = format!("{}{}", id, mode_to_ext(&mode));
    let path = dir.join(filename);
    fs::write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_note(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = ensure_notes_dir(&app)?;
    let path = find_note_file(&dir, &id)
        .ok_or_else(|| format!("Note {} not found", id))?;
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_file(app: tauri::AppHandle, content: String, ext: String) -> Result<String, String> {
    let download_dir = app
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?;
    let filename = format!("{}{}", chrono_timestamp_ms(), &ext);
    let path = download_dir.join(&filename);
    fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn chrono_timestamp_ms() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .to_string()
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&path)
            .parent()
            .ok_or("No parent directory")?
            .to_string_lossy()
            .to_string();
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    let data_dir = get_data_dir(&app)?;
    let path = settings_path(&data_dir);
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings_cmd(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let data_dir = get_data_dir(&app)?;
    let path = settings_path(&data_dir);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_notes,
            read_note,
            save_note,
            delete_note,
            export_file,
            show_in_folder,
            load_settings,
            save_settings_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_title() {
        assert_eq!(get_title("Hello World\nline 2"), "Hello World");
        assert_eq!(get_title(""), "未命名文稿");
        assert_eq!(get_title("   \n\nActual title"), "Actual title");
        let long_line: String = "x".repeat(50);
        assert_eq!(get_title(&long_line), "x".repeat(20));
    }

    #[test]
    fn test_ext_to_mode() {
        assert_eq!(ext_to_mode("md"), "markdown");
        assert_eq!(ext_to_mode("markdown"), "markdown");
        assert_eq!(ext_to_mode("txt"), "text");
        assert_eq!(ext_to_mode("json"), "text");
    }

    #[test]
    fn test_mode_to_ext() {
        assert_eq!(mode_to_ext("markdown"), ".md");
        assert_eq!(mode_to_ext("text"), ".txt");
    }

    #[test]
    fn test_save_read_delete_note() {
        let dir = std::env::temp_dir().join("plico_test_save_read");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let path = dir.join("abc123.md");
        fs::write(&path, "# Hello").unwrap();

        let found = find_note_file(&dir, "abc123");
        assert!(found.is_some());
        let content = fs::read_to_string(found.unwrap()).unwrap();
        assert_eq!(content, "# Hello");

        assert_eq!(get_title("# Hello"), "# Hello");

        let path = find_note_file(&dir, "abc123").unwrap();
        fs::remove_file(&path).unwrap();
        assert!(find_note_file(&dir, "abc123").is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_settings_roundtrip() {
        let dir = std::env::temp_dir().join("plico_test_settings");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let path = settings_path(&dir);
        let s = Settings::default();
        let json = serde_json::to_string_pretty(&s).unwrap();
        fs::write(&path, &json).unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let loaded: Settings = serde_json::from_str(&raw).unwrap();
        assert_eq!(loaded.font_size, 18.0);
        assert_eq!(loaded.line_height, 1.2);
        assert!(loaded.word_wrap);
        assert!(loaded.active_id.is_none());

        let _ = fs::remove_dir_all(&dir);
    }
}
