use std::net::{IpAddr, Ipv4Addr, UdpSocket};

/// Discover outbound LAN IPv4 address and any other valid local IPv4 interfaces.
pub fn get_lan_ips() -> Vec<IpAddr> {
    let mut ips = Vec::new();

    // Outbound LAN route discovery (connects to dummy external IP to determine routing interface)
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip();
                if !ip.is_loopback() {
                    ips.push(ip);
                }
            }
        }
    }

    if ips.is_empty() {
        ips.push(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)));
    }

    ips
}
