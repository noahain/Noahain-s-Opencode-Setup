// Updater IPC commands. The check is served by the plugin itself
// (plugin:updater|check); these commands add download-with-progress and
// cancellation for the frontend.
//
// Wiring (in your builder chain):
//   .plugin(tauri_plugin_updater::Builder::new().build())
//   .plugin(tauri_plugin_process::init())
//   .manage(CancelDownloadState::default())
//   .invoke_handler(tauri::generate_handler![
//       /* ...existing commands..., */
//       start_update_download,
//       cancel_update_download,
//   ])
//
// Cargo.toml:
//   tauri-plugin-updater = "2"
//   tauri-plugin-process = "2"
//   tokio = { version = "1", features = ["sync", "macros", "rt"] }
//   serde = { version = "1", features = ["derive"] }

use tauri::ipc::Channel;
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::{oneshot, Mutex};

#[derive(Default)]
pub struct CancelDownloadState {
    sender: Mutex<Option<oneshot::Sender<()>>>,
}

// rename_all renames the variants (started/progress/finished);
// rename_all_fields renames the fields (contentLength/chunkLength) so the
// wire format matches what updater-toast.js reads. Requires serde 1.0.186+.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(tag = "event", content = "data", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum DownloadEvent {
    Started { content_length: Option<u64> },
    Progress { chunk_length: usize },
    Finished,
}

#[tauri::command]
async fn start_update_download(
    app: tauri::AppHandle,
    on_event: Channel<DownloadEvent>,
    state: tauri::State<'_, CancelDownloadState>,
) -> Result<(), String> {
    let updater = app.updater().map_err(|e| format!("{}", e))?;
    let update = updater.check().await.map_err(|e| format!("{}", e))?;

    let Some(update) = update else {
        return Err("No update available".to_string());
    };

    let (tx, rx) = oneshot::channel();
    *state.sender.lock().await = Some(tx);

    let on_event_for_finished = on_event.clone();
    let mut started = false;
    let on_progress = move |downloaded: usize, total: Option<u64>| {
        if !started {
            let _ = on_event.send(DownloadEvent::Started { content_length: total });
            started = true;
        }
        let _ = on_event.send(DownloadEvent::Progress { chunk_length: downloaded });
    };
    let on_finished = move || {
        let _ = on_event_for_finished.send(DownloadEvent::Finished);
    };

    let result: Result<(), tauri_plugin_updater::Error> = tokio::select! {
        res = update.download_and_install(on_progress, on_finished) => res,
        _ = rx => {
            return Err("Download cancelled".to_string());
        }
    };

    *state.sender.lock().await = None;
    result.map_err(|e: tauri_plugin_updater::Error| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn cancel_update_download(
    state: tauri::State<'_, CancelDownloadState>,
) -> Result<(), String> {
    if let Some(tx) = state.sender.lock().await.take() {
        let _ = tx.send(());
    }
    Ok(())
}
