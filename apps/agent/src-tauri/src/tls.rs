use protocol::compute_cert_fingerprint;
use rcgen::{CertificateParams, DistinguishedName, DnType, KeyPair, SanType};
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::ServerConfig;
use std::fs;
use std::net::IpAddr;
use std::path::Path;
use std::sync::Arc;

pub struct TlsManager {
    pub cert_der: Vec<u8>,
    pub key_der: Vec<u8>,
    pub fingerprint: String,
    pub server_config: Arc<ServerConfig>,
}

impl TlsManager {
    /// Load existing TLS certificate from storage, or generate a new self-signed one with rcgen.
    pub fn load_or_generate(storage_dir: &Path, lan_ips: &[IpAddr]) -> Result<Self, String> {
        let tls_dir = storage_dir.join("tls");
        fs::create_dir_all(&tls_dir).map_err(|e| format!("Failed to create tls dir: {}", e))?;

        let cert_path = tls_dir.join("cert.der");
        let key_path = tls_dir.join("key.der");

        let (cert_der, key_der) = if cert_path.exists() && key_path.exists() {
            log::info!("[TLS] Loading existing self-signed cert from {:?}", cert_path);
            let cert_bytes = fs::read(&cert_path).map_err(|e| format!("Read cert failed: {}", e))?;
            let key_bytes = fs::read(&key_path).map_err(|e| format!("Read key failed: {}", e))?;
            (cert_bytes, key_bytes)
        } else {
            log::info!("[TLS] Generating new self-signed certificate with rcgen...");
            let (cert_bytes, key_bytes) = generate_self_signed_cert(lan_ips)?;
            fs::write(&cert_path, &cert_bytes).map_err(|e| format!("Write cert failed: {}", e))?;
            fs::write(&key_path, &key_bytes).map_err(|e| format!("Write key failed: {}", e))?;
            (cert_bytes, key_bytes)
        };

        let fingerprint = compute_cert_fingerprint(&cert_der);
        log::info!("[TLS] Certificate SHA-256 fingerprint: {}", fingerprint);

        // Build rustls ServerConfig
        let cert_chain = vec![CertificateDer::from(cert_der.clone())];
        let private_key = PrivateKeyDer::try_from(key_der.clone())
            .map_err(|e| format!("Invalid private key format: {:?}", e))?;

        let mut server_config = ServerConfig::builder_with_provider(Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("Protocol versions error: {:?}", e))?
        .with_no_client_auth()
        .with_single_cert(cert_chain, private_key)
        .map_err(|e| format!("ServerConfig creation error: {:?}", e))?;

        server_config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];

        Ok(Self {
            cert_der,
            key_der,
            fingerprint,
            server_config: Arc::new(server_config),
        })
    }
}

fn generate_self_signed_cert(lan_ips: &[IpAddr]) -> Result<(Vec<u8>, Vec<u8>), String> {
    let mut params = CertificateParams::default();
    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, "PhoneDeckAgent");
    dn.push(DnType::OrganizationName, "Phone Deck");
    params.distinguished_name = dn;

    // Subject Alternative Names (SANs)
    let mut sans = vec![
        SanType::DnsName("localhost".to_string().try_into().map_err(|e| format!("{:?}", e))?),
        SanType::IpAddress(IpAddr::from([127, 0, 0, 1])),
    ];

    for ip in lan_ips {
        sans.push(SanType::IpAddress(*ip));
    }

    params.subject_alt_names = sans;

    let key_pair = KeyPair::generate().map_err(|e| format!("KeyPair gen error: {}", e))?;
    let cert = params
        .self_signed(&key_pair)
        .map_err(|e| format!("Self-signed cert error: {}", e))?;

    let cert_der = cert.der().to_vec();
    let key_der = key_pair.serialize_der();

    Ok((cert_der, key_der))
}
