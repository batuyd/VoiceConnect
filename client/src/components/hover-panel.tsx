import { useState } from "react";
import { CoinDisplay } from "./coin-display";
import { Trophy, Calendar, Gift } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function HoverPanel() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="fixed right-0 top-20 z-50"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "flex flex-col items-end gap-2 transition-all duration-300 ease-in-out",
          isHovered ? "translate-x-0" : "translate-x-[calc(100%-3rem)]"
        )}
      >
        <div className="flex items-center gap-2 rounded-l-lg bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-2 shadow-md">
          <div className={cn("overflow-hidden transition-all duration-300", isHovered ? "w-auto opacity-100" : "w-0 opacity-0")}>
            <CoinDisplay />
          </div>
          <Button variant="ghost" size="icon" className="shrink-0">
            <Trophy className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 rounded-l-lg bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-2 shadow-md">
          <div className={cn("overflow-hidden transition-all duration-300", isHovered ? "w-auto opacity-100" : "w-0 opacity-0")}>
            <span className="px-2">Günlük Ödül</span>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0">
            <Calendar className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 rounded-l-lg bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-2 shadow-md">
          <div className={cn("overflow-hidden transition-all duration-300", isHovered ? "w-auto opacity-100" : "w-0 opacity-0")}>
            <span className="px-2">Hediye Mağazası</span>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0">
            <Gift className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}