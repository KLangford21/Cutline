type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IconHome = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M3 10.4 12 3l9 7.4" /><path d="M5.5 9.6V20h13V9.6" /><path d="M9.6 20v-5.4h4.8V20" /></svg>
);

export const IconFlag = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M6 21V3" /><path d="M6 4.2h11.5L15 8l2.5 3.8H6" /></svg>
);

export const IconPlus = ({ size = 22 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>
);

export const IconBook = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" /></svg>
);

export const IconUser = ({ size = 20 }: P) => (
  <svg {...base(size)}><circle cx="12" cy="8" r="3.6" /><path d="M4.8 20c.9-3.6 3.8-5.4 7.2-5.4S18.3 16.4 19.2 20" /></svg>
);

export const IconChevronLeft = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M14.5 5 8 12l6.5 7" /></svg>
);

export const IconChevronRight = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M9.5 5 16 12l-6.5 7" /></svg>
);

export const IconSearch = ({ size = 18 }: P) => (
  <svg {...base(size)}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
);

export const IconCheck = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7" /></svg>
);

export const IconX = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);

export const IconHeart = ({ size = 15 }: P) => (
  <svg {...base(size)}><path d="M12 20s-7.5-4.4-7.5-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.7C19.5 15.6 12 20 12 20z" /></svg>
);

export const IconChat = ({ size = 15 }: P) => (
  <svg {...base(size)}><path d="M20 12.5c0 3.6-3.6 6.5-8 6.5a9.7 9.7 0 0 1-2.7-.4L4.5 20l1.2-3.2A6.4 6.4 0 0 1 4 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5z" /></svg>
);

export const IconTrophy = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5.5H5.5v1A3.5 3.5 0 0 0 8 9.8M16 5.5h2.5v1A3.5 3.5 0 0 1 16 9.8" /><path d="M12 13v3.5M9 20h6l-.6-3.5H9.6z" /></svg>
);

export const IconSettings = ({ size = 18 }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="2.8" /><path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" /></svg>
);

export const IconShare = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M12 15V4M8.5 7.2 12 3.8l3.5 3.4" /><path d="M5 13.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-5.5" /></svg>
);

export const IconClock = ({ size = 15 }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="8.2" /><path d="M12 7.6V12l2.8 1.8" /></svg>
);

export const IconPin = ({ size = 15 }: P) => (
  <svg {...base(size)}><path d="M12 21s6.2-5.6 6.2-10A6.2 6.2 0 0 0 5.8 11c0 4.4 6.2 10 6.2 10z" /><circle cx="12" cy="10.8" r="2.2" /></svg>
);

export const IconUsers = ({ size = 15 }: P) => (
  <svg {...base(size)}><circle cx="9.2" cy="8.4" r="3.1" /><path d="M3.6 19c.7-3 2.9-4.6 5.6-4.6S14.1 16 14.8 19" /><path d="M16 6.2a3 3 0 0 1 0 5.9M17.4 14.8c2 .5 3.3 2 3.8 4.2" /></svg>
);

export const IconLogout = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" /><path d="M17 8.5 20.5 12 17 15.5M20 12h-9" /></svg>
);
