use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use toml_edit::{value, DocumentMut};

use crate::models::CodexProxyConfigStatus;

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

pub fn inspect_proxy_config(home: &Path, host: &str, port: u16) -> CodexProxyConfigStatus {
    let path = config_file(home);
    let backup = backup_file(home);
    let expected = proxy_base_url(host, port);
    let config_exists = path.exists();
    let backup_exists = backup.exists();
    let mut status = CodexProxyConfigStatus {
        config_exists,
        backup_exists,
        installed: false,
        expected_base_url: expected.clone(),
        current_base_url: None,
        error: None,
    };
    if !config_exists {
        return status;
    }
    let contents = match std::fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) => {
            status.error = Some(format!("读取 config.toml 失败：{error}"));
            return status;
        }
    };
    let doc = match contents.parse::<DocumentMut>() {
        Ok(doc) => doc,
        Err(error) => {
            status.error = Some(format!("解析 config.toml 失败：{error}"));
            return status;
        }
    };
    status.current_base_url = doc
        .get("chatgpt_base_url")
        .and_then(|item| item.as_str())
        .map(str::to_string);
    status.installed = status.current_base_url.as_deref() == Some(expected.as_str());
    status
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

    #[test]
    fn inspect_reports_current_and_expected_proxy_url() {
        let home = temp_home();
        std::fs::write(
            home.join("config.toml"),
            "chatgpt_base_url = \"http://127.0.0.1:14550/backend-api\"\n",
        )
        .unwrap();
        let status = inspect_proxy_config(&home, "127.0.0.1", 14550);
        assert!(status.config_exists);
        assert!(status.installed);
        assert_eq!(
            status.current_base_url.as_deref(),
            Some("http://127.0.0.1:14550/backend-api")
        );
        assert_eq!(status.expected_base_url, status.current_base_url.unwrap());
        let _ = std::fs::remove_dir_all(home);
    }
}
