use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

const EDGE_THRESHOLD: i32 = 24;
const WALK_STEP: i32 = 3;
const POLL_MS: u64 = 200;

pub fn start_edge_detection(app: AppHandle) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
        rt.block_on(async {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(POLL_MS)).await;
                if let Err(e) = tick(&app) {
                    eprintln!("edge detection: {e}");
                }
            }
        });
    });
}

fn tick(app: &AppHandle) -> Result<(), String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window missing".to_string())?;

    if !pet.is_visible().map_err(|e| e.to_string())? {
        return Ok(());
    }

    let pos = pet.outer_position().map_err(|e| e.to_string())?;
    let size = pet.outer_size().map_err(|e| e.to_string())?;
    let monitor = pet
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitor".to_string())?;
    let mon_pos = monitor.position();
    let mon_size = monitor.size();

    let work_left = mon_pos.x;
    let work_right = mon_pos.x + mon_size.width as i32;
    let pet_left = pos.x;
    let pet_right = pos.x + size.width as i32;

    let near_left = pet_left - work_left <= EDGE_THRESHOLD;
    let near_right = work_right - pet_right <= EDGE_THRESHOLD;

    if near_right && !near_left {
        pet.emit("pet-edge", serde_json::json!({ "side": "right" }))
            .map_err(|e| e.to_string())?;
        let new_x = pos.x - WALK_STEP;
        if new_x > work_left {
            pet.set_position(PhysicalPosition::new(new_x, pos.y))
                .map_err(|e| e.to_string())?;
        }
    } else if near_left && !near_right {
        pet.emit("pet-edge", serde_json::json!({ "side": "left" }))
            .map_err(|e| e.to_string())?;
        let new_x = pos.x + WALK_STEP;
        if new_x + (size.width as i32) < work_right {
            pet.set_position(PhysicalPosition::new(new_x, pos.y))
                .map_err(|e| e.to_string())?;
        }
    } else if !near_left && !near_right {
        pet.emit("pet-edge", serde_json::json!({ "side": "none" }))
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
