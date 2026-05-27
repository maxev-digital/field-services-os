export interface SectionField {
  key: string;
  label: string;
  type: 'select' | 'multi' | 'boolean' | 'text';
  options?: string[];
}

export interface InspectionSection {
  key: string;
  label: string;
  fields: SectionField[];
}

export const INSPECTION_SECTIONS: InspectionSection[] = [
  {
    key: 'ROOFING',
    label: 'Roofing',
    fields: [
      { key: 'damage_types', label: 'Damage Type', type: 'multi', options: ['Hail/Impact', 'Wind', 'Wear/Age', 'Missing Shingles', 'Other'] },
      { key: 'slope_pct', label: 'Slope(s) Damaged', type: 'select', options: ['25% (1 side)', '50% (2 sides)', '75% (3 sides)', '100% (all sides)'] },
      { key: 'hail_size', label: 'Hail Size', type: 'select', options: ['Pea (1/4")', 'Dime (3/4")', 'Quarter (1")', 'Half Dollar (1-1/4")', 'Golf Ball (1-3/4")', 'Baseball (2-3/4")'] },
      { key: 'granule_loss', label: 'Granule Loss', type: 'select', options: ['None', 'Minor', 'Moderate', 'Severe'] },
      { key: 'bruising', label: 'Bruising/Impact Marks', type: 'select', options: ['None', 'Minor', 'Moderate', 'Severe'] },
      { key: 'cracked_shingles', label: 'Cracked/Missing Shingles', type: 'boolean' },
      { key: 'ridge_cap', label: 'Ridge Cap Damage', type: 'boolean' },
      { key: 'flashing', label: 'Flashing Damage', type: 'boolean' },
      { key: 'decking', label: 'Decking Exposed/Damaged', type: 'boolean' },
    ],
  },
  {
    key: 'GUTTERS',
    label: 'Gutters',
    fields: [
      { key: 'slope_pct', label: 'Side(s) Affected', type: 'select', options: ['25% (1 side)', '50% (2 sides)', '75% (3 sides)', '100% (all sides)'] },
      { key: 'damage_level', label: 'Damage Level', type: 'select', options: ['Minor', 'Moderate', 'Severe'] },
      { key: 'dents', label: 'Dents/Impact Marks', type: 'boolean' },
      { key: 'downspouts', label: 'Downspout Damage', type: 'boolean' },
      { key: 'guards', label: 'Gutter Guards Damaged', type: 'boolean' },
      { key: 'detached', label: 'Gutters Detached/Pulling Away', type: 'boolean' },
    ],
  },
  {
    key: 'FENCE',
    label: 'Fence',
    fields: [
      { key: 'material', label: 'Material', type: 'select', options: ['Wood', 'Vinyl', 'Metal/Iron', 'Chain Link', 'Other'] },
      { key: 'damage_types', label: 'Damage Type', type: 'multi', options: ['Broken Boards', 'Panels Blown Down', 'Posts Damaged', 'Leaning/Bowing', 'Complete Section Loss'] },
      { key: 'linear_feet', label: 'Est. Linear Feet Damaged', type: 'text' },
    ],
  },
  {
    key: 'SCREENS',
    label: 'Window/Door Screens',
    fields: [
      { key: 'window_count', label: 'Window Screens Damaged (#)', type: 'text' },
      { key: 'door_count', label: 'Door Screens Damaged (#)', type: 'text' },
      { key: 'pool_enclosure', label: 'Pool Enclosure Damaged', type: 'boolean' },
      { key: 'screen_room', label: 'Screen Room Damaged', type: 'boolean' },
    ],
  },
  {
    key: 'PATIO_COVER',
    label: 'Patio Cover',
    fields: [
      { key: 'material', label: 'Material', type: 'select', options: ['Wood', 'Metal', 'Composite', 'Screen Enclosure', 'Pergola', 'Other'] },
      { key: 'damage_types', label: 'Damage Type', type: 'multi', options: ['Surface Dents/Damage', 'Structural Damage', 'Screen Panels', 'Total Loss', 'Fascia/Trim'] },
    ],
  },
  {
    key: 'GARAGE_DOOR',
    label: 'Garage Door',
    fields: [
      { key: 'door_count', label: '# of Doors Affected', type: 'text' },
      { key: 'damage_types', label: 'Damage Type', type: 'multi', options: ['Dents/Dings', 'Bent Panels', 'Cracked Panels', "Won't Operate", 'Full Replacement Needed'] },
    ],
  },
  {
    key: 'SIDING',
    label: 'Siding',
    fields: [
      { key: 'material', label: 'Material', type: 'select', options: ['Vinyl', 'Wood', 'HardiePlank', 'Brick/Masonry', 'Stucco', 'EIFS', 'Other'] },
      { key: 'slope_pct', label: 'Side(s) Affected', type: 'select', options: ['25% (1 side)', '50% (2 sides)', '75% (3 sides)', '100% (all sides)'] },
      { key: 'damage_level', label: 'Damage Level', type: 'select', options: ['Minor', 'Moderate', 'Severe'] },
      { key: 'cracks', label: 'Cracks/Holes', type: 'boolean' },
      { key: 'missing', label: 'Missing Panels', type: 'boolean' },
    ],
  },
  {
    key: 'CHIMNEY',
    label: 'Chimney',
    fields: [
      { key: 'flashing', label: 'Flashing Damaged', type: 'boolean' },
      { key: 'cap', label: 'Cap Damaged/Missing', type: 'boolean' },
      { key: 'crown', label: 'Crown Cracked', type: 'boolean' },
      { key: 'bricks', label: 'Brick/Mortar Damage', type: 'boolean' },
      { key: 'spalling', label: 'Spalling', type: 'boolean' },
    ],
  },
];
