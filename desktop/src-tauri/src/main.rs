#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;

/// Absolute path to the docker-compose.yml file.
/// CARGO_MANIFEST_DIR = .../personal-os/desktop/src-tauri, so go two levels up.
const COMPOSE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../docker-compose.yml");
/// Port that the frontend nginx serves on.
const PORT: u16 = 8080;
/// Maximum time to wait for the frontend to become reachable.
const TIMEOUT: Duration = Duration::from_secs(120);

/// Resolve the docker binary from common locations (GUI apps launched via `open` have a
/// minimal PATH that rarely includes `/usr/local/bin` where OrbStack/Docker Desktop lives).
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

/// Run `docker compose <args>` using the project's compose file.
fn compose(args: &[&str]) {
    let status = Command::new(docker_bin())
        .args(["compose", "-f", COMPOSE])
        .args(args)
        .status();
    match status {
        Ok(s) => {
            if s.success() {
                println!("docker compose {:?} -> success", args);
            } else {
                eprintln!("docker compose {:?} -> exited with {}", args, s);
            }
        }
        Err(e) => eprintln!("docker compose {:?} failed: {}", args, e),
    }
}

/// Poll TCP port 8080 until it is reachable or TIMEOUT expires.
fn server_up() -> bool {
    let start = Instant::now();
    loop {
        if TcpStream::connect(("127.0.0.1", PORT)).is_ok() {
            return true;
        }
        if start.elapsed() > TIMEOUT {
            eprintln!(
                "Timeout: frontend at localhost:{} not reachable after {:?}",
                PORT, TIMEOUT
            );
            return false;
        }
        thread::sleep(Duration::from_millis(500));
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Start the docker-compose stack in the background.
            compose(&["up", "-d"]);

            // Spawn a thread that polls for server readiness, then shows the window.
            let handle = app.handle().clone();
            thread::spawn(move || {
                let up = server_up();
                if let Some(win) = handle.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                    if !up {
                        eprintln!("WARNING: frontend not reachable within timeout — window shown anyway");
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                compose(&["down"]);
            }
        });
}
