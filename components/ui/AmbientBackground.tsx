const STAR_COUNT = 50;

const STARS = Array.from({ length: STAR_COUNT }, (_, i) => ({
  top: Math.random() * 100,
  left: Math.random() * 100,
  size: Math.random() < 0.15 ? 2 : 1,
  opacity: 0.25 + Math.random() * 0.55,
  delay: (i % 10) * 0.7,
  duration: 4 + Math.random() * 5,
}));

export function AmbientBackground() {
  return (
    <div className="hidden dark:block fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div
        className="absolute -top-1/4 left-1/2 h-[60vh] w-[60vh] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(245,158,11,0.10) 0%, rgba(245,158,11,0) 70%)" }}
      />
      <div
        className="absolute bottom-0 -left-1/4 h-[50vh] w-[50vh] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0) 70%)" }}
      />
      {STARS.map((star, i) => (
        <span
          key={i}
          className="ambient-star absolute rounded-full bg-white"
          style={{
            top: `${star.top}%`,
            left: `${star.left}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
