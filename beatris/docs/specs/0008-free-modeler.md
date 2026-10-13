# 0008 — مدل‌ساز آزاد استودیو: فرمان‌های عمومی Rhino (فاز ۲ از 0007)

**وضعیت:** پیاده‌شده.

## What
فاز ۱ (0007) خانواده‌های جواهرسازی RhinoArtisan را ساخت. این فاز فرمان‌های عمومی خود Rhino را در یک «پالت فرمان» در استودیو شبیه‌سازی می‌کند (`public/js/three/modeler.mjs` موتور هندسه، `public/js/pages/studiomodel.mjs` پالت و ترسیم). هر فرمان نام Rhino و نام فارسی دارد و با هر دو جستجو می‌شود. نتیجه هر فرمان یک قطعه عادی استودیو است (وزن، گزارش، STL، تاریخچه، فایل پروژه).

| خانواده Rhino | فرمان‌ها |
|---|---|
| Curve | Polyline و Curve (کلیک روی صفحه XY، گام ۰٫۵، Alt آزاد، C بستن، Enter/دوبار کلیک پایان، Backspace، Esc)، Line، Rectangle (گوشه گرد)، Polygon/ستاره، Circle، Ellipse، Arc، Spiral، Helix، Waves، OffsetCrv، FilletCorners |
| Surface/Solid از منحنی | ExtrudeCrv (بسته = جسم، باز = دیواره)، ExtrudeCrvTapered، ExtrudeCrvToPoint، Revolve، Sweep1 (مقیاس و پیچش)، Sweep2، Loft، Pipe (شعاع متغیر)، PlanarSrf |
| Solid | Box، Sphere، Cylinder، Cone، TruncatedCone، Torus، Ellipsoid، Tube، Pyramid، Capsule، Octahedron، Dodecahedron |
| Boolean | BooleanUnion، BooleanDifference، BooleanIntersection، BooleanSplit، GemSeat (برش نشیمن و سوراخ نور هر سنگ در فلز) |
| Mesh/SubD | Explode (قطعه پارامتری → جسم آزاد)، SubDivide (Loop)، MeshSmooth (Taubin)، ReduceMesh، Shell، FillMeshHoles، Weld، Flip |
| Transform/Deform | Bend، Twist، Taper، Shear، Scale1D، Maelstrom، Flow (روی منحنی)، ArrayCrv |
| Analyze | Check (حجم، سطح، لبه باز/نامنیفلد)، Length، Distance، BoundingBox |

## Acceptance
| # | معیار | اثبات |
|---|---|---|
| 1 | هر حجم پایه، Revolve، Sweep1/2، Loft، Boolean، Shell و Deform جسم بسته و منیفلد است | e2e «free modeller» |
| 2 | حجم‌ها دقیق: Revolve = π(5²−3²)·2، چنبره سوییپ = 2π²·10·1، مکعب − استوانه = ۲۴۰ − π·۴·۶؛ تفاضل + اشتراک = مکعب؛ اجتماع = مجموع − اشتراک | همان |
| 3 | جسم ذخیره‌شده پس از بارگذاری دوباره بسته و با همان حجم است (float32، بی‌کوانتش) | همان |
| 4 | نشیمن سنگ روی تک‌نگین زیر ۲۰ ثانیه فلز برمی‌دارد | همان |
| 5 | در مرورگر: ترسیم با کلیک، دایره → اکسترود، مکعب − استوانه، Check «بسته»، GemSeat، ماندن پس از reload | همان |

## Constraints
بدون وابستگی تازه؛ میلی‌متر؛ بولین BSP (روش csg.js) تکراری نه بازگشتی، فقط چندضلعی‌های نزدیک به جسم دیگر (جعبه محیطی) وارد BSP می‌شوند، صفحه برش با کمترین برش انتخاب می‌شود، درزهای T با پنکه‌کردن تمام رأس‌های روی لبه بسته می‌شوند؛ سقف ۶۰۰۰۰ مثلث برای بولین؛ داده هندسه از فایل/ذخیره نامطمئن است (اعتبارسنجی اندیس و عدد، سقف ۸ میلیون نویسه)؛ سقف ۲۴ قطعه صحنه.

## Out of scope
سطوح NURBS واقعی و ویرایش نقاط کنترل، Fillet/Chamfer لبه جسم، ویرایش قفس SubD، حجاری دیجیتال، Grasshopper، رندر هم‌تراز KeyShot، هوش مصنوعی مولد.
