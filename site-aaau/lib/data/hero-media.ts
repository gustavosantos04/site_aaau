export type HeroMediaItem =
  | {
      id: string;
      type: "image";
      src: string;
      alt: string;
    }
  | {
      id: string;
      type: "video";
      src: string;
      poster: string;
      alt: string;
    };

export const heroMediaSlides: HeroMediaItem[] = [
  {
    id: "campus-crowd",
    type: "image",
    src: "/images/hero/campus-crowd.svg",
    alt: "Placeholder de torcida e atmosfera AAAU no campus",
  },
  {
    id: "arena-lights",
    type: "image",
    src: "/images/hero/arena-lights.svg",
    alt: "Placeholder de quadra com luzes cinematograficas",
  },
  {
    id: "sideline-energy",
    type: "image",
    src: "/images/hero/sideline-energy.svg",
    alt: "Placeholder de energia de jogo e borda premium",
  },
];
