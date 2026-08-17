interface IllustrationProps {
  className?: string;
}

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function OvenUnderCounterIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...base}>
      <line x1="10" y1="40" x2="110" y2="40" strokeWidth="5" />
      <rect x="30" y="48" width="60" height="52" rx="3" />
      <line x1="36" y1="58" x2="84" y2="58" />
      <rect x="40" y="66" width="40" height="26" rx="2" />
      <circle cx="44" cy="54" r="1.5" fill="currentColor" />
      <circle cx="54" cy="54" r="1.5" fill="currentColor" />
      <circle cx="64" cy="54" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function OvenTallCabinetIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...base}>
      <rect x="35" y="10" width="50" height="100" rx="3" />
      <line x1="35" y1="38" x2="85" y2="38" />
      <line x1="35" y1="80" x2="85" y2="80" />
      <rect x="42" y="46" width="36" height="26" rx="2" />
      <circle cx="48" cy="42" r="1.5" fill="currentColor" />
      <circle cx="58" cy="42" r="1.5" fill="currentColor" />
      <line x1="45" y1="95" x2="75" y2="95" />
    </svg>
  );
}

export function HoodWallIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...base}>
      <rect x="52" y="10" width="16" height="35" />
      <path d="M 30 70 L 90 70 L 68 45 L 52 45 Z" />
      <line x1="10" y1="105" x2="110" y2="105" strokeWidth="5" />
      <line x1="45" y1="85" x2="45" y2="92" strokeDasharray="2 4" />
      <line x1="60" y1="85" x2="60" y2="92" strokeDasharray="2 4" />
      <line x1="75" y1="85" x2="75" y2="92" strokeDasharray="2 4" />
    </svg>
  );
}

export function HoodIntegratedIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...base}>
      <rect x="30" y="10" width="60" height="45" rx="3" />
      <line x1="30" y1="45" x2="90" y2="45" />
      <rect x="38" y="47" width="44" height="6" rx="2" />
      <line x1="10" y1="105" x2="110" y2="105" strokeWidth="5" />
      <line x1="45" y1="85" x2="45" y2="92" strokeDasharray="2 4" />
      <line x1="60" y1="85" x2="60" y2="92" strokeDasharray="2 4" />
      <line x1="75" y1="85" x2="75" y2="92" strokeDasharray="2 4" />
    </svg>
  );
}

export function FridgeFreestandingIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...base}>
      <rect x="35" y="10" width="50" height="100" rx="5" />
      <line x1="35" y1="45" x2="85" y2="45" />
      <line x1="76" y1="20" x2="76" y2="36" />
      <line x1="76" y1="55" x2="76" y2="80" />
    </svg>
  );
}

export function FridgeIntegratedIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...base}>
      <rect x="15" y="10" width="90" height="100" rx="2" />
      <line x1="40" y1="10" x2="40" y2="110" />
      <line x1="80" y1="10" x2="80" y2="110" />
      <line x1="40" y1="50" x2="80" y2="50" />
      <line x1="72" y1="20" x2="72" y2="40" strokeWidth="4" />
      <line x1="72" y1="60" x2="72" y2="90" strokeWidth="4" />
    </svg>
  );
}

export function LayoutIIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...base}>
      <rect x="15" y="15" width="90" height="90" strokeDasharray="4 4" strokeWidth="1.5" />
      <rect x="15" y="15" width="90" height="24" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

export function LayoutLIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...base}>
      <rect x="15" y="15" width="90" height="90" strokeDasharray="4 4" strokeWidth="1.5" />
      <path d="M 15 15 H 105 V 39 H 39 V 105 H 15 Z" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

export function LayoutUIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...base}>
      <rect x="15" y="15" width="90" height="90" strokeDasharray="4 4" strokeWidth="1.5" />
      <path d="M 15 105 V 15 H 105 V 105 H 81 V 39 H 39 V 105 Z" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}

export function LayoutParallelIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} {...base}>
      <rect x="15" y="15" width="90" height="90" strokeDasharray="4 4" strokeWidth="1.5" />
      <rect x="15" y="15" width="24" height="90" fill="currentColor" fillOpacity="0.15" />
      <rect x="81" y="15" width="24" height="90" fill="currentColor" fillOpacity="0.15" />
    </svg>
  );
}
