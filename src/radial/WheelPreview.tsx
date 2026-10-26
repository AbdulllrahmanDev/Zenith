import React from 'react';
import type { RadialItem } from './types';
import { getRadialIcon } from './iconMap';
import {
  annularSectorPath,
  sectorBoundsDeg,
} from './radialSectors';

interface WheelPreviewProps {
  items: RadialItem[];
  workspaceName: string;
  workspaceIcon: string;
  selectionMode?: 'area' | 'cursor';
  areaWedges?: boolean;
  numberLabels?: boolean;
  hoverColor?: string;
  onSliceClick?: (index: number) => void;
}

export const WheelPreview: React.FC<WheelPreviewProps> = ({
  items,
  workspaceName,
  workspaceIcon,
  areaWedges = false,
  numberLabels = true,
  hoverColor = '#007aff',
  onSliceClick,
}) => {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const count = items.length;
  const radiusInner = 36;
  const radiusOuter = 110;
  const orbitRadius = 78;

  const sliceAngle = count > 0 ? 360 / count : 360;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '240px',
        borderRadius: '12px',
        overflow: 'hidden',
        background: 'radial-gradient(circle at center, rgba(32, 32, 46, 0.6) 0%, rgba(10, 10, 14, 0.95) 100%)',
        border: '1px solid var(--bloom-border, rgba(255, 255, 255, 0.1))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {/* SVG Wedges Layer */}
      {count > 0 && (
        <svg
          viewBox={`0 0 ${radiusOuter * 2} ${radiusOuter * 2}`}
          style={{
            position: 'absolute',
            width: `${radiusOuter * 2}px`,
            height: `${radiusOuter * 2}px`,
            pointerEvents: 'none',
          }}
        >
          {items.map((_, i) => {
            const bounds = sectorBoundsDeg(i, count);
            const isHovered = hoverIndex === i;
            const path = annularSectorPath(radiusInner, radiusOuter, bounds.startDeg, bounds.endDeg);
            return (
              <path
                key={i}
                d={path}
                fill={isHovered ? hoverColor : 'transparent'}
                fillOpacity={isHovered ? 0.28 : 0}
                stroke={areaWedges ? 'rgba(255, 255, 255, 0.12)' : 'none'}
                strokeWidth={areaWedges ? 1 : 0}
                style={{ transition: 'fill 0.15s ease, fill-opacity 0.15s ease' }}
              />
            );
          })}
        </svg>
      )}

      {/* Center Hub */}
      <div
        style={{
          position: 'absolute',
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'var(--bloom-bg, rgba(18, 18, 24, 0.92))',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--bloom-border, rgba(255, 255, 255, 0.15))',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--bloom-text, #ffffff)',
          zIndex: 10,
          cursor: 'default',
        }}
      >
        {(() => {
          const HubIcon = getRadialIcon(workspaceIcon);
          return <HubIcon size={18} strokeWidth={2} style={{ color: hoverColor }} />;
        })()}
        <span
          style={{
            fontSize: '9px',
            fontWeight: 600,
            marginTop: '2px',
            maxWidth: '52px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {workspaceName}
        </span>
      </div>

      {/* Slices */}
      {items.map((item, idx) => {
        const angleDeg = idx * sliceAngle - 90;
        const angleRad = angleDeg * (Math.PI / 180);
        const posX = `calc(50% + ${Math.round(orbitRadius * Math.cos(angleRad))}px)`;
        const posY = `calc(50% + ${Math.round(orbitRadius * Math.sin(angleRad))}px)`;
        const isHovered = hoverIndex === idx;
        const ItemIcon = getRadialIcon(item.icon);

        return (
          <div
            key={item.id || idx}
            onMouseEnter={() => setHoverIndex(idx)}
            onMouseLeave={() => setHoverIndex(null)}
            onClick={() => onSliceClick?.(idx)}
            style={{
              position: 'absolute',
              left: posX,
              top: posY,
              transform: `translate(-50%, -50%) scale(${isHovered ? 1.12 : 1})`,
              width: '46px',
              height: '40px',
              borderRadius: '9px',
              background: isHovered
                ? 'var(--bloom-bg-expanded, rgba(32, 32, 46, 0.95))'
                : 'var(--bloom-bg, rgba(22, 22, 30, 0.88))',
              border: `1px solid ${isHovered ? hoverColor : 'var(--bloom-border, rgba(255, 255, 255, 0.12))'}`,
              boxShadow: isHovered
                ? `0 6px 18px rgba(0, 0, 0, 0.5), 0 0 14px ${hoverColor}40`
                : '0 4px 12px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: isHovered ? 8 : 5,
              transition: 'all 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
              color: 'var(--bloom-text, #ffffff)',
              padding: '2px',
              boxSizing: 'border-box',
            }}
            title={`${item.label} (${item.target})`}
          >
            {numberLabels && (
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: '3px',
                  fontSize: '7px',
                  fontWeight: 700,
                  opacity: isHovered ? 1 : 0.6,
                  color: isHovered ? hoverColor : 'inherit',
                }}
              >
                {idx + 1}
              </span>
            )}
            <ItemIcon size={15} strokeWidth={1.8} style={{ color: isHovered ? hoverColor : 'inherit' }} />
            <span
              style={{
                fontSize: '8px',
                fontWeight: isHovered ? 600 : 500,
                marginTop: '1px',
                maxWidth: '40px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};
