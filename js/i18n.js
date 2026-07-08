/**
 * i18n.js — Chuyển ngôn ngữ EN / VI cho toàn dashboard.
 *
 * Hai cơ chế:
 *  1) Chrome tĩnh: data-i18n="key" (nav, header) — dịch theo DICT (key → {vi,en}).
 *  2) Phần còn lại (bảng, chart-legend HTML, tooltip, mô tả...): tự động dịch text node
 *     VI → EN theo PHRASES (khớp nguyên câu) + PATTERNS (câu có chèn số). Một MutationObserver
 *     dịch cả nội dung render động. Đổi về VI thì reload (nguồn gốc là VI).
 * Ngôn ngữ lưu localStorage 'mc_lang'. Nguồn (mặc định) là tiếng Việt.
 */
const I18N = (() => {

    // ── 1) Keyed dict cho chrome + nhãn vẽ trên canvas ──────────────────────────
    const DICT = {
        vi: {
            'app.brand': 'Merge Cooking', 'app.subtitle': 'Balance Dashboard', 'app.title': 'Merge Cooking — Balance Dashboard',
            'nav.gameData': 'Game Data', 'nav.orderAnalysis': 'Order Analysis', 'nav.playerSim': 'Player Sim',
            'nav.resources': 'Nguồn Lực', 'nav.economy': 'Economy', 'nav.roadmap': 'Lộ Trình', 'nav.businessModel': 'Business Model',
            'hdr.gameData': '🗃️ Game Data Hub', 'sub.gameData': 'Toàn bộ data game: Items, Energy, Orders và IAP Packages — dùng làm nguồn cho các tính năng phân tích.',
            'hdr.orderAnalysis': '📊 Order Analysis', 'sub.orderAnalysis': 'Visualize orders theo scene, energy cost và độ khó.',
            'hdr.playerSim': '🎮 Player Simulation', 'sub.playerSim': 'Giả lập hành trình user — cấu hình profile, session, IAP và xem timeline tiến trình theo từng ngày.',
            'hdr.resources': '⚡ Nguồn Lực — Generator & Tool Analysis', 'sub.resources': 'Traceback từ Order → Recipe → Nguyên liệu cần drop per Batch',
            'hdr.economy': '💰 Economy — Source / Sink Flow', 'sub.economy': 'Sơ đồ dòng tiền Sources → Currency Pools → Sinks. Xem theo toàn game, từng scene hoặc từng batch.',
            'hdr.roadmap': '🗺️ Lộ Trình — Content Release & Onboarding', 'sub.roadmap': 'Feature unlock theo account level và trình tự onboarding phiên đầu của người chơi.',
            'hdr.businessModel': '💵 Business Model — Tasty Merge', 'sub.businessModel': 'Mô hình kinh doanh & điểm đặt ads, benchmark với Flambé. Gói IAP lấy trực tiếp từ game data.',
            'eco.in': 'Vào', 'eco.out': 'Ra',
        },
        en: {
            'app.brand': 'Merge Cooking', 'app.subtitle': 'Balance Dashboard', 'app.title': 'Merge Cooking — Balance Dashboard',
            'nav.gameData': 'Game Data', 'nav.orderAnalysis': 'Order Analysis', 'nav.playerSim': 'Player Sim',
            'nav.resources': 'Resources', 'nav.economy': 'Economy', 'nav.roadmap': 'Roadmap', 'nav.businessModel': 'Business Model',
            'hdr.gameData': '🗃️ Game Data Hub', 'sub.gameData': 'All game data: Items, Energy, Orders and IAP Packages — the source for every analysis feature.',
            'hdr.orderAnalysis': '📊 Order Analysis', 'sub.orderAnalysis': 'Visualize orders by scene, energy cost and difficulty.',
            'hdr.playerSim': '🎮 Player Simulation', 'sub.playerSim': 'Simulate the player journey — configure profile, sessions, IAP and view a day-by-day progression timeline.',
            'hdr.resources': '⚡ Resources — Generator & Tool Analysis', 'sub.resources': 'Traceback from Order → Recipe → raw ingredients needed per Batch.',
            'hdr.economy': '💰 Economy — Source / Sink Flow', 'sub.economy': 'Money-flow diagram Sources → Currency Pools → Sinks. View whole game, per scene or per batch.',
            'hdr.roadmap': '🗺️ Roadmap — Content Release & Onboarding', 'sub.roadmap': 'Feature unlocks by account level and the first-session onboarding sequence.',
            'hdr.businessModel': '💵 Business Model — Tasty Merge', 'sub.businessModel': 'Business model & ad placements, benchmarked against Flambé. IAP packages pulled from game data.',
            'eco.in': 'In', 'eco.out': 'Out',
        },
    };

    // ── 2) Phrase dict (VI → EN) — khớp nguyên câu (đã chuẩn hoá khoảng trắng) ──
    const PHRASES = {
        '(bao gồm nhiều CSV) vào đây để cập nhật data.': '(multiple CSVs supported) drop here to update data.',
        '(trung bình 3 orders)': '(3-order rolling avg)',
        '1×/ngày': '1×/day', 'Nhiều lần/ngày': 'Multiple times/day', 'Nhiều lần/session': 'Multiple times/session', 'Nhiều lần trong ván': 'Multiple times in gameplay',
        'Active — mọi placement': 'Active — all placements', 'Active — trục chính': 'Active — main axis',
        'Ad để skip timer': 'Ad to skip timer',
        'Boost + tài nguyên, giá bậc thang': 'Boost + resources, tiered pricing', 'Booster + tài nguyên': 'Booster + resources',
        'BÁN ĐƯỢC': 'SELLABLE', 'Bán gì': 'Sells', 'Bán được': 'Sellable',
        'Bước onboarding': 'Onboarding steps', 'Bộ 3 gói energy theo tier': 'Bundle of 3 tiered energy packs',
        'CHUỖI': 'CHAIN', 'Cho non-payer tiến bộ + đòn bẩy giảm giá gói shop.': 'Lets non-payers progress + a lever for shop package discounts.',
        'Chưa bật — A/B sau': 'Not active — A/B test later', 'Chưa có Recipe': 'No Recipe',
        'Chọn cấp:': 'Select level:', 'Chọn file từ máy': 'Choose file',
        'Click để lọc Active': 'Click to filter Active', 'Click để lọc Missing': 'Click to filter Missing',
        'Combo tài nguyên': 'Resource combo', 'Cooldown dồn lại → skip bằng ads / IAP.': 'Cooldowns pile up → skip via ads / IAP.',
        'Có': 'Yes', 'Có giá IAP': 'Has IAP price', 'Có popup thông báo khi mở': 'Shows a popup when unlocked', 'Có — nhiều placement': 'Yes — multiple placements',
        'Công thức:': 'Formula:', 'Cả scene': 'Whole scene',
        'Doanh thu chính từ payer; sẽ đào sâu theo Flambé.': 'Primary revenue from payers; to be deepened following Flambé.',
        'Dễ': 'Easy', 'Khó': 'Hard', 'Trung bình': 'Average', 'TB': 'Normal',
        'Dự phòng: test theo segment sau khi ổn định nếu CPI cho phép.': 'Reserve: test by segment after stabilization if CPI allows.',
        'Energy cần (fulfil)': 'Energy needed (fulfil)', 'Energy recipe = tổng': 'Recipe energy = sum', 'Energy, mua lẻ': 'Energy, single purchase',
        'Feature unlock theo account level và trình tự onboarding phiên đầu của người chơi.': 'Feature unlocks by account level and the first-session onboarding sequence.',
        'Flambé dùng wait-timer làm áp lực chi tiêu': 'Flambé uses wait timers as spending pressure',
        'GIÁ': 'PRICE', 'GIÁ BÁN': 'SELL PRICE', 'Giá (USD)': 'Price (USD)',
        'Gems (hard currency), nhiều mức giá': 'Gems (hard currency), multiple price tiers',
        'Generator Cần Dùng': 'Generator Needed', 'Generator sử dụng:': 'Generators used:', 'Generator sử dụng': 'Generators used',
        'Giả lập hành trình user — cấu hình profile, session, IAP và xem timeline tiến trình theo từng ngày.': 'Simulate the player journey — configure profile, sessions, IAP and view a day-by-day progression timeline.',
        'Giống Flambé — đúng chuẩn thể loại': 'Same as Flambé — matches the genre standard',
        'Gold vào (orders)': 'Gold in (orders)', 'Gold chi (Build-Up)': 'Gold out (Build-Up)',
        '📋 Nguồn & Sink': '📋 Sources & Sinks', '🔀 Sơ đồ dòng tiền': '🔀 Flow Diagram',
        'Tên': 'Name', 'Giá trị': 'Value',
        'Không có dòng tiền nào trong phạm vi này.': 'No currency flow in this scope.',
        'Gói giảm giá qua ads': 'Discounted package via ads', 'Gói khởi đầu — giới hạn sau khi tạo account': 'Starter pack — time-limited after account creation',
        'Gói kim cương chuẩn': 'Standard diamond package', 'Gói quay may mắn': 'Lucky spin pack',
        'Gỡ quảng cáo': 'Remove ads',
        'Hoàn thành nấu tức thì': 'Complete cooking instantly', 'Hoàn thành order → Gold, Star, Item': 'Complete order → Gold, Star, Item',
        'Hỗ trợ: .csv đơn lẻ, nhiều .csv cùng lúc, hoặc .zip chứa các CSV': 'Supports: a single .csv, multiple .csv at once, or a .zip of CSVs',
        'IAP-centric, gói leo thang': 'IAP-centric, escalating packages',
        'Item raw sinh ra từ generator theo cấp độ': 'Raw items spawned by generators per level',
        'Khoảng level': 'Level range', 'Khác': 'Other', 'Không': 'No', 'Không dùng': 'Not used', 'Không tính được': 'N/A',
        'Kéo file vào đây': 'Drop files here', 'Kéo thả file': 'Drag & drop files',
        'Làm Order': 'Complete Order', 'Làm mới daily deal': 'Refresh daily deals',
        'Merge-cooking → chuyển sang Flambé': 'Merge-cooking → transitioning to Flambé',
        'Mua gói giá giảm / nửa giá': 'Buy packages at a discount / half price', 'Mua lần đầu — one-time, giá trị cao': 'First purchase — one-time, high value',
        'Mỗi lần unlock': 'Per unlock', 'Mở item sớm': 'Open item early', 'Mở item, bỏ chờ': 'Open item, skip the wait',
        'Mở khi hoàn thành 1 scene': 'Unlocked on completing a scene', 'Mở chest → Generator hoặc Item drop': 'Open chest → Generator or Item drop',
        'NGUYÊN LIỆU': 'INGREDIENTS', 'NGUYÊN LIỆU 1': 'INGREDIENT 1', 'NGUYÊN LIỆU 2': 'INGREDIENT 2', 'NGUYÊN LIỆU 3': 'INGREDIENT 3',
        'NGUỒN': 'SOURCE', 'NHÓM': 'GROUP', 'Nguyên liệu / item': 'Ingredients / items',
        'Nguồn:': 'Source:', 'Người chơi nhận': 'Player receives',
        'Nhiên liệu cho mọi hành động. Cạn → game khựng → áp lực nạp.': 'Fuel for all actions. Depletes → game stalls → pressure to refill.',
        'Nhân đôi thưởng đăng nhập': 'Double login reward', 'Nhóm': 'Group', 'Nhóm:': 'Group:',
        'NỘI DUNG (preview)': 'CONTENT (preview)', 'NỘI DUNG CHI TIẾT': 'DETAILED CONTENT',
        'Offer gói energy': 'Energy package offer', 'Offer trong game, tốn energy kích hoạt': 'In-game offer, costs energy to activate',
        'Phạm vi:': 'Scope:', 'Popup thưởng video': 'Video reward popup', 'Premium (gems + item độc quyền)': 'Premium (gems + exclusive items)',
        'Refresh gói daily': 'Refresh daily packages', 'Reward theo mùa, nhiều tier': 'Seasonal rewards, multiple tiers',
        'Roadmap hội tụ về độ sâu IAP của Flambé': "Roadmap converging toward Flambé's IAP depth",
        'Rương tiếp tế giá trị cao': 'High-value supply chest', 'Rất cao': 'Very high', 'Thấp': 'Low',
        'Skip cooldown, gen ra item kế': 'Skip cooldown, generator produces next item', 'Skip timer nấu': 'Skip cooking timer',
        'Slot giới hạn → board tắc → ép merge → cần energy.': 'Limited slots → board congestion → forced merges → needs energy.',
        'Sơ đồ dòng tiền Sources → Currency Pools → Sinks. Xem theo toàn game, từng scene hoặc từng batch.': 'Money-flow diagram Sources → Currency Pools → Sinks. View whole game, per scene or per batch.',
        'SỐ ITEMS': '# ITEMS', 'THỜI GIAN': 'TIME', 'TRẠNG THÁI': 'STATUS',
        'Tasty có thể bật theo segment nếu CPI cho phép': 'Tasty may enable by segment if CPI allows',
        'Tasty giữ doanh thu từ non-payer qua rewarded': 'Tasty retains revenue from non-payers via rewarded ads',
        'Tasty thân thiện hơn với non-payer': 'Tasty is more non-payer friendly',
        'Tasty tạo doanh thu sớm, ít phụ thuộc retention dài': 'Tasty generates revenue earlier, less dependent on long retention',
        'Theo loại gói': 'Per package type', 'Thiếu 1 phần': 'Partially missing',
        'Thưởng khi hoàn tất Build-Up của scene (BuildUpGoalReward) — Energy, Star và vật phẩm.': "Reward for completing a scene's Build-Up (BuildUpGoalReward) — Energy, Star and items.",
        'Thưởng khi clear batch (OrderSystemReward) — hầu hết là vật phẩm (generator, tool, booster).': 'Reward for clearing a batch (OrderSystemReward) — mostly items (generator, tool, booster).',
        'Thưởng xem quảng cáo (VideoBonuses.csv) — Energy, Diamond, Skip Time. Chỉ tính ở phạm vi toàn game.': 'Rewarded-video bonuses (VideoBonuses.csv) — Energy, Diamond, Skip Time. Whole-game scope only.',
        'Thưởng đăng nhập hằng ngày (DailyReward.csv) — tổng của 1 chu kỳ 7 ngày: Diamond, Energy, Skip Time, Gold và item. Chỉ tính ở phạm vi toàn game.': 'Daily login rewards (DailyReward.csv) — total of one 7-day cycle: Diamond, Energy, Skip Time, Gold and items. Whole-game scope only.',
        'Thống kê máy chế biến nào đang bị "vắt kiệt" qua từng Batch.': 'Which tools get "maxed out" across each Batch.',
        'Tool Cần Dùng': 'Tool Needed',
        'Toàn bộ data game: Items, Energy, Orders và IAP Packages — dùng làm nguồn cho các tính năng phân tích.': 'All game data: Items, Energy, Orders and IAP Packages — the source for every analysis feature.',
        'Toàn game': 'Whole game', 'Traceback từ Order → Recipe → Nguyên liệu cần drop per Batch': 'Traceback from Order → Recipe → raw ingredients needed per Batch',
        'Trạng thái': 'Status', 'Trạng thái:': 'Status:', 'Trục doanh thu': 'Revenue axis',
        'TÊN GENERATOR': 'GENERATOR NAME', 'TÊN ITEM': 'ITEM NAME', 'TÊN MÓN': 'DISH NAME', 'TÊN TOOL': 'TOOL NAME',
        'Tìm kiếm': 'Search', 'Tích thưởng qua nhiều ngày': 'Accumulates rewards over multiple days',
        'Tích điểm trong game, mở bằng 1 lần mua': 'Accumulates in-game points, opened with one purchase',
        'Tính được đầy đủ': 'Fully computed', 'Tính được:': 'Computed:',
        'Tại mỗi thời điểm, một trong ba yếu tố bị đẩy lệch (energy cạn / board tắc / cooldown dồn) → tạo demand cho yếu tố kế → chuỗi demand liên tục.': 'At any moment one of the three factors is pushed out of balance (energy depleted / board congested / cooldowns piled up) → creating demand for the next → a continuous demand chain.',
        'Tất cả': 'All', 'Tất cả là rewarded video — người chơi tự chọn xem để nhận thưởng. Không ép ads.': 'All are rewarded video — players choose to watch for rewards. No forced ads.',
        'Tần suất': 'Frequency',
        'Tổng Food Items': 'Total Recipe Items', 'Tổng Lượt Craft': 'Total Crafts', 'Tổng Lượt Drop': 'Total Drops',
        'Tổng Orders': 'Total Orders', 'Tổng Packs': 'Total Packs', 'Tổng:': 'Total:',
        'Vai trò': 'Role', 'Visualize orders theo scene, energy cost và độ khó.': 'Visualize orders by scene, energy cost and difficulty.',
        'Vé tuần tier Gold': 'Weekly pass, Gold tier', 'Vé tuần tier Silver': 'Weekly pass, Silver tier',
        'Wave lớn nhất': 'Biggest wave',
        'của tất cả nguyên liệu (dùng nguồn rẻ nhất của mỗi ingredient). Items không có generator sẽ ghi': 'of all ingredients (using the cheapest source per ingredient). Items with no generator show',
        'hoặc': 'or', 'từ game data (iap*)': 'from game data (iap*)',
        'Đánh giá': 'Assessment', 'Đã có Recipe': 'Has Recipe', 'Bán gì:': 'Sells:',
        'Được phân tích ngược (Traceback) từ Order → Recipe → Nguyên liệu cần drop.': 'Reverse-analyzed (Traceback) from Order → Recipe → raw ingredients needed.',
        'Dùng Diamond/SkipTime để skip thời gian nấu': 'Use Diamond/SkipTime to skip cooking time',
        'Tap generator, ItemExpand tốn Energy': 'Tapping generators/ItemExpand costs Energy',
        'Tốn Star để xây từng step scene': 'Costs Star to build each scene step', 'Tốn time + item raw → Recipe': 'Costs time + raw items → Recipe',
        'Xem ads → Currency hoặc Item': 'Watch ads → Currency or Item',
        'Data đã được cập nhật ✓': 'Data updated ✓', 'Đang tải...': 'Loading...', 'Đang xử lý...': 'Processing...',
        'Không có file CSV nào được tìm thấy.': 'No CSV files found.', 'JSZip not loaded. Kiểm tra lại CDN script.': 'JSZip not loaded. Check the CDN script.',
        'Vật phẩm (generator/tool) nhận được khi xây từng step trong Build-Up.': 'Items (generator/tool) received while building each Build-Up step.',
        'Vật phẩm thưởng (không phải currency): generator, tool, booster… đổ thẳng vào board. Gộp từ Batch Reward, Build Reward và Build Drops.': 'Item rewards (not currency): generator, tool, booster… go straight to the board. Aggregated from Batch Reward, Build Reward and Build Drops.',
        'Điểm sao thưởng khi hoàn tất Build-Up của scene.': "Star points rewarded for completing a scene's Build-Up.",
        'Token tua nhanh thời gian nấu/cooldown. Nhận từ Video/Daily và các gói IAP.': 'Fast-forward tokens for cooking/cooldown. From Video/Daily and IAP packages.',
        'Tiền mềm chính. Vào từ order + reward, chảy ra để trả chi phí Build-Up.': 'Main soft currency. In from orders + rewards, out to pay Build-Up costs.',
        'Tiền cứng — mua bằng tiền thật hoặc thưởng ads. Dùng để tua nhanh, mua energy.': 'Hard currency — bought with real money or ad rewards. Used to fast-forward and buy energy.',
        'Cổng session. Vào từ reward; ra để sản xuất ra các item mà order yêu cầu.': 'Session gate. In from rewards; out to produce the items orders demand.',
        'Gold trả NGAY mỗi khi hoàn thành 1 order lẻ (faucet gold chính). Nguồn: Core/Order/OrderDetail.csv — cột res_number của dòng đầu mỗi order (res_type=Money, res_id=1=Gold). Số hiển thị = cộng dồn gold của mọi order trong phạm vi đang xem.': 'Gold paid IMMEDIATELY on completing each individual order (the main gold faucet). Source: Core/Order/OrderDetail.csv — the res_number of each order\'s first row (res_type=Money, res_id=1=Gold). The number shown = sum of gold across every order in the current scope.',
        'Gold chi để xây từng step trong Build-Up của scene (BuildUpGoalData.cost). Đây là sink Gold lớn nhất.': "Gold spent building each step of a scene's Build-Up (BuildUpGoalData.cost). The biggest Gold sink.",
        'Currency bán qua các gói IAP (tổng nếu mua mỗi gói 1 lần). Bơm bằng tiền thật.': 'Currency sold via IAP packages (total if each pack bought once). Real-money inflow.',
        'Vật phẩm tặng kèm khi hoàn thành order (custom_value trong OrderDetail.csv).': 'Bonus item granted on completing an order (custom_value in OrderDetail.csv).',
        'Thưởng mốc số order đã hoàn thành (OrderGold.csv) — mỗi N order xong nhận 1 box/item.': 'Milestone reward for total orders completed (OrderGold.csv) — a box/item every N orders.',
        'Thưởng THÊM theo từng step Build-Up (BuildUpGoalRewardBonus.csv) — chủ yếu Star và Energy.': 'EXTRA reward per Build-Up step (BuildUpGoalRewardBonus.csv) — mostly Star and Energy.',
        'Mua energy bằng xem ads (BuyCurrency.csv): 25 energy/lần, tối đa 5 lần/ngày → 125/ngày. Đây là RATE theo ngày.': 'Energy refill via rewarded ads (BuyCurrency.csv): 25 energy each, max 5/day → 125/day. This is a per-day RATE.',
        'Energy nhận được khi mua bằng Diamond (BuyCurrency.csv) — tính 1 lượt hết thang giá 10→160 Diamond, mỗi bậc +100 energy. Diamond tiêu tương ứng nằm ở sink cùng tên.': 'Energy gained buying with Diamond (BuyCurrency.csv) — one full pass of the 10→160 Diamond price ladder, +100 energy per tier. The Diamond spent shows as the sink of the same name.',
        'Diamond tiêu khi mua energy (BuyCurrency.csv) — 1 lượt hết thang giá 10+20+40+80+160 = 310 Diamond đổi 500 energy.': 'Diamond spent buying energy (BuyCurrency.csv) — one full price-ladder pass 10+20+40+80+160 = 310 Diamond for 500 energy.',
        'Tài nguyên tặng lúc bắt đầu (tutorial / default): generator & tool đặt sẵn trên board (BoardDefault) + gold khởi đầu.': 'Starting resources (tutorial / default): generators & tools pre-placed on the board (BoardDefault) + starting gold.',
        'Energy tự hồi miễn phí: 1 mỗi 2 phút → ~720/ngày (max 100). Đây là RATE theo ngày, khác với các con số tổng — cho thấy energy free chỉ nhỏ giọt so với nhu cầu.': 'Free energy regen: 1 every 2 min → ~720/day (max 100). This is a per-day RATE, unlike the totals — showing free energy is a trickle vs demand.',
        'Net balance mỗi currency (vào − ra)': 'Net balance per currency (in − out)',
        'Nguồn Lực': 'Resources', 'Lộ Trình': 'Roadmap',
        'Vào': 'In', 'Ra': 'Out', 'Công thức:': 'Formula:',
        '/ 100) — tính từ level generator đã chọn. Chain expand: energy(lv1) = energy(parent) + 1 ⚡, sau đó nhân theo sum_merge tương đối.':
            '/ 100) — from the selected generator level. Chain expand: energy(lv1) = energy(parent) + 1 ⚡, then scaled by relative sum_merge.',
        'Energy tiêu để sản xuất ra các item mà order yêu cầu (energy cost × số lượng, truy ngược qua recipe/generator). Sink Energy lớn nhất — chính là "độ khó" của order.':
            'Energy spent to produce the items each order demands (energy cost × quantity, traced back through recipe/generator). The biggest Energy sink — the order\'s "difficulty".',
        '⚖️ So sánh với Flambé (reference)': '⚖️ Comparison with Flambé (reference)',
        '⚙️ Cấp độ Generator': '⚙️ Generator Level', '⚡ Ma trận Generator (100xxx) × Batch': '⚡ Generator Matrix (100xxx) × Batch',
        '⚡ Nguồn Lực — Generator & Tool Analysis': '⚡ Resources — Generator & Tool Analysis', '⚡ TỔNG ENERGY': '⚡ TOTAL ENERGY',
        '✅ Áp dụng & Reload Data': '✅ Apply & Reload Data', '✓ Đã có recipe': '✓ Has recipe', '✗ Chưa có recipe': '✗ No recipe',
        '👣 Onboarding Sequence — thứ tự lộ diện phiên đầu': '👣 Onboarding Sequence — first-session reveal order',
        '🔔 Ưu tiên hiển thị Popup': '🔔 Popup Display Priority',
        'Khi nhiều popup cùng được trigger, priority quyết định cái nào hiện trước. Cluster = nhóm popup liên quan/đè nhau. Đây không phải timeline onboarding.':
            'When several popups trigger at once, priority decides which shows first. Cluster = related/overlapping popups. This is NOT an onboarding timeline.',
        'Popup ưu tiên': 'Priority popups',
        '📊 Vào / Ra mỗi currency': '📊 In / Out per currency',
        '📹 Ad Placements — 11 điểm rewarded video': '📹 Ad Placements — 11 rewarded-video spots',
        '🔍 Tên Generator hoặc Tool...': '🔍 Generator or Tool name...', '🔍 Tên hoặc ID...': '🔍 Name or ID...',
        '🔍 Tên item hoặc Order ID...': '🔍 Item name or Order ID...', '🔍 Tên item hoặc Type...': '🔍 Item name or Type...',
        '🔧 Ma trận Tool (200xxx) × Batch': '🔧 Tool Matrix (200xxx) × Batch',
        '🗺️ Lộ Trình — Content Release & Onboarding': '🗺️ Roadmap — Content Release & Onboarding',
    };

    // ── PATTERNS: câu có chèn số/tên động ────────────────────────────────────────
    const PATTERNS = [
        [/^Cấp (\d+)$/, (_, n) => `Level ${n}`],
        [/^Cụm (.+)$/, (_, c) => `Cluster ${c}`],
        [/^(.+?) — mở ở (Account|Board) Lv(\d+)(.*)$/, (_, a, b, c, d) => `${a} — unlocks at ${b} Lv${c}${d.replace(' · có popup', ' · has popup')}`],
        [/^Bước (\d+): (.+)$/, (_, n, rest) => `Step ${n}: ${rest.replace(' · cụm ', ' · cluster ')}`],
        [/^(\d[\d.,]*) orders$/, (_, n) => `${n} orders`],
    ];

    let lang = localStorage.getItem('mc_lang') || 'vi';
    let observer = null;

    function t(key) {
        const d = DICT[lang] || {};
        return d[key] != null ? d[key] : (DICT.vi[key] != null ? DICT.vi[key] : key);
    }

    function translatePhrase(raw) {
        const s = raw.replace(/\s+/g, ' ').trim();
        if (!s) return null;
        if (PHRASES[s]) return PHRASES[s];
        for (const [re, fn] of PATTERNS) {
            const m = s.match(re);
            if (m) return typeof fn === 'function' ? fn(...m) : fn;
        }
        return null;
    }

    // node đáng dịch: có ký tự tiếng Việt HOẶC trùng key ASCII trong PHRASES (vd "Ra")
    function translatable(v) {
        return /[À-ỹ]/.test(v) || PHRASES[v.replace(/\s+/g, ' ').trim()] != null;
    }

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CANVAS', 'NOSCRIPT', 'SVG']);
    function skip(el) {
        while (el) {
            if (el.nodeType === 1) {
                if (SKIP_TAGS.has(el.tagName)) return true;
                if (el.hasAttribute && (el.hasAttribute('data-i18n') || el.hasAttribute('data-i18n-ph') || el.classList.contains('no-i18n'))) return true;
            }
            el = el.parentNode;
        }
        return false;
    }

    function translateTree(root) {
        if (lang !== 'en' || !root) return;
        // text nodes
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: n => (n.nodeValue && !skip(n.parentNode) && translatable(n.nodeValue))
                ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
        });
        const nodes = [];
        let n; while (n = w.nextNode()) nodes.push(n);
        nodes.forEach(node => {
            const en = translatePhrase(node.nodeValue);
            if (en != null) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), en);
        });
        // placeholder / title attrs
        const scope = root.nodeType === 1 ? root : document.body;
        scope.querySelectorAll && scope.querySelectorAll('[placeholder],[title]').forEach(el => {
            if (skip(el)) return;
            ['placeholder', 'title'].forEach(a => {
                const v = el.getAttribute(a);
                if (v && /[À-ỹ]/.test(v)) { const en = translatePhrase(v); if (en != null) el.setAttribute(a, en); }
            });
        });
    }

    function apply(root) {
        const r = root || document;
        r.querySelectorAll && r.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
        r.querySelectorAll && r.querySelectorAll('[data-i18n-ph]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
        document.documentElement.lang = lang;
    }

    function startObserver() {
        if (observer) return;
        observer = new MutationObserver(muts => {
            for (const m of muts) {
                m.addedNodes.forEach(nd => {
                    if (nd.nodeType === 1) translateTree(nd);
                    else if (nd.nodeType === 3 && nd.nodeValue && !skip(nd.parentNode) && translatable(nd.nodeValue)) {
                        const en = translatePhrase(nd.nodeValue);
                        if (en != null) nd.nodeValue = nd.nodeValue.replace(nd.nodeValue.trim(), en);
                    }
                });
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function syncToggle() {
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-lang') === lang));
    }

    function set(l) {
        if (l === lang || !DICT[l]) return;
        localStorage.setItem('mc_lang', l);
        if (l === 'en') { lang = 'en'; apply(); translateTree(document.body); startObserver(); syncToggle(); }
        else { location.reload(); }  // nguồn gốc là VI → reload để khôi phục
    }

    function init() {
        document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => set(b.getAttribute('data-lang'))));
        apply();
        syncToggle();
        if (lang === 'en') { translateTree(document.body); startObserver(); }
    }

    return { t, apply, set, init, get lang() { return lang; } };

})();

if (document.readyState !== 'loading') I18N.init();
else document.addEventListener('DOMContentLoaded', () => I18N.init());
