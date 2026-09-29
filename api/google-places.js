// SAHAYAK — Google Places API (New) proxy
// Requires GOOGLE_MAPS_API_KEY in the Vercel/local environment.

const ENDPOINT = 'https://places.googleapis.com/v1/places';
const NEARBY = `${ENDPOINT}:searchNearby`;
const TEXT = `${ENDPOINT}:searchText`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.json({ error: 'Method not allowed' });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: 'Google Places API key is not configured',
      hint: 'Set GOOGLE_MAPS_API_KEY in Vercel/project environment variables.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const mode = body.mode === 'text' ? 'text' : 'nearby';
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const radius = Math.min(50000, Math.max(100, Number(body.radius) || 5000));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    const fieldMask = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.types',
      'places.rating',
      'places.userRatingCount'
    ].join(',');

    let endpoint;
    let payload;

    if (mode === 'nearby') {
      const type = String(body.type || '').trim();
      if (!type) return res.status(400).json({ error: 'Missing place type' });
      payload = {
        includedTypes: [type],
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius }
        }
      };
      endpoint = NEARBY;
    } else {
      const textQuery = String(body.textQuery || '').trim();
      if (!textQuery) return res.status(400).json({ error: 'Missing text query' });
      payload = {
        textQuery,
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius }
        }
      };
      endpoint = TEXT;
    }

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask
      },
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Google Places request failed',
        providerStatus: upstream.status,
        detail: data?.error?.message || 'Unknown Google Places error'
      });
    }

    return res.status(200).json({
      places: Array.isArray(data.places) ? data.places : [],
      source: 'Google Places API (New)',
      retrievedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Google Places proxy error:', error);
    return res.status(500).json({ error: 'Google Places proxy failed', detail: error.message });
  }
};
