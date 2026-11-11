/** Player-visible identity — the game ships as Shift in every build (main site and portfolio embed). */

/** True for `vite build --mode embed` (CI) or when VITE_PORTFOLIO=1 is set locally. Copy no longer differs by build. */
export const IS_PORTFOLIO =
  import.meta.env.VITE_PORTFOLIO === "1" || import.meta.env.MODE === "embed";

export interface BrandStrings {
  mark: string;
  title: string;
  productTitle: string;
  tagline: string;
  welcomeTitle: string;
  loadingBoot: string;
  rotateGate: string;
  deliveryHeader: string;
  idProvince: string;
  backToShopCaption: string;
  howtoDeliveryReturn: string;
  shiftVerdictClean: string;
  shiftTitleEnd: string;
  welcomeToast: string;
  shopLabel: string;
}

const shift: BrandStrings = {
  mark: "SHIFT",
  title: "Shift",
  productTitle: "Shift",
  tagline: "One shop shift, then deliveries with ID checks. 9 AM–11 PM.",
  welcomeTitle: "Welcome to Shift",
  loadingBoot: "Loading Shift…",
  rotateGate: "Turn your phone sideways to play Shift.",
  deliveryHeader: "SHIFT DELIVERY",
  idProvince: "PROVINCE OF SHIFT",
  backToShopCaption: "Return to the shop",
  howtoDeliveryReturn: "the shop",
  shiftVerdictClean: "Clean shift — the shop stays open.",
  shiftTitleEnd: "End of shift",
  welcomeToast: "Welcome to Shift. Watch the order screen.",
  shopLabel: "the shop",
};

export const brand: BrandStrings = shift;

/** In-game toasts and nav hints that name the shop hub. */
export function shopHubLabel(): string {
  return brand.shopLabel;
}

export function driveToShopFirstToast(): string {
  return `Drive up to ${brand.shopLabel} first.`;
}

export function backAtShopToast(served: number): string {
  if (served > 0) return `Back at ${brand.shopLabel}. Key lead cleared ${served} at the counter.`;
  return `Back at ${brand.shopLabel}. Watch the order screen.`;
}

export function backAtShopBagsToast(): string {
  return `Back at ${brand.shopLabel}. Remaining bags stay in the car.`;
}

export function parkedAtShopToast(): string {
  return `Parked at ${brand.shopLabel}. Tap the shop to return.`;
}

export function headBackToShopToast(): string {
  return `Nothing in the car. Head back to ${brand.shopLabel}.`;
}

export function deniedReturnToShopToast(failScore: number): string {
  return `Denied (${failScore}). Van is heading back to ${brand.shopLabel}.`;
}

export function deniedNextStopToast(failScore: number, nextLabel: string | null): string {
  const dest = nextLabel ?? brand.shopLabel;
  return `Denied (${failScore}). Next → ${dest}.`;
}

export function dropReturnToShopToast(dropMsg: string): string {
  return `${dropMsg}. Van is heading to ${brand.shopLabel} — tap the shop when you arrive.`;
}

export function dropNextStopToast(dropMsg: string, nextLabel: string | null): string {
  const dest = nextLabel ?? brand.shopLabel;
  return `${dropMsg}. Next → ${dest}.`;
}

export function headBackToShopHint(): string {
  return `Head back to ${brand.shopLabel}`;
}

/** Install-coach bodies — title stays generic; product name varies. */
export function installCoachBodies(): readonly string[] {
  const name = brand.title;
  return [
    `Safari keeps the address bar in a normal tab. Tap Share → Add to Home Screen for a chrome-free ${name} session.`,
    `Install ${name} to play without the browser bar — the reliable way to get a full-screen session on your phone.`,
    `Add ${name} to your Home Screen (browser menu → Install app / Add to Home screen) for a chrome-free session. Settings also has Start fullscreen for this tab.`,
    `Add ${name} to your Home Screen for a chrome-free session. Or turn on Start fullscreen in Settings for this tab.`,
  ];
}
