export interface JournalPost {
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  date: string;
  readTime: string;
  tag: string;
}

export const JOURNAL_POSTS: JournalPost[] = [
  {
    slug: "the-art-of-scent-layering",
    title: "The Art of Scent Layering",
    excerpt:
      "How to compose multiple candles in one room the way a perfumer builds a fragrance: in balance, not competition.",
    body: [
      "A single candle carries a room. Two candles, chosen well, can tell a story. The secret is contrast: pair a bright, fresh scent with something deep and resinous, and let each hold its own register.",
      "Start with one anchor scent, something with presence: cedar, amber, or sandalwood. Place it where you sit most often, so its base notes stay close. Then add a second candle across the room, one with lift: citrus, green leaves, or a light floral.",
      "Distance is the third ingredient. Candles placed side by side blur together; candles placed apart layer in the air, revealing themselves one at a time as you move through the room.",
    ],
    date: "August 28, 2026",
    readTime: "5 min read",
    tag: "Rituals",
  },
  {
    slug: "inside-our-soy-wax",
    title: "Inside Our Soy Wax: Why It Matters",
    excerpt:
      "A closer look at the wax we pour, the soybeans it comes from, and why a clean burn starts long before the match.",
    body: [
      "Wax is the body of a candle, and not all bodies burn the same. Paraffin is a petroleum byproduct; it throws scent quickly but leaves soot and, sometimes, more than we'd like in the air. Soy wax is different: a vegetable wax, renewable, slow-burning, and clean.",
      "Our soy comes from American-grown soybeans, hydrogenated into a wax that holds fragrance patiently. That patience matters. Soy releases scent more gradually than paraffin, which means a truer, steadier fragrance rather than a rush of it.",
      "The trade-off is care: soy needs a full melt pool on the first burn, an even wick, and a little time. Give it those, and it will burn down cleanly, edge to edge, to the very last hour.",
    ],
    date: "August 14, 2026",
    readTime: "4 min read",
    tag: "Ingredients",
  },
  {
    slug: "an-evening-with-solenne",
    title: "An Evening with Solenne",
    excerpt:
      "From the first trim of the wick to the last hour of glow: how one candle shaped an entire slow evening at home.",
    body: [
      "It begins an hour before dark. The wick trimmed to a quarter inch, the window cracked just enough for a draft, the first match held until the flame settles steady and low.",
      "By the time dinner is done, the top notes have softened and the heart of the fragrance has arrived: jasmine, perhaps, or the dry warmth of cedar. The room feels different. Slower.",
      "And at the end of the evening, the ritual closes as it opened, with intention. The flame snuffed rather than blown, the wax left to set evenly, the candle put to rest until tomorrow.",
    ],
    date: "July 30, 2026",
    readTime: "6 min read",
    tag: "Stories",
  },
  {
    slug: "seasonal-scents-fall",
    title: "Scents for the Turning Season",
    excerpt:
      "As the air cools, we reach for warmth. A guide to transitioning your candle wardrobe from summer to autumn.",
    body: [
      "Summer favors the fresh: citrus, green tea, ocean air. But as the evenings cool, a room asks for weight, for amber, fig, smoke, and spice.",
      "Transition gently. Keep one fresh scent for bright afternoons, and let a warm one take over after dark. Our Warm and Woody collections were made for exactly these hours.",
      "And don't forget the ritual itself changes: longer burns, closer candlelight, more time. Autumn is the candle's true season.",
    ],
    date: "July 16, 2026",
    readTime: "4 min read",
    tag: "Guides",
  },
];

export function getJournalPost(slug: string): JournalPost | undefined {
  return JOURNAL_POSTS.find((post) => post.slug === slug);
}
