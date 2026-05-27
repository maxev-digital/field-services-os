// ─── SRS Building Products — Melissa Price List (03-19-2026) ────────────────

export type ProductType =
  | 'field_shingle'
  | 'ridge_cap'
  | 'starter'
  | 'underlayment'
  | 'ice_water'
  | 'coil_nails'
  | 'cap_nails'
  | 'drip_edge'
  | 'pipe_boot'
  | 'vent';

export const SHINGLE_BRANDS = [
  'GAF',
  'Owens Corning',
  'CertainTeed',
  'Atlas',
  'IKO',
  'Tamko',
  'Malarkey',
] as const;

export type ShingleBrand = (typeof SHINGLE_BRANDS)[number];

export interface MaterialProduct {
  id: string;
  brand: string;
  type: ProductType;
  name: string;
  price: number; // SRS price
  priceUnit: 'SQ' | 'BD' | 'RL' | 'EA' | 'BX' | 'PC';
  bundlesPerSq?: number; // for field_shingle (price is per bundle)
  lfPerBoard?: number;   // for ridge_cap, starter (price is per board/bundle)
  sqPerRoll?: number;    // for underlayment, ice_water
}

// ─── Field Shingles ──────────────────────────────────────────────────────────

export const FIELD_SHINGLES: MaterialProduct[] = [
  // GAF
  { id: 'gaf_hdz',            brand: 'GAF',          type: 'field_shingle', name: 'Timberline HDZ',               price: 125.01, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'gaf_natural_shadow', brand: 'GAF',          type: 'field_shingle', name: 'Timberline Natural Shadow',     price: 115.00, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'gaf_royal_sovereign', brand: 'GAF',         type: 'field_shingle', name: 'Royal Sovereign 25yr',          price: 115.00, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'gaf_armor_shield_ir', brand: 'GAF',         type: 'field_shingle', name: 'Timberline Armor Shield IR',    price: 147.57, priceUnit: 'BD', bundlesPerSq: 3 },
  // Owens Corning
  { id: 'oc_oakridge_trudef',  brand: 'Owens Corning', type: 'field_shingle', name: 'Oakridge TruDef',             price: 124.00, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'oc_oakridge_ar',      brand: 'Owens Corning', type: 'field_shingle', name: 'Oakridge AR',                 price: 116.13, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'oc_supreme_25',       brand: 'Owens Corning', type: 'field_shingle', name: 'Supreme 25yr',                price: 114.00, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'oc_duration_lifetime', brand: 'Owens Corning', type: 'field_shingle', name: 'TruDef Duration Lifetime',   price: 122.00, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'oc_storm_ir',         brand: 'Owens Corning', type: 'field_shingle', name: 'TruDef Storm IR',             price: 147.80, priceUnit: 'BD', bundlesPerSq: 3 },
  // CertainTeed
  { id: 'ct_landmark_ar',      brand: 'CertainTeed', type: 'field_shingle', name: 'Landmark AR',                  price: 126.00, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'ct_landmark_maxdef',  brand: 'CertainTeed', type: 'field_shingle', name: 'Landmark Max Definition',      price: 130.50, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'ct_belmont_ir',       brand: 'CertainTeed', type: 'field_shingle', name: 'Belmont IR',                   price: 240.00, priceUnit: 'BD', bundlesPerSq: 4 },
  { id: 'ct_presidential_ir',  brand: 'CertainTeed', type: 'field_shingle', name: 'Presidential IR',              price: 250.00, priceUnit: 'BD', bundlesPerSq: 5 },
  { id: 'ct_xt25',             brand: 'CertainTeed', type: 'field_shingle', name: 'XT 25yr',                      price: 116.25, priceUnit: 'BD', bundlesPerSq: 3 },
  // Atlas
  { id: 'atlas_pinnacle',      brand: 'Atlas',       type: 'field_shingle', name: 'Pinnacle',                     price: 124.50, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'atlas_pinnacle_ir',   brand: 'Atlas',       type: 'field_shingle', name: 'Pinnacle IR',                  price: 142.10, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'atlas_pro_laminate',  brand: 'Atlas',       type: 'field_shingle', name: 'Pro Laminate',                 price: 105.00, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'atlas_glass_master',  brand: 'Atlas',       type: 'field_shingle', name: 'Glass Master 25yr',            price: 113.01, priceUnit: 'BD', bundlesPerSq: 3 },
  // IKO
  { id: 'iko_cambridge_ar',    brand: 'IKO',         type: 'field_shingle', name: 'Cambridge AR',                 price: 112.00, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'iko_dynasty_lt',      brand: 'IKO',         type: 'field_shingle', name: 'Dynasty LT',                   price: 117.00, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'iko_nordic_ir',       brand: 'IKO',         type: 'field_shingle', name: 'Nordic IR Armourzone',         price: 130.43, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'iko_marathon_ar',     brand: 'IKO',         type: 'field_shingle', name: 'Marathon Plus AR',             price: 102.00, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'iko_royal_estate_lt', brand: 'IKO',         type: 'field_shingle', name: 'Royal Estate LT',             price: 192.00, priceUnit: 'BD', bundlesPerSq: 3 },
  // Malarkey
  { id: 'mal_highlander_ar',   brand: 'Malarkey',    type: 'field_shingle', name: 'Highlander AR',                price:  38.33, priceUnit: 'BD', bundlesPerSq: 3 },
  { id: 'mal_vista_ar',        brand: 'Malarkey',    type: 'field_shingle', name: 'Vista AR',                     price:  49.00, priceUnit: 'BD', bundlesPerSq: 3 },
];

// ─── Ridge Cap ───────────────────────────────────────────────────────────────

export const RIDGE_CAPS: MaterialProduct[] = [
  // GAF
  { id: 'gaf_z_ridge',        brand: 'GAF',          type: 'ridge_cap', name: 'Z Ridge 13.25"',          price:  80.50, priceUnit: 'BD', lfPerBoard: 33.75 },
  { id: 'gaf_armor_hr',       brand: 'GAF',          type: 'ridge_cap', name: 'Armor Shield H&R 12"',    price:  93.00, priceUnit: 'BD', lfPerBoard: 25    },
  { id: 'gaf_seal_a_ridge',   brand: 'GAF',          type: 'ridge_cap', name: 'Seal-A-Ridge 12"',        price:  59.50, priceUnit: 'BD', lfPerBoard: 25    },
  // Owens Corning
  { id: 'oc_rizer_ridge',     brand: 'Owens Corning', type: 'ridge_cap', name: 'Rizer Ridge',            price:  92.00, priceUnit: 'BD', lfPerBoard: 33    },
  { id: 'oc_proedge',         brand: 'Owens Corning', type: 'ridge_cap', name: 'ProEdge',                price:  78.50, priceUnit: 'BD', lfPerBoard: 33    },
  // CertainTeed
  { id: 'ct_cedarcrest_ir',   brand: 'CertainTeed', type: 'ridge_cap', name: 'CedarCrest IR',           price:  85.00, priceUnit: 'BD', lfPerBoard: 20    },
  // Atlas
  { id: 'atlas_pro_cut_hr',   brand: 'Atlas',       type: 'ridge_cap', name: 'Pro Cut H&R 12"',         price:  78.50, priceUnit: 'BD', lfPerBoard: 31    },
  { id: 'atlas_high_profile', brand: 'Atlas',       type: 'ridge_cap', name: 'High Profile H&R 10"',    price: 108.00, priceUnit: 'BD', lfPerBoard: 20    },
  // IKO
  { id: 'iko_hr_ultra_10',    brand: 'IKO',         type: 'ridge_cap', name: 'Hip & Ridge Ultra 10"',   price: 107.00, priceUnit: 'BD', lfPerBoard: 20    },
  { id: 'iko_hr_12',          brand: 'IKO',         type: 'ridge_cap', name: 'Hip & Ridge 12"',         price:  72.00, priceUnit: 'BD', lfPerBoard: 36.5  },
];

// ─── Starters ────────────────────────────────────────────────────────────────

export const STARTERS: MaterialProduct[] = [
  { id: 'gaf_pro_start',      brand: 'GAF',          type: 'starter', name: 'GAF Pro Start',                     price:  57.00, priceUnit: 'BD', lfPerBoard: 120 },
  { id: 'oc_starter_plus',    brand: 'Owens Corning', type: 'starter', name: 'OC Starter Strip Plus',            price:  61.50, priceUnit: 'BD', lfPerBoard: 105 },
  { id: 'ct_hp_starter',      brand: 'CertainTeed', type: 'starter', name: 'CertainTeed High Performance Starter', price: 135.00, priceUnit: 'BD', lfPerBoard: 105 },
  { id: 'ct_swiftstart',      brand: 'CertainTeed', type: 'starter', name: 'CertainTeed SwiftStart',             price:  66.00, priceUnit: 'BD', lfPerBoard: 105 },
  { id: 'atlas_procut_hp42',  brand: 'Atlas',       type: 'starter', name: 'Atlas Pro-Cut HP42',                price:  83.50, priceUnit: 'BD', lfPerBoard: 105 },
  { id: 'iko_leading_edge',   brand: 'IKO',         type: 'starter', name: 'IKO Leading Edge Plus',             price:  69.00, priceUnit: 'BD', lfPerBoard: 105 },
  { id: 'tamko_starter',      brand: 'Tamko',       type: 'starter', name: 'Tamko Shingle Starter',             price:  59.00, priceUnit: 'BD', lfPerBoard: 105 },
  { id: 'topshield_starter',  brand: 'TopShield',   type: 'starter', name: 'TopShield Starter Strip Plus',      price:  54.00, priceUnit: 'BD', lfPerBoard: 105 },
];

// ─── Underlayments ───────────────────────────────────────────────────────────

export const UNDERLAYMENTS: MaterialProduct[] = [
  { id: 'ts_stormgear',       brand: 'TopShield',   type: 'underlayment', name: 'TopShield StormGear Synthetic',    price:  85.00, priceUnit: 'RL', sqPerRoll: 10 },
  { id: 'ts_ts20',            brand: 'TopShield',   type: 'underlayment', name: 'TopShield TS20 Synthetic',         price:  85.00, priceUnit: 'RL', sqPerRoll: 10 },
  { id: 'oc_rhinoroof_u20',   brand: 'Owens Corning', type: 'underlayment', name: 'OC RhinoRoof U20',              price:  83.00, priceUnit: 'RL', sqPerRoll: 10 },
  { id: 'oc_proarmor',        brand: 'Owens Corning', type: 'underlayment', name: 'OC ProArmor Synthetic',         price: 167.00, priceUnit: 'RL', sqPerRoll: 10 },
  { id: 'gaf_feltbuster',     brand: 'GAF',         type: 'underlayment', name: 'GAF FeltBuster Synthetic',        price: 102.00, priceUnit: 'RL', sqPerRoll: 10 },
  { id: 'ct_roofrunner',      brand: 'CertainTeed', type: 'underlayment', name: 'CertainTeed RoofRunner Synthetic', price: 129.00, priceUnit: 'RL', sqPerRoll: 10 },
  { id: 'iko_stormtite',      brand: 'IKO',         type: 'underlayment', name: 'IKO StormTite Synthetic',         price: 125.00, priceUnit: 'RL', sqPerRoll: 10 },
  { id: 'tamko_synth_guard',  brand: 'Tamko',       type: 'underlayment', name: 'Tamko Synthetic Guard',           price: 104.00, priceUnit: 'RL', sqPerRoll: 10 },
  { id: 'atlas_summit60',     brand: 'Atlas',       type: 'underlayment', name: 'Atlas Summit 60 Synthetic',       price: 116.00, priceUnit: 'RL', sqPerRoll: 10 },
  { id: 'atlas_wm200se',      brand: 'Atlas',       type: 'underlayment', name: 'Atlas WeatherMaster 200 SE',      price: 111.00, priceUnit: 'RL', sqPerRoll: 10 },
  { id: 'maxfelt_15',         brand: 'MaxFelt',     type: 'underlayment', name: 'MaxFelt 15# Synthetic',           price: 116.00, priceUnit: 'RL', sqPerRoll: 10 },
];

// ─── Ice & Water Shield ───────────────────────────────────────────────────────

export const ICE_WATER: MaterialProduct[] = [
  { id: 'tarco_ms300',        brand: 'Tarco',       type: 'ice_water', name: 'Tarco MS300 / TopShield G300',        price:  72.00, priceUnit: 'RL', sqPerRoll: 2 },
  { id: 'ts_iw_defender',     brand: 'TopShield',   type: 'ice_water', name: 'TopShield I&W Defender',              price:  72.00, priceUnit: 'RL', sqPerRoll: 2 },
  { id: 'tamko_moisture_guard', brand: 'Tamko',     type: 'ice_water', name: 'Tamko Moisture Guard',                price: 107.00, priceUnit: 'RL', sqPerRoll: 2 },
  { id: 'iko_stormshield',    brand: 'IKO',         type: 'ice_water', name: 'IKO StormShield',                     price: 122.00, priceUnit: 'RL', sqPerRoll: 2 },
  { id: 'oc_rhinoroof_iw',    brand: 'Owens Corning', type: 'ice_water', name: 'OC RhinoRoof Granulated I&W',      price: 132.00, priceUnit: 'RL', sqPerRoll: 2 },
  { id: 'gaf_stormguard',     brand: 'GAF',         type: 'ice_water', name: 'GAF StormGuard',                      price: 134.00, priceUnit: 'RL', sqPerRoll: 2 },
  { id: 'ct_winterguard',     brand: 'CertainTeed', type: 'ice_water', name: 'CertainTeed WinterGuard Granulated',  price: 156.00, priceUnit: 'RL', sqPerRoll: 2 },
  { id: 'oc_weatherlock_mat', brand: 'Owens Corning', type: 'ice_water', name: 'OC WeatherLock Mat-Faced',         price: 156.00, priceUnit: 'RL', sqPerRoll: 2 },
];

// ─── Accessories (fixed — not brand-selectable) ───────────────────────────────

export interface AccessoryProduct {
  id: string;
  type: ProductType;
  name: string;
  price: number;
  priceUnit: 'BX' | 'EA' | 'PC';
}

export const ACCESSORIES: AccessoryProduct[] = [
  { id: 'coil_nails',    type: 'coil_nails',  name: 'Coil Roofing Nails 1-1/4" 7200/BX', price:  54.00, priceUnit: 'BX' },
  { id: 'cap_nails',     type: 'cap_nails',   name: 'Plastic Cap Nails 1" 2000/BX',        price:  16.50, priceUnit: 'BX' },
  { id: 'drip_2x2',     type: 'drip_edge',   name: 'Metal Edge 2×2 Drip Edge',            price:   6.95, priceUnit: 'EA' }, // 10 LF/stick
  { id: 'drip_mill',    type: 'drip_edge',   name: 'Metal Edge Mill Drip Edge',           price:  15.75, priceUnit: 'EA' }, // 10 LF/stick
  { id: 'pipe_3n1',     type: 'pipe_boot',   name: 'IPS 3N1 Galvanized Pipe Flash',       price:   9.70, priceUnit: 'EA' },
  { id: 'vent_ross150', type: 'vent',         name: 'Ross 150 Roof Vent',                  price:  43.75, priceUnit: 'EA' },
  { id: 'vent_lomanco', type: 'vent',         name: 'Lomanco 750 Box Vent',                price:  22.80, priceUnit: 'PC' },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

// Defaults: the first/most popular product per brand+type
const BRAND_DEFAULTS: Partial<Record<ShingleBrand, Partial<Record<'field_shingle' | 'ridge_cap' | 'starter', string>>>> = {
  'GAF':          { field_shingle: 'gaf_hdz',           ridge_cap: 'gaf_seal_a_ridge', starter: 'gaf_pro_start'   },
  'Owens Corning':{ field_shingle: 'oc_oakridge_trudef', ridge_cap: 'oc_proedge',       starter: 'oc_starter_plus' },
  'CertainTeed':  { field_shingle: 'ct_landmark_ar',    ridge_cap: 'ct_cedarcrest_ir', starter: 'ct_swiftstart'   },
  'Atlas':        { field_shingle: 'atlas_pinnacle',    ridge_cap: 'atlas_pro_cut_hr', starter: 'atlas_procut_hp42'},
  'IKO':          { field_shingle: 'iko_cambridge_ar',  ridge_cap: 'iko_hr_12',        starter: 'iko_leading_edge' },
  'Tamko':        { field_shingle: undefined,           ridge_cap: undefined,          starter: 'tamko_starter'   },
  'Malarkey':     { field_shingle: 'mal_highlander_ar', ridge_cap: undefined,          starter: undefined         },
};

const ALL_PRODUCTS: MaterialProduct[] = [
  ...FIELD_SHINGLES,
  ...RIDGE_CAPS,
  ...STARTERS,
  ...UNDERLAYMENTS,
  ...ICE_WATER,
];

export function getProductById(id: string): MaterialProduct | undefined {
  return ALL_PRODUCTS.find(p => p.id === id);
}

export function getProductsByType(type: ProductType): MaterialProduct[] {
  return ALL_PRODUCTS.filter(p => p.type === type);
}

export function getProductsByBrandAndType(brand: ShingleBrand, type: ProductType): MaterialProduct[] {
  return ALL_PRODUCTS.filter(p => p.brand === brand && p.type === type);
}

export function getDefaultForBrand(
  brand: ShingleBrand,
  type: 'field_shingle' | 'ridge_cap' | 'starter',
): MaterialProduct | null {
  const defaultId = BRAND_DEFAULTS[brand]?.[type];
  if (defaultId) {
    return ALL_PRODUCTS.find(p => p.id === defaultId) ?? null;
  }
  // Fall back to first match for that brand+type
  return ALL_PRODUCTS.find(p => p.brand === brand && p.type === type) ?? null;
}
