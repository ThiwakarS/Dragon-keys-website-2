/* =============================================
   DRAGON KEYS — posts.js
   
   ✏️ ADD YOUR BLOGS & NOTES HERE.
   Simple array of post objects — same structure as your old site.
   ============================================= */

export const POSTS = [
  {
    id: "building-the-car-thing-clone",
    title: "The 'Car Thing' Clone: A 3-Month Journey into Hardware",
    date: "8th March 2026",
    category: "Build Log",
    summary:
      "How a DIY obsession with the Spotify Car Thing led to a deep dive into WinRT, ESP32, and the reality of product testing.",
    coverImage: "assets/posts/carthing/20241205_112336430.jpg",
    pdf: null,
    summary:
      'How a DIY obsession with the Spotify Car Thing led to a deep dive into WinRT, ESP32, and the reality of product testing.',
    content: `
      ## How it Started: The Spotify Spark

			It was late November 2024. I was spiraling down a YouTube rabbit hole when I saw it: how Spotify had "killed" its **Car Thing** device, and how DIY enthusiasts were jailbreaking them to serve as ultimate desk displays.

			I was in my third year of college, fueled by curiosity and a bit of a challenge. I turned to my close friend, Suriya Prakasha, and we discussed a "what if" scenario: Could I build a standalone device that mirrored system media, featured a volume knob, and looked as sleek as the original?

			With Suriya's motivation, I dove in. I didn't realize then that I was about to face a three-month marathon of struggles and breakthroughs.

			---

			## The Tech Stack: Python at the Heart

			I am a Python programmer at heart, so naturally, I chose it for my backend. The first hurdle was a big one: **How do I actually "see" what Windows is playing?**

			After some digging, I discovered the 'winrt' package, which interfaces with the Windows Runtime. If you've ever seen the volume slider pop up in the corner of your screen when you hit a media key, that's WinRT at work.

			[img:./assets/posts/carthing/mediaplayer.jpg | Windows Media player volume dialog box]

			Using this, I could extract:
			- **Title:** The name of the song or video.
			- **Subtitle:** The artist or channel name.
			- **Thumbnail:** The actual media icon/album art.

			[img:./assets/posts/carthing/20241122_154253960.jpg | The first iteration of sending the titles]

			I started with an **ESP32** and my laptop. Initially, sending text via serial communication was all "sunshines and rainbows." Then, I met the final boss: the **3.2-inch color LCD display** (320x240 resolution).

			---

			## The Struggle with Data & HID

			Sending raw image data over serial is a nightmare. I had to optimize the data packets to ensure the icon showed up without the device lagging into oblivion.


			Once the screen worked, I realized a hardware limitation: the standard ESP32 doesn't have native **HID (Human Interface Device)** support. This meant it couldn't "pretend" to be a keyboard or mouse out of the box.

			I engineered a workaround using the Python backend:
			- The Python script listened for serial triggers from the ESP32.
			- The script then executed the actual keypresses or macros on the PC.
			- I implemented a **heartbeat function** to ensure the connection never dropped.
			- I built a **handshake procedure** so the device was "plug-and-play" without manual COM port configuration.

			[img:./assets/posts/carthing/20241207_161605434.jpg | testing of buttons and volume mixers]

			### Features I Managed to Pack In:
			- **16 Buttons:** Integrated via a multiplexer.
			- **Rotary Encoder:** For that satisfying volume scroll.
			- **Multi-Layer Mapping:** Users could swap between different macro sets.
			- **Robust Reconnection:** If the cable was pulled, the script would auto-reconnect instantly.

			[img:./assets/posts/carthing/lcd_image.jpg]

			---

			## The "Testing" Reality Check

			I spent three months—juggling college exams and late-night debugging—to get this prototype ready. Then came the rigorous testing phase.

			**It failed.**

			Not because of the hardware, but because of the foundation. I realized that the Windows 'winrt' API was notoriously unstable for third-party pulls. It would work beautifully for an hour, then simply refuse to fetch the next song's icon.

			> You can't sell a product if it only works "sometimes."

			Faced with the choice of shipping a glitchy experience or starting over, I chose to discontinue the project.

			## Closing Thoughts

			Even though the "Dragon Car-Thing" didn't hit the market, those three months were my real-world masterclass. I learned more about serial protocols, multiplexing and python than any classroom could have taught me.

			This project was the concrete foundation that paved the way for my new venture. Every "failed" prototype is just a stepping stone to the one that finally works.

			---

			[youtube:vQVuGeoqyUc]`,
  },
];
