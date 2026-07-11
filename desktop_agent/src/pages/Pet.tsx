import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { createVoiceRecognition } from "../lib/voice";

interface CursorPos {
  x: number;
  y: number;
}

const POLL_INTERVAL_MS = 50;
const WINDOW_SIZE = 56;
const FOLLOW_SPEED = 0.12;

export function Pet() {
  const [isHovered, setIsHovered] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const cursorRef = useRef<CursorPos>({ x: 0, y: 0 });
  const animFrameRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>();
  const voiceRef = useRef<ReturnType<typeof createVoiceRecognition>>(null);

  const handleVoiceResult = useCallback(async (transcript: string, isFinal: boolean) => {
    if (!isFinal) return;
    setIsProcessing(true);
    try {
      await invoke("open_chat_window");
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("nova-voice-command", { detail: transcript })
        );
        setIsProcessing(false);
      }, 300);
    } catch {
      setIsProcessing(false);
    }
  }, []);

  const handleVoiceState = useCallback((listening: boolean) => {
    setIsListening(listening);
  }, []);

  useEffect(() => {
    voiceRef.current = createVoiceRecognition(handleVoiceResult, handleVoiceState);
  }, [handleVoiceResult, handleVoiceState]);

  // Listen for global shortcut voice trigger
  useEffect(() => {
    const unlisten = listen("trigger-voice", () => {
      if (voiceRef.current && !isListening) {
        voiceRef.current.start();
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [isListening]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const halfSize = WINDOW_SIZE / 2;

    pollTimerRef.current = setInterval(async () => {
      try {
        const pos: CursorPos = await invoke("get_cursor_position");
        cursorRef.current = pos;
      } catch {}
    }, POLL_INTERVAL_MS);

    const animate = async () => {
      try {
        const pos = cursorRef.current;
        const factor = await appWindow.scaleFactor();
        const windowPos = await appWindow.outerPosition();

        const currentX = windowPos.x / factor;
        const currentY = windowPos.y / factor;
        const newX = currentX + (pos.x - halfSize - currentX) * FOLLOW_SPEED;
        const newY = currentY + (pos.y - halfSize - currentY) * FOLLOW_SPEED;

        await appWindow.setPosition(new LogicalPosition(newX, newY));
      } catch {}

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleClick = async () => {
    // Single click: start voice command
    if (voiceRef.current) {
      if (isListening) {
        voiceRef.current.stop();
      } else {
        voiceRef.current.start();
      }
    }
  };

  const handleDoubleClick = async () => {
    // Double click: open chat window for typing
    try {
      await invoke("open_chat_window");
    } catch {}
  };

  const getState = () => {
    if (isProcessing) return "processing";
    if (isListening) return "listening";
    if (isHovered) return "hover";
    return "idle";
  };

  const state = getState();

  return (
    <div
      className="flex items-center justify-center"
      style={{ width: WINDOW_SIZE, height: WINDOW_SIZE, background: "transparent" }}
      data-tauri-drag-region
    >
      <div
        className="relative cursor-pointer"
        style={{ width: 40, height: 40 }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Scanning ring — spins when listening */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 40 40"
          style={{
            animation: state === "listening" ? "spin 2s linear infinite" : state === "processing" ? "spin 0.8s linear infinite" : "none",
            opacity: state === "idle" ? 0 : 1,
            transition: "opacity 0.3s",
          }}
        >
          <circle
            cx="20" cy="20" r="18"
            fill="none"
            strokeWidth="1.5"
            strokeDasharray="20 60"
            strokeLinecap="round"
            stroke={state === "listening" ? "#60a5fa" : state === "processing" ? "#a78bfa" : "#a855f7"}
          />
        </svg>

        {/* Outer boundary — rounded square (squircle feel) */}
        <div
          className="absolute inset-[4px] rounded-[10px] transition-all duration-300"
          style={{
            background: state === "listening"
              ? "linear-gradient(135deg, #1e3a5f, #1e293b)"
              : state === "processing"
                ? "linear-gradient(135deg, #2d1b69, #1e1b4b)"
                : "linear-gradient(135deg, #1a1a2e, #16213e)",
            border: `1px solid ${
              state === "listening" ? "rgba(96, 165, 250, 0.4)"
              : state === "hover" ? "rgba(168, 85, 247, 0.5)"
              : "rgba(255, 255, 255, 0.08)"
            }`,
            boxShadow: state === "listening"
              ? "0 0 12px rgba(96, 165, 250, 0.3), inset 0 1px 0 rgba(255,255,255,0.05)"
              : state === "hover"
                ? "0 0 12px rgba(168, 85, 247, 0.3), inset 0 1px 0 rgba(255,255,255,0.05)"
                : "0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          {/* Core indicator — the "brain" */}
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Inner diamond / neural core */}
            <div
              className="relative transition-all duration-300"
              style={{
                width: state === "hover" ? 14 : 12,
                height: state === "hover" ? 14 : 12,
              }}
            >
              {/* Diamond shape */}
              <div
                className="absolute inset-0 rotate-45 rounded-[3px] transition-all duration-300"
                style={{
                  background: state === "listening"
                    ? "linear-gradient(135deg, #3b82f6, #60a5fa)"
                    : state === "processing"
                      ? "linear-gradient(135deg, #8b5cf6, #a78bfa)"
                      : "linear-gradient(135deg, #7c3aed, #a855f7)",
                  boxShadow: state === "listening"
                    ? "0 0 8px rgba(96, 165, 250, 0.6)"
                    : "0 0 6px rgba(168, 85, 247, 0.5)",
                }}
              />
              {/* Center dot */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-all duration-200"
                style={{
                  width: state === "processing" ? 4 : 3,
                  height: state === "processing" ? 4 : 3,
                  opacity: state === "processing" ? 1 : 0.8,
                }}
              />
            </div>
          </div>

          {/* Status dots — bottom corners */}
          <div
            className="absolute bottom-[5px] left-1/2 -translate-x-1/2 flex gap-[3px]"
          >
            <div
              className="w-[3px] h-[3px] rounded-full transition-colors duration-300"
              style={{
                background: state === "listening" ? "#60a5fa" : state === "processing" ? "#a78bfa" : "rgba(255,255,255,0.15)",
              }}
            />
            <div
              className="w-[3px] h-[3px] rounded-full transition-colors duration-300"
              style={{
                background: state !== "idle" ? (state === "listening" ? "#60a5fa" : "#a78bfa") : "rgba(255,255,255,0.15)",
                animationDelay: "0.1s",
              }}
            />
            <div
              className="w-[3px] h-[3px] rounded-full transition-colors duration-300"
              style={{
                background: state === "processing" ? "#a78bfa" : "rgba(255,255,255,0.15)",
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
