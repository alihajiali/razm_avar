# لوگوی رزم‌آور

فایل اصلی: `logo.png`؛ تصویر مربعی ۱۲۵۴ × ۱۲۵۴ با زمینهٔ مات و نشان طلایی کلاه‌خود و سپر.

این تصویر با ابزار داخلی `image_gen` ساخته شده است. منبع با همان کیفیت اصلی در پروژه کپی شده؛ ابزار تولید برای اجرای بازی یا بیلد لازم نیست.

## کاربرد در بیلد

در `package.json`، مسیر `mac.icon`، `win.icon` و `linux.icon` همگی `assets/branding/logo.png` است. electron-builder از همین منبع، ICNS برای macOS، ICO برای Windows و مجموعهٔ PNG برای Linux تولید می‌کند. بیلدهای GitHub Actions همین تنظیمات را می‌خوانند.

در Windows، `signExecutable: false` فقط امضای کد را غیرفعال می‌کند؛ ویرایش منابع EXE و افزودن آیکون فعال می‌ماند. تصویر همچنین آیکون پنجره و favicon صفحهٔ بازی است.

## پرامپت ساخت

Use case: logo-brand. Asset type: square desktop game app icon, for the Iranian tactical FPS «رزم‌آور» (Razm Avar). Create one polished, original emblem: a bold, front-facing stylized Persian warrior helmet within a compact shield silhouette, conveying courage and tactical precision. Match the game's dark charcoal/deep teal and warm bronze-gold palette. Clean geometric forms, restrained metallic bevels, strong contrast, a distinctive silhouette readable at 32 pixels. Centered composition on an opaque dark teal square background; generous 12 percent edge safety margin, no baked-in rounded outer corners. A very subtle targeting ring can sit behind the emblem. The icon fills the image elegantly. Deliver a single square high-resolution icon, ideally 1024 by 1024. No letters, no text, no slogans, no watermark, no mockup, no additional panels, no existing brand or franchise insignia.
