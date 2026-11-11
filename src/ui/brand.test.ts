import { describe, expect, it } from "vitest";
import {
  backAtShopToast,
  brand,
  driveToShopFirstToast,
  headBackToShopHint,
  installCoachBodies,
  IS_PORTFOLIO,
} from "./brand";

describe("brand (default build)", () => {
  it("ships the Shift identity even when VITE_PORTFOLIO is unset", () => {
    expect(IS_PORTFOLIO).toBe(false);
    expect(brand.mark).toBe("SHIFT");
    expect(brand.title).toBe("Shift");
    expect(brand.welcomeTitle).toBe("Welcome to Shift");
    expect(brand.deliveryHeader).toBe("SHIFT DELIVERY");
    expect(brand.idProvince).toBe("PROVINCE OF SHIFT");
  });

  it("names the shop hub in driver toasts", () => {
    expect(driveToShopFirstToast()).toBe("Drive up to the shop first.");
    expect(backAtShopToast(2)).toContain("the shop");
    expect(headBackToShopHint()).toBe("Head back to the shop");
  });

  it("threads the product name through install-coach copy", () => {
    const bodies = installCoachBodies();
    expect(bodies).toHaveLength(4);
    for (const body of bodies) expect(body).toContain("Shift");
  });

  it("never shows the old Kindling name to players", () => {
    for (const value of Object.values(brand)) expect(value).not.toMatch(/kindling|cannabis/i);
    for (const body of installCoachBodies()) expect(body).not.toMatch(/kindling/i);
  });
});
