//! Remote news feed.
//!
//! Hosted as a static JSON at `config::NEWS_URL`. Example shape:
//! ```json
//! [
//!   {
//!     "id": "1.0-launch",
//!     "title": "MoonCraft is live!",
//!     "subtitle": "Season 1 begins",
//!     "body": "Markdown supported.",
//!     "image": "https://.../banner.jpg",
//!     "tag": "EVENT",
//!     "published_at": "2026-05-17T18:00:00Z"
//!   }
//! ]
//! ```

use serde::{Deserialize, Serialize};

use crate::config;
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsEntry {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    pub body: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub tag: Option<String>,
    pub published_at: String,
}

pub async fn fetch() -> Result<Vec<NewsEntry>> {
    let http = reqwest::Client::builder()
        .user_agent(config::USER_AGENT)
        .timeout(std::time::Duration::from_secs(15))
        .https_only(true)
        .build()?;
    let res = http.get(config::NEWS_URL).send().await?;
    if !res.status().is_success() {
        // Soft-fail: empty list rather than blocking the UI.
        return Ok(vec![]);
    }
    let entries: Vec<NewsEntry> = res.json().await.unwrap_or_default();
    Ok(entries)
}
