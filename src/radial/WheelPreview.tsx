import React, { useMemo, useState } from "react";
import { radialScrimGradient } from "./radialScrim";
import { ZenithLogo } from "./ZenithLogo";
import { SmartIcon } from "./SmartIcon";
import {
  computeRadialLayout,
  getLabelPlacement,
  getReadableForeground,
  normalizeHoverColor,
  RadialSectors,
  roundedRectPathFromTop,
  snapToDevicePixel,
} from "./radialLayout";
import { DEFAULT_WHEEL_CONFIG, type RadialItem, type RadialWheelConfig } from "./types";

export interface WheelPreviewProps {
  items: RadialItem[];
  config: Partial<RadialWheelConfig>;
  areaWedges?: boolean;
  workspaceName?: string;
  size?: number;
  interactive?: boolean;
}

const FALLBACK_ITEMS: RadialItem[] = [
  { id: "1", label: "Browser", type: "url", target: "https://google.com", icon: "Globe" },
  { id: "2", label: "Terminal", type: "app", target: "wt.exe", icon: "Terminal" },
  { id: "3", label: "Explorer", type: "folder", target: "C:\\", icon: "Folder" },
  { id: "4", label: "Settings", type: "system", target: "settings", icon: "Settings" },
  { id: "5", label: "Media", type: "system", target: "media-toggle", icon: "Music" },
  { id: "6", label: "Calculator", type: "app", target: "calc.exe", icon: "Calculator" },
];

export const WheelPreview: React.FC<WheelPreviewProps> = ({
  items,
  config,
  areaWedges = true,
  workspaceName = "General",
  size = 248,
  interactive = true,
}) => {
  const fullConfig: RadialWheelConfig = { ...DEFAULT_WHEEL_CONFIG, ...config };
  const previewItems = items.length > 0 ? items.slice(0, 12) : FALLBACK_ITEMS;
  const [hoveredIdx, setHoveredIdx] = useState<number>(0);

  const { actualMenuRadius, actualIconSize } = useMemo(
    () =>
      computeRadialLayout({
        numberOfApps: previewItems.length,
        iconSizePx: fullConfig.iconSize,
        minGap: fullConfig.appSpacing,
        menuRadius: fullConfig.menuRadius,
        activationThreshold: fullConfig.activationThreshold,
        viewportSize: { width: 1400, height: 900 },
      }),
    [
      previewItems.length,
      fullConfig.iconSize,
      fullConfig.appSpacing,
      fullConfig.menuRadius,
      fullConfig.activationThreshold,
    ]
  );

  const hoverColor = normalizeHoverColor(fullConfig.hoverColor);
  const hoverFg = getReadableForeground(hoverColor);

  const hubDiameter =
    Math.max(
      32,
      Math.min(
        Math.round(fullConfig.iconSize * 0.82 * 1.2),
        Math.round((actualMenuRadius - actualIconSize / 2 - 10) * 2)
      )
    ) & ~1;
  const deadZoneRadius = Math.max(
    fullConfig.activationThreshold ?? 60,
    Math.ceil((hubDiameter / 2) * 1.06 * Math.SQRT2) + 4
  );
  const sectorOuterRadius = Math.max(actualMenuRadius + actualIconSize * 1.65, deadZoneRadius + 40);
  const falloffRadius = actualMenuRadius + actualIconSize * 0.85;

  const naturalSpan = (actualMenuRadius + actualIconSize / 2 + 88) * 2;
  const scale = Math.min(0.68, size / Math.max(360, naturalSpan));

  const scrimBg = useMemo(
    () =>
      radialScrimGradient(
        { x: Math.round(size / 2), y: Math.round(size / 2) },
        fullConfig.backdropOpacity,
        Math.round((actualMenuRadius + actualIconSize / 2) * scale)
      ),
    [size, actualMenuRadius, actualIconSize, scale, fullConfig.backdropOpacity]
  );

  const activeIndex = hoveredIdx >= 0 && hoveredIdx < previewItems.length ? hoveredIdx : 0;
  const stepDeg = 360 / Math.max(previewItems.length, 1);

  return (
    <div
      className="zn-wheel-preview-card"
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: 16,
        overflow: "hidden",
        background: "linear-gradient(155deg, #8d97ad 0%, #6c758c 48%, #4d5468 100%)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 28px rgba(0,0,0,0.34)",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {/* Stand-in desktop grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          opacity: 0.45,
          pointerEvents: "none",
        }}
      />

      {/* Live radial scrim */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: scrimBg,
          pointerEvents: "none",
        }}
      />

      {/* Scaled wheel origin at card center */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          transform: `scale(${scale.toFixed(4)})`,
          transformOrigin: "0 0",
        }}
      >
        {areaWedges && (
          <RadialSectors
            count={previewItems.length}
            activeIndex={activeIndex}
            radiusInner={hubDiameter / 2 + 4}
            radiusOuter={sectorOuterRadius}
            hoverColor={hoverColor}
            falloffRadius={falloffRadius}
            visible={true}
            dimmed={false}
          />
        )}

        {/* Center hub */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: hubDiameter,
            height: hubDiameter,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background: `rgb(${12 + Math.round(fullConfig.backdropOpacity * 10)}, ${
              12 + Math.round(fullConfig.backdropOpacity * 10)
            }, ${14 + Math.round(fullConfig.backdropOpacity * 10)})`,
            border: "1px solid rgba(255, 255, 255, 0.24)",
            boxShadow:
              "inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 0 1px rgba(0,0,0,0.5), 0 8px 22px rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            zIndex: 10,
          }}
        >
          <ZenithLogo size={Math.max(16, Math.round(hubDiameter * 0.44))} />
        </div>

        {/* Wedge tiles & outer labels */}
        {previewItems.map((item, i) => {
          const isActive = i === activeIndex;
          const angleDeg = i * stepDeg - 90;
          const rad = (angleDeg * Math.PI) / 180;
          const ix = actualMenuRadius * Math.cos(rad);
          const iy = actualMenuRadius * Math.sin(rad);

          const labelPos = getLabelPlacement(angleDeg, actualIconSize);
          const showLabel =
            fullConfig.showLabels && (fullConfig.alwaysShowAppLabels || isActive);

          return (
            <div
              key={item.id || i}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: `translate3d(${snapToDevicePixel(ix)}px, ${snapToDevicePixel(
                  iy
                )}px, 0) scale(${isActive ? 1.06 : 1})`,
                transition: "transform 150ms cubic-bezier(0.22, 1, 0.36, 1)",
                zIndex: isActive ? 25 : 15,
              }}
            >
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div
                  onMouseEnter={() => interactive && setHoveredIdx(i)}
                  style={{
                    width: actualIconSize,
                    height: actualIconSize,
                    borderRadius: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isActive
                      ? hoverColor
                      : `rgb(${12 + Math.round(fullConfig.backdropOpacity * 10)}, ${
                          12 + Math.round(fullConfig.backdropOpacity * 10)
                        }, ${14 + Math.round(fullConfig.backdropOpacity * 10)})`,
                    border: isActive
                      ? `1px solid ${hoverColor}`
                      : `1px solid rgba(255,255,255,${(
                          0.28 +
                          fullConfig.backdropOpacity * 0.08
                        ).toFixed(2)})`,
                    color: isActive ? hoverFg : "#ffffff",
                    boxShadow: isActive
                      ? `0 0 0 1px rgba(0,0,0,0.45), 0 0 0 4px ${hoverColor}2e, 0 0 22px ${hoverColor}38, 0 12px 28px rgba(0,0,0,0.5)`
                      : "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(0,0,0,0.5), 0 8px 22px rgba(0,0,0,0.42)",
                    cursor: interactive ? "pointer" : "default",
                    transition:
                      "background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease",
                  }}
                >
                  <SmartIcon item={item} size={actualIconSize} />
                </div>

                {showLabel && (
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform:
                        `translate(${labelPos.originX}, ${labelPos.originY}) ` +
                        `translate3d(${snapToDevicePixel(labelPos.x)}px, ${snapToDevicePixel(
                          labelPos.y
                        )}px, 0)`,
                      padding: "5px 11px",
                      borderRadius: 999,
                      whiteSpace: "nowrap",
                      background: isActive ? hoverColor : "rgba(6,7,9,0.95)",
                      border: `1px solid ${isActive ? hoverColor : "rgba(255,255,255,0.2)"}`,
                      color: isActive ? hoverFg : "rgba(255,255,255,0.78)",
                      fontSize: 12,
                      fontWeight: 500,
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.45)",
                      pointerEvents: "none",
                      zIndex: 30,
                    }}
                  >
                    {item.label}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Workspace indicator pill below wheel */}
        {fullConfig.showWorkspacePill && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: actualMenuRadius + actualIconSize / 2 + 34,
              transform: "translateX(-50%)",
              padding: "5px 14px",
              borderRadius: 999,
              background: "rgba(12, 12, 15, 0.94)",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "#ffffff",
              fontSize: 11.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
              boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
              pointerEvents: "none",
            }}
          >
            {workspaceName}
          </div>
        )}
      </div>

      {/* Live Preview badge */}
      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 8,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.72)",
          background: "rgba(14, 14, 18, 0.62)",
          padding: "2px 7px",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.12)",
          pointerEvents: "none",
        }}
      >
        Live Preview
      </div>
    </div>
  );
};

export { roundedRectPathFromTop };
