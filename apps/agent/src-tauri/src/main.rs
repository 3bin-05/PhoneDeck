// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;

fn main() {
    let log_file = "D:\\PhoneDeck\\agent_debug.log";
    let _ = std::fs::write(log_file, "Phone Deck Agent starting...\n");

    std::panic::set_hook(Box::new(move |panic_info| {
        let msg = format!("PANIC OCCURRED:\n{:?}\n", panic_info);
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open("D:\\PhoneDeck\\agent_debug.log") {
            let _ = f.write_all(msg.as_bytes());
        }
    }));

    if let Ok(mut f) = OpenOptions::new().append(true).open(log_file) {
        let _ = writeln!(f, "Running agent_lib::run()");
    }

    agent_lib::run();
}
