mod chat_db;
mod settings;
mod edge_walk;

use chat_db::ChatDb;
use settings::{AppSettings, SettingsStore};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter, Manager, State, WindowEvent,
};

struct TrayState(TrayIcon);

struct AppState {
    db: Mutex<ChatDb>,
    settings: Mutex<SettingsStore>,
}

#[tauri::command]
fn get_api_key(state: State<AppState>) -> Result<String, String> {
    Ok(state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .load()?
        .api_key)
}

#[tauri::command]
fn set_api_key(state: State<AppState>, key: String) -> Result<(), String> {
    state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .save_api_key(&key)
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .load()
}

#[tauri::command]
fn save_settings(state: State<AppState>, settings: AppSettings) -> Result<(), String> {
    let store = state
        .settings
        .lock()
        .map_err(|e| e.to_string())?;
    let current = store.load().unwrap_or_default();
    let mut next = settings;
    if next.api_key.trim().is_empty() {
        next.api_key = current.api_key;
    }
    store.save(&next)
}

#[tauri::command]
fn list_sessions(state: State<AppState>) -> Result<Vec<chat_db::Session>, String> {
    state.db.lock().map_err(|e| e.to_string())?.list_sessions()
}

#[tauri::command]
fn create_session(state: State<AppState>, title: Option<String>) -> Result<i64, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .create_session(title.as_deref().unwrap_or("新对话"))
}

#[tauri::command]
fn get_messages(state: State<AppState>, session_id: i64) -> Result<Vec<chat_db::Message>, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .get_messages(session_id)
}

#[tauri::command]
fn get_recent_messages(
    state: State<AppState>,
    session_id: i64,
    limit: i64,
) -> Result<Vec<chat_db::Message>, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .get_recent_messages(session_id, limit)
}

#[tauri::command]
fn add_message(
    state: State<AppState>,
    session_id: i64,
    role: String,
    content: String,
) -> Result<i64, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .add_message(session_id, &role, &content)
}

#[tauri::command]
fn delete_session(state: State<AppState>, session_id: i64) -> Result<(), String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .delete_session(session_id)
}

#[tauri::command]
fn update_session_title(
    state: State<AppState>,
    session_id: i64,
    title: String,
) -> Result<(), String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .update_session_title(session_id, &title)
}

#[tauri::command]
fn list_memories(
    state: State<AppState>,
    limit: Option<i64>,
) -> Result<Vec<chat_db::Memory>, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .list_memories(limit.unwrap_or(50))
}

#[tauri::command]
fn add_memory(
    state: State<AppState>,
    content: String,
    category: Option<String>,
    importance: Option<i64>,
    source_session_id: Option<i64>,
) -> Result<i64, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .add_memory(&content, category, importance, source_session_id)
}

#[tauri::command]
fn search_memories(
    state: State<AppState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<chat_db::Memory>, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .search_memories(&query, limit.unwrap_or(12))
}

#[tauri::command]
fn delete_memory(state: State<AppState>, memory_id: i64) -> Result<(), String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .delete_memory(memory_id)
}

#[tauri::command]
fn clear_memories(state: State<AppState>) -> Result<(), String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .clear_memories()
}

#[tauri::command]
fn create_reminder(
    state: State<AppState>,
    title: String,
    due_at: i64,
    notes: Option<String>,
) -> Result<chat_db::Reminder, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .create_reminder(&title, due_at, notes)
}

#[tauri::command]
fn list_reminders(
    state: State<AppState>,
    include_completed: Option<bool>,
    limit: Option<i64>,
) -> Result<Vec<chat_db::Reminder>, String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .list_reminders(include_completed.unwrap_or(false), limit.unwrap_or(50))
}

#[tauri::command]
fn complete_reminder(state: State<AppState>, reminder_id: i64) -> Result<(), String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .complete_reminder(reminder_id)
}

#[tauri::command]
fn delete_reminder(state: State<AppState>, reminder_id: i64) -> Result<(), String> {
    state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .delete_reminder(reminder_id)
}

#[tauri::command]
fn show_chat_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("chat") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        w.show().map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toggle_pet_visibility(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("pet") {
        let visible = w.is_visible().map_err(|e| e.to_string())?;
        if visible {
            w.hide().map_err(|e| e.to_string())?;
        } else {
            w.show().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn emit_pet_event(app: AppHandle, event: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("pet") {
        w.emit(&event, ()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn emit_pet_bubble(app: AppHandle, text: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("pet") {
        w.emit("pet-bubble", serde_json::json!({ "text": text }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn emit_settings_changed(
    app: AppHandle,
    pet_scale: f64,
    show_chat_bubble: bool,
    current_outfit_id: String,
) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("pet") {
        w.emit(
            "settings-changed",
            serde_json::json!({
                "petScale": pet_scale,
                "showChatBubble": show_chat_bubble,
                "currentOutfitId": current_outfit_id,
            }),
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn setup_tray(app: &AppHandle) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    let show_pet = MenuItem::with_id(app, "show_pet", "显示/隐藏宠物", true, None::<&str>)?;
    let chat = MenuItem::with_id(app, "chat", "打开聊天", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_pet,
            &chat,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("桌宠小楠")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_pet" => {
                let _ = toggle_pet_visibility(app.clone());
            }
            "chat" => {
                let _ = show_chat_window(app.clone());
            }
            "settings" => {
                let _ = show_settings_window(app.clone());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(tray)
}

fn start_reminder_loop(app: AppHandle) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
                if let Err(e) = tick_reminders(&app) {
                    eprintln!("reminder loop: {e}");
                }
            }
        });
    });
}

fn hide_on_close(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let window_to_hide = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window_to_hide.hide();
            }
        });
    }
}

fn tick_reminders(app: &AppHandle) -> Result<(), String> {
    let now = current_time_ms();
    let state = app.state::<AppState>();
    let due = state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .due_reminders(now, 5)?;

    for reminder in due {
        let text = if let Some(notes) = reminder.notes.as_ref() {
            format!("提醒：{}\n{}", reminder.title, notes)
        } else {
            format!("提醒：{}", reminder.title)
        };
        if let Some(w) = app.get_webview_window("pet") {
            let _ = w.show();
            let _ = w.set_focus();
            let _ = w.emit("pet-bubble", serde_json::json!({ "text": text }));
            let _ = w.emit(
                "schedule-reminder",
                serde_json::json!({
                    "id": reminder.id,
                    "title": reminder.title,
                    "notes": reminder.notes,
                    "dueAt": reminder.due_at,
                }),
            );
        }
        state
            .db
            .lock()
            .map_err(|e| e.to_string())?
            .mark_reminded(reminder.id)?;
    }

    Ok(())
}

fn current_time_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("eve-desktop-pet");

    let db = ChatDb::open(&data_dir).expect("failed to open chat database");
    let settings = SettingsStore::new(&data_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            db: Mutex::new(db),
            settings: Mutex::new(settings),
        })
        .setup(|app| {
            let tray = setup_tray(app.handle())?;
            app.manage(TrayState(tray));
            hide_on_close(app.handle(), "chat");
            hide_on_close(app.handle(), "settings");
            edge_walk::start_edge_detection(app.handle().clone());
            start_reminder_loop(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_api_key,
            set_api_key,
            get_settings,
            save_settings,
            list_sessions,
            create_session,
            get_messages,
            get_recent_messages,
            add_message,
            delete_session,
            update_session_title,
            list_memories,
            add_memory,
            search_memories,
            delete_memory,
            clear_memories,
            create_reminder,
            list_reminders,
            complete_reminder,
            delete_reminder,
            show_chat_window,
            show_settings_window,
            toggle_pet_visibility,
            emit_pet_event,
            emit_pet_bubble,
            emit_settings_changed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
