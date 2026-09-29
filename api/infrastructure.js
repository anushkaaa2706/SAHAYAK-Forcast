// Server-side proxy for OpenStreetMap Overpass.
// Keeps the browser from depending on Overpass CORS headers and lets us
// retry another public Overpass instance when the primary is unavailable.

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const query = String(body.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Missing Overpass query' });

    let lastError = null;
    for (const endpoint of ENDPOINTS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        const upstream = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'SAHAYAK-SIH-Prototype/1.0'
          },
          body: new URLSearchParams({ data: query }),
          signal: controller.signal
        });
        clearTimeout(timer);

        if (!upstream.ok) {
          lastError = new Error(`${endpoint} returned HTTP ${upstream.status}`);
          continue;
        }

        const text = await upstream.text();
        let data;
        try { data = JSON.parse(text); }
        catch { lastError = new Error('Invalid JSON from Overpass'); continue; }

        if (!Array.isArray(data.elements)) {
          lastError = new Error('Overpass response contained no elements array');
          continue;
        }

        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ ...data, source: endpoint, retrievedAt: new Date().toISOString() });
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
      }
    }

    return res.status(503).json({
      error: 'All OpenStreetMap Overpass services are temporarily unavailable',
      detail: lastError?.message || 'Unknown upstream error'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Infrastructure proxy failed', detail: err.message });
  }
};
