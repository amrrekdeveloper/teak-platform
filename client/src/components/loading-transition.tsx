import { useState, useEffect, useRef } from "react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

interface LoadingTransitionProps {
  show: boolean;
  message: string;
  subMessage?: string;
  duration?: number;
  onComplete?: () => void;
}

export function LoadingTransition({ show, message, subMessage, duration = 1500, onComplete }: LoadingTransitionProps) {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (show) {
      setVisible(true);
      setFadeOut(false);
      timerRef.current = setTimeout(() => {
        setFadeOut(true);
        fadeTimerRef.current = setTimeout(() => {
          setVisible(false);
          setFadeOut(false);
          onCompleteRef.current?.();
        }, 400);
      }, duration);
    } else {
      setVisible(false);
      setFadeOut(false);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [show, duration]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-400 ${fadeOut ? "opacity-0" : "opacity-100"}`}
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      data-testid="loading-transition-overlay"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-[3px] border-white/10 border-t-primary animate-spin absolute inset-0" />
          <img
            src={teakLogo}
            alt="Teak"
            className="w-20 h-20 object-contain logo-red animate-pulse"
            data-testid="img-loading-logo"
          />
        </div>

        <div className="text-center space-y-2 mt-2">
          <p className="text-white text-base font-semibold tracking-wide" data-testid="text-loading-message">
            {message}
          </p>
          {subMessage && (
            <p className="text-white/60 text-xs" data-testid="text-loading-sub">
              {subMessage}
            </p>
          )}
        </div>

        <div className="flex gap-1.5 mt-1">
          <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

export function useLoadingTransition(duration = 1500) {
  const [showLoading, setShowLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingSubMessage, setLoadingSubMessage] = useState<string | undefined>();
  const resolveRef = useRef<(() => void) | null>(null);

  const handleComplete = () => {
    setShowLoading(false);
    resolveRef.current?.();
    resolveRef.current = null;
  };

  const startTransition = (message: string, subMessage?: string) => {
    return new Promise<void>((resolve) => {
      setLoadingMessage(message);
      setLoadingSubMessage(subMessage);
      resolveRef.current = resolve;
      setShowLoading(true);
    });
  };

  const TransitionComponent = (
    <LoadingTransition
      show={showLoading}
      message={loadingMessage}
      subMessage={loadingSubMessage}
      duration={duration}
      onComplete={handleComplete}
    />
  );

  return { startTransition, TransitionComponent };
}
