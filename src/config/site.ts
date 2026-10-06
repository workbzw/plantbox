/** Shared site metadata; geometry remains the calibrated WH-01 layout. */
export const SITE = {
  id: "WH-01",
  name: "昆仑元仓储中心",
  location: "上海 · 昆仑元物流园",
  parkName: "KUNLUN YUAN LOGISTICS PARK",
  sign: "PLANTBOX  /  昆仑元仓储中心",
  coordinates: "31°08′ N · 121°22′ E",
  capacity: 1800,
  docks: [
    { id: "A01", x: -19 },
    { id: "A02", x: -8 },
    { id: "A03", x: 3 },
  ],
} as const;
