use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::PathBuf};
use tauri::command;
use uuid::Uuid;

const KEY_ID: &str = "supporter-v1";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LicenseDocument {
    version: u8,
    skin_id: String,
    device_hash: String,
    issued_at: String,
    license_id: String,
    key_id: String,
    signature: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IssuedLicense {
    license: String,
    license_id: String,
    issued_at: String,
    device_prefix: String,
    ledger_path: Option<String>,
    ledger_error: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LedgerRecord {
    issued_at: String,
    buyer_name: String,
    order_number: String,
    skin_id: String,
    device_request_code: String,
    license_id: String,
    key_id: String,
    status: String,
    cancelled_at: Option<String>,
    cancellation_note: Option<String>,
}

fn signing_key(value: &str) -> Result<SigningKey, String> {
    let bytes = STANDARD
        .decode(value.trim())
        .map_err(|_| "私钥必须是 Base64 编码。".to_string())?;
    let bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "私钥必须是 32-byte Ed25519 seed。".to_string())?;
    Ok(SigningKey::from_bytes(&bytes))
}

fn payload(document: &LicenseDocument) -> String {
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

fn csv_cell(value: &str) -> String {
    format!(
        "\"{}\"",
        value.replace('"', "\"\"").replace(['\r', '\n'], " ")
    )
}

fn ledger_path() -> Result<PathBuf, String> {
    let root = dirs::document_dir()
        .or_else(dirs::data_local_dir)
        .ok_or_else(|| "无法确定本地文档目录。".to_string())?;
    let folder = root.join("Quota Float Maintainer Issuer");
    fs::create_dir_all(&folder).map_err(|_| "无法创建台账目录。".to_string())?;
    Ok(folder.join("issuance-ledger.csv"))
}

fn ledger_json_path() -> Result<PathBuf, String> {
    Ok(ledger_path()?.with_file_name("issuance-ledger.json"))
}

fn read_ledger() -> Result<Vec<LedgerRecord>, String> {
    let path = ledger_json_path()?;
    if !path.exists() { return Ok(Vec::new()); }
    let raw = fs::read_to_string(path).map_err(|_| "无法读取本地签发台账。".to_string())?;
    serde_json::from_str(&raw).map_err(|_| "本地签发台账格式无效。".to_string())
}

fn write_ledger(records: &[LedgerRecord]) -> Result<(), String> {
    let path = ledger_json_path()?;
    let raw = serde_json::to_string_pretty(records).map_err(|_| "无法编码本地签发台账。".to_string())?;
    fs::write(path, raw).map_err(|_| "无法写入本地签发台账。".to_string())
}

fn append_ledger(document: &LicenseDocument, buyer_name: &str, order_number: &str) -> Result<String, String> {
    let path = ledger_path()?;
    let is_new = !path.exists();
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|_| "无法打开 Excel 台账文件。".to_string())?;
    if is_new {
        file.write_all(
            b"\xEF\xBB\xBFissuedAt,buyerOrOrder,skinId,deviceRequestCode,licenseId,keyId\r\n",
        )
        .map_err(|_| "无法写入 Excel 台账标题。".to_string())?;
    }
    let row = [
        document.issued_at.as_str(),
        &format!("{} | {}", buyer_name, order_number),
        document.skin_id.as_str(),
        document.device_hash.as_str(),
        document.license_id.as_str(),
        document.key_id.as_str(),
    ]
    .into_iter()
    .map(csv_cell)
    .collect::<Vec<_>>()
    .join(",")
        + "\r\n";
    file.write_all(row.as_bytes())
        .map_err(|_| "无法写入 Excel 台账记录。".to_string())?;
    let mut records = read_ledger()?;
    records.push(LedgerRecord {
        issued_at: document.issued_at.clone(), buyer_name: buyer_name.into(), order_number: order_number.into(), skin_id: document.skin_id.clone(), device_request_code: document.device_hash.clone(), license_id: document.license_id.clone(), key_id: document.key_id.clone(), status: "issued".into(), cancelled_at: None, cancellation_note: None,
    });
    write_ledger(&records)?;
    Ok(path.display().to_string())
}

#[command]
fn issue_license(
    skin_id: String,
    device_hash: String,
    buyer_name: String,
    order_number: String,
    private_key: String,
) -> Result<IssuedLicense, String> {
    if !matches!(skin_id.as_str(), "blur" | "computer") {
        return Err("只允许签发 Blur 或 Computer 内置皮肤。".into());
    }
    if !device_hash.starts_with("QF1-") || device_hash.len() < 12 {
        return Err("设备请求码必须是完整的 QF1-… 代码。".into());
    }
    if buyer_name.trim().is_empty() || order_number.trim().is_empty() {
        return Err("请填写订单名称和订单号，以便写入台账。".into());
    }
    let key = signing_key(&private_key)?;
    let issued_at = Utc::now().to_rfc3339();
    let mut document = LicenseDocument {
        version: 1,
        skin_id,
        device_hash,
        issued_at: issued_at.clone(),
        license_id: Uuid::new_v4().to_string(),
        key_id: KEY_ID.into(),
        signature: String::new(),
    };
    document.signature = STANDARD.encode(key.sign(payload(&document).as_bytes()).to_bytes());
    let (ledger_path, ledger_error) = match append_ledger(&document, buyer_name.trim(), order_number.trim()) {
        Ok(path) => (Some(path), None),
        Err(error) => (None, Some(error)),
    };
    let device_prefix = document.device_hash.chars().take(16).collect();
    let license_id = document.license_id.clone();
    let license =
        serde_json::to_string_pretty(&document).map_err(|_| "无法编码许可证 JSON。".to_string())?;
    Ok(IssuedLicense {
        license,
        license_id,
        issued_at,
        device_prefix,
        ledger_path,
        ledger_error,
    })
}

#[command]
fn list_ledger() -> Result<Vec<LedgerRecord>, String> {
    let mut records = read_ledger()?;
    records.sort_by(|a, b| b.issued_at.cmp(&a.issued_at));
    Ok(records)
}

#[command]
fn cancel_issuance(license_id: String) -> Result<(), String> {
    let mut records = read_ledger()?;
    let record = records.iter_mut().find(|record| record.license_id == license_id).ok_or_else(|| "未找到对应的签发记录。".to_string())?;
    if record.status == "cancelled" { return Ok(()); }
    record.status = "cancelled".into();
    record.cancelled_at = Some(Utc::now().to_rfc3339());
    record.cancellation_note = Some("本地运营记录取消；不会使客户端许可证失效。".into());
    write_ledger(&records)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![issue_license, list_ledger, cancel_issuance])
        .run(tauri::generate_context!())
        .expect("error while running maintainer issuer");
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Verifier};
    #[test]
    fn issued_document_uses_the_shared_license_payload() {
        let key = SigningKey::from_bytes(&[7; 32]);
        let mut document = LicenseDocument {
            version: 1,
            skin_id: "computer".into(),
            device_hash: "QF1-TEST-REQUEST".into(),
            issued_at: "2026-07-21T00:00:00Z".into(),
            license_id: "license-id".into(),
            key_id: KEY_ID.into(),
            signature: String::new(),
        };
        document.signature = STANDARD.encode(key.sign(payload(&document).as_bytes()).to_bytes());
        let signature =
            Signature::from_slice(&STANDARD.decode(&document.signature).unwrap()).unwrap();
        assert!(key
            .verifying_key()
            .verify(payload(&document).as_bytes(), &signature)
            .is_ok());
    }

    #[test]
    fn csv_cells_are_safe_for_excel() {
        assert_eq!(csv_cell("Buyer \"A\"\nOrder"), "\"Buyer \"\"A\"\" Order\"");
    }
}
