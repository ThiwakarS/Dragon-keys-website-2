/* =============================================
   DRAGON KEYS — posts.js
   
   ✏️ ADD YOUR BLOGS & NOTES HERE.
   Simple array of post objects — same structure as your old site.
   ============================================= */

export const POSTS = [
  {
    id: 'building-the-alice-keyboard',
    title: 'Building My First Alice Layout Keyboard',
    date: 'February 2026',
    category: 'Build Log',
    summary:
      'A walkthrough of my first split ergonomic build — what went right, what went wrong, and everything I learned along the way.',
    coverImage: null,
    content: `
## How it started

I've been typing on flat, cramped keyboards my whole life. After a long stint of late-night coding sessions, my wrists started complaining. So I did what any reasonable person does — I spent three months designing my own keyboard instead of just buying an ergonomic one.

The Alice layout is a **split, angled design** that keeps your wrists in a more natural position. Most commercial Alice boards cost ₹15,000+. I built mine for under ₹4,000.

---

## The build

### Case & Plate

I designed the case in Fusion 360. Printed in *PLA+* with 20% gyroid infill — rigid enough that it doesn't flex when you type, but light enough to carry around.

The plate is FR4 fibreglass (same material as PCBs). It gives a satisfying, slightly springy feel compared to aluminium.

> FR4 plates are underrated. Everyone chases aluminium but the dampened sound profile of FR4 is genuinely better for most use cases.

### Electronics

- **Controller:** RP2040 Zero — tiny, fast, and the QMK support is excellent
- **Switches:** Gateron Yellow Linear, lubed with Krytox 205g0
- **Sockets:** Kailh hot-swap, so I can swap switches without desoldering

The hand-wiring took about 4 hours. Diodes on every switch for n-key rollover.
    `,
  },
  {
    id: 'tpu-mudflap-design-notes',
    title: 'Designing a Mudflap for the Triumph Speed 400',
    date: 'January 2026',
    category: 'Notes',
    summary:
      'Notes on designing a clip-on TPU mudflap that fits without drilling. Tolerances, material choice, and what I\'d change in v2.',
    coverImage: null,
    content: `
## The problem

The stock Triumph Speed 400 fender does a poor job keeping road spray off the rear of the bike. There's no factory mudflap option.

---

## Material choice: TPU 95A

I tried three materials before settling on **TPU 95A (flexible)**:

- PLA — too brittle
- PETG — still too rigid
- TPU 95A — flexible, impact-resistant, doesn't rattle

> TPU is annoying to print. It strings, it oozes. Slow it right down to 20mm/s and it behaves.
    `,
  },
];
