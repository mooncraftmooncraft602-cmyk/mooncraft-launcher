//! Minecraft Server List Ping (SLP).
//!
//! Implements the modern (1.7+) handshake → status request flow. Returns
//! online/max players, MOTD, version. Falls back to `online=false` on any
//! connection error so the UI degrades gracefully.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

use crate::config;
use crate::error::Result;

#[derive(Debug, Clone, Serialize)]
pub struct ServerStatus {
    pub online: bool,
    pub players_online: u32,
    pub players_max: u32,
    pub version: String,
    pub motd: String,
    pub latency_ms: u64,
}

pub async fn ping() -> Result<ServerStatus> {
    let host = config::SERVER_HOST;
    let port = config::SERVER_PORT;
    let started = std::time::Instant::now();
    let res = timeout(Duration::from_secs(5), inner_ping(host, port)).await;
    match res {
        Ok(Ok(parsed)) => {
            let latency = started.elapsed().as_millis() as u64;
            Ok(ServerStatus {
                online: true,
                players_online: parsed.players.online,
                players_max: parsed.players.max,
                version: parsed.version.name,
                motd: extract_motd(&parsed.description),
                latency_ms: latency,
            })
        }
        _ => Ok(ServerStatus {
            online: false,
            players_online: 0,
            players_max: 0,
            version: "unknown".into(),
            motd: "Server unreachable".into(),
            latency_ms: 0,
        }),
    }
}

#[derive(Deserialize)]
struct StatusResponse {
    version: VersionInfo,
    players: PlayersInfo,
    description: serde_json::Value,
}
#[derive(Deserialize)]
struct VersionInfo {
    name: String,
}
#[derive(Deserialize)]
struct PlayersInfo {
    online: u32,
    max: u32,
}

async fn inner_ping(host: &str, port: u16) -> Result<StatusResponse> {
    let mut stream = TcpStream::connect((host, port)).await?;

    // Handshake packet (state = 1: status)
    let mut hs = Vec::new();
    write_varint(&mut hs, 0x00); // packet id
    write_varint(&mut hs, -1);   // protocol version (-1 = any)
    write_string(&mut hs, host);
    hs.push((port >> 8) as u8);
    hs.push((port & 0xff) as u8);
    write_varint(&mut hs, 1); // next state: status
    send_packet(&mut stream, &hs).await?;

    // Status request packet
    let mut req = Vec::new();
    write_varint(&mut req, 0x00);
    send_packet(&mut stream, &req).await?;

    // Read response: length + packet id + json string
    let _len = read_varint(&mut stream).await?;
    let _id = read_varint(&mut stream).await?;
    let json_len = read_varint(&mut stream).await? as usize;
    let mut buf = vec![0u8; json_len];
    stream.read_exact(&mut buf).await?;
    let s = std::str::from_utf8(&buf).map_err(|e| crate::error::Error::Custom(e.to_string()))?;
    let parsed: StatusResponse = serde_json::from_str(s)?;
    Ok(parsed)
}

async fn send_packet(stream: &mut TcpStream, payload: &[u8]) -> std::io::Result<()> {
    let mut framed = Vec::new();
    write_varint(&mut framed, payload.len() as i32);
    framed.extend_from_slice(payload);
    stream.write_all(&framed).await
}

fn write_varint(buf: &mut Vec<u8>, mut v: i32) {
    loop {
        let mut byte = (v as u32 & 0x7f) as u8;
        v = ((v as u32) >> 7) as i32;
        if v != 0 {
            byte |= 0x80;
        }
        buf.push(byte);
        if v == 0 {
            break;
        }
    }
}

fn write_string(buf: &mut Vec<u8>, s: &str) {
    let bytes = s.as_bytes();
    write_varint(buf, bytes.len() as i32);
    buf.extend_from_slice(bytes);
}

async fn read_varint(stream: &mut TcpStream) -> std::io::Result<i32> {
    let mut shift = 0;
    let mut result: u32 = 0;
    loop {
        let mut b = [0u8; 1];
        stream.read_exact(&mut b).await?;
        result |= ((b[0] & 0x7f) as u32) << shift;
        if b[0] & 0x80 == 0 {
            return Ok(result as i32);
        }
        shift += 7;
        if shift >= 32 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "varint too long",
            ));
        }
    }
}

fn extract_motd(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Object(o) => {
            // Walk text / extra recursively.
            let mut out = String::new();
            collect_text(v, &mut out);
            if out.is_empty() {
                if let Some(t) = o.get("text").and_then(|t| t.as_str()) {
                    return t.to_string();
                }
            }
            out
        }
        _ => String::new(),
    }
}
fn collect_text(v: &serde_json::Value, out: &mut String) {
    if let Some(t) = v.get("text").and_then(|t| t.as_str()) {
        out.push_str(t);
    }
    if let Some(extra) = v.get("extra").and_then(|e| e.as_array()) {
        for child in extra {
            collect_text(child, out);
        }
    }
}

