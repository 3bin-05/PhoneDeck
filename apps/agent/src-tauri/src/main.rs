// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;

fn is_another_instance_running() -> bool {
    // If port 8766 is already bound, another Agent instance is already running
    std::net::TcpListener::bind("127.0.0.1:8766").is_err()
}

fn main() {
    let log_file = "D:\\PhoneDeck\\agent_debug.log";
    if is_another_instance_running() {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log_file) {
            let _ = writeln!(f, "Another instance of Phone Deck Agent is already running. Exiting.");
        }
        return;
    }

    let _ = std::fs::write(log_file, "Phone Deck Agent starting...\n");
    let _ = std::fs::write(log_file, "Phone Deck Agent starting...\n");

    std::panic::set_hook(Box::new(move |panic_info| {
        let msg = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            format!("{:?}", panic_info)
        };
        let location = panic_info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_default();
        let full = format!("PANIC at {}:\n{}\n", location, msg);
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open("D:\\PhoneDeck\\agent_debug.log") {
            let _ = f.write_all(full.as_bytes());
        }
    }));

    if let Ok(mut f) = OpenOptions::new().append(true).open(log_file) {
        let _ = writeln!(f, "Running agent_lib::run()");
    }

    agent_lib::run();
}
