"use client";

import { useEffect, useRef, useState } from "react";
import { unlockAudio } from "@/lib/speech";

// ---------------------------------------------------------------------------
// Minimal Web Speech API shapes. The browser types aren't in lib.dom, so we
// describe only the slice we use. No new deps — this is a native browser API.
// ---------------------------------------------------------------------------
type SRAlternative = { transcript: string };
type SRResult = { 0: SRAlternative; isFinal: boolean; length: number };
type SRResultList = { length: number; [i: number]: SRResult };
type SREvent = { results: SRResultList; resultIndex: number };
type SRErrorEvent = { error: string };
type SRInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type SRCtor = new () => SRInstance;

function getSpeechRecognition(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRCtor;
    webkitSpeechRecognition?: SRCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SRInstance | null>(null);
  const cancelledRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + "px";
    }
  }, [text]);

  // Detect support once; hide the mic entirely on browsers without it.
  useEffect(() => {
    setMicSupported(getSpeechRecognition() !== null);
  }, []);

  function flashToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  // Tear down recognition + toast timer on unmount.
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  function submit() {
    if (disabled || !text.trim()) return;
    // Arm audio inside this gesture so iOS Safari lets Silas speak the reply.
    unlockAudio();
    onSend(text.trim());
    setText("");
  }

  function startListening() {
    const Ctor = getSpeechRecognition();
    if (!Ctor || disabled) return;

    // Arm audio here too — the mic tap is the user gesture that will lead to an
    // auto-sent message, which iOS otherwise wouldn't let us play audio for.
    unlockAudio();

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    cancelledRef.current = false;

    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      // Show interim live in the field; on a final result, auto-send.
      if (final) {
        const toSend = final.trim();
        setText(toSend);
        if (toSend && !cancelledRef.current) {
          onSend(toSend);
          setText("");
        }
      } else {
        setText(interim);
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        flashToast("Mic access denied");
      } else if (e.error === "no-speech") {
        flashToast("Didn't catch that");
      }
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch {
      flashToast("Mic unavailable");
      setListening(false);
    }
  }

  function stopListening() {
    cancelledRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    setListening(false);
  }

  function toggleMic() {
    if (listening) stopListening();
    else startListening();
  }

  return (
    <div className="relative">
      {toast && (
        <div
          className="absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full silas-glass px-4 py-2 text-sm text-[var(--text)]"
          role="status"
        >
          {toast}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-full silas-glass pl-2 pr-2 py-2">
        {micSupported && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={disabled}
            className={`flex items-center justify-center w-11 h-11 rounded-full shrink-0 transition-transform active:scale-90 disabled:opacity-40 ${
              listening ? "silas-mic-live" : "silas-mic"
            }`}
            aria-label={listening ? "Stop listening" : "Speak to Silas"}
            aria-pressed={listening}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M19 11a7 7 0 0 1-14 0M12 18v3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={listening ? "listening…" : "talk to silas…"}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none leading-relaxed max-h-[160px] py-2.5"
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="silas-send flex items-center justify-center w-11 h-11 rounded-full shrink-0 disabled:opacity-40 transition-transform active:scale-90"
          aria-label="Send"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 19V5M12 5l-6 6M12 5l6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
