# TIMOA Voice Server

> **MediaSoup SFU 기반 다자간 음성 통화 서버**  
> 팀 서버마다 음성 채널을 제공하고, WebRTC 미디어를 SFU 방식으로 중계합니다.

![Node.js](https://img.shields.io/badge/Node.js_22-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![MediaSoup](https://img.shields.io/badge/MediaSoup-SFU-5C2D91?style=flat-square)
![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=flat-square&logo=webrtc&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=socketdotio&logoColor=white)

---

## 개요

TIMOA의 **Discord 음성 채널** 대체 기능을 담당합니다.

P2P Mesh는 참여자가 늘수록 각 클라이언트의 업로드가 `N-1`배로 늘어나고, MCU는 서버에서 믹싱하느라 CPU 부담이 큽니다.  
TIMOA는 **SFU(Selective Forwarding Unit)** 를 선택해, 각 클라이언트가 서버로 **한 번만 업로드**하고 서버는 디코딩 없이 다른 참여자에게 전달하도록 했습니다.

→ 결정 배경: [ADR 0010 — Voice SFU (MediaSoup)](https://github.com/TIMOA-MAIN/TIMOA_Docs/blob/main/protocol/0010-voice-sfu-mediasoup.md)

```
            Socket.IO (시그널링)
Client A ──────────────────────┐
Client B ──────────────────────┤      ┌──────────── Voice Server ────────────┐
Client C ──────────────────────┘      │  MediaSoup Worker                    │
                                      │   └─ Router (팀 서버별 1개)            │
   WebRTC (UDP 우선, TCP fallback)     │        ├─ Producer  (A의 마이크)      │
Client A ══ upload ══════════════════▶│        ├─ Consumer → B, C           │
Client B ◀═ download ═════════════════│        └─ ...                        │
                                      └──────────────────────────────────────┘
```

## 주요 기능

### SFU 미디어 중계
- MediaSoup Worker 1개 + **팀 서버별 Router** 분리 → 서버 간 미디어 격리
- 코덱: **OPUS 48kHz 스테레오**
- WebRTC Transport: **UDP 우선, TCP fallback** (방화벽 환경 대응)
- RTC 포트 범위 `10000–10100`
- Worker가 비정상 종료되면 프로세스를 종료해 불완전한 상태로 서비스가 지속되는 것을 방지 (Proxy 헬스체크에서 자동 제외)

### 음성 채널 관리
- 팀 서버마다 기본 음성 채널 자동 생성, 채널당 최대 99명
- 참여자별 **음소거 / 헤드셋 끄기(deafen)** 상태를 실시간으로 다른 참여자에게 브로드캐스트
- Consumer는 일시정지 상태로 생성 후 클라이언트 준비가 끝나면 resume (초기 패킷 손실 방지)

## Socket.IO 이벤트

| 이벤트 | 설명 |
|---|---|
| `join_voice_channel` / `leave_voice_channel` | 음성 채널 입장 / 퇴장 |
| `get_rtp_capabilities` | Router RTP Capabilities 조회 (mediasoup-client Device 로드용) |
| `create_transport` / `connect_transport` | WebRTC Transport 생성 / DTLS 연결 |
| `create_producer` / `close_producer` | 마이크 송출 시작 / 종료 |
| `create_consumer` / `resume_consumer` / `pause_consumer` | 다른 참여자 음성 수신 제어 |
| `toggle_mute` / `toggle_deafen` / `update_voice_state` | 음성 상태 변경 |
| `get_channel_users` / `get_channel_voice_states` | 채널 참여자·상태 조회 |

HTTP: `GET /health` (Proxy Server 헬스체크용)

### 연결 흐름

```
1. join_voice_channel
2. get_rtp_capabilities  → device.load()
3. create_transport (send) → connect_transport → create_producer
4. create_transport (recv) → 참여자마다 create_consumer → resume_consumer
```

## 프로젝트 구조

```
Voice_Server/
├── Start.cjs                  # 진입점
├── App.cjs                    # Express + Socket.IO 서버 구성
├── Control.cjs                # 매니저 조립
├── Config/Config.cjs          # 서버·DB·MediaSoup·CORS 설정
├── managers/
│   ├── BaseManager.cjs        # 공통 로깅·예외 처리(safe_execute)
│   ├── SocketManager.cjs      # Socket.IO 이벤트 라우팅
│   └── VoiceManager.cjs       # Worker/Router/Transport/Producer/Consumer 관리
├── services/DatabaseService.cjs
└── Utils/                     # LogHelper, ResponseHelper, ValidationHelper
```

## 실행

```bash
npm install
npm run dev        # Node.js 22.16.0 권장
```

### 환경 변수 (`.env`)
| 변수 | 설명 | 기본값 |
|---|---|---|
| `PORT` | 서버 포트 | `8007` |
| `HOST` | 바인딩 주소 | `0.0.0.0` |
| `ANNOUNCED_IP` | WebRTC ICE 후보로 알릴 **공인 IP** | — |
| `DB_SERVER` / `DB_PORT` | MS SQL 호스트 / 포트 | — / `1433` |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | DB 접속 정보 | — |

> NAT 환경에서는 `ANNOUNCED_IP`를 공인 IP로 설정하고, 방화벽에서 UDP/TCP `10000–10100` 포트를 열어야 합니다.

## 관련 레포
- [Desktop_Client](https://github.com/TIMOA-MAIN/Desktop_Client) — `mediasoup-client` 기반 음성 UI
- [Proxy_Server](https://github.com/TIMOA-MAIN/Proxy_Server) — `/voice` Socket.IO WebSocket Upgrade 중계
