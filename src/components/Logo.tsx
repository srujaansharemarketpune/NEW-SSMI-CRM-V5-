import React from 'react';

export interface LogoProps {
  customLogoUrl?: string;
  className?: string;
  variant?: 'header' | 'card' | 'receipt' | 'certificate';
}

export const Logo: React.FC<LogoProps> = ({
  customLogoUrl,
  className = '',
  variant = 'header'
}) => {
  // Dimension styling rules conforming to specifications (minimum 48px height for header touch target)
  let containerStyle: React.CSSProperties = {
    minHeight: '48px',
    height: '52px',
    width: 'auto',
    minWidth: '52px',
    maxWidth: '190px',
    padding: '4px'
  };

  let imgStyle: React.CSSProperties = {
    height: '44px',
    width: 'auto',
    maxWidth: '182px',
    objectFit: 'contain'
  };

  if (variant === 'card') {
    containerStyle = { width: '48px', height: '48px', minWidth: '48px', minHeight: '48px' };
    imgStyle = { width: '48px', height: '48px', objectFit: 'contain' };
  } else if (variant === 'receipt') {
    containerStyle = { maxHeight: '55px', maxWidth: '180px' };
    imgStyle = { maxHeight: '55px', maxWidth: '180px', objectFit: 'contain' };
  } else if (variant === 'certificate') {
    containerStyle = { height: '100px', maxHeight: '110px', width: 'auto', maxWidth: '240px' };
    imgStyle = { height: '100px', maxHeight: '110px', width: 'auto', maxWidth: '240px', objectFit: 'contain' };
  }

  return (
    <div
      style={containerStyle}
      className={`relative rounded-xl overflow-hidden shrink-0 flex items-center justify-center ${
        customLogoUrl ? 'bg-transparent' : 'border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 shadow-xs'
      } ${className}`}
      title="Srujaan Share Market Institute — Official Insignia"
    >
      {customLogoUrl ? (
        <img
          src={customLogoUrl}
          alt="Srujaan Share Market Institute"
          style={imgStyle}
          className="object-contain"
        />
      ) : (
        <svg
          viewBox="0 0 60 60"
          style={{
            height: variant === 'certificate' ? '95px' : variant === 'card' ? '44px' : '44px',
            width: variant === 'certificate' ? '95px' : variant === 'card' ? '44px' : '44px',
          }}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="block"
        >
          {/* Background Badge */}
          <rect width="60" height="60" rx="12" fill="#090E17" />
          <rect x="1.5" y="1.5" width="57" height="57" rx="10.5" stroke="url(#logoGlowGrad)" strokeWidth="1.5" />

          {/* Upward Bullish Financial Trend Grid */}
          <line x1="8" y1="46" x2="52" y2="46" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="8" y1="32" x2="52" y2="32" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />

          {/* Left Candlestick Bar (Emerald) */}
          <line x1="16" y1="20" x2="16" y2="45" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="13" y="26" width="6" height="13" rx="1.5" fill="#10b981" />

          {/* Center Candlestick Bar (Electric Blue / Cyan) */}
          <line x1="30" y1="12" x2="30" y2="45" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="27" y="18" width="6" height="20" rx="1.5" fill="url(#centerBarGrad)" />

          {/* Right Candlestick Bar (Gold / Amber) */}
          <line x1="44" y1="8" x2="44" y2="45" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="41" y="14" width="6" height="18" rx="1.5" fill="#f59e0b" />

          {/* Dynamic Growth Trend Arrow */}
          <path
            d="M 12 38 Q 28 26 47 11"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M 47 11 L 41 12 M 47 11 L 46 17" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />

          {/* SSMI Golden Monogram Badge */}
          <rect x="10" y="48" width="40" height="9" rx="3" fill="#1e293b" stroke="#334155" strokeWidth="0.8" />
          <text
            x="30"
            y="55"
            textAnchor="middle"
            fill="#38bdf8"
            fontSize="6.5"
            fontWeight="900"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="0.8px"
          >
            SRUJAAN
          </text>

          {/* Gradients */}
          <defs>
            <linearGradient id="logoGlowGrad" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38bdf8" stopOpacity="0.8" />
              <stop offset="0.5" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="1" stopColor="#f59e0b" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="centerBarGrad" x1="27" y1="18" x2="33" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#38bdf8" />
              <stop offset="1" stopColor="#2563eb" />
            </linearGradient>
          </defs>
        </svg>
      )}
    </div>
  );
};
