//! Anonymous PNG upload via catbox.moe — used when the server has the
//! SkinRestorer plugin so players can run `/skin set <url>` once and have
//! their skin remembered server-side.
//!
//! catbox.moe accepts unauthenticated multipart POSTs and returns a plain
//! text URL like `https://files.catbox.moe/abcd.png`. The file is
//! permanent unless the uploader requests deletion.

use std::path::Path;

use reqwest::multipart::{Form, Part};

use crate::error::{Error, Result};

const ENDPOINT: &str = "https://catbox.moe/user/api.php";

/// Upload `skin_png` and return the resulting public URL.
pub async fn upload(http: &reqwest::Client, skin_png: &Path) -> Result<String> {
    let bytes = std::fs::read(skin_png)
        .map_err(|e| Error::Custom(format!("Lecture skin échouée : {}", e)))?;
    let filename = skin_png
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("skin.png")
        .to_string();

    let part = Part::bytes(bytes)
        .file_name(filename)
        .mime_str("image/png")
        .map_err(|e| Error::Custom(format!("mime: {}", e)))?;

    let form = Form::new()
        .text("reqtype", "fileupload")
        .part("fileToUpload", part);

    let resp = http
        .post(ENDPOINT)
        .multipart(form)
        .send()
        .await
        .map_err(|e| Error::Custom(format!("catbox unreachable: {}", e)))?;

    if !resp.status().is_success() {
        return Err(Error::Custom(format!(
            "catbox HTTP {}",
            resp.status().as_u16()
        )));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| Error::Custom(format!("catbox parse: {}", e)))?;
    let body = body.trim();
    if !body.starts_with("https://files.catbox.moe/") {
        return Err(Error::Custom(format!(
            "catbox returned unexpected payload: {}",
            body
        )));
    }
    Ok(body.to_string())
}
