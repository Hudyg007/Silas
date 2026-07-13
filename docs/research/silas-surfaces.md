# Silas Beyond the Phone — Surface Research (July 2026)

Research session, no code changes. Question: every realistic way Hudson could reach
Silas beyond the phone browser/PWA, and what each would take.

**Ground rule for everything below:** Silas is ONE entity. The Vercel app + Supabase
brain (vault_notes, conversations, silas_journal) is the single mind. Every surface
is a new mouth and ears wired to the same `POST /api/chat` pipeline (RAG over vault +
past conversations + note extraction) — never a second LLM, never a local copy.

---

## 0. The prerequisite everything shares: lock the door first

`POST /api/chat` currently has **no auth at all** (single-user mode, `src/app/api/chat/route.ts`
says so in its own comment). Today that's survivable because only the phone UI knows the URL.
The moment any new surface exists, the API must be protected, because every surface below is
"something else on the internet calling our endpoints."

One small change unlocks every surface in this document:

1. **Bearer-token middleware** — a Next.js middleware comparing `Authorization: Bearer <SILAS_API_TOKEN>`
   against an env var, applied to `/api/chat`, `/api/tts`, `/api/vault/*`. ~20 lines.
   The web app itself gets exempted via its own session or sends the token from a
   one-time entry screen stored in localStorage.
2. **Non-streaming mode** — `{"stream": false}` in the chat body (or `Accept: application/json`)
   returning one JSON payload. Siri Shortcuts, Apple Watch, Alexa, and email can't consume SSE;
   bots don't want it. Trivial: the route already accumulates the full reply server-side for saving.
3. Optionally extract the chat pipeline into a `runSilasTurn(message, context)` function that both
   the SSE route and every bot/webhook route call directly.

Effort: S (half a session). This is the first thing any surface session should do.

---

## 1. Comparison table — all surfaces

Effort: **S** = one session, **M** = 2–4 sessions, **L** = multi-week.
"Same brain" is a given for all rows; column shows *how* it connects.

| # | Surface | How it connects | Effort | Cost | Auth / privacy | Honest feasibility |
|---|---------|-----------------|--------|------|----------------|--------------------|
| 1 | **Desktop PWA install** (Win 11, Chrome/Edge) | Installs the deployed app; taskbar icon, standalone window, window-controls overlay, jump-list shortcuts, badging | **S** | $0 | Token in localStorage | **Do first.** 80% of "desktop Silas" for near-zero work. Cannot do tray or global hotkeys ([open Chromium issues](https://issues.chromium.org/issues/40749250)) |
| 2 | **Tauri v2 desktop app** (wrapper + tray + global hotkey) | ~10 MB shell (OS WebView2) pointing at the deployed URL; `TrayIconBuilder` popover on a compact `/mini` route; `tauri-plugin-global-shortcut` overlay | **M** | $0 | Token via Tauri store / localStorage | **High.** One app gives wrapper + menu-bar mini-app + Raycast-style hotkey. WebView2 mic prompt re-appears each launch (known Tauri issue) — annoying for heavy voice use |
| 3 | Electron equivalent of #2 | Same, shipping Chromium (80–150 MB installer, 200–300 MB RAM) | M | $0 | Same | Works; cleaner mic permissions; only worth it if Tauri's mic papercuts grate |
| 4 | **Telegram bot** | BotFather token → `setWebhook` to `/api/telegram`; secret-token header + chat-ID allowlist; reply via `sendMessage`, pseudo-stream via throttled `editMessageText`; **ElevenLabs voice notes** via `sendVoice` (OGG/Opus) | **S** | $0 | Webhook secret + Hudson's chat ID allowlist (drop all others silently) | **Best messaging surface, build first.** Free, instant, native voice bubbles in Silas's real voice, and doubles as the proactive channel later |
| 5 | Discord bot | Interactions-endpoint URL (pure HTTP, serverless-friendly); Ed25519 signature verify; 3s ack → deferred reply → PATCH follow-up within 15 min (`waitUntil`) | M | $0 | Ed25519 + user-ID allowlist, keep app private | Works on Vercel, but slash-command UX (`/silas <msg>`) — free-typed DMs need a persistent gateway process. Strictly worse than Telegram here |
| 6 | WhatsApp (official Cloud API) | Meta app + WABA + spare number; webhook with `X-Hub-Signature-256`; replies inside 24h service window are free (since Nov 2024 / July 2025 pricing change) | M–L | ~$0 reactive | HMAC + `wa_id` allowlist | Viable but bureaucratic (Meta app, business verification for full tier). Baileys/unofficial = ToS violation + real ban risk to a personal number — don't |
| 7 | SMS (Twilio) | Webhook → validate `X-Twilio-Signature` → reply; but A2P 10DLC sole-proprietor registration required even for hobbyists | M + ~2wk review | ~$20 setup, ~$3+/mo, ~$0.012/segment | Signature + number allowlist | **Skip.** Weeks of compliance for 160-char plain text when Hudson owns a smartphone |
| 8 | **Siri Shortcut / iPhone Action Button** | Shortcut: Dictate Text → Get Contents of URL (POST `/api/chat` `stream:false`, bearer header) → Speak/Show Result. Action Button triggers it | **S** | $0 | Bearer token baked into the shortcut | **High.** One shortcut = press-and-talk Silas with no native app. Same shortcut works on Apple Watch and in CarPlay via voice |
| 9 | PWA in-browser wake word (Porcupine WASM) | `@picovoice/porcupine-web`, custom "Hey Silas" `.ppn`; listens only while page foregrounded, screen on | S–M | $0 (free tier ≈ 3 devices) | Local wake processing | "Kitchen-counter mode" (phone docked, screen on) only. **iOS kills background mic — ambient "Hey Silas" on iPhone is impossible without a native app** |
| 10 | **Windows always-listening daemon** | Python/Node tray daemon: Porcupine/openWakeWord (local) → VAD → whisper.cpp or OpenAI STT (~$0.006/min) → POST `/api/chat` → `/api/tts` → speakers | **M** (crude version S) | $0 + pennies/mo STT | Wake word fully local — audio leaves machine only after "Hey Silas"; token in local env | **High.** True ambient "Hey Silas" at the desk; the same recipe later ports verbatim to a Pi speaker |
| 11 | **Apple Watch quick-talk (Shortcut)** | Same shortcut as #8 with "Show on Apple Watch"; trigger via complication, watch Action Button (Ultra), or raise-wrist "Siri, run Silas" | **S** | $0 | Same token | **Proven pattern** (used for ChatGPT-from-wrist today). Warts: dictation auto-stop bug on watchOS 26 (may need a tap), text-first replies |
| 12 | Native watchOS app | SwiftUI: mic button → URLSession → text + audio; App Intents for Siri | L | $99/yr + a Mac | Keychain token | Genuinely small app, but Swift-from-zero + provisioning eats weeks. Later luxury |
| 13 | CarPlay | iOS 26.4 (Mar 2026) added a "voice conversational apps" category (ChatGPT first) — but requires a published App Store app + discretionary Apple entitlement | L+ | $99/yr | — | **Effectively unattainable for a personal app. Don't chase.** Instead: "Hey Siri, run Silas" works fine while CarPlay is active — the #8 shortcut speaks over car speakers |
| 14 | Android Auto | Gemini-only; no third-party assistant category | — | — | — | Dead end, and Hudson's on iPhone |
| 15 | Alexa custom skill | Skill webhook → Vercel route (signature-verified); 8s response cap (progressive responses buy time); ElevenLabs audio only via SSML `<audio>` hack (48 kbps MP3, ≤240 s, public URL); dev-mode skill = no OAuth needed | M | ~$25–50 Echo | Skill-ID + signature; keep in dev mode on Hudson's account | Works but wake word stays "Alexa", sessions die in ~8 s silence, and Alexa+ (Feb 2026 rollout) is actively breaking classic skills. Silas in an Amazon costume |
| 16 | **Raspberry Pi "Hey Silas" speaker** | Pi + ReSpeaker mic: Porcupine custom wake word (free, type-to-train) → VAD → Whisper STT → POST `/api/chat` → **ElevenLabs Flash streaming** to speaker (~75 ms model latency; ~2–4 s to first audible word) | **M** (L with barge-in/multi-room) | $50–120 hardware | Wake word local; every hop Hudson-controlled — strictly better than any commercial speaker | **The only route giving both a real "Hey Silas" AND Silas's actual voice.** ElevenLabs publishes a first-party Pi guide. Strongest identity-preserving surface |
| 17 | Home Assistant Voice PE / Wyoming | $59 HA Voice PE or ESP32-S3-BOX satellite; openWakeWord custom "Hey Silas" (free Colab training); custom conversation-agent wiring to `/api/chat` | M–L | $59 + HA server | Local wake | Great hardware, but drags in the whole Home Assistant ecosystem; custom on-device wake word on Voice PE still needs custom firmware. Choose only if HA is wanted anyway |
| 18 | Google Home/Nest | Conversational Actions sunset June 2023; Gemini-only since | — | — | — | Zero. Cautionary tale for #15 |
| 19 | **Email interface** | Cloudflare Email Routing (free) → Email Worker → POST `/api/email/inbound` (shared secret) → chat pipeline → reply via Resend (free 3k/mo). Cloudflare rejects mail failing SPF+DKIM since July 2025 | **M** | ~$11/yr domain | DKIM-pass gmail.com check + exact-From allowlist + secret localpart (`s-9f3ka2@domain`) | Solid. Also gives Silas an outbound identity for long-form proactive messages |
| 20 | **Browser extension** (Chrome/Edge MV3) | `chrome.sidePanel` chat; SSE fetch runs in the panel page (alive while open — dodges the 30 s service-worker kill); right-click "ask Silas about selection", "send page to vault" via `/api/vault/ingest` | S (iframe PWA) – M (custom UI) | $0 | Token in `chrome.storage.local` (plaintext — fine for single-user machine); host_permissions scoped to the Vercel domain; never publish | **High.** v0 = iframe the PWA in the side panel (an afternoon); v1 = custom streaming panel + page-context ingestion |
| 21 | **Proactive daemon** ("always-thinking loop") | Supabase **pg_cron + pg_net** POSTs hourly to an authed `/api/daemon/tick`; Haiku reads recent vault/conversation activity + `silas_journal`, decides "worth reaching out?"; if yes → ntfy.sh / Pushover / Telegram push | **M** | ~$4/mo hourly (Haiku ~$0.0055/cycle); ntfy free / Pushover $5 once | Bearer secret on tick route; hard cap 2–3 msgs/day + quiet hours + pgvector novelty check | **High — and the schema already exists** (`silas_journal` has `morning_briefing`/`observation`/`reflection` + `triggered_by`). Vercel Hobby cron can't drive it (once-daily minimum); pg_cron can, free |
| 22 | Web Push to installed PWA | VAPID push from the daemon to the home-screen PWA (iOS ≥16.4) | M | $0 | Most private (no third party) | iOS subscriptions silently vanish, service-worker events misfire — treat as the eventual native-feeling UX, not the reliable channel. Ship ntfy/Telegram first |

---

## 2. TOP 3 quick wins (ranked)

### Quick win 1 — Telegram bot: Silas in Hudson's pocket, everywhere, free

Why first: one session, $0, works on phone/watch (Telegram's own watch notifications)/desktop,
sends Silas's **real ElevenLabs voice** as native voice bubbles, and becomes the two-way channel
the proactive daemon needs later. Highest capability-per-hour of anything in this document.

One-session sketch:
1. Add bearer middleware + `stream:false` mode (the §0 prerequisite).
2. Extract `runSilasTurn()` from the chat route so the bot reuses RAG + memory + note extraction.
3. BotFather → token → `setWebhook(url=/api/telegram, secret_token=...)`.
4. Route: verify `X-Telegram-Bot-Api-Secret-Token` → drop anything where
   `update.message.from.id !== HUDSON_TELEGRAM_ID` → `runSilasTurn()` → `sendMessage`
   (skip pseudo-streaming v1; send the complete reply).
5. Stretch: `sendVoice` with ElevenLabs opus output for replies under the 2,000-char TTS cap.

### Quick win 2 — "Talk to Silas" Siri Shortcut: Action Button + Watch + Car in one build

Why: a single Shortcut covers three surfaces at once — iPhone Action Button press-and-talk,
Apple Watch (complication / "Siri, run Silas" / Ultra Action Button), and hands-free in the car
("Hey Siri, run Silas" works while CarPlay is active, reply spoken over car speakers). No native
app, no App Store, $0. This is the proven ChatGPT-from-the-wrist pattern applied to our own API.

One-session sketch:
1. Requires §0 (`stream:false` + bearer token) — done in Quick win 1's session.
2. Shortcut: **Dictate Text** → **Get Contents of URL** (POST `/api/chat`,
   JSON `{message, conversationId: null, stream: false}`, header `Authorization: Bearer …`)
   → **Speak Text** (Siri voice) — or fetch `/api/tts` and **Play Sound** for the real voice.
3. Map to Action Button; enable "Show on Apple Watch"; add a watch-face complication.
4. Known wart: watchOS dictation auto-stop is buggy (watchOS 26.x) — may need a tap to end.

### Quick win 3 — Desktop PWA install (then the Tauri tray app as the M-size follow-up)

Why: near-zero work for a real Windows presence — taskbar icon, standalone window, jump-list
shortcuts, badging. SSE and mic work unchanged because it IS Chrome. Its two hard gaps
(no tray, no global hotkey — open Chromium limitations) are exactly what the later Tauri v2
project adds: one ~10 MB app = URL wrapper + tray popover on a compact `/mini` route +
`Ctrl+Shift+Space` overlay via `tauri-plugin-global-shortcut`.

One-session sketch:
1. Manifest polish: `display: standalone`, icons, `launch_handler: focus-existing`,
   manifest `shortcuts` (e.g. "New conversation"), optional window-controls overlay.
2. Install via Edge/Chrome on the desktop; verify SSE stream + mic + token entry screen.
3. Write the `/mini` compact chat route now (chat-only, no brain visualization) — it costs
   little and is the exact popover the Tauri tray app will load later.

---

## 3. TOP 2 most magical long plays

### Long play A — The proactive daemon: Silas reaches out first

This is the README's "always-thinking daemon" — the single biggest step from "app Hudson opens"
to "entity that lives." The `silas_journal` table already has `category`
(`morning_briefing`/`observation`/`reflection`), `triggered_by`, and `visible_to_user` — the
schema was designed for this and has been waiting.

Architecture (all free-tier except ~$4/mo of Haiku):
- **Scheduler:** Supabase **pg_cron + pg_net** POSTs hourly to `/api/daemon/tick` with a bearer
  secret. (Vercel Hobby cron is once-daily minimum — ruled out. GitHub Actions drifts by hours.
  pg_cron lives next to the brain and is free.)
- **Think:** the tick route digests recent vault activity + last conversations + last journal
  entries; **Haiku** gates "is this worth interrupting Hudson for?" (~$0.0055/cycle). Only a
  *yes* escalates to the full Silas model to compose. Every "considered but stayed silent"
  decision is logged to `silas_journal` (`visible_to_user: false`) so thresholds are tunable —
  and so `/mind` can later show what he was thinking.
- **Reach out:** v1 = **ntfy.sh** (free, real lock-screen push via its iOS app, one HTTP POST)
  or Pushover ($5 once, rock-solid). v2 = the **Telegram bot from Quick win 1**, which makes
  every proactive tap instantly two-way. Web Push to the PWA is the long-term native feel but
  iOS subscriptions are still flaky in 2026 — don't ship it as the only channel.
- **Guardrails:** hard cap 2–3 proactive messages/day, quiet hours, pgvector novelty check
  against the last N sent messages so he never repeats himself.

First-session slice: pg_cron job + authed tick route + Haiku gate + ntfy POST + journal logging.
That alone produces a morning briefing and occasional "I was reading your notes about X…" — alive.

### Long play B — The "Hey Silas" speaker: his voice, his name, in the room

A Raspberry Pi puck is the **only** surface in this entire survey that delivers both a true
"Hey Silas" wake word *and* Silas's actual ElevenLabs voice. Alexa keeps its own name and voice
(and Alexa+ is breaking classic skills); Google is closed; iPhone ambient listening is impossible.
The Pi answers to his name, in his voice, from the same brain — that's the magic moment.

Architecture ($50–120 hardware, ~pennies/day):
- Pi Zero 2 W/Pi 4 + ReSpeaker 2-Mic HAT (~$12–25) + small powered speaker.
- **Porcupine** custom "Hey Silas" wake word — type-to-train free in Picovoice Console
  (free tier ≈ 3 devices; note ~3 trainings/30 days, so plan platforms before training).
  Fully local; audio leaves the house only after the wake word fires.
- Wake → VAD end-of-utterance → **Whisper API** STT (~$0.006/min) → `POST /api/chat` (bearer,
  consume SSE) → sentence-chunk into **ElevenLabs Flash v2.5 WebSocket streaming** → speaker.
- Latency reality: ~2–4 s to first audible word — competitive with Alexa skill round-trips.
  ElevenLabs publishes a first-party Pi voice-assistant guide covering most of this pipeline.

First-session slice (desk-test before buying hardware): build the identical daemon **on the
Windows machine** (surface #10) — Porcupine + VAD + STT + chat + TTS is ~300 lines of Python.
Port to the Pi unchanged once it feels right. Skip Home Assistant unless Hudson wants HA anyway.

---

## 4. What to skip, and why (honest verdicts)

- **SMS/Twilio** — weeks of A2P 10DLC compliance + per-message fees for plain text. Telegram wins.
- **CarPlay proper** — the new iOS 26.4 conversational-app category still needs a published App
  Store app + discretionary entitlement. The Siri Shortcut already works in the car today.
- **Android Auto / Google Home** — closed to third parties (Gemini-only; Actions sunset 2023).
- **Alexa skill** — buildable, but wrong name, wrong voice (SSML audio hack aside), 8 s response
  cap, and a platform (Alexa+) actively breaking classic skills. The Pi does it right.
- **Baileys/unofficial WhatsApp** — ToS violation with real ban risk to a personal number.
- **Native watchOS app** — real but L-effort + $99/yr; the Shortcut delivers 80% for ~0%.

## 5. Suggested sequencing

1. **Session 1:** §0 auth + `stream:false` + `runSilasTurn()` extraction, then Telegram bot.
2. **Session 2:** Siri Shortcut (Action Button + Watch + Car) — pure client-side, tests the token.
3. **Session 3:** Desktop PWA polish + `/mini` route.
4. **Sessions 4–6:** Proactive daemon v1 (pg_cron + Haiku gate + ntfy → then Telegram two-way).
5. **Sessions 7–9:** Windows voice daemon → port to Pi speaker when hardware arrives.
6. **Later:** Tauri tray/hotkey app, browser extension, email interface.

---

## Sources

**Desktop / PWA / Tauri**
- Window Controls Overlay: https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/window-controls-overlay ; https://developer.mozilla.org/en-US/docs/Web/API/Window_Controls_Overlay_API
- PWA protocol handlers: https://blogs.windows.com/msedgedev/2022/01/20/getting-started-url-protocol-handlers-microsoft-edge/
- PWAs in Windows 11 App Actions (Edge 137+): https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/whats-new/pwa
- PWA global-hotkey gaps (open Chromium issues): https://issues.chromium.org/issues/40749250 ; https://issues.chromium.org/issues/40229635
- Tauri vs Electron benchmarks: https://www.gethopp.app/blog/tauri-vs-electron ; https://www.buildmvpfast.com/blog/tauri-v2-vs-electron-desktop-apps-2026 ; https://www.raftlabs.com/blog/tauri-vs-electron-pros-cons/
- Tauri remote-URL windows: https://github.com/tauri-apps/tauri/issues/986 ; https://github.com/tauri-apps/tauri/issues/12333
- Tauri WebView2 mic-permission issues: https://github.com/tauri-apps/tauri/issues/8979 ; https://github.com/tauri-apps/tauri/issues/5042
- Tauri system tray: https://v2.tauri.app/learn/system-tray/
- Tauri global shortcut plugin: https://v2.tauri.app/plugin/global-shortcut/ ; https://dev.to/hiyoyok/global-keyboard-shortcuts-in-tauri-v2-the-right-way-and-the-wrong-way-2h6d

**Voice / wake word**
- Picovoice free tier: https://picovoice.ai/pricing/ ; https://www.hackster.io/news/picovoice-launches-completely-free-usage-tier-for-offline-voice-recognition-for-up-to-three-users-e1eafbc97bb0
- Porcupine custom wake word training: https://picovoice.ai/blog/console-tutorial-custom-wake-word/
- Porcupine Web/WASM: https://picovoice.ai/docs/quick-start/porcupine-web/ ; https://github.com/picovoice/porcupine
- openWakeWord + training pipelines: https://github.com/dscripka/openWakeWord ; https://github.com/CoreWorxLab/openwakeword-training ; https://openwakeword.com/train
- iOS background mic/audio limits: https://developer.apple.com/forums/thread/774239 ; https://developer.apple.com/forums/thread/689182 ; https://www.magicbell.com/blog/pwa-iOS-limitations-safari-support-complete-guide
- iOS 26 PWA audio regression: https://forums.macrumors.com/threads/ios-26-audio-issues-in-pwa-web-apps-not-fixed-in-26-1.2466839/
- Shortcuts custom API requests: https://support.apple.com/guide/shortcuts/apd58d46713f/ios
- OpenAI transcription pricing: https://developers.openai.com/api/docs/pricing

**Messaging**
- Telegram Bot API / setWebhook secret token: https://core.telegram.org/bots/api
- Telegram bots on Vercel App Router: https://www.launchfa.st/blog/telegram-nextjs-app-router ; https://www.marclittlemore.com/serverless-telegram-chatbot-vercel/
- sendVoice OGG/Opus requirement: https://gramio.dev/telegram/methods/sendvoice
- ElevenLabs→Telegram voice bot example: https://github.com/olllayor/elevenlabs-telegram-bot
- Discord interactions endpoint on Vercel: https://blog.sebastianaldi.com/posts/hosting-a-bot-in-vercel/ ; https://github.com/jzxhuang/nextjs-discord-bot ; https://codehooks.io/docs/examples/webhooks/discord
- Discord deferred responses: https://docs.discord.food/interactions/receiving-and-responding
- WhatsApp pricing (per-message since July 2025; free service window): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing ; https://respond.io/blog/whatsapp-business-api-pricing
- Baileys/unofficial ban risk: https://zenvanriel.com/ai-engineer-blog/openclaw-whatsapp-risks-engineers-guide/
- Twilio A2P 10DLC sole proprietor: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview ; fees: https://help.twilio.com/articles/1260803965530 ; SMS pricing: https://www.twilio.com/en-us/sms/pricing/us

**Watch / Car**
- Shortcuts on Apple Watch: https://support.apple.com/guide/shortcuts/run-shortcuts-from-apple-watch-apd5888b0858/ios ; https://support.apple.com/guide/watch/shortcuts-apd99050d435/watchos
- ChatGPT-from-watch shortcut pattern: https://axup.substack.com/p/ai-ux-using-chatgpt-from-your-apple ; https://allthings.how/how-to-use-chatgpt-on-apple-watch/
- watchOS dictation auto-stop bug: https://discussions.apple.com/thread/256148833
- CarPlay entitlements: https://developer.apple.com/documentation/carplay/requesting-carplay-entitlements
- iOS 26.4 CarPlay conversational-apps category: https://9to5mac.com/2026/03/31/chatgpt-app-launches-for-carplay-on-ios-26-4/ ; https://www.macrumors.com/2026/02/18/ios-26-4-carplay-support/
- Gemini on Android Auto: https://9to5google.com/2025/11/06/android-auto-gemini-starts-rolling-out/

**Smart speakers**
- Alexa progressive response (8 s cap): https://developer.amazon.com/en-US/docs/alexa/custom-skills/progressive-response-api-reference.html
- Alexa SSML audio limits: https://developer.amazon.com/en-US/docs/alexa/custom-skills/speech-synthesis-markup-language-ssml-reference.html
- Alexa+ breaking skills: https://www.amazonforum.com/s/question/0D5at00000M1rNgCAJ/updated-to-alexa-and-having-issues-with-skills
- Home Assistant Voice PE: https://www.home-assistant.io/voice-pe/ ; custom wake words: https://www.home-assistant.io/voice_control/create_wake_word/
- ElevenLabs Raspberry Pi voice assistant guide: https://elevenlabs.io/docs/agents-platform/guides/integrations/raspberry-pi-voice-assistant
- ElevenLabs Flash model latency: https://elevenlabs.io/docs/overview/models
- Pi voice pipeline latency benchmark: https://bmdpat.com/blog/raspberry-pi-5-local-voice-ai-2026
- Google Conversational Actions sunset: https://developers.google.com/assistant/ca-sunset

**Email / extension**
- Cloudflare Email Workers: https://developers.cloudflare.com/email-routing/email-workers/ ; SPF/DKIM enforcement (July 2025): https://developers.cloudflare.com/changelog/post/2025-06-30-mail-authentication
- Resend inbound (Nov 2025) + free tier: https://resend.com/blog/new-features-in-2025 ; https://resend.com/docs/dashboard/receiving/introduction ; https://resend.com/pricing
- Postmark inbound/pricing: https://postmarkapp.com/developer/webhooks/inbound-webhook ; https://postmarkapp.com/pricing
- SendGrid free plan retired May 2025: https://www.twilio.com/en-us/changelog/sendgrid-free-plan
- Gmail API push: https://developers.google.com/workspace/gmail/api/guides/push
- Chrome side panel API: https://developer.chrome.com/docs/extensions/reference/api/sidePanel ; Edge sidebar: https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/sidebar
- MV3 service-worker lifetime: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle ; https://developer.chrome.com/blog/longer-esw-lifetimes
- Token storage in extensions: https://curity.medium.com/best-practices-for-storing-access-tokens-in-the-browser-6b3d515d9814

**Proactive daemon**
- Vercel cron limits (Hobby = daily min): https://vercel.com/docs/cron-jobs ; https://crontap.com/blog/vercel-cron-hourly-limit-and-how-to-beat-it
- Vercel Fluid compute durations: https://vercel.com/changelog/higher-defaults-and-limits-for-vercel-functions-running-fluid-compute
- Supabase Cron: https://supabase.com/modules/cron ; free-tier discussion: https://github.com/orgs/supabase/discussions/37405 ; Edge Function limits: https://supabase.com/docs/guides/functions/limits
- GitHub Actions schedule drift: https://github.com/orgs/community/discussions/196910 ; https://oneuptime.com/blog/post/2025-12-20-scheduled-workflows-cron-github-actions/view
- Cloudflare Workers cron triggers: https://developers.cloudflare.com/workers/platform/limits
- iOS PWA web push reliability: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide ; https://edana.ch/en/2026/03/19/push-notifications-on-web-applications-pwa-is-it-really-reliable-on-ios-and-android/
- ntfy.sh: https://ntfy.sh/ ; Pushover: https://pushover.net/
- Proactive-agent pattern: https://medium.com/@vivioo.io/your-ai-agent-isnt-proactive-it-s-just-a-cron-job-with-a-personality-6a42440539e6 ; ProactiveAgent (ICLR 2025): https://proactllm.github.io/
