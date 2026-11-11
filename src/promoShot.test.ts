import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCaptureSeed, applyPromoShot } from "./promoShot";
import { GameSim } from "./sim/gameSim";

describe("applyPromoShot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds a mid-run drive with a GPS stop", () => {
    vi.stubGlobal("location", { search: "?shot=drive" });
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    applyPromoShot(sim);
    const snap = sim.snapshot();
    expect(snap.playerRole).toBe("driver");
    expect(snap.run?.nextStopId).toBe("house-1");
    expect(snap.autoDriving || snap.dropoff.phase === "atCurb").toBe(true);
  });

  it("seeds a matching ID by default and a mismatched one with ?idmatch=0", () => {
    for (const [search, matches] of [
      ["?shot=drive", true],
      ["?shot=drive&idmatch=0", false],
    ] as const) {
      vi.stubGlobal("location", { search });
      const sim = GameSim.create({ seed: 4, autoSpawn: false });
      applyPromoShot(sim);
      const view = sim.snapshot().orders.find((o) => o.type === "delivery");
      expect(view, search).toBeDefined();
      expect(sim.orderById(view!.id)?.idMatches, search).toBe(matches);
    }
  });

  it("aims the seeded run at the lot ?house names, in either spelling", () => {
    for (const search of ["?shot=drive&house=5", "?shot=drive&house=house-5"]) {
      vi.stubGlobal("location", { search });
      const sim = GameSim.create({ seed: 4, autoSpawn: false });
      applyPromoShot(sim);
      expect(sim.snapshot().run?.nextStopId, search).toBe("house-5");
    }
  });

  it("falls back to the default lot when ?house names one that does not exist", () => {
    for (const search of ["?shot=drive&house=nope", "?shot=drive&house=999", "?shot=drive&house="]) {
      vi.stubGlobal("location", { search });
      const sim = GameSim.create({ seed: 4, autoSpawn: false });
      applyPromoShot(sim);
      expect(sim.snapshot().run?.nextStopId, search).toBe("house-1");
    }
  });

  it("stops the van mid-approach when ?drivems lands inside the run", () => {
    // Swept rather than pinned to one instant. How long house-2's run takes moves with the
    // route and the pace of the traffic the van waits for — it has already moved from
    // 7550ms to 6450ms across two changes — and a hard-coded window turns that into a
    // failure about nothing. What the query has to do is unchanged: land inside the run and
    // the van is still driving, land past it and the van is in the stall.
    const driving = [2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000].map((ms) => {
      vi.stubGlobal("location", { search: `?shot=drive&house=2&drivems=${ms}` });
      const sim = GameSim.create({ seed: 5, autoSpawn: false });
      applyPromoShot(sim);
      return { ms, moving: sim.snapshot().autoDriving };
    });

    expect(driving.filter((d) => d.moving).length, "no seed caught the van driving").toBeGreaterThan(0);
    expect(driving.filter((d) => !d.moving).length, "no seed reached the stall").toBeGreaterThan(0);
    // And it parks once and stays parked: driving then parked, never back again.
    const parkedFrom = driving.findIndex((d) => !d.moving);
    expect(
      driving.slice(parkedFrom).every((d) => !d.moving),
      `van resumed driving after parking: ${driving.map((d) => `${d.ms}:${d.moving ? "drive" : "park"}`).join(" ")}`,
    ).toBe(true);
  });

  it("keeps the promo still's own seven seconds when ?drivems is absent or unusable", () => {
    const reference = (() => {
      vi.stubGlobal("location", { search: "?shot=drive&house=2" });
      const sim = GameSim.create({ seed: 5, autoSpawn: false });
      applyPromoShot(sim);
      return sim.clock.gameMs;
    })();
    for (const search of ["?shot=drive&house=2&drivems=abc", "?shot=drive&house=2&drivems=999999"]) {
      vi.stubGlobal("location", { search });
      const sim = GameSim.create({ seed: 5, autoSpawn: false });
      applyPromoShot(sim);
      expect(sim.clock.gameMs, search).toBe(reference);
    }
  });

  it("seeds shop counter speech for capture stills", () => {
    vi.stubGlobal("location", { search: "?capture=shop-counter" });
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    applyCaptureSeed(sim);
    const snap = sim.snapshot();
    expect(snap.playerRole).toBe("keyLead");
    const walkIn = snap.customers.find((c) => c.bubble.includes("want"));
    expect(walkIn?.bubble.length).toBeGreaterThan(0);
  });

  it("seeds mid-fetch key-lead speech for capture stills", () => {
    vi.stubGlobal("location", { search: "?capture=shop-lead" });
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    applyCaptureSeed(sim);
    expect(sim.snapshot().keyLeadLine).toMatch(/Grabbing/);
  });

  it("seeds the porch at CHECK ID with a card", () => {
    vi.stubGlobal("location", { search: "?shot=door" });
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    applyPromoShot(sim);
    const snap = sim.snapshot();
    expect(snap.playerRole).toBe("driver");
    expect(snap.dropoff.phase).toBe("atDoor");
    expect(snap.dropoff.idAsked).toBe(true);
    expect(snap.dropoff.idCard).not.toBeNull();
    expect(snap.dropoff.idChecked).toBe(false);
  });
});
