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
}

export const JOURNAL_POSTS: JournalPost[] = [
  {
    slug: "the-art-of-scent-layering",
    title: "The Art of Scent Layering",
    titleVi: "Nghệ Thuật Phối Hương Đa Tầng",
    excerpt:
      "How to compose multiple candles in one room the way a perfumer builds a fragrance: in balance, not competition.",
    excerptVi:
      "Nghệ thuật hòa quyện nhiều ngọn nến trong một không gian như cách nhà chế tác nước hoa tạo tác một tuyệt phẩm: cân bằng và hòa hợp.",
    body: [
      "A single candle carries a room. Two candles, chosen well, can tell a story. The secret is contrast: pair a bright, fresh scent with something deep and resinous, and let each hold its own register.",
      "Start with one anchor scent, something with presence: cedar, amber, or sandalwood. Place it where you sit most often, so its base notes stay close. Then add a second candle across the room, one with lift: citrus, green leaves, or a light floral.",
      "Distance is the third ingredient. Candles placed side by side blur together; candles placed apart layer in the air, revealing themselves one at a time as you move through the room.",
    ],
    bodyVi: [
      "Một ngọn nến đơn lẻ có thể ấp ôm cả căn phòng. Nhưng hai ngọn nến, nếu được chọn tinh tế, sẽ kể nên một câu chuyện thi vị. Bí quyết nằm ở sự tương phản: hãy kết hợp một nốt hương tươi sáng, trong trẻo cùng một tầng hương trầm ấm sâu lắng, để mỗi ngọn nến tự cất lên khúc hoan ca của riêng mình.",
      "Hãy khởi đầu bằng một ngọn nến điểm tựa mang chiều sâu: tuyết tùng, hổ phách hoặc đàn hương. Đặt nến gần nơi bạn hay ngồi nhất để lớp hương nền luôn vỗ về. Sau đó, thắp thêm ngọn nến thứ hai ở góc đối diện mang nốt hương thanh thoát: cam chanh, lá xanh hoặc hoa cỏ dịu êm.",
      "Khoảng cách chính là chất xúc tác diệu kỳ thứ ba. Những ngọn nến đặt sát nhau sẽ làm lu mờ nhau; nhưng những ngọn nến đặt cách xa sẽ đan dệt nên những tầng hương trong không khí, khẽ khàng hé lộ từng nốt hương khi bạn nhẹ bước qua căn phòng.",
    ],
    date: "August 28, 2026",
    dateVi: "28 Tháng Tám, 2026",
    readTime: "5 min read",
    readTimeVi: "5 phút đọc",
    tag: "Rituals",
    tagVi: "Nghi thức sống",
  },
  {
    slug: "inside-our-soy-wax",
    title: "Inside Our Soy Wax: Why It Matters",
    titleVi: "Bên Trong Lớp Sáp Đậu Nành Thuần Khiết",
    excerpt:
      "A closer look at the wax we pour, the soybeans it comes from, and why a clean burn starts long before the match.",
    excerptVi:
      "Chiêm ngưỡng nguồn sáp thuần khiết chúng tôi nâng niu, và lý do vì sao một ngọn lửa trong sạch đã bắt đầu từ rất lâu trước khi que diêm bừng sáng.",
    body: [
      "Wax is the body of a candle, and not all bodies burn the same. Paraffin is a petroleum byproduct; it throws scent quickly but leaves soot and, sometimes, more than we'd like in the air. Soy wax is different: a vegetable wax, renewable, slow-burning, and clean.",
      "Our soy comes from American-grown soybeans, hydrogenated into a wax that holds fragrance patiently. That patience matters. Soy releases scent more gradually than paraffin, which means a truer, steadier fragrance rather than a rush of it.",
      "The trade-off is care: soy needs a full melt pool on the first burn, an even wick, and a little time. Give it those, and it will burn down cleanly, edge to edge, to the very last hour.",
    ],
    bodyVi: [
      "Sáp chính là thể xác của ngọn nến, và không phải thể xác nào cũng cháy như nhau. Paraffin là một phụ phẩm từ dầu mỏ; nó tỏa hương vội vã nhưng để lại muội than độc hại trong không khí. Sáp đậu nành thì hoàn toàn khác biệt: một loại sáp thực vật tái tạo, cháy êm đềm, chậm rãi và thanh sạch tuyệt đối.",
      "Nguồn đậu nành của Solenne được canh tác bền vững, chuyển hóa thành lớp sáp mịn như lụa có khả năng giữ chặt từng phân tử tinh dầu hương. Sự kiên nhẫn ấy vô cùng quý giá. Sáp đậu nành giải phóng hương thơm từ tốn, mang đến một làn hương chân thực, sâu lắng và bền bỉ thay vì một thoáng choáng ngợp nhất thời.",
      "Điều sáp đòi hỏi ở chúng ta là sự nâng niu: sáp đậu nành cần một mặt hồ tan chảy chạm tới thành ly trong lần thắp đầu, một sợi bấc ngay ngắn và một chút kiên nhẫn. Trao cho nến sự trân trọng ấy, nến sẽ tỏa sáng tinh khôi đến tận giọt sáp cuối cùng.",
    ],
    date: "August 14, 2026",
    dateVi: "14 Tháng Tám, 2026",
    readTime: "4 min read",
    readTimeVi: "4 phút đọc",
    tag: "Ingredients",
    tagVi: "Nguyên liệu quý",
  },
  {
    slug: "an-evening-with-solenne",
    title: "An Evening with Solenne",
    titleVi: "Một Buổi Tối Bình Yên Cùng Solenne",
    excerpt:
      "From the first trim of the wick to the last hour of glow: how one candle shaped an entire slow evening at home.",
    excerptVi:
      "Từ nhát cắt tỉa bấc nến đầu tiên đến giờ phút cuối cùng của ánh sáng: cách một ngọn nến kiến tạo nên một buổi tối an yên tại tổ ấm.",
    body: [
      "It begins an hour before dark. The wick trimmed to a quarter inch, the window cracked just enough for a draft, the first match held until the flame settles steady and low.",
      "By the time dinner is done, the top notes have softened and the heart of the fragrance has arrived: jasmine, perhaps, or the dry warmth of cedar. The room feels different. Slower.",
      "And at the end of the evening, the ritual closes as it opened, with intention. The flame snuffed rather than blown, the wax left to set evenly, the candle put to rest until tomorrow.",
    ],
    bodyVi: [
      "Mọi điều bắt đầu một giờ trước khi hoàng hôn buông xuống. Bấc nến được cắt gọn gàng, khung cửa sổ khẽ hé đón làn gió nhẹ, que diêm đầu tiên được giữ cho đến khi ánh lửa cháy điềm đạm và ấm áp.",
      "Khi bữa tối nhẹ nhàng khép lại, những nốt hương đầu đã dịu dần nhường chỗ cho trái tim của hương thơm: hoa nhài thanh khiết, hay sự ấm áp khô ráo của gỗ tuyết tùng. Căn phòng bỗng trở nên thật khác. Dịu lại. Chậm rãi và tĩnh tại.",
      "Và khi đêm đã về khuya, nghi thức khép lại trang trọng như lúc mở ra. Ngọn lửa được dập tắt êm đềm thay vì thổi tắt, mặt sáp được để lắng đọng phẳng phiu, và ngọn nến nghỉ ngơi chờ đón một ngày mai bình yên.",
    ],
    date: "July 30, 2026",
    dateVi: "30 Tháng Bảy, 2026",
    readTime: "6 min read",
    readTimeVi: "6 phút đọc",
    tag: "Stories",
    tagVi: "Tản văn",
  },
  {
    slug: "seasonal-scents-fall",
    title: "Scents for the Turning Season",
    titleVi: "Hương Sắc Cho Thời Khắc Chuyển Mùa",
    excerpt:
      "As the air cools, we reach for warmth. A guide to transitioning your candle wardrobe from summer to autumn.",
    excerptVi:
      "Khi làn gió thu bắt đầu se lạnh, tâm hồn lại khao khát hơi ấm. Cẩm nang chuyển giao tủ nến thơm từ hạ sang thu.",
    body: [
      "Summer favors the fresh: citrus, green tea, ocean air. But as the evenings cool, a room asks for weight, for amber, fig, smoke, and spice.",
      "Transition gently. Keep one fresh scent for bright afternoons, and let a warm one take over after dark. Our Warm and Woody collections were made for exactly these hours.",
      "And don't forget the ritual itself changes: longer burns, closer candlelight, more time. Autumn is the candle's true season.",
    ],
    bodyVi: [
      "Mùa hạ yêu chuộng sự tươi mát: cam chanh, trà xanh và gió biển mặn mòi. Nhưng khi những buổi chiều chớm lạnh, không gian lại đòi hỏi một chiều sâu lắng đọng: của hổ phách, quả sung chín mọng, khói mỏng và hương gia vị ấm nồng.",
      "Hãy chuyển giao nhẹ nhàng. Giữ một ngọn nến tươi mát cho những trưa thu trong vắt, và để hương thơm ấm nồng ôm ấp gian phòng khi màn đêm buông. Bộ sưu tập Warm và Woody của Solenne được sinh ra chính là để dành cho những giờ phút này.",
      "Và đừng quên, chính nghi thức thắp nến cũng thay đổi: những giờ phút thắp dài hơn, ánh nến gần gũi hơn và nhiều thời gian để tĩnh tâm hơn. Mùa thu chính là mùa ngự trị đích thực của nến thơm.",
    ],
    date: "July 16, 2026",
    dateVi: "16 Tháng Bảy, 2026",
    readTime: "4 min read",
    readTimeVi: "4 phút đọc",
    tag: "Guides",
    tagVi: "Cẩm nang",
  },
];

export function getJournalPost(slug: string): JournalPost | undefined {
  return JOURNAL_POSTS.find((post) => post.slug === slug);
}
