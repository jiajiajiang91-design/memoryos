#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

// 把项目文件夹移到系统回收站。
#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
  trash::delete(&path).map_err(|e| e.to_string())
}

// 从系统回收站还原一个之前被 move_to_trash 删掉的路径。
// 用最近被删的同路径条目作为目标。仅在 Windows / Linux 受支持。
#[cfg(any(target_os = "windows", target_os = "linux"))]
#[tauri::command]
fn restore_from_trash(original_path: String) -> Result<(), String> {
  let target = PathBuf::from(&original_path);
  let items = trash::os_limited::list().map_err(|e| e.to_string())?;
  let item = items
    .into_iter()
    .filter(|it| it.original_parent.join(&it.name) == target)
    .max_by_key(|it| it.time_deleted)
    .ok_or_else(|| format!("回收站里找不到「{}」,可能已被清空", original_path))?;
  trash::os_limited::restore_all([item]).map_err(|e| e.to_string())?;
  Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
#[tauri::command]
fn restore_from_trash(_original_path: String) -> Result<(), String> {
  Err("当前系统暂不支持从回收站自动还原,请手动从回收站恢复。".into())
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![move_to_trash, restore_from_trash])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
