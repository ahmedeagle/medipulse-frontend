Website / GTM Changes — integrated into every phase
Rules for all website edits:

File: medipulse-site/index.html (bilingual AR/EN via data-i18n).
Reuse existing section styling, card grid, colors, RTL. No new design language.
Every new claim must map to a real, shipped backend capability (no vaporware — keeps trust + avoids false advertising).
Each addition gets a soft CTA to demo.
Deploy to Cloudflare Pages after each phase.
Phase 0 website changes (ship with launch)
New hero section: "ذكاء السوق والمواسم / Market & Seasonal Intelligence" — your core differentiator, currently missing.

3 cards (match the 9-agent card style):

رادار المواسم / Seasonal Radar
AR: "يتوقّع النظام طفرات الطلب قبل المواسم — الحج، رمضان، العودة للمدارس — ويرفع مخزونك في الوقت المناسب."
EN: "Predicts demand spikes before each season — Hajj, Ramadan, back-to-school — so you stock up at the right time."
رادار نقص السوق / Market Shortage Radar
AR: "يرصد نقص الأدوية على مستوى السوق كله قبل أن ينفد مخزونك — وتعرف أي دواء أصبح نادراً لدى الموردين."
EN: "Detects market-wide medicine shortages before you run out — know which drugs are going scarce across all suppliers."
التنبؤ بنفاد المخزون / Stockout Prediction
AR: "يحسب تاريخ نفاد كل صنف ويذكّرك بموعد إعادة الطلب بدقة."
EN: "Calculates each item's stockout date and reminds you exactly when to reorder."
Plus: update hero sub-line to mention seasonal + market intelligence as a headline differentiator.

Phase 1 website changes (onboarding history +  catalog AI)
Add to onboarding/"كيف تبدأ" + a value card:

"ابدأ بذكاء كامل من اليوم الأول / AI-ready from day one"
AR: "ارفع سجل مبيعاتك لآخر ٦ شهور (إكسل) ويبدأ الذكاء الاصطناعي في التنبؤ فوراً — لا انتظار."
EN: "Upload your last 6 months of sales (Excel) and AI forecasting starts immediately — no waiting."
Catalog matching intelligence:
AR: "مطابقة أصنافك تلقائياً بذكاء — بدون تكرار أو أخطاء."
EN: "Your products auto-matched intelligently — no duplicates, no errors."
Phase 2 website changes (cash/POS anomaly)
Strengthen existing "نزاهة الكاشير / Cashier Integrity" agent copy:

AR: add "كشف الشذوذ بالذكاء الاصطناعي — يرصد الورديات والمعاملات غير المعتادة تلقائياً."
EN: "AI anomaly detection — automatically spots unusual shifts and transactions."
Phase 3 website changes (Prophet — only after activation)
Upgrade the existing "Forecasting" capability + Procurement agent copy:

AR: "تنبؤ موسمي بالذكاء الاصطناعي — يتعلّم نمط مبيعاتك ومواسمك ويوصي بالكمية الأمثل."
EN: "AI seasonal forecasting — learns your sales pattern and seasons to recommend the optimal quantity."
Only published once Prophet is live for real tenants (no premature claim).
Website delivery checklist (your test side)
For each phase:

 New/updated copy present in both AR and EN (data-i18n keys added to both dictionaries).
 Renders correctly RTL (AR) and LTR (EN), mobile + desktop.
 No layout break in the cards grid.
 Claim matches a real shipped backend feature.
 CTA to demo works.
 Deployed to Cloudflare Pages; preview URL verified.
Updated build order (website is now an explicit deliverable in each phase)
Phase	Product/Backend	Frontend (app)	Website (GTM)
0	Seasonality endpoint	Banner + route 2 pages	Market & Seasonal Intelligence section
1	History import + embeddings	Import UI + match badges	"AI-ready day one" + catalog AI copy
2	Isolation Forest	Anomaly badges	Cashier Integrity AI copy
3	Prophet (shadow→live)	(unchanged)	AI seasonal forecasting copy (post-activation)
The website is now a mandatory, tracked output of every phase — nothing ships server-side without its sales story going live too.

This completes the consolidated plan with the website fully included. Ready when you are — just confirm:

Start with Phase 0 (app + website together)?
History import first flavor: ops/script-assisted or self-serve UI?
