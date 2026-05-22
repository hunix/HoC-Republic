import { Gamepad2 } from "lucide-react";
import { PageHeader } from "@/components/ui";

export function PoolGamePage() {
  const gameUrl = `/games/3d-pool-game.html`;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="3D Pool"
        description="Full-physics 8-ball pool game — Three.js + Cannon.js"
        icon={<Gamepad2 size={28} />}
        actions={
          <a
            href={gameUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Open Fullscreen ↗
          </a>
        }
      />

      <div
        className="rounded-xl overflow-hidden border border-border"
        style={{ height: "calc(100vh - 180px)" }}
      >
        <iframe
          src={gameUrl}
          title="3D Pool Game"
          className="w-full h-full border-0"
          allow="autoplay; fullscreen"
        />
      </div>
    </div>
  );
}
