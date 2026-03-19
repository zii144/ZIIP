use serde::{Deserialize, Serialize};
use reqwest::{Client, Method, header::HeaderMap};
use std::str::FromStr;
use std::time::Instant;

// --- LLM Chat (Gemini + OpenAI) ---
const GEMINI_API_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const OPENAI_API_URL: &str = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL: &str = "gpt-4o-mini";
const ZII_SYSTEM_PROMPT: &str = "You are ZII, an AI assistant built into ZIIP, a desktop API client. You help users test APIs, craft requests, debug responses, and generate mock payloads. Be concise, practical, and API-focused. When asked to generate JSON or mock data, output valid JSON. When suggesting endpoints or headers, be specific. You receive request context (URL, method, headers, params, body) and the last response when available. Use this context when relevant—e.g., debugging 401/403/500, suggesting missing headers, explaining responses, or generating payloads for the current request.";

#[derive(Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Serialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "systemInstruction")]
    system_instruction: GeminiContent,
}

#[derive(Deserialize)]
struct GeminiResponsePart {
    text: Option<String>,
}

#[derive(Deserialize)]
struct GeminiResponseContent {
    parts: Option<Vec<GeminiResponsePart>>,
}

#[derive(Deserialize)]
struct GeminiResponseCandidate {
    content: Option<GeminiResponseContent>,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiResponseCandidate>>,
}

// --- OpenAI structures ---
#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct OpenAIChatRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
}

#[derive(Deserialize)]
struct OpenAIChatResponseMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIChatResponseMessage,
}

#[derive(Deserialize)]
struct OpenAIChatResponse {
    choices: Vec<OpenAIChoice>,
}

// --- Request context (ZII-002) ---
const MAX_RESPONSE_BODY_LEN: usize = 4000;

#[derive(Deserialize, Default)]
struct RequestContext {
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    params: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    headers: Option<std::collections::HashMap<String, String>>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default, rename = "collectionsSummary")]
    collections_summary: Option<String>,
    #[serde(default, rename = "lastResponse")]
    last_response: Option<LastResponseContext>,
}

#[derive(Deserialize)]
struct LastResponseContext {
    status: u16,
    #[serde(rename = "time_ms", default)]
    time_ms: Option<u64>,
    #[serde(default)]
    headers: Option<std::collections::HashMap<String, String>>,
    #[serde(default)]
    body: Option<String>,
}

fn build_context_block(ctx: &RequestContext) -> String {
    let mut lines = vec!["[Request context]".to_string()];
    if let Some(url) = &ctx.url {
        lines.push(format!("URL: {}", url));
    }
    if let Some(m) = &ctx.method {
        lines.push(format!("Method: {}", m));
    }
    if let Some(params) = &ctx.params {
        if !params.is_empty() {
            let ps: Vec<String> = params
                .iter()
                .filter_map(|p| {
                    let obj = p.as_object()?;
                    let k = obj.get("key")?.as_str()?;
                    let v = obj.get("value").and_then(|x| x.as_str()).unwrap_or("");
                    Some(format!("{}={}", k, v))
                })
                .collect();
            if !ps.is_empty() {
                lines.push(format!("Params: {}", ps.join(", ")));
            }
        }
    }
    if let Some(h) = &ctx.headers {
        if !h.is_empty() {
            let hs: Vec<String> = h
                .iter()
                .filter(|(k, _)| !k.is_empty())
                .map(|(k, v)| format!("{}: {}", k, v))
                .collect();
            if !hs.is_empty() {
                lines.push(format!("Headers: {}", hs.join("; ")));
            }
        }
    }
    if let Some(b) = &ctx.body {
        if !b.is_empty() {
            let truncated = if b.len() > MAX_RESPONSE_BODY_LEN {
                format!("{}... (truncated)", &b[..MAX_RESPONSE_BODY_LEN])
            } else {
                b.clone()
            };
            lines.push(format!("Body: {}", truncated));
        }
    }
    if let Some(s) = &ctx.collections_summary {
        if !s.is_empty() {
            lines.push(format!("User's saved collections (collection name -> request names): {}", s));
        }
    }
    if let Some(lr) = &ctx.last_response {
        lines.push(format!("Last response: {} ({}ms)", lr.status, lr.time_ms.unwrap_or(0)));
        if let Some(h) = &lr.headers {
            if !h.is_empty() {
                let hs: Vec<String> = h
                    .iter()
                    .take(10)
                    .map(|(k, v)| format!("{}: {}", k, v))
                    .collect();
                lines.push(format!("Response headers: {}", hs.join("; ")));
            }
        }
        if let Some(b) = &lr.body {
            let truncated = if b.len() > MAX_RESPONSE_BODY_LEN {
                format!("{}... (truncated)", &b[..MAX_RESPONSE_BODY_LEN])
            } else {
                b.clone()
            };
            lines.push(format!("Response body: {}", truncated));
        }
    } else {
        lines.push("Last response: (no request sent yet)".to_string());
    }
    lines.join("\n")
}

#[tauri::command]
async fn chat(
    message: String,
    provider: Option<String>,
    api_key: Option<String>,
    context: Option<RequestContext>,
) -> Result<String, HttpError> {
    let provider = provider
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(|| "gemini".to_string())
        .to_lowercase();

    let key = api_key
        .filter(|k| !k.trim().is_empty())
        .or_else(|| {
            if provider == "gemini" {
                std::env::var("GEMINI_API_KEY").ok()
            } else {
                std::env::var("OPENAI_API_KEY").ok()
            }
        })
        .ok_or_else(|| HttpError {
            message: format!(
                "{} API key not configured. Add it in Settings (gear icon).",
                if provider == "gemini" { "Gemini" } else { "OpenAI" }
            ),
        })?;

    let client = Client::new();

    let user_content = match context.as_ref() {
        Some(ctx) => {
            let block = build_context_block(ctx);
            format!("{}\n\n---\n\nUser: {}", block, message)
        }
        None => message,
    };

    let content = match provider.as_str() {
        "openai" => {
            let body = OpenAIChatRequest {
                model: OPENAI_MODEL.to_string(),
                messages: vec![
                    OpenAIMessage {
                        role: "system".to_string(),
                        content: ZII_SYSTEM_PROMPT.to_string(),
                    },
                    OpenAIMessage {
                        role: "user".to_string(),
                        content: user_content,
                    },
                ],
            };

            let resp = client
                .post(OPENAI_API_URL)
                .header("Authorization", format!("Bearer {}", key.trim()))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| HttpError { message: e.to_string() })?;

            let status = resp.status();
            let text = resp
                .text()
                .await
                .map_err(|e| HttpError { message: e.to_string() })?;

            if !status.is_success() {
                return Err(HttpError {
                    message: format!("OpenAI API error ({}): {}", status, text),
                });
            }

            let parsed: OpenAIChatResponse = serde_json::from_str(&text).map_err(|e| HttpError {
                message: format!("Failed to parse OpenAI response: {}", e),
            })?;

            parsed
                .choices
                .first()
                .and_then(|c| c.message.content.clone())
                .unwrap_or_else(|| "No response generated.".to_string())
        }
        _ => {
            // Default: Gemini
            let body = GeminiRequest {
                contents: vec![GeminiContent {
                    parts: vec![GeminiPart { text: user_content }],
                }],
                system_instruction: GeminiContent {
                    parts: vec![GeminiPart {
                        text: ZII_SYSTEM_PROMPT.to_string(),
                    }],
                },
            };

            let resp = client
                .post(GEMINI_API_URL)
                .header("x-goog-api-key", key.trim())
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| HttpError { message: e.to_string() })?;

            let status = resp.status();
            let text = resp
                .text()
                .await
                .map_err(|e| HttpError { message: e.to_string() })?;

            if !status.is_success() {
                return Err(HttpError {
                    message: format!("Gemini API error ({}): {}", status, text),
                });
            }

            let parsed: GeminiResponse = serde_json::from_str(&text).map_err(|e| HttpError {
                message: format!("Failed to parse Gemini response: {}", e),
            })?;

            parsed
                .candidates
                .and_then(|c| c.into_iter().next())
                .and_then(|c| c.content)
                .and_then(|c| c.parts)
                .and_then(|p| p.into_iter().next())
                .and_then(|p| p.text)
                .unwrap_or_else(|| "No response generated.".to_string())
        }
    };

    Ok(content)
}

// --- HTTP Request ---

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
        .invoke_handler(tauri::generate_handler![make_request, chat])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
