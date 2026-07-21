#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;

const PORT: u16 = 8080;
const TIMEOUT: Duration = Duration::from_secs(120);
const STACK_VERSION: &str = "1";

static COMPOSE_PATH: OnceLock<PathBuf> = OnceLock::new();

struct StackGuard;

impl Drop for StackGuard {
    fn drop(&mut self) {
        shutdown_stack();
    }
}

// ---------- Docker helpers ----------

fn docker_bin() -> String {
    let candidates =
        ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "/usr/bin/docker"];
    for c in &candidates {
        if Path::new(c).exists() {
            return c.to_string();
        }
    }
    "docker".to_string()
}

fn docker_available() -> bool {
    Command::new(docker_bin())
        .args(["info"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_or(false, |s| s.success())
}

fn compose(args: &[&str], compose_path: &Path) {
    let status = Command::new(docker_bin())
        .args(["compose", "-f"])
        .arg(compose_path)
        .args(args)
        .status();
    match status {
        Ok(s) if s.success() => println!("docker compose {:?} -> success", args),
        Ok(s) => eprintln!("docker compose {:?} -> exited with {}", args, s),
        Err(e) => eprintln!("docker compose {:?} failed: {}", args, e),
    }
}

fn server_up() -> bool {
    let start = Instant::now();
    loop {
        if TcpStream::connect(("127.0.0.1", PORT)).is_ok() {
            return true;
        }
        if start.elapsed() > TIMEOUT {
            eprintln!("Timeout: server not reachable on port {}", PORT);
            return false;
        }
        thread::sleep(Duration::from_millis(500));
    }
}

// ---------- File helpers ----------

fn copy_dir(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        let s = entry.path();
        let d = dst.join(entry.file_name());
        if ft.is_dir() {
            fs::create_dir_all(&d).map_err(|e| e.to_string())?;
            copy_dir(&s, &d)?;
        } else {
            fs::copy(&s, &d).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// ---------- Compose path resolution ----------

fn resolve_compose(handle: &tauri::AppHandle) -> PathBuf {
    // Debug builds (cargo build / tauri dev) — use the repo path directly.
    // Release builds (tauri build) — extract from .app Resources.
    #[cfg(debug_assertions)]
    {
        let _ = handle;
        return PathBuf::from(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../docker-compose.yml"
        ));
    }

    #[cfg(not(debug_assertions))]
    {
        let dest = handle
            .path()
            .app_data_dir()
            .expect("app data dir available")
            .join("stack");
        let version_file = dest.join(".version");

        let needs_extract =
            fs::read_to_string(&version_file).map_or(true, |v| v.trim() != STACK_VERSION);

        if needs_extract {
            let _ = fs::remove_dir_all(&dest);
            fs::create_dir_all(&dest).expect("create stack data dir");

            let src = handle
                .path()
                .resource_dir()
                .expect("resource dir available")
                .join("stack");
            assert!(
                src.exists(),
                "Bundle incomplete: resources/stack/ missing at {:?}",
                src
            );

            copy_dir(&src, &dest).expect("copy stack resources");
            let _ = fs::write(&version_file, STACK_VERSION);
            println!("Stack extracted to {:?}", dest);
        }

        dest.join("docker-compose.yml")
    }
}

// ---------- Main ----------

fn shutdown_stack() {
    if let Some(cp) = COMPOSE_PATH.get() {
        let docker = docker_bin();
        // Fire-and-forget: spawn docker compose down in a detached child process.
        // Even if the parent (Tauri) is killed before the command completes,
        // the child continues running (reparented to launchd on macOS).
        let _ = std::process::Command::new(&docker)
            .args(["compose", "-f"])
            .arg(cp)
            .args(["down"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
    }
}

fn main() {
    let _guard = StackGuard;

    tauri::Builder::default()
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let _ = window;
                shutdown_stack();
            }
        })
        .setup(|app| {
            let handle = app.handle();

            // 1) Resolve compose file path (extract from bundle if needed).
            let cp = resolve_compose(handle);
            COMPOSE_PATH.set(cp.clone()).ok();

            // 2) Check Docker is installed & running.
            if !docker_available() {
                eprintln!(
                    "Docker is not available. Please install OrbStack or Docker Desktop."
                );
                let h = handle.clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(500));
                    if let Some(win) = h.get_webview_window("main") {
                        let _ = win.show();
                    }
                });
                return Ok(());
            }

            // 3) Start the stack.
            compose(&["up", "-d"], &cp);

            // 4) Wait for server, then show the window.
            let h = handle.clone();
            thread::spawn(move || {
                let up = server_up();
                if let Some(win) = h.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                    if !up {
                        eprintln!("Server failed to start within timeout.");
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri application")
        .run(|_handle, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                shutdown_stack();
            }
        });
}
