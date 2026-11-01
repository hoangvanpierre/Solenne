export interface JournalPost {
  slug: string;
  title: string;
  titleVi: string;
  excerpt: string;
  excerptVi: string;
  body: string[];
  bodyVi: string[];
  date: string;
  dateVi: string;
  readTime: string;
  readTimeVi: string;
  tag: string;
  tagVi: string;
  /**
   * Article hero image — public path (URL-safe filename), cropped to 16:9.
   * Recommended source: 1600 × 900. Omit to keep the muted placeholder.
   */
  image?: string;
  /**
   * Listing-card thumbnail — public path (URL-safe filename), cropped to 4:3.
   * Recommended source: 1200 × 900. Omit to keep the muted placeholder.
   * Independent of `image`: no cross-fallback between the two slots.
   */
  imageCard?: string;
}

export const JOURNAL_POSTS: JournalPost[] = [
  {
    slug: "the-art-of-scent-layering",
    image: "/images/journal/the-art-of-scent-layering-hero.webp",
    imageCard: "/images/journal/the-art-of-scent-layering-card.webp",
    title: "The art of scent layering",
    titleVi: "Nghệ thuật phối hương nhiều tầng",
    excerpt:
      "How to layer two candles in one room the way a perfumer builds a fragrance: in balance, not competition.",
    excerptVi:
      "Cách phối hai ngọn nến trong một không gian như một nhà pha hương dựng nên mùi hương: cân bằng, không cạnh tranh.",
    body: [
      "One candle can carry a room. Two, chosen well, can tell a story. The trick is contrast: pair something bright and fresh with something deep and resinous, and let each keep its own register.",
      "Start with an anchor — cedar, amber or sandalwood — and place it where you sit most often, so the base notes stay close. Add a second candle across the room with more lift: citrus, green leaves, a light floral.",
      "Distance is the third ingredient. Side by side, candles blur together. Set apart, they layer in the air and reveal themselves as you move through the room.",
    ],
    bodyVi: [
      "Một ngọn nến có thể giữ cả căn phòng. Hai ngọn, nếu chọn khéo, sẽ kể được một câu chuyện. Điều quan trọng là tương phản: ghép một hương tươi sáng với một hương trầm ấm, và để mỗi ngọn giữ tiếng nói riêng.",
      "Bắt đầu bằng một hương neo — tuyết tùng, hổ phách hoặc đàn hương — đặt ở nơi bạn ngồi nhiều nhất để hương nền luôn ở gần. Thêm ngọn thứ hai ở phía bên kia phòng, nhẹ và bay cao hơn: cam chanh, lá xanh hoặc một chút hoa.",
      "Khoảng cách là nguyên liệu thứ ba. Đặt sát nhau, các hương sẽ hòa lẫn. Đặt xa nhau, chúng phân tầng trong không khí và lần lượt hiện ra khi bạn đi qua phòng.",
    ],
    date: "August 28, 2026",
    dateVi: "28 tháng 8, 2026",
    readTime: "5 min read",
    readTimeVi: "5 phút đọc",
    tag: "Rituals",
    tagVi: "Nghi thức",
  },
  {
    slug: "inside-our-soy-wax",
    image: "/images/journal/inside-our-soy-wax-hero.webp",
    imageCard: "/images/journal/inside-our-soy-wax-card.webp",
    title: "Inside our soy wax",
    titleVi: "Sáp đậu nành của chúng tôi",
    excerpt:
      "A closer look at the wax we pour, the soybeans behind it, and why a clean burn starts long before the match.",
    excerptVi:
      "Nhìn kỹ hơn vào loại sáp chúng tôi dùng, nguồn đậu nành phía sau và lý do một ngọn lửa sạch bắt đầu từ trước khi que diêm được quẹt.",
    body: [
      "Wax is the body of a candle, and not every body burns the same. Paraffin is a petroleum byproduct: it throws scent quickly, and it can leave soot. Soy wax is a vegetable wax — renewable, slower to burn, and cleaner.",
      "Our soy comes from soybeans grown in the United States, hydrogenated into a wax that holds fragrance patiently. That patience matters: soy releases scent gradually, so the fragrance stays true and steady instead of arriving all at once.",
      "The trade-off is care. Soy needs a full melt pool on the first burn, an even wick and a little time. Give it those, and it burns down cleanly, edge to edge, to the last hour.",
    ],
    bodyVi: [
      "Sáp là thân thể của ngọn nến, và không phải loại sáp nào cũng cháy giống nhau. Paraffin là phụ phẩm dầu mỏ: tỏa hương nhanh nhưng có thể để lại muội. Sáp đậu nành là sáp thực vật — tái tạo được, cháy chậm hơn và sạch hơn.",
      "Sáp của chúng tôi làm từ đậu nành trồng tại Hoa Kỳ, chuyển hóa thành loại sáp giữ hương chậm rãi. Sự chậm rãi đó quan trọng: sáp đậu nành nhả hương từ từ, nên mùi hương giữ được sự chân thật và ổn định thay vì ùa đến một lúc.",
      "Đổi lại, nến cần được chăm. Sáp đậu nành cần mặt sáp tan chảy tới thành ly trong lần thắp đầu, bấc thẳng và một chút thời gian. Cho nến những điều đó, nến sẽ cháy sạch, đều tới mép ly, đến giờ cuối cùng.",
    ],
    date: "August 14, 2026",
    dateVi: "14 tháng 8, 2026",
    readTime: "4 min read",
    readTimeVi: "4 phút đọc",
    tag: "Ingredients",
    tagVi: "Nguyên liệu",
  },
  {
    slug: "an-evening-with-solenne",
    image: "/images/journal/an-evening-with-solenne-hero.webp",
    imageCard: "/images/journal/an-evening-with-solenne-card.webp",
    title: "An evening with Solenne",
    titleVi: "Một buổi tối cùng Solenne",
    excerpt:
      "From the first trim of the wick to the last hour of light: how one candle shapes a slow evening at home.",
    excerptVi:
      "Từ nhát cắt bấc đầu tiên đến giờ phút cuối của ánh sáng: cách một ngọn nến tạo nên một buổi tối chậm rãi ở nhà.",
    body: [
      "It starts an hour before dark. The wick trimmed to a quarter inch, a window cracked for air, the first match held until the flame settles low and steady.",
      "By the time dinner is over, the top notes have softened and the heart has arrived — jasmine, perhaps, or the dry warmth of cedar. The room feels different. Slower.",
      "At the end of the evening the ritual closes the way it opened. The flame is snuffed rather than blown out, the wax left to set evenly, the candle put to rest until tomorrow.",
    ],
    bodyVi: [
      "Mọi thứ bắt đầu một giờ trước khi trời tối. Bấc được cắt còn khoảng 0,6 cm, cửa sổ hé cho không khí vào, que diêm đầu tiên giữ cho đến khi ngọn lửa cháy thấp và đều.",
      "Khi bữa tối kết thúc, hương đầu đã dịu lại và hương giữa đã đến — có thể là hoa nhài, hoặc hơi ấm khô của tuyết tùng. Căn phòng thấy khác đi. Chậm lại.",
      "Cuối buổi tối, nghi thức khép lại như lúc mở đầu. Ngọn lửa được dập tắt chứ không thổi, mặt sáp để lắng phẳng, và ngọn nến nghỉ đến ngày mai.",
    ],
    date: "July 30, 2026",
    dateVi: "30 tháng 7, 2026",
    readTime: "6 min read",
    readTimeVi: "6 phút đọc",
    tag: "Stories",
    tagVi: "Câu chuyện",
  },
  {
    slug: "seasonal-scents-fall",
    image: "/images/journal/seasonal-scents-fall-hero.webp",
    imageCard: "/images/journal/seasonal-scents-fall-card.webp",
    title: "Scents for the turning season",
    titleVi: "Hương cho mùa chuyển",
    excerpt:
      "As the air cools, we reach for warmth. A guide to moving your candles from summer into autumn.",
    excerptVi:
      "Khi không khí se lạnh, ta tìm hơi ấm. Cẩm nang chuyển nến từ mùa hè sang mùa thu.",
    body: [
      "Summer favours the fresh: citrus, green tea, sea air. As evenings cool, a room starts to ask for weight — amber, fig, smoke, spice.",
      "Move across gently. Keep one fresh scent for bright afternoons and let a warm one take over after dark. Our Warm and Woody collections were made for these hours.",
      "The ritual changes too: longer burns, closer light, more time. Autumn is the candle's true season.",
    ],
    bodyVi: [
      "Mùa hè hợp với hương tươi: cam chanh, trà xanh, gió biển. Khi buổi tối se lạnh, căn phòng bắt đầu cần chiều sâu — hổ phách, quả sung, khói, gia vị.",
      "Chuyển mùa từ từ. Giữ một hương tươi cho những buổi chiều còn nắng, và để hương ấm tiếp quản khi trời tối. Bộ sưu tập Warm và Woody được làm cho chính những giờ này.",
      "Cách thắp nến cũng đổi: cháy lâu hơn, ánh sáng gần hơn, nhiều thời gian hơn. Mùa thu là mùa thật sự của nến.",
    ],
    date: "July 16, 2026",
    dateVi: "16 tháng 7, 2026",
    readTime: "4 min read",
    readTimeVi: "4 phút đọc",
    tag: "Guides",
    tagVi: "Cẩm nang",
  },
];

export function getJournalPost(slug: string): JournalPost | undefined {
  return JOURNAL_POSTS.find((post) => post.slug === slug);
}
