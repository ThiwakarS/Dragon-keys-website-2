/* =============================================
   DRAGON KEYS — products.js
   
   ✏️  ADD/EDIT PRODUCTS HERE.
   
   FIELD REFERENCE:
   
   id              — unique string, no spaces (used in URLs)
   name            — display name
   category        — "Keyboard" | "Keychain" | "3D Printed" | "Service"
   description     — 1-2 sentence description
   price           — price string for display (e.g. "₹4,999" or "From ₹299")
   images          — array of image paths (first is primary)
   
   fulfillment     — "queue" | "email"
                     "queue"  → physical product; goes into the production queue,
                               requires login, booking form, admin fulfillment
                     "email"  → service/custom request; routes to your support email
   
   throughputPerDay — (queue products only) how many you can make per day.
                      Examples: 4 (four per day), 0.5 (one every 2 days), 
                                0.33 (one every 3 days)
                      For "1 every 2 days" → use 0.5
                      For "4 per day"      → use 4
   
   openSource      — { github: "url" | null, cults3d: "url" | null }
                     Set either to null if not applicable.
                     If both are null, no OSS links will show.
   
   specs           — optional array of { label, value } pairs
   ============================================= */

export const PRODUCTS = [
  {
    id: 'triumph-speed-400-mudflap',
    name: 'Triumph Speed 400 Mudflap',
    category: '3D Printed',
    description:
      'Clip-on TPU mudflap for the Triumph Speed 400. No drilling, no modifications — slides onto the OEM bracket in under a minute.',
    price: '₹499',
    images: [
      // 'assets/products/mudflaps/speed-400-1.jpg',
      // 'assets/products/mudflaps/speed-400-2.jpg',
    ],
    fulfillment: 'queue',
    throughputPerDay: 4, // 4 per day (upgraded from 3)
    openSource: {
      github: 'https://github.com/dragonkeys/triumph-mudflap',
      cults3d: 'https://cults3d.com/en/3d-model/dragonkeys-mudflap',
    },
    specs: [
      { label: 'Material', value: 'TPU 95A (flexible)' },
      { label: 'Infill', value: '40% gyroid' },
      { label: 'Fitment', value: 'OEM bracket — no drilling' },
    ],
  },

  {
    id: 'dragonfly-67-keyboard',
    name: 'Dragonfly 67 Keyboard',
    category: 'Keyboard',
    description:
      'A 67-key split-layout keyboard with hot-swap sockets, VIAL firmware, and deej compatibility. Hand-wired, hand-assembled, built to order.',
    price: '₹6,499',
    images: [
      // 'assets/products/keyboards/dragonfly-67-1.jpg',
    ],
    fulfillment: 'queue',
    throughputPerDay: 0.5, // 1 every 2 days
    openSource: {
      github: 'https://github.com/dragonkeys/dragonfly-67',
      cults3d: null,
    },
    specs: [
      { label: 'Switches', value: 'Gateron Yellow (swappable)' },
      { label: 'Controller', value: 'RP2040 Zero' },
      { label: 'Firmware', value: 'QMK + VIAL' },
      { label: 'Plate', value: 'FR4 fibreglass' },
    ],
  },

  {
    id: 'custom-keychain',
    name: 'Custom Keychain',
    category: 'Keychain',
    description:
      'Custom 3D-printed keychains — names, logos, dragons, whatever you want. Email me your design idea and I\'ll get back with a quote.',
    price: 'From ₹199',
    images: [
      // 'assets/products/keychains/sample.jpg',
    ],
    fulfillment: 'email',
    openSource: {
      github: null,
      cults3d: null,
    },
    specs: [
      { label: 'Material', value: 'PLA+ / PETG / Resin' },
      { label: 'Turnaround', value: '3–7 days after design approval' },
    ],
  },

  {
    id: 'custom-keyboard-build',
    name: 'Custom Keyboard Build Service',
    category: 'Service',
    description:
      'Bring me a kit, I\'ll build it. Lubing, filming, soldering, assembly — full build service with tuning notes. Pricing depends on the kit.',
    price: 'Quoted per build',
    images: [],
    fulfillment: 'email',
    openSource: { github: null, cults3d: null },
    specs: [
      { label: 'Includes', value: 'Lube, film, assemble, test, tune' },
      { label: 'Turnaround', value: 'Usually under 10 days' },
    ],
  },
];

// Helpers used across the app
export function findProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

export function queueProducts() {
  return PRODUCTS.filter((p) => p.fulfillment === 'queue');
}
