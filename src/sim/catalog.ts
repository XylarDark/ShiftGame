import { generateNames } from "./names";

/** Shelf category; only tints the item's menu-board row. */
export type SkuType = "pantry" | "treat" | "home";

export interface Sku {
  id: string;
  name: string;
  type: SkuType;
  color: number;
}

const TYPES: SkuType[] = ["pantry", "treat", "home"];

const TYPE_COLORS: Record<SkuType, number> = {
  pantry: 0x4fae5a,
  treat: 0xe07aa0,
  home: 0xd4a054,
};

export const CATALOG_SIZE = 9;

export function createCatalog(seed: number): Sku[] {
  const names = generateNames(CATALOG_SIZE, seed);
  return names.map((name, i) => {
    const type = TYPES[i % TYPES.length]!;
    return {
      id: `sku-${i + 1}`,
      name,
      type,
      color: TYPE_COLORS[type],
    };
  });
}

export function skuById(catalog: Sku[], id: string): Sku | undefined {
  return catalog.find((s) => s.id === id);
}
