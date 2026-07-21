use chrono::Utc;
use quota_float_license_cli::{
    private_key_base64, public_key_base64, sign, signing_key_from_base64, LicenseDocument,
    LICENSE_VERSION,
};
use rand_core::OsRng;
use std::{env, fs};
use uuid::Uuid;

fn usage() -> ! {
    eprintln!("Usage:\n  license-cli generate-key --key-id supporter-v1\n  license-cli sign --skin-id blur|computer --device-hash QF1-... --private-key-file private.key [--key-id supporter-v1] [--license-id id] [--issued-at RFC3339]");
    std::process::exit(2);
}

fn value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|item| item == flag)
        .and_then(|index| args.get(index + 1))
        .cloned()
}

fn main() -> Result<(), String> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let command = args.first().map(String::as_str).unwrap_or("");
    match command {
        "generate-key" => {
            let key_id = value(&args, "--key-id").unwrap_or_else(|| "supporter-v1".into());
            if key_id != "supporter-v1" {
                return Err("only supporter-v1 is accepted by the desktop app".into());
            }
            let key = ed25519_dalek::SigningKey::generate(&mut OsRng);
            println!(
                "keyId: {key_id}\npublicKeyBase64: {}\nprivateKeyBase64: {}",
                public_key_base64(&key),
                private_key_base64(&key)
            );
            eprintln!("Keep privateKeyBase64 offline. Set QUOTA_FLOAT_LICENSE_PUBLIC_KEY to publicKeyBase64 only when building the desktop app.");
        }
        "sign" => {
            let skin_id = value(&args, "--skin-id").unwrap_or_else(|| usage());
            if !matches!(skin_id.as_str(), "blur" | "computer") {
                return Err("only built-in supporter skins can be signed by this CLI; currently: blur, computer".into());
            }
            let device_hash = value(&args, "--device-hash").unwrap_or_else(|| usage());
            if !device_hash.starts_with("QF1-") {
                return Err("device hash must be a QF1 request code".into());
            }
            let private_key = if let Some(path) = value(&args, "--private-key-file") {
                fs::read_to_string(path)
                    .map_err(|_| "unable to read private key file".to_string())?
            } else {
                env::var("QUOTA_FLOAT_LICENSE_PRIVATE_KEY").map_err(|_| {
                    "provide --private-key-file or QUOTA_FLOAT_LICENSE_PRIVATE_KEY".to_string()
                })?
            };
            let key = signing_key_from_base64(&private_key)?;
            let key_id = value(&args, "--key-id").unwrap_or_else(|| "supporter-v1".into());
            if key_id != "supporter-v1" {
                return Err("only supporter-v1 is accepted by the desktop app".into());
            }
            let document = sign(
                LicenseDocument {
                    version: LICENSE_VERSION,
                    skin_id,
                    device_hash,
                    issued_at: value(&args, "--issued-at")
                        .unwrap_or_else(|| Utc::now().to_rfc3339()),
                    license_id: value(&args, "--license-id")
                        .unwrap_or_else(|| Uuid::new_v4().to_string()),
                    key_id,
                    signature: String::new(),
                },
                &key,
            );
            let license = serde_json::to_string_pretty(&document)
                .map_err(|_| "unable to encode license".to_string())?;
            println!("{license}");
            eprintln!(
                "Verification summary: skinId={}, deviceHashPrefix={}, licenseId={}",
                document.skin_id,
                &document.device_hash[..document.device_hash.len().min(12)],
                document.license_id
            );
        }
        _ => usage(),
    }
    Ok(())
}
