use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use serde::Serialize;

pub const LICENSE_VERSION: u8 = 1;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseDocument {
    pub version: u8,
    pub skin_id: String,
    pub device_hash: String,
    pub issued_at: String,
    pub license_id: String,
    pub key_id: String,
    pub signature: String,
}

pub fn canonical_payload(document: &LicenseDocument) -> String {
    [
        document.version.to_string(),
        document.skin_id.clone(),
        document.device_hash.clone(),
        document.issued_at.clone(),
        document.license_id.clone(),
        document.key_id.clone(),
    ]
    .join("\n")
}

pub fn signing_key_from_base64(value: &str) -> Result<SigningKey, String> {
    let bytes = STANDARD
        .decode(value.trim())
        .map_err(|_| "private key must be base64".to_string())?;
    let bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "private key must contain a 32-byte seed".to_string())?;
    Ok(SigningKey::from_bytes(&bytes))
}

pub fn public_key_base64(key: &SigningKey) -> String {
    STANDARD.encode(key.verifying_key().as_bytes())
}

pub fn private_key_base64(key: &SigningKey) -> String {
    STANDARD.encode(key.to_bytes())
}

pub fn sign(mut document: LicenseDocument, key: &SigningKey) -> LicenseDocument {
    document.signature =
        STANDARD.encode(key.sign(canonical_payload(&document).as_bytes()).to_bytes());
    document
}

pub fn verify_for_test(document: &LicenseDocument, key: &VerifyingKey) -> bool {
    use ed25519_dalek::{Signature, Verifier};
    STANDARD
        .decode(&document.signature)
        .ok()
        .and_then(|bytes| Signature::from_slice(&bytes).ok())
        .map(|signature| {
            key.verify(canonical_payload(document).as_bytes(), &signature)
                .is_ok()
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand_core::OsRng;

    #[test]
    fn key_and_license_round_trip() {
        let key = SigningKey::generate(&mut OsRng);
        let license = sign(
            LicenseDocument {
                version: 1,
                skin_id: "blur".into(),
                device_hash: "QF1-TEST".into(),
                issued_at: "2026-07-17T00:00:00Z".into(),
                license_id: "test".into(),
                key_id: "supporter-v1".into(),
                signature: String::new(),
            },
            &key,
        );
        assert!(verify_for_test(&license, &key.verifying_key()));
        assert!(signing_key_from_base64(&private_key_base64(&key)).is_ok());
    }
}
