// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, Mutex as TokioMutex};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

const WS_BRIDGE_ADDR: &str = "127.0.0.1:17899";

// Connection state
struct ConnectionState {
    stream: Option<Arc<TokioMutex<TcpStream>>>,
    tx: Option<mpsc::UnboundedSender<Vec<u8>>>,
}

impl ConnectionState {
    fn new() -> Self {
        Self {
            stream: None,
            tx: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ConnectParams {
    host: String,
    port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
struct SendPacketParams {
    data: Vec<u8>,
}

#[derive(Debug, Serialize, Clone)]
struct PacketReceivedEvent {
    data: Vec<u8>,
}

#[derive(Debug, Serialize, Clone)]
struct ConnectionEvent {
    connected: bool,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum WsCommand {
    #[serde(rename = "connect")]
    Connect { host: String, port: u16 },
    #[serde(rename = "disconnect")]
    Disconnect,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum WsEvent {
    #[serde(rename = "connect")]
    Connect { ok: bool, error: Option<String> },
    #[serde(rename = "disconnect")]
    Disconnect { reason: Option<String> },
    #[serde(rename = "error")]
    Error { message: String },
}

async fn handle_ws_client(stream: tokio::net::TcpStream) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws_stream) => ws_stream,
        Err(e) => {
            eprintln!("[Tauri WS] Failed to accept websocket: {e}");
            return;
        }
    };

    let (mut ws_write, mut ws_read) = ws_stream.split();
    let (ws_tx, mut ws_rx) = mpsc::unbounded_channel::<Message>();

    let ws_writer = tokio::spawn(async move {
        while let Some(msg) = ws_rx.recv().await {
            if ws_write.send(msg).await.is_err() {
                break;
            }
        }
    });

    let mut tcp_writer: Option<tokio::net::tcp::OwnedWriteHalf> = None;
    let mut tcp_reader_task: Option<tokio::task::JoinHandle<()>> = None;

    while let Some(msg) = ws_read.next().await {
        let msg = match msg {
            Ok(msg) => msg,
            Err(e) => {
                eprintln!("[Tauri WS] Websocket error: {e}");
                break;
            }
        };

        match msg {
            Message::Text(text) => {
                match serde_json::from_str::<WsCommand>(&text) {
                    Ok(WsCommand::Connect { host, port }) => {
                        if let Some(handle) = tcp_reader_task.take() {
                            handle.abort();
                        }
                        tcp_writer = None;

                        let address = format!("{host}:{port}");
                        match TcpStream::connect(&address).await {
                            Ok(tcp_stream) => {
                                let (mut tcp_reader, writer) = tcp_stream.into_split();
                                tcp_writer = Some(writer);

                                let ws_tx_clone = ws_tx.clone();
                                tcp_reader_task = Some(tokio::spawn(async move {
                                    let mut buffer = vec![0u8; 8192];
                                    loop {
                                        match tcp_reader.read(&mut buffer).await {
                                            Ok(0) => {
                                                let event = WsEvent::Disconnect {
                                                    reason: Some("Connection closed".to_string()),
                                                };
                                                let _ = ws_tx_clone.send(Message::Text(
                                                    serde_json::to_string(&event).unwrap_or_default(),
                                                ));
                                                break;
                                            }
                                            Ok(n) => {
                                                let _ = ws_tx_clone.send(Message::Binary(
                                                    buffer[..n].to_vec(),
                                                ));
                                            }
                                            Err(e) => {
                                                let event = WsEvent::Disconnect {
                                                    reason: Some(format!("Read error: {e}")),
                                                };
                                                let _ = ws_tx_clone.send(Message::Text(
                                                    serde_json::to_string(&event).unwrap_or_default(),
                                                ));
                                                break;
                                            }
                                        }
                                    }
                                }));

                                let event = WsEvent::Connect { ok: true, error: None };
                                let _ = ws_tx.send(Message::Text(
                                    serde_json::to_string(&event).unwrap_or_default(),
                                ));
                            }
                            Err(e) => {
                                let event = WsEvent::Connect {
                                    ok: false,
                                    error: Some(format!("Failed to connect: {e}")),
                                };
                                let _ = ws_tx.send(Message::Text(
                                    serde_json::to_string(&event).unwrap_or_default(),
                                ));
                            }
                        }
                    }
                    Ok(WsCommand::Disconnect) => {
                        if let Some(handle) = tcp_reader_task.take() {
                            handle.abort();
                        }
                        tcp_writer = None;
                        let event = WsEvent::Disconnect {
                            reason: Some("Client requested".to_string()),
                        };
                        let _ = ws_tx.send(Message::Text(
                            serde_json::to_string(&event).unwrap_or_default(),
                        ));
                    }
                    Err(_) => {
                        let event = WsEvent::Error {
                            message: "Invalid websocket command".to_string(),
                        };
                        let _ = ws_tx.send(Message::Text(
                            serde_json::to_string(&event).unwrap_or_default(),
                        ));
                    }
                }
            }
            Message::Binary(data) => {
                if let Some(writer) = tcp_writer.as_mut() {
                    if let Err(e) = writer.write_all(&data).await {
                        let event = WsEvent::Disconnect {
                            reason: Some(format!("Write error: {e}")),
                        };
                        let _ = ws_tx.send(Message::Text(
                            serde_json::to_string(&event).unwrap_or_default(),
                        ));
                        tcp_writer = None;
                    } else if let Err(e) = writer.flush().await {
                        // Flush para o servidor receber o pacote (ex.: movimento) imediatamente
                        let event = WsEvent::Disconnect {
                            reason: Some(format!("Flush error: {e}")),
                        };
                        let _ = ws_tx.send(Message::Text(
                            serde_json::to_string(&event).unwrap_or_default(),
                        ));
                        tcp_writer = None;
                    }
                } else {
                    let event = WsEvent::Error {
                        message: "Not connected".to_string(),
                    };
                    let _ = ws_tx.send(Message::Text(
                        serde_json::to_string(&event).unwrap_or_default(),
                    ));
                }
            }
            Message::Close(_) => break,
            Message::Ping(payload) => {
                let _ = ws_tx.send(Message::Pong(payload));
            }
            _ => {}
        }
    }

    if let Some(handle) = tcp_reader_task {
        handle.abort();
    }
    ws_writer.abort();
}

async fn run_ws_server() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind(WS_BRIDGE_ADDR).await?;
    println!("[Tauri WS] Listening on ws://{}", WS_BRIDGE_ADDR);

    loop {
        let (stream, _) = listener.accept().await?;
        tokio::spawn(handle_ws_client(stream));
    }
}

// Connect to server
#[tauri::command]
async fn tcp_connect(
    params: ConnectParams,
    state: State<'_, Arc<Mutex<ConnectionState>>>,
    app: AppHandle,
) -> Result<String, String> {
    let address = format!("{}:{}", params.host, params.port);
    println!("[Tauri TCP] Connecting to {}...", address);

    // Connect to server
    let stream = TcpStream::connect(&address)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;

    println!("[Tauri TCP] Connected successfully!");

    let stream = Arc::new(TokioMutex::new(stream));
    let stream_clone = stream.clone();

    // Create channel for sending packets
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();

    // Store connection state
    {
        let mut conn_state = state.lock().unwrap();
        conn_state.stream = Some(stream.clone());
        conn_state.tx = Some(tx);
    }

    // Emit connection event
    let _ = app.emit(
        "tcp-connection",
        ConnectionEvent {
            connected: true,
            error: None,
        },
    );

    // Spawn task to handle incoming packets
    let app_clone = app.clone();
    tokio::spawn(async move {
        let mut buffer = vec![0u8; 8192];
        loop {
            let mut stream = stream_clone.lock().await;
            match stream.read(&mut buffer).await {
                Ok(0) => {
                    // Connection closed
                    println!("[Tauri TCP] Connection closed by server");
                    let _ = app_clone.emit(
                        "tcp-connection",
                        ConnectionEvent {
                            connected: false,
                            error: Some("Connection closed".to_string()),
                        },
                    );
                    break;
                }
                Ok(n) => {
                    // Received data
                    let data = buffer[..n].to_vec();
                    println!("[Tauri TCP] Received {} bytes", n);
                    let _ = app_clone.emit("tcp-packet-received", PacketReceivedEvent { data });
                }
                Err(e) => {
                    println!("[Tauri TCP] Read error: {}", e);
                    let _ = app_clone.emit(
                        "tcp-connection",
                        ConnectionEvent {
                            connected: false,
                            error: Some(format!("Read error: {}", e)),
                        },
                    );
                    break;
                }
            }
        }
    });

    // Spawn task to handle outgoing packets
    tokio::spawn(async move {
        while let Some(data) = rx.recv().await {
            let mut stream = stream.lock().await;
            if let Err(e) = stream.write_all(&data).await {
                println!("[Tauri TCP] Write error: {}", e);
                break;
            }
            println!("[Tauri TCP] Sent {} bytes", data.len());
        }
    });

    Ok("Connected successfully".to_string())
}

// Send packet to server
#[tauri::command]
async fn tcp_send(
    params: SendPacketParams,
    state: State<'_, Arc<Mutex<ConnectionState>>>,
) -> Result<String, String> {
    let conn_state = state.lock().unwrap();

    if let Some(tx) = &conn_state.tx {
        tx.send(params.data)
            .map_err(|e| format!("Failed to send packet: {}", e))?;
        Ok("Packet sent".to_string())
    } else {
        Err("Not connected".to_string())
    }
}

// Disconnect from server
#[tauri::command]
async fn tcp_disconnect(state: State<'_, Arc<Mutex<ConnectionState>>>) -> Result<String, String> {
    let mut conn_state = state.lock().unwrap();
    conn_state.stream = None;
    conn_state.tx = None;
    println!("[Tauri TCP] Disconnected");
    Ok("Disconnected".to_string())
}

// Check connection status
#[tauri::command]
async fn tcp_is_connected(state: State<'_, Arc<Mutex<ConnectionState>>>) -> Result<bool, String> {
    let conn_state = state.lock().unwrap();
    Ok(conn_state.stream.is_some())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|_| {
            tauri::async_runtime::spawn(async {
                if let Err(e) = run_ws_server().await {
                    eprintln!("[Tauri WS] Server error: {e}");
                }
            });
            Ok(())
        })
        .manage(Arc::new(Mutex::new(ConnectionState::new())))
        .invoke_handler(tauri::generate_handler![
            tcp_connect,
            tcp_send,
            tcp_disconnect,
            tcp_is_connected
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
