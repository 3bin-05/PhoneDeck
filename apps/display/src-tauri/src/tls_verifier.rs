use protocol::{compute_cert_fingerprint, subtle_eq};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{verify_tls12_signature, verify_tls13_signature};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{CertificateError, DigitallySignedStruct, Error as RustlsError, SignatureScheme};
use std::sync::Arc;

/// A custom rustls server certificate verifier that enforces a pinned SHA-256 fingerprint.
/// It verifies that the presented leaf certificate's SHA-256 fingerprint exactly matches
/// the expected hex-encoded fingerprint obtained from the QR code pairing payload.
#[derive(Debug)]
pub struct PinnedFingerprintVerifier {
    pub pinned_fingerprint: String,
}

impl PinnedFingerprintVerifier {
    pub fn new(fingerprint: &str) -> Arc<Self> {
        Arc::new(Self {
            pinned_fingerprint: fingerprint.to_lowercase(),
        })
    }
}

impl ServerCertVerifier for PinnedFingerprintVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, RustlsError> {
        let actual_fp = compute_cert_fingerprint(end_entity.as_ref());
        if subtle_eq(&actual_fp, &self.pinned_fingerprint) {
            log::info!("[TLS] Server certificate fingerprint verified: {}", actual_fp);
            Ok(ServerCertVerified::assertion())
        } else {
            log::error!(
                "[TLS] Certificate fingerprint mismatch! Expected: {}, Presented: {}",
                self.pinned_fingerprint,
                actual_fp
            );
            Err(RustlsError::InvalidCertificate(
                CertificateError::ApplicationVerificationFailure,
            ))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls12_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls13_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}
