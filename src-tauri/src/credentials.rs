use keyring::Entry;

const SERVICE: &str = "Quota Float";

fn entry(source: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, source).map_err(|_| "secure credential storage is unavailable".into())
}

pub fn load(source: &str) -> Result<String, String> {
    entry(source)?
        .get_password()
        .map_err(|_| "source credential is unavailable; reconnect the source".into())
}

pub fn save(source: &str, secret: &str) -> Result<(), String> {
    if secret.trim().is_empty() {
        return Err("credential is required".into());
    }
    entry(source)?
        .set_password(secret.trim())
        .map_err(|_| "could not save the credential in the system vault".into())
}

pub fn delete(source: &str) -> Result<(), String> {
    match entry(source)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("could not remove the credential from the system vault".into()),
    }
}
