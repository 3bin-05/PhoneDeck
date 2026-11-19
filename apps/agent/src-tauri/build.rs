fn main() {
    // Ensure ../dist exists so tauri::generate_context!() does not panic
    // when building or testing crates before the frontend bundle is built.
    let dist = std::path::Path::new("../dist");
    if !dist.exists() {
        let _ = std::fs::create_dir_all(dist);
        let index = dist.join("index.html");
        if !index.exists() {
            let _ = std::fs::write(index, "<!DOCTYPE html><html><body></body></html>");
        }
    }
    tauri_build::build()
}
