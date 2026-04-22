/**
 * diary-rinat — Service Worker
 * -----------------------------
 * Strategy: Network-first with cache fallback
 * - תמיד מנסה להביא גרסה טרייה מהרשת
 * - אם הרשת זמינה — מגיש ומעדכן cache
 * - אם לא — מגיש מה-cache (offline support)
 *
 * Versioning: כשמשנים את CACHE_VERSION, כל ה-cache הישן נמחק אוטומטית
 */

const CACHE_VERSION = 'diary-rinat-v21';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

// התקנה: פותח cache חדש
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // precache רק את ה-root (הדף הראשי)
      try {
        await cache.add(new Request('./', { cache: 'reload' }));
      } catch (e) {
        // אם אין רשת בזמן התקנה — לא נורא, ניטען ברגע שתחזור
      }
      // מפעיל מיד בלי לחכות לטאבים הישנים
      self.skipWaiting();
    })()
  );
});

// הפעלה: מוחק cacheים ישנים מגרסאות קודמות
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      // לוקח שליטה על טאבים פתוחים מיד
      await self.clients.claim();
    })()
  );
});

// fetch: network-first לכל הבקשות של אותו origin
self.addEventListener('fetch', (event) => {
  const { request } = event;
  // רק GET
  if (request.method !== 'GET') return;
  // רק same-origin (לא חוסם קריאות ל-Firebase וכו')
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        // מנסה רשת קודם
        const fresh = await fetch(request, { cache: 'no-cache' });
        // אם הצליח — שומר ב-cache ומחזיר
        if (fresh && fresh.status === 200) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (e) {
        // רשת נכשלה — נופל ל-cache
        const cached = await caches.match(request);
        if (cached) return cached;
        // אם זה נוויגציה ואין cache — נסה את הדף הראשי
        if (request.mode === 'navigate') {
          const rootCached = await caches.match('./');
          if (rootCached) return rootCached;
        }
        // אחרת — שגיאה
        return new Response('Network error, no cache', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })()
  );
});

// הודעות: אפשר לשלוח הודעת "SKIP_WAITING" מה-main JS כדי להעביר לגרסה חדשה
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
