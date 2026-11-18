use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::exit;
use std::time::Duration;

const DEFAULT_PORT: u16 = 8767;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        print_help();
        exit(1);
    }

    match args[1].as_str() {
        "notify" => handle_notify(&args[2..]),
        "ask" => handle_ask(&args[2..]),
        "push" => handle_push(&args[2..]),
        "goto" => handle_goto(&args[2..]),
        "--help" | "-h" | "help" => {
            print_help();
            exit(0);
        }
        cmd => {
            eprintln!("Unknown command: {}", cmd);
            print_help();
            exit(1);
        }
    }
}

fn print_help() {
    println!(
        r#"phonedeck CLI - AI Agent & Developer Bridge (Protocol v{})

USAGE:
    phonedeck <SUBCOMMAND> [OPTIONS]

SUBCOMMANDS:
    notify    Send a task completion or event notification to Phone Deck
    ask       Request approval from paired Phone Deck (blocks until answered)
    push      Push metric / value to a Phone Deck widget
    goto      Switch to a specific page on Phone Deck

OPTIONS for 'notify':
    --agent <name>       Agent name (e.g. claude-code, codex, antigravity)
    --title <title>      Notification title
    --summary <text>     Summary description
    --project <project>  Project name
    --kind <kind>        Event kind (done | needs_input | approval | error)
    --cwd <path>         Working directory for git stats (default: .)
    --port <port>        Agent HTTP bridge port (default: 8767)

OPTIONS for 'ask':
    <prompt>             Approval question / prompt
    --command <cmd>      Exact command to approve (shows on phone)
    --timeout <seconds>  Timeout in seconds before terminal fallback (default: 60)
    --cwd <path>         Working directory (default: .)
    --port <port>        Agent HTTP bridge port (default: 8767)

OPTIONS for 'push':
    <key> <value>        Field ID / key and value to push
    --port <port>        Agent HTTP bridge port (default: 8767)

OPTIONS for 'goto':
    <page_index>         Target page (0-indexed)
    --port <port>        Agent HTTP bridge port (default: 8767)
"#,
        protocol::PROTOCOL_VERSION
    );
}

fn handle_notify(args: &[String]) {
    let mut agent = "agent".to_string();
    let mut title = "Task Finished".to_string();
    let mut summary = String::new();
    let mut project = String::new();
    let mut kind = "done".to_string();
    let mut cwd = ".".to_string();
    let mut port = DEFAULT_PORT;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--agent" if i + 1 < args.len() => {
                agent = args[i + 1].clone();
                i += 2;
            }
            "--title" if i + 1 < args.len() => {
                title = args[i + 1].clone();
                i += 2;
            }
            "--summary" if i + 1 < args.len() => {
                summary = args[i + 1].clone();
                i += 2;
            }
            "--project" if i + 1 < args.len() => {
                project = args[i + 1].clone();
                i += 2;
            }
            "--kind" if i + 1 < args.len() => {
                kind = args[i + 1].clone();
                i += 2;
            }
            "--cwd" if i + 1 < args.len() => {
                cwd = args[i + 1].clone();
                i += 2;
            }
            "--port" if i + 1 < args.len() => {
                port = args[i + 1].parse().unwrap_or(DEFAULT_PORT);
                i += 2;
            }
            _ => {
                i += 1;
            }
        }
    }

    if cwd == "." {
        if let Ok(c) = std::env::current_dir() {
            cwd = c.to_string_lossy().to_string();
        }
    }
    if project.is_empty() {
        project = std::path::Path::new(&cwd)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "project".to_string());
    }

    let payload = serde_json::json!({
        "agent": agent,
        "title": title,
        "summary": summary,
        "project": project,
        "kind": kind,
        "cwd": cwd,
    });

    match http_post(port, "/api/notify", &payload.to_string(), 5) {
        Ok(_) => {
            println!("[phonedeck] Notification delivered to Phone Deck");
            exit(0);
        }
        Err(e) => {
            eprintln!("[phonedeck] Could not deliver notification: {}", e);
            exit(1);
        }
    }
}

fn handle_ask(args: &[String]) {
    if args.is_empty() {
        eprintln!("Error: missing prompt for 'ask'");
        exit(1);
    }

    let prompt = args[0].clone();
    let mut command: Option<String> = None;
    let mut cwd = ".".to_string();
    let mut timeout_sec: u64 = 60;
    let mut port = DEFAULT_PORT;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--command" if i + 1 < args.len() => {
                command = Some(args[i + 1].clone());
                i += 2;
            }
            "--timeout" if i + 1 < args.len() => {
                timeout_sec = args[i + 1].parse().unwrap_or(60);
                i += 2;
            }
            "--cwd" if i + 1 < args.len() => {
                cwd = args[i + 1].clone();
                i += 2;
            }
            "--port" if i + 1 < args.len() => {
                port = args[i + 1].parse().unwrap_or(DEFAULT_PORT);
                i += 2;
            }
            _ => {
                i += 1;
            }
        }
    }

    if cwd == "." {
        if let Ok(c) = std::env::current_dir() {
            cwd = c.to_string_lossy().to_string();
        }
    }

    let payload = serde_json::json!({
        "prompt": prompt,
        "command": command,
        "cwd": cwd,
        "timeout": timeout_sec,
    });

    println!("[phonedeck] Requesting approval on Phone Deck (timeout: {}s)...", timeout_sec);

    match http_post(port, "/api/ask", &payload.to_string(), timeout_sec + 5) {
        Ok(body) => {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                if let Some(approved) = v.get("approved").and_then(|a| a.as_bool()) {
                    if approved {
                        println!("[phonedeck] Approved by Phone Deck");
                        exit(0);
                    } else {
                        eprintln!("[phonedeck] Denied by Phone Deck");
                        exit(1);
                    }
                }
            }
            eprintln!("[phonedeck] Invalid response format from Agent");
            exit(2);
        }
        Err(e) => {
            eprintln!("[phonedeck] Approval timed out or unreachable: {}", e);
            eprintln!("[phonedeck] Falling back to local terminal prompt...");
            exit(2);
        }
    }
}

fn handle_push(args: &[String]) {
    if args.len() < 2 {
        eprintln!("Usage: phonedeck push <key> <value> [--port <port>]");
        exit(1);
    }

    let key = &args[0];
    let val = &args[1];
    let mut port = DEFAULT_PORT;

    if args.len() >= 4 && args[2] == "--port" {
        port = args[3].parse().unwrap_or(DEFAULT_PORT);
    }

    let path = format!("/api/push/{}", key);
    match http_post(port, &path, val, 5) {
        Ok(_) => {
            println!("[phonedeck] Pushed key {} = {}", key, val);
            exit(0);
        }
        Err(e) => {
            eprintln!("[phonedeck] Push failed: {}", e);
            exit(1);
        }
    }
}

fn handle_goto(args: &[String]) {
    if args.is_empty() {
        eprintln!("Usage: phonedeck goto <page> [--port <port>]");
        exit(1);
    }

    let page = &args[0];
    let mut port = DEFAULT_PORT;

    if args.len() >= 3 && args[1] == "--port" {
        port = args[2].parse().unwrap_or(DEFAULT_PORT);
    }

    let path = format!("/api/goto/{}", page);
    match http_post(port, &path, "", 5) {
        Ok(_) => {
            println!("[phonedeck] Switched phone to page {}", page);
            exit(0);
        }
        Err(e) => {
            eprintln!("[phonedeck] Goto failed: {}", e);
            exit(1);
        }
    }
}

/// Zero-dependency raw HTTP 1.1 POST helper for lightning-fast execution.
fn http_post(port: u16, path: &str, body: &str, timeout_secs: u64) -> Result<String, String> {
    let addr = format!("127.0.0.1:{}", port);
    let mut stream = TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("Invalid address: {}", e))?,
        Duration::from_secs(3),
    )
    .map_err(|e| format!("Could not connect to Phone Deck Agent on {}: {}", addr, e))?;

    stream
        .set_read_timeout(Some(Duration::from_secs(timeout_secs)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(3)))
        .map_err(|e| e.to_string())?;

    let req = format!(
        "POST {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        path,
        port,
        body.len(),
        body
    );

    stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;

    let mut response = String::new();
    stream.read_to_string(&mut response).map_err(|e| e.to_string())?;

    if let Some(pos) = response.find("\r\n\r\n") {
        let headers = &response[..pos];
        let body_str = &response[pos + 4..];
        if headers.contains("200 OK") {
            Ok(body_str.to_string())
        } else {
            Err(format!("HTTP error status in response: {}", headers.lines().next().unwrap_or("")))
        }
    } else {
        Err("Incomplete HTTP response".to_string())
    }
}
