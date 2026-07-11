import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";

interface CursorPos {
  x: number;
  y: number;
}

export function Pet() {
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Follow cursor with a gentle lag
  useEffect(() => {
    let animFrame: number;
    let targetX = 0;
    let targetY = 0;

    const appWindow = getCurrentWindow();

    const followCursor = async () => {
      try {
        const pos: CursorPos = await invoke("get_cursor_position");
        const factor = appWindow ? await appWindow.scaleFactor() : 1;
        const windowPos = await appWindow.outerPosition();

        // Calculate where to look (relative to window center)
        const centerX = windowPos.x / factor + 60;
        const centerY = windowPos.y / factor + 60;

        const dx = pos.x - centerX;
        const dy = pos.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Clamp eye movement to max 8px
        const maxOffset = 8;
        if (dist > 0) {
          targetX = (dx / dist) * Math.min(dist / 15, maxOffset);
          targetY = (dy / dist) * Math.min(dist / 15, maxOffset);
        }

        setEyeOffset((prev) => ({
          x: prev.x + (targetX - prev.x) * 0.3,
          y: prev.y + (targetY - prev.y) * 0.3,
        }));

        // Move window towards cursor with gentle follow
        const speed = 2;
        const windowTargetX = pos.x - 60;
        const windowTargetY = pos.y - 60;
        const currentX = windowPos.x / factor;
        const currentY = windowPos.y / factor;

        const newX = currentX + (windowTargetX - currentX) * 0.02 * speed;
        const newY = currentY + (windowTargetY - currentY) * 0.02 * speed;

        await appWindow.setPosition(new LogicalPosition(newX, newY));
      } catch {
        // Silently handle errors during cursor tracking
      }

      animFrame = requestAnimationFrame(followCursor);
    };

    followCursor();
    return () => cancelAnimationFrame(animFrame);
  }, []);

  // Random blink
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    }, 3000 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  const handleClick = async () => {
    try {
      await invoke("open_chat_window");
    } catch (e) {
      console.error("Failed to open chat:", e);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-[120px] h-[120px] flex items-center justify-center"
      style={{ background: "transparent" }}
      data-tauri-drag-region
    >
      <div
        className={`relative w-[80px] h-[80px] rounded-full cursor-pointer transition-transform duration-200 ${
          isHovered ? "scale-110" : "scale-100"
        }`}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          background: "radial-gradient(circle at 35% 35%, #a855f7, #7c3aed, #5b21b6)",
          boxShadow: isHovered
            ? "0 0 30px rgba(168, 85, 247, 0.6), 0 0 60px rgba(168, 85, 247, 0.3)"
            : "0 0 20px rgba(168, 85, 247, 0.4), 0 0 40px rgba(168, 85, 247, 0.2)",
        }}
      >
        {/* Left eye */}
        <div
          className="absolute top-[30px] left-[22px] w-[14px] h-[14px] bg-white rounded-full flex items-center justify-center"
          style={{
            height: isBlinking ? "3px" : "14px",
            transition: "height 0.1s",
          }}
        >
          {!isBlinking && (
            <div
              className="w-[7px] h-[7px] bg-gray-900 rounded-full"
              style={{
                transform: `translate(${eyeOffset.x * 0.4}px, ${eyeOffset.y * 0.4}px)`,
              }}
            />
          )}
        </div>

        {/* Right eye */}
        <div
          className="absolute top-[30px] right-[22px] w-[14px] h-[14px] bg-white rounded-full flex items-center justify-center"
          style={{
            height: isBlinking ? "3px" : "14px",
            transition: "height 0.1s",
          }}
        >
          {!isBlinking && (
            <div
              className="w-[7px] h-[7px] bg-gray-900 rounded-full"
              style={{
                transform: `translate(${eyeOffset.x * 0.4}px, ${eyeOffset.y * 0.4}px)`,
              }}
            />
          )}
        </div>

        {/* Mouth - small smile */}
        {isHovered && (
          <div
            className="absolute bottom-[18px] left-1/2 -translate-x-1/2 w-[16px] h-[8px] border-b-2 border-white rounded-b-full"
          />
        )}
      </div>
    </div>
  );
}
