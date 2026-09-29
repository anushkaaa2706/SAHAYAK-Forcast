# Google Places setup for SAHAYAK

This Infrastructure page no longer uses OpenStreetMap/Overpass. It uses Google Places API (New) through `/api/google-places.js`.

1. Create a Google Maps Platform project.
2. Enable **Places API (New)**.
3. Create an API key and restrict it to the Places API where possible.
4. For local `npx vercel dev`, add `GOOGLE_MAPS_API_KEY=...` to your local Vercel environment or `.env.local`.
5. For deployment, add `GOOGLE_MAPS_API_KEY` to Vercel Project Settings → Environment Variables.

The page intentionally does not invent road counts or population totals because Google Places is a POI service, not a complete road-network or census database. Use the Route Risk page for road routing and the validated population/infrastructure sources you connect later.
