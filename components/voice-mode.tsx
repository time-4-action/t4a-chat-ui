"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, Volume2, Loader2 } from "lucide-react";
import { UIMessage } from "ai";
import { cn } from "@/lib/utils";

type VoicePhase = "idle" | "listening" | "processing" | "speaking";

interface Props {
  messages: UIMessage[];
  status: string;
  onTranscript: (text: string) => void;
  onInterim: (text: string) => void;
}

// Volume thresholds (0–255 byte frequency average)
const SPEECH_THRESHOLD = 10;       // above this = user is speaking
const INTERRUPT_THRESHOLD = 15;    // above this during AI speech = interrupt
const SILENCE_DURATION_MS = 600;   // ms of silence before submitting utterance

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

function extractChunks(text: string): { chunks: string[]; remainder: string } {
  const chunks: string[] = [];
  const regex = /[^.!?\n]*[.!?\n]+/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    chunks.push(match[0].trim());
    lastIndex = match.index + match[0].length;
  }
  let remainder = text.slice(lastIndex);
  const commaIdx = remainder.lastIndexOf(", ");
  if (commaIdx > 0 && remainder.length >= 80) {
    chunks.push(remainder.slice(0, commaIdx + 1).trim());
    remainder = remainder.slice(commaIdx + 2);
  }
  return { chunks, remainder };
}

export default function VoiceMode({ messages, status, onTranscript, onInterim }: Props) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const phaseRef = useRef<VoicePhase>("idle");

  // VAD
  const vadCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);

  // Recording
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechBufferRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // TTS playback
  const playCtxRef = useRef<AudioContext | null>(null);
  const ttsQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  const ttsTrackerRef = useRef({ msgId: "", index: 0, buffer: "" });
  const isSubmittingRef = useRef(false);
  const ttsGenRef = useRef(0); // incremented on killAudio — stale chains check this and bail

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── TTS playback ────────────────────────────────────────────────────────────

  function getPlayCtx(): AudioContext {
    if (!playCtxRef.current || playCtxRef.current.state === "closed") {
      // Fallback only — ideally the context was already created in activate()
      playCtxRef.current = new AudioContext();
    }
    return playCtxRef.current;
  }

  async function playBuffer(buf: ArrayBuffer): Promise<void> {
    const ctx = getPlayCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const audio = await ctx.decodeAudioData(buf);
    return new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = audio;
      src.connect(ctx.destination);
      src.onended = () => resolve();
      src.start(0);
    });
  }

  function killAudio() {
    playCtxRef.current?.close();
    playCtxRef.current = null;
    pendingRef.current = 0;
    ttsQueueRef.current = Promise.resolve();
    ttsGenRef.current++; // invalidates all old queued chains
  }

  const enqueueTTS = useCallback((text: string) => {
    const clean = stripMarkdown(text);
    if (!clean) return;
    const gen = ttsGenRef.current; // capture generation at enqueue time
    pendingRef.current++;
    ttsQueueRef.current = ttsQueueRef.current.then(async () => {
      // Bail if audio was killed (interrupted) since this was enqueued
      if (ttsGenRef.current !== gen) { pendingRef.current--; return; }
      if (phaseRef.current === "idle") { pendingRef.current--; return; }
      try {
        phaseRef.current = "speaking";
        setPhase("speaking");
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: clean }),
        });
        const active = () => (phaseRef.current as string) !== "idle";
        if (res.ok && active()) {
          const buf = await res.arrayBuffer();
          if (active()) await playBuffer(buf);
        }
      } catch (e) {
        console.error("TTS error:", e);
      } finally {
        pendingRef.current--;
        if (pendingRef.current === 0 && phaseRef.current === "speaking") {
          phaseRef.current = "listening";
          setPhase("listening");
        }
      }
    });
  }, []);

  // ── Watch messages → TTS ────────────────────────────────────────────────────

  useEffect(() => {
    if (phaseRef.current === "idle") return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;

    const fullText = lastMsg.parts
      ?.filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join("") ?? "";

    const tracker = ttsTrackerRef.current;
    if (lastMsg.id !== tracker.msgId) {
      tracker.msgId = lastMsg.id;
      tracker.index = 0;
      tracker.buffer = "";
    }
    const newText = fullText.slice(tracker.index);
    if (!newText) return;
    tracker.index = fullText.length;
    tracker.buffer += newText;

    if (status === "complete" || status === "error") {
      if (tracker.buffer.trim()) { enqueueTTS(tracker.buffer); tracker.buffer = ""; }
    } else {
      const { chunks, remainder } = extractChunks(tracker.buffer);
      tracker.buffer = remainder;
      chunks.forEach((c) => enqueueTTS(c));
    }
  }, [messages, status, enqueueTTS]);


  // ── STT: VAD + MediaRecorder + Deepgram REST ────────────────────────────────

  async function submitAudio(blob: Blob) {
    if (!blob.size || (phaseRef.current as string) === "idle") return;
    if (isSubmittingRef.current) return; // prevent concurrent submissions
    isSubmittingRef.current = true;
    try {
      const res = await fetch("/api/stt", { method: "POST", body: blob });
      if (!res.ok) return;
      const { transcript } = await res.json();
      if (transcript?.trim() && (phaseRef.current as string) !== "idle") {
        onInterim("");
        phaseRef.current = "processing"; // sync — VAD stops acting on next tick
        setPhase("processing");
        isSpeakingRef.current = false;
        onTranscript(transcript.trim());
      }
    } catch (e) {
      console.error("STT error:", e);
    } finally {
      isSubmittingRef.current = false;
    }
  }

  function startVAD(stream: MediaStream) {
    const ctx = new AudioContext();
    vadCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // MediaRecorder collects audio during speech
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) speechBufferRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(speechBufferRef.current, { type: "audio/webm" });
      speechBufferRef.current = [];
      submitAudio(blob);
    };

    function tick() {
      analyser.getByteFrequencyData(dataArray);
      const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      // Interruption: user speaks while AI is talking → cut audio immediately
      if (volume > INTERRUPT_THRESHOLD && phaseRef.current === "speaking") {
        killAudio();
        phaseRef.current = "listening"; // sync — next tick sees "listening" immediately
        setPhase("listening");
        isSpeakingRef.current = false;
        speechBufferRef.current = [];
        isSubmittingRef.current = false;
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      }

      if (phaseRef.current === "listening") {
        if (volume > SPEECH_THRESHOLD) {
          // Speech detected
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            speechBufferRef.current = [];
            if (recorder.state === "inactive") recorder.start(100);
            onInterim("…");
          }
          // Cancel any pending silence timer
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (isSpeakingRef.current && !silenceTimerRef.current) {
          // Silence after speech → submit after delay
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            isSpeakingRef.current = false;
            if (recorder.state === "recording") recorder.stop();
            onInterim("");
          }, SILENCE_DURATION_MS);
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    tick();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async function activate() {
    try {
      // Create + resume AudioContext during the user gesture (button click)
      // so the browser allows playback when TTS arrives later
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      playCtxRef.current = ctx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      ttsTrackerRef.current = { msgId: "", index: 0, buffer: "" };
      pendingRef.current = 0;
      ttsQueueRef.current = Promise.resolve();
      isSpeakingRef.current = false;
      phaseRef.current = "listening";
      setPhase("listening");
      startVAD(stream);
    } catch (e) {
      console.error("Mic access denied:", e);
    }
  }

  function deactivate() {
    phaseRef.current = "idle"; // sync so in-flight callbacks bail immediately
    setPhase("idle");
    onInterim("");
    cancelAnimationFrame(animFrameRef.current);
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    vadCtxRef.current?.close(); vadCtxRef.current = null;
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    killAudio();
    isSpeakingRef.current = false;
    ttsTrackerRef.current = { msgId: "", index: 0, buffer: "" };
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <button
      type="button"
      onClick={phase === "idle" ? activate : deactivate}
      title={
        phase === "idle" ? "Start voice mode"
        : phase === "listening" ? "Listening… (click to stop)"
        : phase === "processing" ? "AI is thinking…"
        : "AI is speaking… (click to stop)"
      }
      className={cn(
        "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
        phase === "idle" && "bg-slate-200 text-slate-500 hover:bg-slate-300",
        phase === "listening" && "bg-red-500 text-white shadow-md animate-pulse",
        phase === "processing" && "bg-slate-300 text-slate-500",
        phase === "speaking" && "bg-blue-500 text-white shadow-md"
      )}
      aria-label={phase === "idle" ? "Start voice mode" : "Stop voice mode"}
    >
      {phase === "listening" && <Mic className="h-4 w-4" />}
      {phase === "processing" && <Loader2 className="h-4 w-4 animate-spin" />}
      {phase === "speaking" && <Volume2 className="h-4 w-4" />}
      {phase === "idle" && <Mic className="h-4 w-4" />}
    </button>
  );
}
