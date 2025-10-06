#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use stratosort::run;

fn main() {
    if let Err(e) = run() {
        eprintln!("Application error: {}", e);
        std::process::exit(1);
    }
}
