#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use stratosort::run;

#[tokio::main(flavor = "multi_thread", worker_threads = 6)]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("Application error: {}", e);
        std::process::exit(1);
    }
}
