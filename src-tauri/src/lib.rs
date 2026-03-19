use serde::{Deserialize, Serialize};
use reqwest::{Client, Method, header::HeaderMap};
use std::str::FromStr;
use std::time::Instant;

#[derive(Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
    pub time_ms: u64,
}

#[derive(Serialize)]
pub struct HttpError {
    pub message: String,
}

#[tauri::command]
async fn make_request(method: String, url: String, body: String, headers: std::collections::HashMap<String, String>) -> Result<HttpResponse, HttpError> {
    let start = Instant::now();
    let client = Client::new();
    
    let req_method = Method::from_str(&method).map_err(|e| HttpError { message: e.to_string() })?;
    
    let mut builder = client.request(req_method, &url);
    if !body.is_empty() {
        builder = builder.body(body);
    }

    let mut req_headers = HeaderMap::new();
    for (key, value) in headers {
        let trimmed_value = value.trim();
        if let (Ok(header_name), Ok(header_value)) = (
            reqwest::header::HeaderName::from_str(&key.trim()),
            reqwest::header::HeaderValue::from_str(trimmed_value),
        ) {
            req_headers.insert(header_name, header_value);
        }
    }
    builder = builder.headers(req_headers);
    
    let response = builder.send().await.map_err(|e| HttpError { message: e.to_string() })?;
    
    let mut resp_headers = std::collections::HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(val_str) = value.to_str() {
            resp_headers.insert(key.to_string(), val_str.to_string());
        }
    }

    let status = response.status().as_u16();
    let res_body = response.text().await.map_err(|e| HttpError { message: e.to_string() })?;
    let duration = start.elapsed();
    
    Ok(HttpResponse {
        status,
        headers: resp_headers,
        body: res_body,
        time_ms: duration.as_millis() as u64,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![make_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
