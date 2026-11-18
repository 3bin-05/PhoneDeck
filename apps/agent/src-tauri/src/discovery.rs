use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;

pub struct MdnsAdvertiser {
    daemon: ServiceDaemon,
    fullname: String,
}

impl MdnsAdvertiser {
    pub fn start(
        agent_id: &str,
        port: u16,
        fingerprint: &str,
    ) -> Result<Self, String> {
        let daemon = ServiceDaemon::new().map_err(|e| format!("Failed to create mDNS daemon: {}", e))?;
        let service_type = "_phonedeck._tcp.local.";
        let instance_name = agent_id;
        let host_name = format!("{}.local.", agent_id);

        let mut txt_properties = HashMap::new();
        txt_properties.insert("id".to_string(), agent_id.to_string());
        txt_properties.insert("fp".to_string(), fingerprint.to_string());
        txt_properties.insert("v".to_string(), protocol::PROTOCOL_VERSION.to_string());

        let service_info = ServiceInfo::new(
            service_type,
            instance_name,
            &host_name,
            "",
            port,
            txt_properties,
        )
        .map_err(|e| format!("Failed to construct ServiceInfo: {}", e))?;

        let fullname = service_info.get_fullname().to_string();
        daemon
            .register(service_info)
            .map_err(|e| format!("Failed to register mDNS service: {}", e))?;

        log::info!("[mDNS] Advertised service {} on port {}", fullname, port);

        Ok(Self { daemon, fullname })
    }

    pub fn stop(&self) {
        let _ = self.daemon.unregister(&self.fullname);
    }
}
