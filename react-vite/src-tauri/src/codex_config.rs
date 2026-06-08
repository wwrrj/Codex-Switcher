use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use toml_edit::{value, DocumentMut};

fn config_file(home: &Path) -> PathBuf {
    home.join("config.toml")
}

fn backup_file(home: &Path) -> PathBuf {
    home.join("config").join("proxy_config_backup.toml")
}

pub fn proxy_base_url(host: &str, port: u16) -> String {
    format!("http://{host}:{port}/backend-api")
}

pub fn install_proxy_config(home: &Path, host: &str, port: u16) -> Result<String> {
    let path = config_file(home);
    let backup = backup_file(home);
    if let Some(parent) = backup.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if path.exists() && !backup.exists() {
        std::fs::copy(&path, &backup).with_context(|| "备份 Codex config.toml 失败")?;
    }

    let original = if path.exists() {
        std::fs::read_to_string(&path)?
    } else {
        String::new()
    };
    let mut doc = original
        .parse::<DocumentMut>()
        .unwrap_or_else(|_| DocumentMut::new());
    let url = proxy_base_url(host, port);
    doc["chatgpt_base_url"] = value(url.clone());
    std::fs::write(&path, doc.to_string())?;
    Ok(url)
}

pub fn restore_proxy_config(home: &Path) -> Result<bool> {
    let path = config_file(home);
    let backup = backup_file(home);
    if backup.exists() {
        std::fs::copy(&backup, &path).with_context(|| "恢复 Codex config.toml 失败")?;
        std::fs::remove_file(&backup).ok();
        return Ok(true);
    }

    if path.exists() {
        let original = std::fs::read_to_string(&path)?;
        let mut doc = original
            .parse::<DocumentMut>()
            .unwrap_or_else(|_| DocumentMut::new());
        if doc.contains_key("chatgpt_base_url") {
            doc.remove("chatgpt_base_url");
            std::fs::write(&path, doc.to_string())?;
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn is_proxy_config_installed(home: &Path, host: &str, port: u16) -> bool {
    let path = config_file(home);
    let Ok(contents) = std::fs::read_to_string(path) else {
        return false;
    };
    let Ok(doc) = contents.parse::<DocumentMut>() else {
        return false;
    };
    doc.get("chatgpt_base_url")
        .and_then(|item| item.as_str())
        .is_some_and(|url| url == proxy_base_url(host, port))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_home() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "codex-switcher-config-test-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn install_and_restore_preserves_other_fields() {
        let home = temp_home();
        std::fs::write(home.join("config.toml"), "model = \"gpt-4.1\"\n").unwrap();
        install_proxy_config(&home, "127.0.0.1", 14550).unwrap();
        let installed = std::fs::read_to_string(home.join("config.toml")).unwrap();
        assert!(installed.contains("chatgpt_base_url"));
        assert!(installed.contains("model"));
        restore_proxy_config(&home).unwrap();
        let restored = std::fs::read_to_string(home.join("config.toml")).unwrap();
        assert_eq!(restored, "model = \"gpt-4.1\"\n");
        let _ = std::fs::remove_dir_all(home);
    }
}
