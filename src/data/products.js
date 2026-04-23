/* =============================================
   DRAGON KEYS — products.js

      ✏️  ADD/EDIT PRODUCTS HERE.

   REQUIRED fields for every product:
     id, name, category, fulfillment, description, price, images, openSource

   fulfillment: "queue" = booking form + login + production queue
                "email" = routes straight to support email

   throughputPerDay (queue only):
     4   = four per day
     0.5 = one every 2 days
     0.33 = one every 3 days

   specs: array of { label, rows: [{key, value}] }
   notes: array of { type: "info"|"caution"|"tip", text }
   images: paths from /public folder, e.g. "assets/mudflaps/photo.jpg"

   IMPORTANT about image paths:
     - Images live in /public (e.g. public/assets/mudflaps/foo.jpg)
     - Paths in this file should START WITH "/assets/..." — with a leading slash.
     - WITHOUT the slash, browsers resolve relative to the current URL,
       so "assets/foo.jpg" on the /order/mudflap page becomes
       /order/assets/foo.jpg → 404.
     - Product card images happen to work either way because the grid
       is rendered on "/" — but option images are rendered on "/order/:id"
       and will break without the slash.
     - Safe rule: ALWAYS start image paths with "/".
============================================= */

export const PRODUCTS = [
  {
    id: "dragonfly-67",
    name: "Dragonfly 67",
    category: "Keyboard",
    fulfillment: "queue",
    throughputPerDay: 0.5,
    maxActivePerUser: 1,
    description:
      "A handcrafted 67-key split mechanical keyboard inspired by the ROG Falcata. Features RP2040 Zero with QMK/VIAL support, three Deej audio sliders, a rotary encoder, and an ergonomic 3D-printed design with TRRS interconnect and USB-C input.",
    price: "₹5,200",
    images: [
      "/assets/keyboards/dragonfly67/_dsc8664_edited_lrc.png",
      "/assets/keyboards/dragonfly67/_dsc8665_edited_lrc.png",
      "/assets/keyboards/dragonfly67/_dsc8666_edited_lrc.png",
      "/assets/keyboards/dragonfly67/_dsc8667_edited_lrc.png",
      "/assets/keyboards/dragonfly67/_dsc8668_edited_lrc.png",
      "/assets/keyboards/dragonfly67/_dsc8669_edited_lrc.png",
      "/assets/keyboards/dragonfly67/_dsc8670_edited_lrc.png",
      "/assets/keyboards/dragonfly67/_dsc8671_edited_lrc.png",
      "/assets/keyboards/dragonfly67/_dsc8672_edited_lrc.png",
      "/assets/keyboards/dragonfly67/_dsc8673_edited_lrc.png",
    ],
    openSource: {
      github: "https://github.com/ThiwakarS/Dragon-Keys-3d-model-files",
      cults3d: null,
    },
    specs: [
      {
        label: "Build",
        rows: [
          { key: "Layout",        value: "Alice (ergonomic split)" },
          { key: "Case Material", value: "3D Printed PLA" },
          { key: "Color",         value: "Matte black with teal green and pink switches" },
        ],
      },
      {
        label: "Electronics",
        rows: [
          { key: "Switches",   value: "Gateron Yellow Linear (lubed)" },
          { key: "Controller", value: "RP2040 Zero" },
          { key: "Firmware",   value: "QMK + VIAL" },
          { key: "Connection", value: "USB-C + TRRS split cable" },
          { key: "RGB",        value: "2 RGB LEDs with capslock and scroll lock indicators" },
        ],
      },
      {
        label: "Keycaps",
        rows: [
          { key: "Profile",  value: "Cherry" },
          { key: "Material", value: "PLA" },
          { key: "Legend",   value: "Custom blank available on request" },
        ],
      },
    ],
    notes: [
      { type: "info",    text: "Firmware is pre-flashed. Remap keys live using the VIAL app — no reflashing needed." },
      { type: "info",    text: "Delivery charges will be calculated at the time of delivery." },
      { type: "info",    text: "Based in Chennai, Tamilnadu — happy to do on-site collection. Contact me on WhatsApp." },
      { type: "caution", text: "Do not plug in both halves simultaneously. Always connect the primary (left) half to your PC first, then connect the TRRS cable." },
    ],
  },

  {
    id: "keychain-service",
    name: "Keychains",
    category: "Keychain",
    fulfillment: "email",
    description:
      "Transform your vision into a tangible accessory with our custom-designed, 3D-printed keychains. Precision engineering with personalized flair — high-quality gifts tailored to your style.",
    price: "₹40 onwards",
    images: [
      "/assets/keychains/20250912_170251.jpg",
      "/assets/keychains/20250927_190548.jpg",
      "/assets/keychains/20250927_180329.jpg",
      "/assets/keychains/20250820_220629.jpg",
    ],
    openSource: { github: null, cults3d: null },
    specs: [
      {
        label: "Material & Print",
        rows: [
          { key: "Material", value: "PLA" },
          { key: "Colour",   value: "Based on user preference" },
        ],
      },
    ],
    notes: [
      { type: "info", text: "Cost calculated based on material and print time." },
      { type: "info", text: "Single and bulk orders welcome." },
      { type: "info", text: "Delivery charges calculated at time of delivery." },
      { type: "info", text: "Based in Chennai, Tamilnadu — happy to do on-site collection. Contact me on WhatsApp." },
    ],
  },

  {
    id: "mudflap-triumph-400",
    name: "Triumph Speed / Scrambler 400x Mudflap",
    category: "3D Printed",
    fulfillment: "queue",
    throughputPerDay: 4,
    maxActivePerUser: 2,  // ← bump this to 2, 3, etc when you scale production
    description:
      "Custom-designed rear mudflap for the Triumph Speed 400, Scrambler 400x, Speed T4, Thruxton 400 and Scrambler 400xc, printed in flexible TPU95A. Easy installation.",
    price: "₹600 - 640",
    images: [
      "/assets/mudflaps/20260308_103458.jpg",
      "/assets/mudflaps/20260423_133002.jpeg",
      "/assets/mudflaps/20260423_133010.jpeg",
      "/assets/mudflaps/20260308_103515.jpg",
      "/assets/mudflaps/20260308_103532.jpg",
      "/assets/mudflaps/20260308_103608.jpg",
      "/assets/mudflaps/20260308_103651.jpg",      

      "/assets/mudflaps/20260125_145727.jpg",
      "/assets/mudflaps/20260125_145730.jpg",
      "/assets/mudflaps/20260125_145734.jpg",
      "/assets/mudflaps/20260125_145738.jpg",
      "/assets/mudflaps/20260125_145741.jpg",
      "/assets/mudflaps/20260123_192234.jpg",
      "/assets/mudflaps/20260123_192240.jpg",
      "/assets/mudflaps/20260123_192250.jpg",

      "/assets/mudflaps/20260129_155145.jpg",
      "/assets/mudflaps/20260130_074730.jpg",
      "/assets/mudflaps/20260130_074733.jpg",
      "/assets/mudflaps/20260131_084233.jpg",
      "/assets/mudflaps/20260308_103458.jpg",
      "/assets/mudflaps/20260308_103515.jpg",
      "/assets/mudflaps/20260308_103532.jpg",
      "/assets/mudflaps/20260308_103608.jpg",
      "/assets/mudflaps/20260308_103651.jpg",
    ],
    openSource: {
      github: null,
      cults3d: "https://cults3d.com/en/users/thiwakar/3d-models",
    },
    optionCategories: [
      {
        key: "vehicle",
        label: "Vehicle Model",
        required: true,
        options: [
          { value: "Triumph Speed 400, T4, Thruxton 400" },
          { value: "Triumph Scrambler 400x, 400xc" },
        ],
      },
      {
        key: "design",
        label: "Design",
        required: true,
        options: [
          // Drop design photos into public/assets/mudflaps/designs/
          // Paths MUST start with "/"
          { value: "Classic",  image: "/assets/mudflaps/20260308_103458.jpg"  },
          { value: "Triangle logo",   image: "/assets/mudflaps/20260423_133002.jpeg"   },
          { value: "Vehicle name",  image: "/assets/mudflaps/20260423_133010.jpeg"  },
        ],
      },
    ],
    specs: [
      {
        label: "Material & Print",
        rows: [
          { key: "Material", value: "Elegoo TPU 95A (flexible)" },
          { key: "Colour",   value: "Matte black (standard)" },
        ],
      },
      {
        label: "Fitment",
        rows: [
          { key: "Compatible",         value: "Triumph Speed 400, Scrambler 400x, Speed T4, Thruxton 400, Scrambler 400xc" },
          { key: "Mounting",           value: "Rear fender holes — sits between nut and washer. Order: Nut → Mudflap → Washer" },
          { key: "Print Instructions", value: "No supports. 0.2mm layer height, Gyroid infill 15% density" },
        ],
      },
    ],
    notes: [
      { type: "info",    text: "Scrambler variants — ₹640 · Speed variants — ₹600 · Advance — ₹200" },
      { type: "info",    text: "Open source for personal use only. Files on Cults3D." },
      { type: "info",    text: "Delivery charges calculated at time of delivery." },
      { type: "info",    text: "Based in Chennai, Tamilnadu — collect on site and I'll install it for free. Contact me on WhatsApp." },
      { type: "info",    text: "Installation: Two mounting holes under the seat. Remove the bolt (Allen key 5mm — in stock toolkit). Pinch the mat: Nut → TPU mat → Washer. Tighten firmly until snug." },
      { type: "tip",     text: "Before fitting, clean the bolt and mudguard. Apply a small amount of oil where the nut spins — stops the mat from rotating while tightening." },
      { type: "caution", text: "If the mat rotates with the nut: back off a quarter turn, hold the mat flat with your finger, then re-tighten. End result — mat should sit flush with the underside of the fender." },
      { type: "tip",     text: "If the lower tape section comes loose, reapply double-sided tape. Avoid high-pressure washing near the mount." },
      { type: "info",    text: "Scrambler 400x variants are 2cm longer than Speed 400 variants." },
    ],
  },
];

export function findProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

export function queueProducts() {
  return PRODUCTS.filter((p) => p.fulfillment === "queue");
}