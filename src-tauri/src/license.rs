use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(target_os = "macos")]
use std::process::Command;

pub const LICENSE_VERSION: u8 = 1;
pub const BLUR_SKIN_ID: &str = "blur";
pub const COMPUTER_SKIN_ID: &str = "computer";

pub fn is_supported_skin_id(skin_id: &str) -> bool {
    matches!(skin_id, BLUR_SKIN_ID | COMPUTER_SKIN_ID)
}
const DEVICE_SALT: &str = "quota-float/supporter-license/v1";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupporterStatus {
    pub request_code: String,
    pub active: bool,
    pub message: String,
    pub unlocked_skin: Option<String>,
    pub unlocked_skins: Vec<String>,
    pub selected_skin: String,
    pub available_skins: Vec<String>,
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

pub fn request_code_from_raw(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(DEVICE_SALT.as_bytes());
    hasher.update([0]);
    hasher.update(raw.trim().as_bytes());
    let digest = hasher.finalize().iter().map(|byte| format!("{byte:02X}")).collect::<String>();
    format!("QF1-{}-{}-{}-{}", &digest[0..8], &digest[8..16], &digest[16..24], &digest[24..32])
}

pub fn device_request_code() -> Result<String, String> {
    let raw = platform_device_identifier()?;
    Ok(request_code_from_raw(&raw))
}

#[cfg(target_os = "windows")]
fn platform_device_identifier() -> Result<String, String> {
    use winreg::{enums::HKEY_LOCAL_MACHINE, RegKey};

    // Avoid spawning reg.exe: GUI processes can have a constrained PATH or
    // child-process policy, while the registry API is available to normal
    // desktop users without administrator rights.
    let machine = RegKey::predef(HKEY_LOCAL_MACHINE);
    let cryptography = machine
        .open_subkey(r"SOFTWARE\Microsoft\Cryptography")
        .map_err(|_| "unable to read Windows device identifier".to_string())?;
    let value = cryptography
        .get_value::<String, _>("MachineGuid")
        .map_err(|_| "unable to read Windows device identifier".to_string())?;
    let value = value.trim();
    if value.is_empty() {
        Err("Windows device identifier is unavailable".into())
    } else {
        Ok(value.to_owned())
    }
}

#[cfg(target_os = "macos")]
fn platform_device_identifier() -> Result<String, String> {
    let output = Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .map_err(|_| "unable to read macOS device identifier".to_string())?;
    if !output.status.success() {
        return Err("unable to read macOS device identifier".into());
    }
    extract_macos_platform_uuid(&String::from_utf8_lossy(&output.stdout))
        .ok_or_else(|| "macOS device identifier is unavailable".into())
}

#[cfg(any(target_os = "macos", test))]
fn extract_macos_platform_uuid(text: &str) -> Option<String> {
    text.lines()
        .find_map(|line| line.contains("IOPlatformUUID").then(|| line).and_then(|line| line.split_once('=').and_then(|(_, value)| value.split('"').nth(1))).map(str::to_owned))
        .filter(|value| !value.is_empty())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn platform_device_identifier() -> Result<String, String> {
    Err("supporter skins are available on Windows and macOS only".into())
}

fn public_key(key_id: &str) -> Result<VerifyingKey, String> {
    if key_id != "supporter-v1" {
        return Err("unknown license signing key".into());
    }
    let encoded = option_env!("QUOTA_FLOAT_LICENSE_PUBLIC_KEY")
        .ok_or_else(|| "license public key is not configured in this build".to_string())?;
    let bytes = STANDARD.decode(encoded).map_err(|_| "license public key is invalid".to_string())?;
    let bytes: [u8; 32] = bytes.try_into().map_err(|_| "license public key has an invalid length".to_string())?;
    VerifyingKey::from_bytes(&bytes).map_err(|_| "license public key is invalid".to_string())
}

pub fn parse_and_verify(raw: &str, request_code: &str) -> Result<LicenseDocument, String> {
    let document: LicenseDocument = serde_json::from_str(raw.trim()).map_err(|_| "license format is invalid".to_string())?;
    let key = public_key(&document.key_id)?;
    verify_document(document, request_code, &key)
}

fn verify_document(document: LicenseDocument, request_code: &str, key: &VerifyingKey) -> Result<LicenseDocument, String> {
    if document.version != LICENSE_VERSION {
        return Err("license version is not supported".into());
    }
    if !is_supported_skin_id(&document.skin_id) {
        return Err("license skin is not available in this build".into());
    }
    if document.device_hash != request_code {
        return Err("license is for a different device".into());
    }
    let signature_bytes = STANDARD.decode(&document.signature).map_err(|_| "license signature is invalid".to_string())?;
    let signature = Signature::from_slice(&signature_bytes).map_err(|_| "license signature is invalid".to_string())?;
    key.verify(canonical_payload(&document).as_bytes(), &signature)
        .map_err(|_| "license signature could not be verified".to_string())?;
    Ok(document)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn request_codes_are_stable_and_do_not_expose_raw_identifiers() {
        let code = request_code_from_raw("MachineGuid-secret");
        assert_eq!(code, request_code_from_raw("MachineGuid-secret"));
        assert_ne!(code, request_code_from_raw("another-machine"));
        assert!(!code.contains("secret"));
        assert!(code.starts_with("QF1-"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_can_generate_a_device_request_code() {
        let code = device_request_code().expect("Windows MachineGuid should be readable by a standard user");
        assert!(code.starts_with("QF1-"));
        assert_eq!(code.len(), 39);
    }

    #[test]
    fn parses_macos_platform_uuid_output() {
        assert_eq!(extract_macos_platform_uuid("  | |   \"IOPlatformUUID\" = \"ABC-123\"\n"), Some("ABC-123".into()));
    }

    #[test]
    fn canonical_payload_excludes_signature() {
        let document = LicenseDocument { version: 1, skin_id: BLUR_SKIN_ID.into(), device_hash: "QF1-TEST".into(), issued_at: "2026-01-01T00:00:00Z".into(), license_id: "license-1".into(), key_id: "supporter-v1".into(), signature: "ignored".into() };
        assert!(!canonical_payload(&document).contains("ignored"));
    }

    #[test]
    fn signed_license_rejects_tampering_and_other_devices() {
        let key = SigningKey::from_bytes(&[7; 32]);
        let request_code = request_code_from_raw("same-machine");
        let mut document = LicenseDocument { version: 1, skin_id: BLUR_SKIN_ID.into(), device_hash: request_code.clone(), issued_at: "2026-01-01T00:00:00Z".into(), license_id: "license-1".into(), key_id: "supporter-v1".into(), signature: String::new() };
        document.signature = STANDARD.encode(key.sign(canonical_payload(&document).as_bytes()).to_bytes());
        assert!(verify_document(document.clone(), &request_code, &key.verifying_key()).is_ok());
        assert!(verify_document(document.clone(), &request_code_from_raw("other-machine"), &key.verifying_key()).is_err());
        document.skin_id = "other".into();
        assert!(verify_document(document, &request_code, &key.verifying_key()).is_err());
    }

}
