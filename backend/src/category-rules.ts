export const categoryRules: Record<
  string,
  { subcategories: string[]; fields: { id: string; options?: string[] }[] }
> = {
  phones: {
    subcategories: [
      "smartphones",
      "basic_phones",
      "tablets",
      "phone_accessories",
    ],
    fields: [
      { id: "model" },
      { id: "batteryCondition" },
      { id: "lockStatus", options: ["unlocked", "locked", "unknown"] },
    ],
  },
  electronics: {
    subcategories: [
      "computers",
      "cameras",
      "audio",
      "televisions",
      "electronic_accessories",
    ],
    fields: [{ id: "model" }, { id: "workingCondition" }],
  },
  furniture: {
    subcategories: [
      "seating",
      "tables",
      "beds",
      "storage_furniture",
      "home_decor",
    ],
    fields: [{ id: "dimensions" }],
  },
  appliances: {
    subcategories: ["kitchen", "laundry", "cooling", "small_appliances"],
    fields: [{ id: "workingCondition" }, { id: "missingParts" }],
  },
  fashion: {
    subcategories: ["clothing", "shoes", "accessories"],
    fields: [{ id: "size" }],
  },
  kids: {
    subcategories: ["baby_equipment", "toys", "kids_clothing"],
    fields: [{ id: "ageRange" }, { id: "safetyCondition" }],
  },
  books: {
    subcategories: ["books", "magazines", "music_media", "movies"],
    fields: [{ id: "language" }],
  },
  gaming: {
    subcategories: ["consoles", "video_games", "gaming_accessories"],
    fields: [{ id: "platform" }],
  },
  sports: {
    subcategories: ["fitness", "team_sports", "outdoor_equipment"],
    fields: [{ id: "size" }],
  },
  tools: {
    subcategories: ["hand_tools", "power_tools", "garden"],
    fields: [{ id: "workingCondition" }],
  },
  hobbies: {
    subcategories: ["art", "collectibles", "musical_instruments", "crafts"],
    fields: [{ id: "itemDetails" }],
  },
  vehicles: {
    subcategories: ["cars", "motorcycles", "bicycles", "vehicle_parts"],
    fields: [
      { id: "model" },
      { id: "ownership", options: ["owner", "authorized_seller"] },
      { id: "registrationStatus", options: ["registered", "not_applicable"] },
    ],
  },
  business: {
    subcategories: ["office", "commercial_equipment", "industrial_equipment"],
    fields: [{ id: "workingCondition" }],
  },
  pets: {
    subcategories: ["pet_accessories", "pet_housing", "pet_toys"],
    fields: [{ id: "itemDetails" }],
  },
  other: { subcategories: ["general"], fields: [] },
};
