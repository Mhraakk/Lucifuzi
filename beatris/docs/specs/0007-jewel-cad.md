# 0007 — استودیوی طراحی طلا در حد ابزارهای جواهرسازی RhinoArtisan (فاز ۱)

**وضعیت:** فاز ۱ پیاده‌شده.

## What
RhinoArtisan افزونه جواهرسازی Rhino است (~۶۰۰ فرمان در مستندات نسخه ۶: Shanks، Diamonds، Accessories، Transform، Analyze، Drafting، Manufacturing، 3D Printing، Rendering، به‌علاوه فرمان‌های عمومی Curve/Surface/Solid/Mesh/SubD خود Rhino). فاز ۱ تمام خانواده‌های **مخصوص طلا و جواهر** را در استودیوی سه‌بعدی (three.js، مرورگر) می‌سازد؛ مدل‌سازی آزاد NURBS/SubD (Sweep2، Network، Fillet، SubD) فاز بعد است.

| خانواده RhinoArtisan | در بئاتریس |
|---|---|
| Shanks: Classic، Cathedral، Signet، Eternity، Wedding، Advanced Ring، Cut By Ring Size | رکاب ساده، کلیسایی، مهری، اترنیتی، حلقه، رکاب پیشرفته (پهنا/ضخامت جدا در پایین، کنار، بالا)، سایز ISO/آمریکا |
| Diamonds: Gem Studio، Baguette، Pearl، Cabochon، Gemsets، Pave، Custom Prongs، Collision | ۸ تراش + باگت، کابوشن، مروارید؛ نشاندن ۳/۴/۶/۸ پنجه، سبدی، لاله، تریلیس (ضربدری)، مارتینی، قاب دور، میخ مروارید؛ پاوه رکابی (ردیف، لانه‌زنبوری) و پاوه روی سطح (گرد، بیضی، قلب، اشک، مربع)؛ وارسی برخورد سنگ‌ها |
| Trilogy | سه‌نگین با نسبت سنگ کناری |
| Accessories: Bail، Bead، Milgrain، Rope، Chain، Bangle | آویزگیر، مهره سوراخ‌دار، میل‌گرین لبه، طناب تابیده، زنجیر، النگو |
| Transform: Pair، Array Polar، Array، Copy | جفت (قرینه گوشواره)، آرایه دایره‌ای، آرایه خطی، تکثیر |
| Analyze: Weight، Thickness، Global Thickness | وزن هر آلیاژ (بود)، ضخامت دیواره با پرتو و نشان دادن نقاط نازک |
| Drafting: Metals List، Gems List، Gem List to CSV، Report | گزارش فلز و سنگ، خروجی CSV، برگه چاپی |
| Manufacturing / 3D Printing: Sprue، Ring Resizer، STL | راهگاه (تنه و دکمه)، تغییر سایز، جبران انقباض در STL، STL/OBJ/PLY/GLB/USDZ (بود) |

## Acceptance
| # | معیار | اثبات |
|---|---|---|
| 1 | هر قطعه × هر نوع نشاندن و هر تراش جسم بسته با حجم مثبت می‌سازد (وزن معتبر) | e2e «jewel cad» (در مرورگر، با three.js واقعی) |
| 2 | هیچ دو سنگی در هیچ قطعه‌ای هم‌پوشانی ندارند؛ پاوه رکابی ≥۲۰ و پاوه سطح ≥۴۰ سنگ | همان |
| 3 | ضخامت: حلقه ۱٫۸mm حداقل ضخامت ≈ ۱٫۸ (±۱۰٪)؛ هر جزء بسته جدا سنجیده می‌شود (پنجه فرورفته در رکاب ≠ دیواره نازک) | همان |
| 4 | سایز: آمریکا ۷ = ISO ۵۴٫۴ (قطر = ۱۱٫۶۳ + ۰٫۸۱۲۸×US)؛ ورودی US سایز را تنظیم می‌کند | همان |
| 5 | در مرورگر: ساخت هر قطعه، ابزارها، گزارش و CSV بدون خطا | e2e «jewel cad» |

## Constraints
بدون وابستگی تازه (three.js محلی موجود)؛ واحد میلی‌متر؛ پارامترها محدود و ایمن (فایل پروژه نامطمئن است)؛ نام و نشان RhinoArtisan فقط برای مقایسه، رابط و نام‌ها مال خود بئاتریس.

## Out of scope (فاز ۲)
فرمان‌های عمومی Rhino: منحنی آزاد، Sweep2/Network/Loft آزاد، Fillet/Chamfer لبه، Boolean واقعی (برش نشیمن سنگ)، SubD و حجاری دیجیتال، Grasshopper، رندر KeyShot، هوش مصنوعی مولد.
