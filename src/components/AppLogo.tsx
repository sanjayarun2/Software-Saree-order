/**
 * App logo component - matches SplashController styling for consistency.
 * Used on registration, login, and verification pages.
 * High-quality rendering with proper image-rendering CSS.
 */
export function AppLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex h-14 w-14 shrink-0 items-center justify-center md:h-16 md:w-16 ${className}`}>
      <img
        src="/icon.svg"
        alt="Velo"
        className="h-full w-full max-w-[80px] object-contain"
        style={{
          imageRendering: "auto",
          WebkitImageRendering: "-webkit-optimize-contrast" as any,
          shapeRendering: "geometricPrecision",
          backfaceVisibility: "hidden",
          transform: "translateZ(0)",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        } as React.CSSProperties}
        width={128}
        height={128}
        fetchPriority="high"
        loading="eager"
      />
    </div>
  );
}
