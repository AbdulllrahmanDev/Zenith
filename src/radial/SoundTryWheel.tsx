import React, { useMemo, useState } from "react";
import { Volume2 } from "lucide-react";
import { RovylLogo } from "./RovylLogo";
import { SmartIcon } from "./SmartIcon";
import {
  computeRadialLayout,
  getReadableForeground,
  normalizeHoverColor,
  RadialSectors,
  snapToDevicePixel,
} from "./radialLayout";
import { isRadialSoundId, playRadialSound, type RadialSoundId } from "./radialSound";
import type { RadialItem } from "./types";

export interface SoundTryWheelProps {
  openSoundId: RadialSoundId | "off";
  hoverSoundId: RadialSoundId | "off";
  soundEnabled: boolean;
  hoverColor?: string;
}

const DEMO_ITEMS: RadialItem[] = [
  { id: "s1", label: "Browser", type: "url", target: "https://google.com", icon: "Globe" },
  { id: "s2", label: "Terminal", type: "app", target: "wt.exe", icon: "Terminal" },
  { id: "s3", label: "Files", type: "folder", target: "C:\\", icon: "Folder" },
  { id: "s4", label: "Music", type: "system", target: "media-toggle", icon: "Music" },
  { id: "s5", label: "Code", type: "app", target: "code", icon: "Code" },
  { id: "s6", label: "Settings", type: "system", target: "settings", icon: "Settings" },
];

export const SoundTryWheel: React.FC<SoundTryWheelProps> = ({
  openSoundId,
  hoverSoundId,
  soundEnabled,
  hoverColor = "#FFFFFF",
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hubPulse, setHubPulse] = useState(false);

  const { actualMenuRadius, actualIconSize } = useMemo(
    () =>
      computeRadialLayout({
        numberOfApps: DEMO_ITEMS.length,
        iconSizePx: 44,
        minGap: 10,
        menuRadius: 96,
        activationThreshold: 40,
        viewportSize: { width: 1200, height: 800 },
      }),
    []
  );

  const normHover = normalizeHoverColor(hoverColor);
  const hoverFg = getReadableForeground(normHover);
  const hubDiameter = 40;
  const sectorOuterRadius = actualMenuRadius + actualIconSize * 1.45;
  const falloffRadius = actualMenuRadius + actualIconSize * 0.78;
  const stepDeg = 360 / DEMO_ITEMS.length;
  const boxSize = 200;
  const scale = 0.68;

  const handleSectorEnter = (idx: number) => {
    setHoveredIdx(idx);
    if (soundEnabled && hoverSoundId !== "off" && isRadialSoundId(hoverSoundId)) {
      playRadialSound(hoverSoundId);
    }
  };

  const handleHubClick = () => {
    setHubPulse(true);
    setTimeout(() => setHubPulse(false), 220);
    if (soundEnabled && openSoundId !== "off" && isRadialSoundId(openSoundId)) {
      playRadialSound(openSoundId);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "14px",
        borderRadius: 16,
        background:
          "linear-gradient(155deg, rgba(38, 41, 52, 0.92) 0%, rgba(20, 21, 27, 0.96) 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        gap: 8,
      }}
    >
      <div
        style={{
          position: "relative",
          width: boxSize,
          height: boxSize,
          userSelect: "none",
          overflow: "hidden",
          borderRadius: 12,
        }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 0,
            height: 0,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <RadialSectors
            count={DEMO_ITEMS.length}
            activeIndex={hoveredIdx}
            radiusInner={hubDiameter / 2 + 4}
            radiusOuter={sectorOuterRadius}
            hoverColor={normHover}
            falloffRadius={falloffRadius}
            visible={true}
            dimmed={false}
          />

          {/* Center hub — click to audition Open Sound */}
          <button
            type="button"
            onClick={handleHubClick}
            title="Click to test Open Sound"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: hubDiameter,
              height: hubDiameter,
              transform: `translate(-50%, -50%) scale(${hubPulse ? 0.9 : 1})`,
              transition: "transform 130ms cubic-bezier(0.22, 1, 0.36, 1)",
              borderRadius: "50%",
              background: "#16161a",
              border: "1px solid rgba(255, 255, 255, 0.24)",
              boxShadow: "0 6px 18px rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              cursor: "pointer",
              zIndex: 15,
            }}
          >
            <RovylLogo size={18} />
          </button>

          {/* Sector tiles */}
          {DEMO_ITEMS.map((item, i) => {
            const isActive = i === hoveredIdx;
            const angleDeg = i * stepDeg - 90;
            const rad = (angleDeg * Math.PI) / 180;
            const ix = actualMenuRadius * Math.cos(rad);
            const iy = actualMenuRadius * Math.sin(rad);

            return (
              <div
                key={item.id}
                onMouseEnter={() => handleSectorEnter(i)}
                onClick={handleHubClick}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: actualIconSize,
                  height: actualIconSize,
                  transform: `translate(-50%, -50%) translate3d(${snapToDevicePixel(
                    ix
                  )}px, ${snapToDevicePixel(iy)}px, 0) scale(${isActive ? 1.08 : 1})`,
                  transition:
                    "transform 130ms ease, background-color 140ms ease, border-color 140ms ease",
                  borderRadius: 16,
                  backgroundColor: isActive ? normHover : "#16161a",
                  border: isActive
                    ? `1px solid ${normHover}`
                    : "1px solid rgba(255,255,255,0.24)",
                  color: isActive ? hoverFg : "#ffffff",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.42)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  zIndex: isActive ? 20 : 12,
                }}
              >
                <SmartIcon item={item} size={actualIconSize} />
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "rgba(255,255,255,0.64)",
          textAlign: "center",
        }}
      >
        <Volume2 size={13} />
        <span>Hover tiles for hover voice · Click hub for open voice</span>
      </div>
    </div>
  );
};
