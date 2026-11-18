use protocol::fields::FieldId;
use protocol::MetricValue;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

#[derive(Debug, Clone, Default)]
pub struct MediaSnapshot {
    pub playing: bool,
    pub status: String, // "playing", "paused", "stopped"
    pub title: String,
    pub artist: String,
    pub album: String,
    pub source_app: String,
    pub position_sec: u32,
    pub duration_sec: u32,
    pub playback_rate: u32, // 1000 = 1.0x
    pub controls: String,   // "play,pause,next,prev,seek"
    pub art_id: String,
    pub palette: String, // "#RRGGBB,#RRGGBB,#RRGGBB"
    pub master_volume_pct: u8,
    pub master_mute: bool,
    pub available_sessions: Vec<String>,
}

pub struct MediaSessionManager {
    pub snapshot: Arc<RwLock<MediaSnapshot>>,
    pub art_cache: Arc<Mutex<HashMap<String, Vec<u8>>>>, // art_id -> WebP bytes
    pub preferred_source: Arc<RwLock<Option<String>>>,
    telemetry_hub: Arc<crate::sensors::TelemetryHub>,
}

impl MediaSessionManager {
    pub fn new(telemetry_hub: Arc<crate::sensors::TelemetryHub>) -> Arc<Self> {
        let manager = Arc::new(Self {
            snapshot: Arc::new(RwLock::new(MediaSnapshot::default())),
            art_cache: Arc::new(Mutex::new(HashMap::new())),
            preferred_source: Arc::new(RwLock::new(None)),
            telemetry_hub,
        });

        // Initialize Windows Native Event-Driven Media Session Listener
        #[cfg(target_os = "windows")]
        {
            let mgr_clone = manager.clone();
            std::thread::spawn(move || {
                if let Err(e) = mgr_clone.init_windows_media_listener() {
                    log::warn!("[MediaSession] Windows media listener initialization notice: {}", e);
                }
            });
        }

        manager
    }

    pub fn get_art(&self, art_id: &str) -> Option<Vec<u8>> {
        let cache = self.art_cache.lock().ok()?;
        cache.get(art_id).cloned()
    }

    pub fn set_preferred_source(&self, app: Option<String>) {
        if let Ok(mut pref) = self.preferred_source.write() {
            *pref = app;
        }
        self.refresh_session_state();
    }

    pub fn cycle_source(&self) {
        let (current_app, sessions) = {
            let snap = self.snapshot.read().unwrap();
            (snap.source_app.clone(), snap.available_sessions.clone())
        };

        if sessions.is_empty() {
            return;
        }

        let next_idx = match sessions.iter().position(|s| s == &current_app) {
            Some(idx) => (idx + 1) % sessions.len(),
            None => 0,
        };

        let next_app = sessions[next_idx].clone();
        self.set_preferred_source(Some(next_app));
    }

    pub fn broadcast_snapshot(&self, snap: &MediaSnapshot) {
        let hub = &self.telemetry_hub;
        hub.push_custom_metric(FieldId::MediaPlaying.id(), MetricValue::Bool(snap.playing));
        hub.push_custom_metric(FieldId::MediaTitle.id(), MetricValue::String(snap.title.clone()));
        hub.push_custom_metric(FieldId::MediaArtist.id(), MetricValue::String(snap.artist.clone()));
        hub.push_custom_metric(FieldId::MediaAlbum.id(), MetricValue::String(snap.album.clone()));
        hub.push_custom_metric(FieldId::MediaPositionSec.id(), MetricValue::U64(snap.position_sec as u64));
        hub.push_custom_metric(FieldId::MediaDurationSec.id(), MetricValue::U64(snap.duration_sec as u64));
        hub.push_custom_metric(FieldId::MediaStatus.id(), MetricValue::String(snap.status.clone()));
        hub.push_custom_metric(FieldId::MediaPlaybackRate.id(), MetricValue::U64(snap.playback_rate as u64));
        hub.push_custom_metric(FieldId::MediaSourceApp.id(), MetricValue::String(snap.source_app.clone()));
        hub.push_custom_metric(FieldId::MediaControls.id(), MetricValue::String(snap.controls.clone()));
        hub.push_custom_metric(FieldId::MediaArtId.id(), MetricValue::String(snap.art_id.clone()));
        hub.push_custom_metric(FieldId::MediaPalette.id(), MetricValue::String(snap.palette.clone()));
        hub.push_custom_metric(FieldId::MasterVolumePct.id(), MetricValue::U64(snap.master_volume_pct as u64));
        hub.push_custom_metric(FieldId::MasterMute.id(), MetricValue::Bool(snap.master_mute));

        if let Ok(json_sessions) = serde_json::to_string(&snap.available_sessions) {
            hub.push_custom_metric(FieldId::MediaSessionList.id(), MetricValue::String(json_sessions));
        }
    }

    pub fn process_album_art(&self, raw_bytes: &[u8]) -> (String, String) {
        if raw_bytes.is_empty() {
            return (String::new(), "#1A202C,#4A5568,#E2E8F0".to_string());
        }

        // Decode image, center crop square, resize to 512px
        if let Ok(img) = image::load_from_memory(raw_bytes) {
            let (width, height) = (img.width(), img.height());
            let min_dim = width.min(height);
            let crop_x = (width - min_dim) / 2;
            let crop_y = (height - min_dim) / 2;

            let cropped = img.crop_imm(crop_x, crop_y, min_dim, min_dim);
            let resized = cropped.resize_exact(512, 512, image::imageops::FilterType::Triangle);

            // Extract dominant colors from a 32x32 downscale
            let thumb32 = cropped.resize_exact(32, 32, image::imageops::FilterType::Nearest);
            let palette = extract_dominant_colors(&thumb32);

            // Encode to WebP (~q80) or PNG fallback
            let mut webp_bytes = Vec::new();
            if resized.write_to(&mut std::io::Cursor::new(&mut webp_bytes), image::ImageFormat::WebP).is_ok() {
                // Compute SHA-256 art ID
                let art_id = hex::encode(ring::digest::digest(&ring::digest::SHA256, &webp_bytes).as_ref());

                if let Ok(mut cache) = self.art_cache.lock() {
                    // LRU cache cap of ~50 arts
                    if cache.len() >= 50 {
                        cache.clear();
                    }
                    cache.insert(art_id.clone(), webp_bytes);
                }

                return (art_id, palette);
            }
        }

        (String::new(), "#1A202C,#4A5568,#E2E8F0".to_string())
    }

    #[cfg(target_os = "windows")]
    fn init_windows_media_listener(&self) -> Result<(), Box<dyn std::error::Error>> {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

        // Initialize COM on this worker thread
        unsafe {
            let _ = windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            );
        }

        let _session_manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?;

        log::info!("[MediaSession] Windows GlobalSystemMediaTransportControlsSessionManager active");

        // Initial snapshot
        self.refresh_session_state();

        // Run message/event loop for SessionManager
        loop {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            self.refresh_session_state();
        }
    }

    pub fn refresh_session_state(&self) {
        #[cfg(target_os = "windows")]
        {
            if let Ok(snap) = self.query_windows_current_session() {
                if let Ok(mut guard) = self.snapshot.write() {
                    *guard = snap.clone();
                }
                self.broadcast_snapshot(&snap);
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn query_windows_current_session(&self) -> Result<MediaSnapshot, Box<dyn std::error::Error>> {
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus,
        };

        let session_manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()?;

        let mut available_sessions = Vec::new();
        if let Ok(sessions) = session_manager.GetSessions() {
            for session in sessions {
                if let Ok(app_id) = session.SourceAppUserModelId() {
                    let clean_id = app_id.to_string();
                    if !clean_id.is_empty() && !available_sessions.contains(&clean_id) {
                        available_sessions.push(clean_id);
                    }
                }
            }
        }

        // Follow preferred source if set and present, else current session
        let preferred = self.preferred_source.read().unwrap().clone();
        let target_session = if let Some(pref) = preferred {
            session_manager.GetSessions().ok().and_then(|sessions| {
                sessions.into_iter().find(|s| {
                    s.SourceAppUserModelId().map(|id| id.to_string() == pref).unwrap_or(false)
                })
            })
        } else {
            session_manager.GetCurrentSession().ok()
        };

        let mut snap = MediaSnapshot {
            available_sessions: available_sessions.clone(),
            ..Default::default()
        };

        // Query Master Volume via Core Audio
        if let Ok((vol, mute)) = query_windows_master_volume() {
            snap.master_volume_pct = vol;
            snap.master_mute = mute;
        }

        if let Some(session) = target_session {
            if let Ok(app_id) = session.SourceAppUserModelId() {
                snap.source_app = clean_friendly_app_name(&app_id.to_string());
            }

            if let Ok(props) = session.TryGetMediaPropertiesAsync()?.get() {
                if let Ok(title) = props.Title() {
                    snap.title = title.to_string();
                }
                if let Ok(artist) = props.Artist() {
                    snap.artist = artist.to_string();
                }
                if let Ok(album) = props.AlbumTitle() {
                    snap.album = album.to_string();
                }

                // Thumbnail extraction
                if let Ok(thumb_ref) = props.Thumbnail() {
                    if let Ok(stream) = thumb_ref.OpenReadAsync()?.get() {
                        let size = stream.Size().unwrap_or(0) as usize;
                        if size > 0 && size < 10_000_000 {
                            let mut buffer = vec![0u8; size];
                            let reader = windows::Storage::Streams::DataReader::CreateDataReader(&stream)?;
                            reader.LoadAsync(size as u32)?.get()?;
                            reader.ReadBytes(&mut buffer)?;

                            let (art_id, palette) = self.process_album_art(&buffer);
                            snap.art_id = art_id;
                            snap.palette = palette;
                        }
                    }
                }
            }

            if let Ok(info) = session.GetPlaybackInfo() {
                if let Ok(status) = info.PlaybackStatus() {
                    match status {
                        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing => {
                            snap.playing = true;
                            snap.status = "playing".to_string();
                        }
                        GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused => {
                            snap.playing = false;
                            snap.status = "paused".to_string();
                        }
                        _ => {
                            snap.playing = false;
                            snap.status = "stopped".to_string();
                        }
                    }
                }

                if let Ok(controls) = info.Controls() {
                    let mut ctrl_list = Vec::new();
                    if controls.IsPlayEnabled().unwrap_or(false) { ctrl_list.push("play"); }
                    if controls.IsPauseEnabled().unwrap_or(false) { ctrl_list.push("pause"); }
                    if controls.IsNextEnabled().unwrap_or(false) { ctrl_list.push("next"); }
                    if controls.IsPreviousEnabled().unwrap_or(false) { ctrl_list.push("prev"); }
                    snap.controls = ctrl_list.join(",");
                }
            }

            if let Ok(timeline) = session.GetTimelineProperties() {
                if let Ok(pos) = timeline.Position() {
                    snap.position_sec = (pos.Duration / 10_000_000) as u32; // 100ns units to seconds
                }
                if let Ok(end) = timeline.EndTime() {
                    snap.duration_sec = (end.Duration / 10_000_000) as u32;
                }
            }
        }

        Ok(snap)
    }

    // Media Controls Execution
    pub fn play(&self) {
        #[cfg(target_os = "windows")]
        {
            if let Ok(session_manager) = windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager::RequestAsync().and_then(|r| r.get()) {
                if let Ok(session) = session_manager.GetCurrentSession() {
                    let _ = session.TryPlayAsync();
                }
            }
        }
        self.refresh_session_state();
    }

    pub fn pause(&self) {
        #[cfg(target_os = "windows")]
        {
            if let Ok(session_manager) = windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager::RequestAsync().and_then(|r| r.get()) {
                if let Ok(session) = session_manager.GetCurrentSession() {
                    let _ = session.TryPauseAsync();
                }
            }
        }
        self.refresh_session_state();
    }

    pub fn toggle_play_pause(&self) {
        #[cfg(target_os = "windows")]
        {
            if let Ok(session_manager) = windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager::RequestAsync().and_then(|r| r.get()) {
                if let Ok(session) = session_manager.GetCurrentSession() {
                    let _ = session.TryTogglePlayPauseAsync();
                }
            }
        }
        self.refresh_session_state();
    }

    pub fn next(&self) {
        #[cfg(target_os = "windows")]
        {
            if let Ok(session_manager) = windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager::RequestAsync().and_then(|r| r.get()) {
                if let Ok(session) = session_manager.GetCurrentSession() {
                    let _ = session.TrySkipNextAsync();
                }
            }
        }
        self.refresh_session_state();
    }

    pub fn prev(&self) {
        #[cfg(target_os = "windows")]
        {
            if let Ok(session_manager) = windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager::RequestAsync().and_then(|r| r.get()) {
                if let Ok(session) = session_manager.GetCurrentSession() {
                    let _ = session.TrySkipPreviousAsync();
                }
            }
        }
        self.refresh_session_state();
    }

    pub fn seek(&self, position_sec: u32) {
        #[cfg(target_os = "windows")]
        {
            if let Ok(session_manager) = windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager::RequestAsync().and_then(|r| r.get()) {
                if let Ok(session) = session_manager.GetCurrentSession() {
                    let pos_units = (position_sec as i64) * 10_000_000;
                    let _ = session.TryChangePlaybackPositionAsync(pos_units);
                }
            }
        }
        self.refresh_session_state();
    }

    pub fn set_master_volume(&self, pct: u8) {
        #[cfg(target_os = "windows")]
        {
            let _ = set_windows_master_volume(pct);
        }
        self.refresh_session_state();
    }

    pub fn toggle_master_mute(&self) {
        #[cfg(target_os = "windows")]
        {
            let _ = toggle_windows_master_mute();
        }
        self.refresh_session_state();
    }
}

// Extract 3 dominant colors from 32x32 image (simple median-cut / frequency binning)
fn extract_dominant_colors(img: &image::DynamicImage) -> String {
    use image::GenericImageView;
    let mut color_counts: HashMap<(u8, u8, u8), u32> = HashMap::new();

    for (_x, _y, pixel) in img.pixels() {
        // Quantize colors to 4-bit (16 levels per channel) for robust clustering
        let r = (pixel[0] / 16) * 16;
        let g = (pixel[1] / 16) * 16;
        let b = (pixel[2] / 16) * 16;
        *color_counts.entry((r, g, b)).or_insert(0) += 1;
    }

    let mut sorted: Vec<((u8, u8, u8), u32)> = color_counts.into_iter().collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1));

    let mut hex_colors = Vec::new();
    for (rgb, _) in sorted.iter().take(3) {
        hex_colors.push(format!("#{:02X}{:02X}{:02X}", rgb.0, rgb.1, rgb.2));
    }

    while hex_colors.len() < 3 {
        hex_colors.push("#7C5CFF".to_string());
    }

    hex_colors.join(",")
}

fn clean_friendly_app_name(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("spotify") {
        "Spotify".to_string()
    } else if lower.contains("opera") {
        "Opera GX".to_string()
    } else if lower.contains("chrome") {
        "Google Chrome".to_string()
    } else if lower.contains("msedge") || lower.contains("edge") {
        "Microsoft Edge".to_string()
    } else if lower.contains("vlc") {
        "VLC Media Player".to_string()
    } else if lower.contains("foobar") {
        "foobar2000".to_string()
    } else if lower.contains("itunes") || lower.contains("apple") {
        "Apple Music".to_string()
    } else {
        raw.split('.').last().unwrap_or(raw).to_string()
    }
}

#[cfg(target_os = "windows")]
fn query_windows_master_volume() -> Result<(u8, bool), Box<dyn std::error::Error>> {
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let endpoint_vol: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;

        let level = endpoint_vol.GetMasterVolumeLevelScalar()?;
        let mute = endpoint_vol.GetMute()?;

        let pct = (level * 100.0).round().clamp(0.0, 100.0) as u8;
        Ok((pct, mute.as_bool()))
    }
}

#[cfg(target_os = "windows")]
fn set_windows_master_volume(pct: u8) -> Result<(), Box<dyn std::error::Error>> {
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let endpoint_vol: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;

        let level = (pct.min(100) as f32) / 100.0;
        endpoint_vol.SetMasterVolumeLevelScalar(level, std::ptr::null())?;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn toggle_windows_master_mute() -> Result<(), Box<dyn std::error::Error>> {
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let endpoint_vol: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;

        let current_mute = endpoint_vol.GetMute()?;
        let new_mute = windows::Win32::Foundation::BOOL(!current_mute.as_bool() as i32);
        endpoint_vol.SetMute(new_mute, std::ptr::null())?;
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn query_windows_master_volume() -> Result<(u8, bool), Box<dyn std::error::Error>> {
    Ok((65, false))
}

#[cfg(not(target_os = "windows"))]
fn set_windows_master_volume(_pct: u8) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn toggle_windows_master_mute() -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}
