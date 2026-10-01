// js/services.js
// ============================================================================
// SAHAYAK — Environmental Intelligence Service Layer
// ============================================================================
// Live sources used by the monitoring console:
//   Open-Meteo       -> rainfall + modelled soil moisture
//   Open-Meteo Geo   -> place-name geocoding
//   Open-Meteo Arch. -> historical precipitation
//   OpenTopoData     -> ASTER 30 m DEM elevation
//   NASA GIBS        -> optional satellite imagery layer
//   ISRO / NRSC      -> published historical landslide inventory summary
//
// Engineering rule: a value is labelled LIVE only when it is obtained from
// an external source during the current request. Derived values are labelled
// DERIVED so the dashboard never presents synthetic values as observations.
// ============================================================================

const Services = {

  // ============================================================
  // CONFIG
  // ============================================================

  API: {
    
    OPEN_METEO: 'https://api.open-meteo.com/v1/forecast',
    OPEN_METEO_GEOCODING: 'https://geocoding-api.open-meteo.com/v1/search',
    OPEN_METEO_ARCHIVE: 'https://archive-api.open-meteo.com/v1/archive',
    // Browser-safe terrain elevation source.
    // Open-Meteo Elevation uses Copernicus DEM GLO-90 (90 m).
    OPEN_METEO_ELEVATION: 'https://api.open-meteo.com/v1/elevation',
    OSRM: 'https://router.project-osrm.org/route/v1/driving'
  },

  ML_API_BASE: 'https://sahayak-ml-api.onrender.com',
  // Published ISRO / NRSC Landslide Atlas inventory counts.
  // These are real inventory records, not synthetic event rows.
  ISRO_LANDSLIDE_INVENTORY: {
    source: 'ISRO / NRSC Landslide Atlas of India',
    coverage: '1998-2022',
    global: {
      total: 80933,
      seasonal: 41593,
      eventBased: 37074,
      fieldBased: 2266
    },
    northeast: [
      { state: 'Arunachal Pradesh', 2014: 2904, 2017: 4709 },
      { state: 'Assam', 2014: 1243, 2017: 793 },
      { state: 'Meghalaya', 2014: 2127, 2017: 512 },
      { state: 'Sikkim', 2014: 73, 2017: 79 },
      { state: 'Nagaland', 2014: 54, 2017: 2071 },
      { state: 'Manipur', 2014: 379, 2017: 4559 },
      { state: 'Mizoram', 2014: 1205, 2017: 2254 },
      { state: 'Tripura', 2014: 56, 2017: 8014 }
    ]
  },

  // ============================================================
  // GENERIC HELPERS
  // ============================================================
  /// Fetch JSON with timeout and error handling
  async _fetchJSON(url, options = {}) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, options.timeout || 10000);

    try {
    

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      });


      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      return data;

    } catch (error) {


      throw error;

    } finally {
      clearTimeout(timeout);
    }
  },

  async _safeFetch(url, fallback = null, options = {}) {
    try {
      return await this._fetchJSON(url, options);
    } catch (error) {
      return fallback;
    }
  },

  _findZone(locationName) {
    if (!locationName || typeof DEMO_DATA === 'undefined') {
      return null;
    }

    const query = String(locationName).trim().toLowerCase();

    return DEMO_DATA.riskZones?.find(z =>
      String(z.location || '').toLowerCase() === query
    ) || DEMO_DATA.riskZones?.find(z =>
      String(z.location || '').toLowerCase().includes(query)
    ) || null;
  },

  _getCoordinates(locationName) {
    const zone = this._findZone(locationName);

    if (zone && Number.isFinite(Number(zone.lat)) && Number.isFinite(Number(zone.lng))) {
      return {
        lat: Number(zone.lat),
        lng: Number(zone.lng)
      };
    }

    return null;
  },

  // Resolve any user-entered place name through Open-Meteo Geocoding.
  // Results are cached in memory so repeated monitoring requests do not
  // repeatedly hit the geocoding endpoint.
  _geocodeCache: new Map(),

  async _resolveCoordinates(locationName) {
    const local = this._getCoordinates(locationName);
    if (local) return { ...local, source: 'local-zone' };

    const query = String(locationName || '').trim();
    if (!query) return null;

    const cacheKey = query.toLowerCase();
    if (this._geocodeCache.has(cacheKey)) {
      return this._geocodeCache.get(cacheKey);
    }

    const url =
      `${this.API.OPEN_METEO_GEOCODING}` +
      `?name=${encodeURIComponent(query)}` +
      `&count=1` +
      `&language=en` +
      `&format=json` +
      `&countryCode=IN`;

    const data = await this._safeFetch(url, null);
    const place = data?.results?.[0];

    if (!place || !Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) {
      return null;
    }

    const result = {
      lat: Number(place.latitude),
      lng: Number(place.longitude),
      name: place.name,
      state: place.admin1 || '',
      country: place.country || 'India',
      elevation: place.elevation ?? null,
      source: 'open-meteo-geocoding'
    };

    this._geocodeCache.set(cacheKey, result);
    return result;
  },

  _formatTime(date = new Date()) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  _levelFromRisk(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 30) return 'WATCH';
    return 'SAFE';
  },

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },


  // ============================================================
  // RISK DATA
  // ============================================================

  async getRiskData(locationId = 'tawang') {
    await this._delay(100);

    const zone = this._findZone(locationId);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    return {
      ...zone,
      timestamp: new Date().toISOString(),
      isDemo: true
    };
  },

_mapLevelFromRisk(score) {
  if (score >= 81) return 'WARNING';
  if (score >= 61) return 'ALERT';
  if (score >= 31) return 'WATCH';
  return 'SAFE';
},
 
_prettyFeature(name) {
  const labels = {
    elevation: 'Elevation',
    slope: 'Slope steepness',
    aspect: 'Slope orientation',
    rain_1d: 'Rainfall (last 24h)',
    rain_3d: 'Rainfall (last 3 days)',
    rain_7d: 'Rainfall (last 7 days)',
    rain_7d_anomaly: 'Rainfall vs seasonal norm'
  };
  return labels[name] || name;
},
 
// One zone -> one call to the deployed model. Cached for 10 minutes
// per browser tab so reloading the map does not hit the API again.
async _fetchZoneSevereWeatherScore(zone) {

    const cacheKey = `sahayak_severe_weather_${zone.id}`;
    const TTL = 10 * 60 * 1000;

    try {
        const cached = JSON.parse(
            sessionStorage.getItem(cacheKey) || 'null'
        );

        if (cached && Date.now() - cached.at < TTL) {
            return cached.data;
        }
    } catch (e) {
        // Storage unavailable, ignore
    }

    const url =
        `${this.API.OPEN_METEO}` +
        `?latitude=${encodeURIComponent(zone.lat)}` +
        `&longitude=${encodeURIComponent(zone.lng)}` +
        `&hourly=precipitation,rain,soil_moisture_0_to_7cm,` +
        `relative_humidity_2m,cloud_cover,precipitation_probability,` +
        `wind_speed_10m,wind_gusts_10m,weather_code,temperature_2m` +
        `&forecast_days=2` +
        `&timezone=auto`;

    const data = await this._safeFetch(url, null);

    if (!data?.hourly?.time?.length) {
        return null;
    }

    const hourly = data.hourly;
    const times = hourly.time || [];

    const precipitation = hourly.precipitation || [];
    const soilMoisture = hourly.soil_moisture_0_to_7cm || [];
    const humidity = hourly.relative_humidity_2m || [];
    const cloudCover = hourly.cloud_cover || [];
    const precipitationProbability =
        hourly.precipitation_probability || [];
    const windSpeed = hourly.wind_speed_10m || [];
    const windGusts = hourly.wind_gusts_10m || [];
    const weatherCode = hourly.weather_code || [];
    const temperature = hourly.temperature_2m || [];

    const now = new Date();

    let currentIndex = times.findIndex(time =>
        new Date(time) >= now
    );

    if (currentIndex === -1) {
        currentIndex = 0;
    }

    /*
     * Use the next 6 hours.
     * This keeps Dashboard/Risk Map consistent
     * with the Risk Analysis page.
     */
    const forecast = times
        .slice(currentIndex, currentIndex + 6)
        .map((time, index) => {

            const i = currentIndex + index;

            const rain = Number(precipitation[i] || 0);
            const prob = Number(
                precipitationProbability[i] || 0
            );
            const hum = Number(humidity[i] || 0);
            const cloud = Number(cloudCover[i] || 0);
            const wind = Number(windSpeed[i] || 0);
            const gust = Number(windGusts[i] || 0);
            const code = Number(weatherCode[i] ?? -1);

            let score = 0;

            // Rainfall intensity
            score += Math.min(30, rain * 3);

            // Probability of precipitation
            score += prob * 0.20;

            // High humidity
            score += Math.min(
                10,
                Math.max(0, hum - 70) * 0.33
            );

            // Cloud cover
            score += cloud * 0.10;

            // Wind speed
            score += Math.min(10, wind * 0.25);

            // Wind gusts
            score += Math.min(10, gust * 0.15);

            // WMO thunderstorm codes
            if ([95, 96, 99].includes(code)) {
                score += 10;
            }

            score = Math.round(
                Math.max(0, Math.min(100, score))
            );

            return {
                timestamp: time,
                hour: new Date(time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                rainfall: rain,
                soilMoisture: Number(
                    soilMoisture[i] || 0
                ),
                humidity: hum,
                cloudCover: cloud,
                precipitationProbability: prob,
                windSpeed: wind,
                windGusts: gust,
                weatherCode: code,
                temperature: Number(
                    temperature[i] || 0
                ),
                risk: score
            };
        });

    if (!forecast.length) {
        return null;
    }

    /*
     * The map score represents the highest severe-weather
     * risk expected during the next 6 hours.
     */
    const maxRisk = Math.max(
        ...forecast.map(f => f.risk)
    );

    const peak = forecast.reduce(
        (highest, current) =>
            current.risk > highest.risk
                ? current
                : highest,
        forecast[0]
    );

    const result = {
        risk_score: maxRisk,

        rainfall: peak.rainfall,
        soilMoisture: peak.soilMoisture,
        humidity: peak.humidity,
        cloudCover: peak.cloudCover,
        precipitationProbability:
            peak.precipitationProbability,
        windSpeed: peak.windSpeed,
        windGusts: peak.windGusts,
        weatherCode: peak.weatherCode,
        temperature: peak.temperature,

        forecast,
        isLive: true,
        isDemo: false,

        source: 'Open-Meteo',
        updatedAt: new Date().toISOString()
    };

    try {
        sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
                at: Date.now(),
                data: result
            })
        );
    } catch (e) {
        // Ignore storage errors
    }

    return result;
},
 
// (3) REPLACE the old getAllRiskZones() (the one that returns DEMO_DATA)
// with this one. Delete the old version so there is only one.
async getAllRiskZones() {

    const zones = DEMO_DATA.riskZones || [];

    if (!zones.length) {
        return [];
    }

    const results = new Array(zones.length).fill(null);

    /*
     * Fetch live Open-Meteo data.
     * Small batches avoid sending too many
     * requests at once.
     */
    const BATCH = 3;

    for (let i = 0; i < zones.length; i += BATCH) {

        const chunk = zones.slice(i, i + BATCH);

        const out = await Promise.all(
            chunk.map(zone =>
                this._fetchZoneSevereWeatherScore(zone)
            )
        );

        out.forEach((result, j) => {
            results[i + j] = result;
        });
    }

    /*
     * Update the existing risk-zone objects.
     * Risk Map already reads DEMO_DATA.riskZones,
     * so both Dashboard and Risk Map get the
     * same live score.
     */
    zones.forEach((zone, i) => {

        const live = results[i];

        if (!live) {
            zone.isLive = false;
            zone.isDemo = true;
            return;
        }

        const score = Math.max(
            0,
            Math.min(
                100,
                Math.round(Number(live.risk_score))
            )
        );

        zone.risk = score;

        // Keep your existing SAFE/WATCH/ALERT/WARNING thresholds
        zone.level = this._mapLevelFromRisk(score);

        zone.isLive = true;
        zone.isDemo = false;

        zone.liveUpdated =
            live.updatedAt;

        /*
         * Store the live severe-weather values
         * so Dashboard/Risk Map panels can use them.
         */
        zone.rainfall = live.rainfall;
        zone.soilMoisture = live.soilMoisture;
        zone.humidity = live.humidity;
        zone.cloudCover = live.cloudCover;
        zone.precipitationProbability =
            live.precipitationProbability;
        zone.windSpeed = live.windSpeed;
        zone.windGusts = live.windGusts;
        zone.weatherCode = live.weatherCode;
        zone.temperature = live.temperature;

        zone.severeWeatherForecast =
            live.forecast;

        zone.dataSource = 'Open-Meteo';

        /*
         * Factors used by the Dashboard
         * "Why is this area at elevated weather risk?"
         */
        const factors = [];

        if (live.rainfall > 0) {
            factors.push({
                label: 'Rainfall intensity',
                value: Math.round(
                    Math.min(30, live.rainfall * 3)
                )
            });
        }

        if (live.precipitationProbability > 0) {
            factors.push({
                label: 'Rain probability',
                value: Math.round(
                    live.precipitationProbability * 0.20
                )
            });
        }

        if (live.cloudCover > 0) {
            factors.push({
                label: 'Cloud cover',
                value: Math.round(
                    live.cloudCover * 0.10
                )
            });
        }

        if (live.humidity > 70) {
            factors.push({
                label: 'High humidity',
                value: Math.round(
                    Math.min(
                        10,
                        (live.humidity - 70) * 0.33
                    )
                )
            });
        }

        if (live.windSpeed > 0) {
            factors.push({
                label: 'Wind speed',
                value: Math.round(
                    Math.min(
                        10,
                        live.windSpeed * 0.25
                    )
                )
            });
        }

        if (live.windGusts > 0) {
            factors.push({
                label: 'Wind gusts',
                value: Math.round(
                    Math.min(
                        10,
                        live.windGusts * 0.15
                    )
                )
            });
        }

        if ([95, 96, 99].includes(
            live.weatherCode
        )) {
            factors.push({
                label: 'Thunderstorm conditions',
                value: 10
            });
        }

        /*
         * Highest contributing factors first.
         */
        factors.sort(
            (a, b) => b.value - a.value
        );

        zone.factors = factors;

        /*
         * Keep a simple weather-event description.
         */
        if ([95, 96, 99].includes(live.weatherCode)) {
            zone.weatherEvent = 'Thunderstorm';
        } else if (
            live.windGusts >= 50
        ) {
            zone.weatherEvent = 'Strong Wind';
        } else if (
            live.rainfall >= 10
        ) {
            zone.weatherEvent = 'Heavy Rainfall';
        } else {
            zone.weatherEvent = 'No severe event detected';
        }
    });

    return zones.map(zone => ({
        ...zone,
        isDemo: !zone.isLive
    }));
},
 


  // ============================================================
  // WEATHER / RAINFALL
  // ============================================================

  async getRainfall(locationId = 'tawang', period = '24h') {

    const coords = this._getCoordinates(locationId);

    if (!coords) {
      return this._getDemoRainfall();
    }

    const url =
      `${this.API.OPEN_METEO}` +
      `?latitude=${encodeURIComponent(coords.lat)}` +
      `&longitude=${encodeURIComponent(coords.lng)}` +
      `&hourly=precipitation,rain,soil_moisture_0_to_7cm` +
      `&forecast_days=2` +
      `&timezone=auto`;

    const data = await this._safeFetch(url, null);

    if (!data?.hourly) {
      return this._getDemoRainfall();
    }

    const times = data.hourly.time || [];
    const precipitation = data.hourly.precipitation || [];

    const result = times.slice(0, 25).map((time, index) => ({
      hour: new Date(time).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      }),
      value: Number(precipitation[index] || 0),
      timestamp: time,
      isDemo: false
    }));

    return result;
  },
    async getSevereWeatherForecast(locationId = 'tawang') {

    const coords = this._getCoordinates(locationId);

    if (!coords) {
      return [];
    }

    const url =
      `${this.API.OPEN_METEO}` +
      `?latitude=${encodeURIComponent(coords.lat)}` +
      `&longitude=${encodeURIComponent(coords.lng)}` +
      `&hourly=precipitation,rain,soil_moisture_0_to_7cm,` +
      `relative_humidity_2m,cloud_cover,precipitation_probability,` +
      `wind_speed_10m,wind_gusts_10m,weather_code,temperature_2m` +
      `&forecast_days=2` +
      `&timezone=auto`;

    const data = await this._safeFetch(url, null);

    if (!data?.hourly) {
      return [];
    }

    const hourly = data.hourly;
    const times = hourly.time || [];

    const precipitation = hourly.precipitation || [];
    const soilMoisture = hourly.soil_moisture_0_to_7cm || [];
    const humidity = hourly.relative_humidity_2m || [];
    const cloudCover = hourly.cloud_cover || [];
    const precipitationProbability = hourly.precipitation_probability || [];
    const windSpeed = hourly.wind_speed_10m || [];
    const windGusts = hourly.wind_gusts_10m || [];
    const weatherCode = hourly.weather_code || [];
    const temperature = hourly.temperature_2m || [];

    const now = new Date();

    let currentIndex = times.findIndex(time => {
      return new Date(time) >= now;
    });

    if (currentIndex === -1) {
      currentIndex = 0;
    }

    const result = times
      .slice(currentIndex, currentIndex + 7)
      .map((time, index) => {

        const i = currentIndex + index;

        return {
          timestamp: time,

          hour: new Date(time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          }),

          rainfall: Number(precipitation[i] || 0),

          soilMoisture: Number(soilMoisture[i] || 0),

          humidity: Number(humidity[i] || 0),

          cloudCover: Number(cloudCover[i] || 0),

          precipitationProbability:
            Number(precipitationProbability[i] || 0),

          windSpeed: Number(windSpeed[i] || 0),

          windGusts: Number(windGusts[i] || 0),

          weatherCode: Number(weatherCode[i] ?? -1),

          temperature: Number(temperature[i] || 0),

          isDemo: false
        };
      });

    return result;
  },

  async getRainfallData(locationName = 'Tawang') {
    return this.getRainfall(locationName, '24h');
  },

  async getRainfallHistory(locationName) {
    const coords = this._getCoordinates(locationName);

    if (!coords) {
      const zone = this._findZone(locationName);

      if (!zone) {
        return {
          error: 'Location not found',
          isDemo: true
        };
      }

      return {
        location: locationName,
        data: zone.rainfallHistory || [],
        isDemo: true
      };
    }

    const url =
      `${this.API.OPEN_METEO}` +
      `?latitude=${coords.lat}` +
      `&longitude=${coords.lng}` +
      `&hourly=precipitation` +
      `&past_days=7` +
      `&forecast_days=1` +
      `&timezone=auto`;

    const data = await this._safeFetch(url, null);

    if (!data?.hourly) {
      const zone = this._findZone(locationName);

      return {
        location: locationName,
        data: zone?.rainfallHistory || [],
        isDemo: true
      };
    }

    return {
      location: locationName,
      data: (data.hourly.time || []).map((time, index) => ({
        timestamp: time,
        hour: new Date(time).toLocaleString(),
        value: Number(data.hourly.precipitation?.[index] || 0)
      })),
      isDemo: false
    };
  },

  async _getDemoRainfall() {
    return [
      { hour: '00:00', value: 2.1 },
      { hour: '04:00', value: 3.4 },
      { hour: '08:00', value: 5.8 },
      { hour: '12:00', value: 8.2 },
      { hour: '16:00', value: 12.5 },
      { hour: '20:00', value: 9.3 },
      { hour: '24:00', value: 6.7 }
    ].map(d => ({
      ...d,
      isDemo: true
    }));
  },


  // ============================================================
  // LOCATION SEARCH
  // ============================================================

  async searchLocations(query) {

    if (!query || !query.trim()) return [];

    const q = query.trim();

    const url =
      `${this.API.OPEN_METEO_GEOCODING}` +
      `?name=${encodeURIComponent(q)}` +
      `&count=6` +
      `&language=en` +
      `&format=json` +
      `&countryCode=IN`;

    const data = await this._safeFetch(url, null);

    if (Array.isArray(data?.results) && data.results.length) {
      return data.results.map((place, index) => ({
        id: `OM-${place.id || index}`,
        name: place.name,
        state: place.admin1 || '',
        country: place.country || '',
        lat: Number(place.latitude),
        lng: Number(place.longitude),
        elevation: place.elevation ?? null,
        displayName: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
        risk: null,
        level: 'UNKNOWN',
        isDemo: false,
        source: 'Open-Meteo Geocoding'
      }));
    }

    // Existing local data remains a graceful fallback.
    const localQuery = q.toLowerCase();
    return (DEMO_DATA.riskZones || [])
      .filter(z =>
        String(z.location || '').toLowerCase().includes(localQuery) ||
        String(z.state || '').toLowerCase().includes(localQuery)
      )
      .map(z => ({
        id: z.id,
        name: z.location,
        state: z.state,
        lat: z.lat,
        lng: z.lng,
        risk: z.risk,
        level: z.level,
        isDemo: true,
        source: 'Local fallback'
      }))
      .slice(0, 6);
  },


  // ============================================================
  // ALERT SERVICES
  // ============================================================

  async getAlerts(filters = {}) {
    await this._delay(50);

    let alerts = [];

    if (typeof SahayakState !== 'undefined') {
      alerts = SahayakState.getAlerts() || [];
    } else {
      alerts = DEMO_DATA.alerts || [];
    }

    if (filters.status && filters.status !== 'all') {
      alerts = alerts.filter(a => a.status === filters.status);
    }

    if (filters.severity && filters.severity !== 'all') {
      alerts = alerts.filter(a => a.severity === filters.severity);
    }

    if (filters.state && filters.state !== 'all') {
      alerts = alerts.filter(a => a.state === filters.state);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();

      alerts = alerts.filter(a =>
        String(a.location || '').toLowerCase().includes(q) ||
        String(a.id || '').toLowerCase().includes(q) ||
        String(a.state || '').toLowerCase().includes(q)
      );
    }

    return alerts.map(a => ({
      ...a,
      isDemo: true
    }));
  },

  async getAlertById(id) {
    await this._delay(50);

    const alerts =
      typeof SahayakState !== 'undefined'
        ? SahayakState.getAlerts() || []
        : DEMO_DATA.alerts || [];

    const alert = alerts.find(a => a.id === id);

    return alert
      ? { ...alert, isDemo: true }
      : null;
  },

  async createAlert(alertData) {
    await this._delay(100);

    const alerts = SahayakState.getAlerts();

    const newAlert = {
      id: 'SAH-ALR-' + String(alerts.length + 1).padStart(4, '0'),
      ...alertData,
      issuedAt: Date.now(),
      issued: 'Just now',
      status: 'active',
      read: false,
      assignedOfficer: null,
      timeline: [
        {
          time: 'Now',
          event: 'Warning generated by authority'
        }
      ]
    };

    SahayakState.addAlert(newAlert);

    SahayakState.addNotification({
      type: 'critical',
      icon: '🔴',
      title: 'New warning generated',
      message: `${newAlert.location}: ${newAlert.type}`,
      timestamp: 'Just now',
      read: false
    });

    return {
      ...newAlert,
      isDemo: true
    };
  },

  async updateAlert(id, updates) {
    await this._delay(100);

    SahayakState.updateAlert(id, updates);

    return {
      success: true,
      isDemo: true
    };
  },

  async assignOfficerToAlert(alertId, officer) {
    await this._delay(100);

    SahayakState.updateAlert(alertId, {
      assignedOfficer: officer
    });

    SahayakState.addNotification({
      type: 'info',
      icon: '📍',
      title: 'Field officer assigned',
      message: `${officer.name} assigned to ${alertId}`,
      timestamp: 'Just now',
      read: false
    });

    return {
      success: true,
      isDemo: true
    };
  },


  // ============================================================
  // FIELD REPORT SERVICES
  // ============================================================

  async getFieldReports(filters = {}) {

    await this._delay(50);

    let reports =
      SahayakState.getReports() ||
      DEMO_DATA.fieldReports ||
      [];

    if (filters.status && filters.status !== 'all') {
      reports = reports.filter(r => r.status === filters.status);
    }

    if (filters.severity && filters.severity !== 'all') {
      reports = reports.filter(r => r.severity === filters.severity);
    }

    if (filters.state && filters.state !== 'all') {
      reports = reports.filter(r => r.state === filters.state);
    }

    if (filters.type && filters.type !== 'all') {
      reports = reports.filter(r => r.type === filters.type);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();

      reports = reports.filter(r =>
        String(r.location || '').toLowerCase().includes(q) ||
        String(r.id || '').toLowerCase().includes(q) ||
        String(r.officer || '').toLowerCase().includes(q)
      );
    }

    return reports.map(r => ({
      ...r,
      isDemo: true
    }));
  },

  async getFieldReportById(id) {
    await this._delay(50);

    const reports = SahayakState.getReports() || [];

    const report = reports.find(r => r.id === id);

    return report
      ? { ...report, isDemo: true }
      : null;
  },

  async createFieldReport(reportData) {

    await this._delay(100);

    const reports = SahayakState.getReports();

    const newReport = {
      id: 'FR-' + (1000 + reports.length + 1),
      ...reportData,
      submittedAt: Date.now(),
      submitted: 'Just now',
      status: 'PENDING'
    };

    SahayakState.addReport(newReport);

    SahayakState.addNotification({
      type: 'info',
      icon: '📍',
      title: 'Field report submitted',
      message:
        `${newReport.officer} submitted ${newReport.type} from ${newReport.location}`,
      timestamp: 'Just now',
      read: false
    });

    return {
      ...newReport,
      isDemo: true
    };
  },

  async verifyFieldReport(id, result) {

    await this._delay(100);

    const statusMap = {
      verify: 'VERIFIED',
      reject: 'REJECTED',
      reinspect: 'REINSPECTION_REQUESTED'
    };

    SahayakState.updateReport(id, {
      status: statusMap[result] || 'VERIFIED'
    });

    const messages = {
      verify: 'Prediction verified',
      reject: 'Prediction not verified',
      reinspect: 'Re-inspection requested'
    };
    SahayakState.addNotification({
      type: result === 'verify' ? 'success' : 'warning',
      icon: result === 'verify' ? '✓' : '⚠',
      title: messages[result],
      message:
        `Report ${id} — ${result === 'verify'
          ? 'Field observation confirmed'
          : 'Action required'
        }`,
      timestamp: 'Just now',
      read: false
    });

    return {
      success: true,
      isDemo: true
    };
  },

  async addToOfflineQueue(report) {
    await this._delay(50);

    SahayakState.addToOfflineQueue(report);

    return {
      success: true,
      isDemo: true
    };
  },

  async syncOfflineReports() {

    await this._delay(200);

    const queue = SahayakState.getOfflineQueue();

    queue.forEach(r => {

      r.status = 'PENDING';
      r.submitted = 'Just now';
      r.submittedAt = Date.now();

      SahayakState.addReport(r);
    });

    SahayakState.clearOfflineQueue();

    return {
      synced: queue.length,
      isDemo: true
    };
  },


  // ============================================================
  // OFFICERS
  // ============================================================

  async getOfficers() {

    await this._delay(50);

    return (DEMO_DATA.officers || []).map(o => ({
      ...o,
      isDemo: true
    }));
  },


  // ============================================================
  // RISK ANALYSIS
  // ============================================================

  // ============================================================
  // RISK ANALYSIS
  // ============================================================

  async getRiskAnalysis(locationName = 'Tawang') {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: false
      };
    }

    // ============================================================
    // LIVE SAHAYAK ML MODEL
    // ============================================================
    //
    // The deployed FastAPI model accepts only the place name:
    //
    // GET /risk-score-by-place?place=shillong
    //
    // Example response:
    // {
    //   "lat": 25.56892,
    //   "lon": 91.88313,
    //   "risk_score": 15,
    //   "risk_level": "Low",
    //   "top_factors": [
    //      {
    //        "feature": "rain_1d",
    //        "contribution": -0.262
    //      }
    //   ],
    //   "source": "model"
    // }
    //
    // No Node.js backend is required.
    // The browser directly calls the deployed FastAPI service.

    const modelUrl =
      `https://sahayak-ml-api.onrender.com/risk-score-by-place?place=${encodeURIComponent(locationName)}`;

    const model = await this._safeFetch(
      modelUrl,
      null,
      {
        timeout: 80000
      }
    );

    // ============================================================
    // VALIDATE MODEL RESPONSE
    // ============================================================

    if (
      !model ||
      !Number.isFinite(Number(model.risk_score))
    ) {

      console.error(
        'SAHAYAK ML model did not return a valid risk score:',
        model
      );

      return {
        error: 'AI risk model is temporarily unavailable',
        location: locationName,
        isDemo: false,
        modelConnected: false
      };
    }

    // ============================================================
    // MODEL RISK SCORE
    // ============================================================
    //
    // Keep the score between 0 and 100.
    //

    const riskScore = Math.max(
      0,
      Math.min(
        100,
        Number(model.risk_score)
      )
    );

    // ============================================================
    // RISK LEVEL
    // ============================================================

    const rawLevel = String(
      model.risk_level || ''
    )
      .trim()
      .toLowerCase();

    let uiLevel;

    if (rawLevel === 'critical') {

      uiLevel = 'CRITICAL';

    } else if (rawLevel === 'high') {

      uiLevel = 'HIGH';

    } else if (
      rawLevel === 'medium' ||
      rawLevel === 'moderate' ||
      rawLevel === 'watch'
    ) {

      uiLevel = 'WATCH';

    } else if (
      rawLevel === 'low' ||
      rawLevel === 'safe'
    ) {

      uiLevel = 'SAFE';

    } else {

      // Fallback only if model does not send a recognized level.
      uiLevel = this._levelFromRisk(riskScore);

    }

    // ============================================================
    // LIVE RAINFALL
    // ============================================================
    //
    // Rainfall is still fetched separately so the existing
    // environmental/rainfall section of the page continues
    // to display real Open-Meteo data.
    //
    // IMPORTANT:
    // Rainfall does NOT overwrite the ML model's prediction.
    //

    let rainfall = [];

    try {

      rainfall = await this.getRainfall(locationName);

    } catch (rainfallError) {

    }

    const rainfallTotal = rainfall.reduce(
      (sum, item) =>
        sum + Number(item.value || 0),
      0
    );
        // ============================================================
    // LIVE SEVERE WEATHER FORECAST
    // ============================================================

    let severeWeatherForecast = [];

    try {
      severeWeatherForecast =
        await this.getSevereWeatherForecast(locationName);
    } catch (weatherError) {
      console.warn(
        'Severe weather forecast unavailable:',
        weatherError
      );
    }

    // ============================================================
    // MODEL TOP FACTORS
    // ============================================================
    //
    // Keep the actual signed contribution returned by the model.
    //

    const modelFactors =
      Array.isArray(model.top_factors)
        ? model.top_factors.map(f => ({

          feature: String(
            f?.feature || 'unknown'
          ),

          contribution: Number(
            f?.contribution || 0
          )

        }))
        : [];

    // Structure used by the existing UI.

    const factors = modelFactors.map(f => ({

      label: f.feature,

      value: f.contribution,

      contribution: f.contribution,

      source: 'model'

    }));

    // Sort factors by absolute contribution.
    // This tells the UI which factors have the
    // strongest influence on the model prediction.

    const keyDrivers = modelFactors
      .slice()
      .sort(
        (a, b) =>
          Math.abs(b.contribution) -
          Math.abs(a.contribution)
      )
      .map(
        f => f.feature
      );

    // ============================================================
    // RETURN LIVE MODEL RESULT
    // ============================================================

    return {
// Keep existing location information.
      ...zone,

      // ----------------------------------------------------------
      // LIVE MODEL RESULT
      // ----------------------------------------------------------

      risk: riskScore,

      modelRiskScore: riskScore,

      modelRiskLevel:
        model.risk_level || uiLevel,

      level: uiLevel,

      modelSource:
        model.source || 'model',

      modelConnected: true,

      modelLatitude:
        Number(model.lat),

      modelLongitude:
        Number(model.lon),

      // ----------------------------------------------------------
      // MODEL FACTORS
      // ----------------------------------------------------------

      modelFactors,
      factors,
      keyDrivers,

      // ----------------------------------------------------------
      // REAL RAINFALL
      // ----------------------------------------------------------

      currentRainfall:
        Math.round(
          rainfallTotal * 10
        ) / 10,

      // ----------------------------------------------------------
      // LIVE ENVIRONMENT + TERRAIN
      // ----------------------------------------------------------

     // ----------------------------------------------------------
// LIVE ENVIRONMENT + TERRAIN
// ----------------------------------------------------------

rainfall: rainfall,

soilMoisture: zone.soilMoisture ?? null,

slope: zone.slope ?? null,

elevation: zone.elevation ?? null,

aspect: zone.aspect ?? null,

stability: zone.stability ?? null,

environmentLive: rainfall.length > 0,

terrainLive: false,
      severeWeatherForecast: severeWeatherForecast,

      severeWeatherForecastLive:
        severeWeatherForecast.length > 0,

      // ----------------------------------------------------------
      // TIMESTAMP
      // ----------------------------------------------------------

      timestamp:
        new Date().toISOString(),

      isDemo: false
    };
  },

  async getRiskFactors(locationName = 'Tawang') {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    return {
      location: locationName,
      factors: zone.factors || [],
      keyDrivers: zone.keyDrivers || [],
      isDemo: true
    };
  },


  // ============================================================
  // EXPOSURE
  // ============================================================

  async getExposureData(locationName) {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    const exposure = zone.exposure || {
      population: zone.population || 1000,

      villages:
        Math.max(
          2,
          Math.round((zone.population || 1000) / 300)
        ),

      roads: typeof zone.roads === 'number'
        ? zone.roads
        : 3,

      schools: zone.schools || 2,
      hospitals: zone.hospitals || 1,
      bridges: zone.bridges || 1
    };

    const populationBreakdown =
      zone.populationBreakdown || {

        high:
          Math.round(
            exposure.population * 0.34
          ),

        moderate:
          Math.round(
            exposure.population * 0.43
          ),

        low:
          Math.round(
            exposure.population * 0.23
          )
      };

    return {
      location: locationName,
      state: zone.state,
      risk: zone.risk,
      level: zone.level,
      exposure,
      populationBreakdown,
      isDemo: true
    };
  },


  // ============================================================
  // ELEVATION / TERRAIN
  // ============================================================

  async getTerrainAnalysis(locationName) {

    const coords = await this._resolveCoordinates(locationName);

    if (!coords) {
      return {
        location: locationName,
        error: 'Location not found',
        isDemo: true,
        source: 'No coordinates available'
      };
    }

    // Use the same live terrain calculation used by the monitoring page.
    const terrain = await this._getLiveTerrainBlock(
      locationName,
      this._findZone(locationName),
      null,
      coords
    );

    return {
      ...terrain,
      source: terrain.source || 'Open-Meteo Elevation + Open-Meteo',
      dataset: terrain.dataset || 'Copernicus DEM GLO-90 (90 m)'
    };
  },


  // ============================================================
  // SATELLITE
  // ============================================================

  async getSatelliteData(locationId = 'tawang') {

    const zone = this._findZone(locationId);

    return {
      location: locationId,

      vegetationIndex:
        zone?.satelliteIndicators?.vegetationIndex ??
        0.42,

      surfaceChange:
        zone?.satelliteChange ??
        'anomaly',

      lastScan:
        new Date().toISOString(),

      isDemo: true
    };
  },

  async getSatelliteAnalysis(locationName) {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    return {
      location: locationName,

      indicators:
        zone.satelliteIndicators || {},

      surfaceChange:
        zone.satelliteChange || 'unknown',

      isDemo: true
    };
  },

  async getSatelliteIndicators(location = 'Tawang') {

    const data =
      DEMO_DATA.riskAnalysisData?.[location] ||
      DEMO_DATA.riskAnalysisData?.Tawang;

    return {
      ...(data?.satellite || {}),
      isDemo: true
    };
  },


  // ============================================================
  // HISTORICAL DATA
  // ============================================================

  async getHistoricalLandslides() {

    await this._delay(50);

    return (DEMO_DATA.historicalLandslides || [])
      .map(h => ({
        ...h,
        isDemo: true
      }));
  },

  async getHistoricalContext(locationName) {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    return {
      location: locationName,

      events:
        zone.historicalEventsList ||
        zone.historicalEvents ||
        [],

      count:
        zone.historical ||
        0,

      isDemo: true
    };
  },

  async getRiskHistory(locationName) {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    return {
      location: locationName,

      trend:
        zone.trend || 'stable',

      events:
        zone.riskHistoryEvents || [],

      isDemo: true
    };
  },
    // ============================================================
  // INFRASTRUCTURE (DEBUG VERSION)
  // ============================================================

  async getInfrastructure(locationName = 'Tawang') {
    console.log("🏗️ [DEBUG] getInfrastructure called for:", locationName);
    
    // 1. Try to find zone in DEMO_DATA first
    let zone = this._findZone(locationName);
    console.log("🔍 [DEBUG] Zone found in DEMO_DATA:", zone ? zone.location : "NO");
    
    // 2. If zone not found, try to get coordinates from Geocoding API
    let coords = null;
    if (!zone) {
      console.log("⏳ [DEBUG] Resolving coordinates via API...");
      coords = await this._resolveCoordinates(locationName);
      console.log("📍 [DEBUG] Coordinates resolved:", coords);
      
      if (!coords) {
        console.log("⚠️ [DEBUG] API failed, falling back to Tawang");
        zone = this._findZone('Tawang');
      }
    }

    // 3. If we have coords but no zone, create a minimal zone object
    if (!zone && coords) {
      console.log("🛠️ [DEBUG] Creating auto-generated zone object");
      zone = {
        id: 'auto-generated',
        location: locationName,
        state: coords.state || 'Unknown',
        lat: coords.lat,
        lng: coords.lng,
        risk: 50,
        level: 'WATCH'
      };
    }

    if (!zone) {
      console.error("❌ [DEBUG] CRITICAL: No zone and no fallback available!");
      return {
        error: 'Location not found',
        infrastructure: [],
        isDemo: true
      };
    }

    let infrastructure = zone.infrastructure;
    console.log("📦 [DEBUG] Raw infrastructure data from zone:", infrastructure);

    // 4. Generate demo infrastructure if none exists
    if (!infrastructure || !Array.isArray(infrastructure)) {
      console.log("⚙️ [DEBUG] Generating fallback demo infrastructure");
      infrastructure = [
        {
          id: 'INF-AUTO-001',
          type: 'hospital',
          name: `${zone.location} District Hospital`,
          distance: 2.8,
          status: 'POTENTIALLY_EXPOSED',
          lat: zone.lat + 0.005,
          lng: zone.lng - 0.005,
          capacity: 40
        },
        {
          id: 'INF-AUTO-002',
          type: 'school',
          name: `${zone.location} Govt School`,
          distance: 1.5,
          status: 'POTENTIALLY_EXPOSED',
          lat: zone.lat - 0.003,
          lng: zone.lng + 0.004,
          capacity: 280
        },
        {
          id: 'INF-AUTO-003',
          type: 'bridge',
          name: `${zone.location} River Bridge`,
          distance: 2.2,
          status: 'MONITOR',
          lat: zone.lat + 0.002,
          lng: zone.lng + 0.003
        }
      ];
    }

    const finalResult = {
      location: locationName,
      infrastructure,
      isDemo: true
    };
    
    console.log("✅ [DEBUG] getInfrastructure returning successfully:", finalResult);
    return finalResult;
  },

  
  // ============================================================
  // ROADS
  // ============================================================

  async getRoadRisk(locationName) {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    let roads = Array.isArray(zone.roads)
      ? zone.roads
      : null;

    if (!roads) {

      roads = [

        {
          id: 'RD-AUTO-001',
          name: `${zone.location} Main Road`,
          risk:
            zone.risk > 60
              ? 'HIGH'
              : 'MODERATE',
          distance: 1.2,
          status: 'Monitor'
        },

        {
          id: 'RD-AUTO-002',
          name: `${zone.location} Access Road`,
          risk: 'MODERATE',
          distance: 2.5,
          status: 'Monitor'
        }
      ];
    }

    const summary = {
      total: roads.length,

      critical:
        roads.filter(
          r => r.risk === 'CRITICAL'
        ).length,

      high:
        roads.filter(
          r => r.risk === 'HIGH'
        ).length,

      moderate:
        roads.filter(
          r =>
            r.risk === 'MODERATE' ||
            r.risk === 'WATCH'
        ).length
    };

    return {
      location: locationName,
      roads,
      summary,
      isDemo: true
    };
  },


  // ============================================================
  // VILLAGES
  // ============================================================

  async getVillages(locationName) {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    let villages = zone.villages;

    if (!Array.isArray(villages)) {

      const count =
        Math.max(
          2,
          Math.round(
            (zone.population || 1000) / 300
          )
        );

      villages = Array.from(
        { length: count },
        (_, i) => ({

          id: `VLG-AUTO-${i + 1}`,

          name:
            `${zone.location} Village ${i + 1}`,

          population:
            Math.round(
              (zone.population || 1000) /
              count
            ),

          distance:
            1.5 + i * 1.2,

          exposure:
            i === 0
              ? 'HIGH'
              : i === 1
                ? 'MODERATE'
                : 'LOW',

          lat:
            zone.lat +
            (Math.random() - 0.5) * 0.02,

          lng:
            zone.lng +
            (Math.random() - 0.5) * 0.02
        })
      );
    }

    return {
      location: locationName,
      villages,
      isDemo: true
    };
  },


  // ============================================================
  // EMERGENCY SERVICES
  // ============================================================

  async getEmergencyServices(locationName) {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    const services =
      zone.emergencyServices || {

        police:
          Math.max(
            1,
            Math.round(
              (typeof zone.roads === 'number'
                ? zone.roads
                : 3) / 2
            )
          ),

        relief: 1,

        hospitals:
          zone.hospitals || 1,

        fire: 1
      };

    const nearest =
      zone.nearestResponse || {

        name:
          `${zone.location} Relief Center`,

        distance: 3.5,

        responseTime: 15
      };

    return {
      location: locationName,
      services,
      nearest,
      isDemo: true
    };
  },


  // ============================================================
  // RESPONSE PRIORITY
  // ============================================================

  async getResponsePriority(locationName) {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    const risk = Number(zone.risk || 0);

    const priority =
      zone.responsePriority || {

        score:
          Math.min(
            100,
            risk + 10
          ),

        level:
          risk >= 80
            ? 'CRITICAL'
            : risk >= 60
              ? 'HIGH'
              : risk >= 40
                ? 'MODERATE'
                : 'LOW'
      };

    const factors =
      zone.priorityFactors || [

        {
          label: 'Hazard Severity',
          value: Math.round(risk * 0.4)
        },

        {
          label: 'Population Exposure',
          value:
            Math.round(
              (zone.population || 1000) / 100
            )
        },

        {
          label: 'Road Connectivity',
          value:
            (typeof zone.roads === 'number'
              ? zone.roads
              : 3) * 4
        },

        {
          label: 'Critical Facilities',
          value:
            (
              (zone.schools || 2) +
              (zone.hospitals || 1)
            ) * 3
        }
      ];

    return {
      location: locationName,
      priority,
      factors,
      isDemo: true
    };
  },


  // ============================================================
  // MONITORING
  // ============================================================

  // ------------------------------------------------------------
  // getMonitoringData(location)
  //
  // Returns the data used by monitoring.html.
  //
  // - rainfall  -> LIVE (Open-Meteo). Falls back to DEMO_DATA if
  //                the API call fails or the location has no
  //                known coordinates.
  // - terrain   -> PARTIALLY LIVE. Elevation comes from
  //                Open-Elevation (real). Slope / soil moisture /
  //                soil type have no free live source and stay
  //                demo-derived (matches the "PARTIAL LIVE" badge
  //                already on the page).
  // - satellite -> DEMO. No free satellite API is wired up.
  //                Correctly labelled "DATA SOURCE REQUIRED" in
  //                the UI already.
  // - historical-> DEMO. Static curated dataset. Correctly
  //                labelled "DATASET REQUIRED" in the UI already.
  //
  // Every section carries its own isDemo flag so the UI can show
  // truthfully which parts are live and which are placeholders.
  // ------------------------------------------------------------
  async getMonitoringData(location = 'Tawang') {

    const zone = this._findZone(location);
    const demoBlock =
      DEMO_DATA.monitoringData?.[location] ||
      DEMO_DATA.monitoringData?.Tawang ||
      {};

    // Resolve user-entered locations first. This is what makes the page
    // work for places that are not present in DEMO_DATA.
    const coords = await this._resolveCoordinates(location);

   const [rainfall, terrain, historicalRainfall, weather] = await Promise.all([
  this._getLiveRainfallBlock(location, zone, demoBlock.rainfall, coords),
  this._getLiveTerrainBlock(location, zone, demoBlock.terrain, coords),
  this.getHistoricalRainfall(location, 30),
  this.getSevereWeatherForecast(location)
]);

    const satellite = this._getSatelliteImageryBlock(location, coords, demoBlock.satellite);

   return {
  location,
  coordinates: coords,
  rainfall,
  weather,
  terrain,
  satellite,
  historical: {
        ...(demoBlock.historical || {}),
        rainfall: historicalRainfall,
        inventory: this.ISRO_LANDSLIDE_INVENTORY,
        isDemo: false,
        source: this.ISRO_LANDSLIDE_INVENTORY.source
      }
    };
  },

  // ------------------------------------------------------------
  // LIVE RAINFALL BLOCK (Open-Meteo)
  // ------------------------------------------------------------
  async _getLiveRainfallBlock(location, zone, demoRainfall, coordsArg = null) {

    const fallback = () => ({ ...(demoRainfall || {}), isDemo: true, source: 'Local fallback' });
    const coords = coordsArg || await this._resolveCoordinates(location);
    if (!coords) return fallback();

    const url =
      `${this.API.OPEN_METEO}` +
      `?latitude=${coords.lat}` +
      `&longitude=${coords.lng}` +
      `&hourly=precipitation,rain,soil_moisture_0_to_7cm,` +
`relative_humidity_2m,cloud_cover,precipitation_probability,` +
`wind_speed_10m,wind_gusts_10m,weather_code,temperature_2m` +
      `&past_days=7` +
      `&forecast_days=1` +
      `&timezone=auto`;

    const data = await this._safeFetch(url, null);
    const times = data?.hourly?.time;
    const precip = data?.hourly?.precipitation;
    const rain = data?.hourly?.rain;
    const soil = data?.hourly?.soil_moisture_0_to_7cm;

    if (!times?.length || !precip?.length) return fallback();

    const now = Date.now();
    let nowIndex = times.findIndex(t => new Date(t).getTime() > now);
    if (nowIndex === -1) nowIndex = times.length;
    nowIndex = Math.max(0, nowIndex - 1);

    const sumLast = hours => {
      const start = Math.max(0, nowIndex - hours + 1);
      return precip.slice(start, nowIndex + 1).reduce((sum, v) => sum + Number(v || 0), 0);
    };

    const current = Math.round(Number(precip[nowIndex] || 0) * 10) / 10;
    const h24 = Math.round(sumLast(24) * 10) / 10;
    const h48 = Math.round(sumLast(48) * 10) / 10;
    const h72 = Math.round(sumLast(72) * 10) / 10;
    const h7day = Math.round(sumLast(24 * 7) * 10) / 10;
    const last24Start = Math.max(0, nowIndex - 23);
    const hourly = precip.slice(last24Start, nowIndex + 1).map(v => Math.round(Number(v || 0) * 10) / 10);
    while (hourly.length < 24) hourly.unshift(0);

    let running = 0;
    const accumulated = hourly.map(v => { running += v; return Math.round(running * 10) / 10; });

    const threshold = demoRainfall?.threshold || zone?.simulatorBaseline?.rainfall || 250;
    const exceeded = h72 > threshold;
    const exceedPct = threshold > 0 ? Math.max(0, Math.round(((h72 - threshold) / threshold) * 100)) : 0;
    const currentSoilMoisture = Array.isArray(soil) ? Number(soil[nowIndex] || 0) : null;
    const currentRain = Array.isArray(rain) ? Number(rain[nowIndex] || 0) : current;

    return {
      current, currentRain, currentSoilMoisture, h24, h48, h72, h7day,
      threshold, exceeded, exceedPct, hourly, accumulated,
      timestamps: times.slice(last24Start, nowIndex + 1),
      isDemo: false,
      source: 'Open-Meteo'
    };
  },

  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // LIVE TERRAIN + SOIL
  // ------------------------------------------------------------
  // OpenTopoData supplies the DEM elevation. Slope is calculated from a
  // small 3x3 neighbourhood of real DEM samples around the selected point.
  // Open-Meteo supplies modelled volumetric soil moisture for the upper soil
  // layer. This replaces the previous hard-coded slope/soil values.
  // ------------------------------------------------------------
  async _getLiveTerrainBlock(location, zone, demoTerrain, coordsArg = null) {

    const coords = coordsArg || await this._resolveCoordinates(location);

    if (!coords) {
      return {
        location,
        isDemo: true,
        source: 'No coordinates available',
        soilMoisture: null,
        slope: null,
        elevation: null,
        aspect: null,
        soilType: 'Unavailable',
        stability: 'UNAVAILABLE'
      };
    }

    // Copernicus GLO-90 DEM resolution is approximately 90 metres.
    // We therefore sample the surrounding terrain at roughly one DEM cell.
    const sampleMeters = 90;

    const latStep = sampleMeters / 111320;

    const lonStep =
      sampleMeters /
      (
        111320 *
        Math.max(
          0.1,
          Math.cos(coords.lat * Math.PI / 180)
        )
      );

    // 3x3 terrain neighbourhood.
    //
    // Index:
    // 0 = centre
    // 1 = north
    // 2 = south
    // 3 = east
    // 4 = west
    // 5-8 = diagonal points

    const samplePoints = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1]
    ];

    const latitudes = samplePoints.map(
      ([dy]) => coords.lat + dy * latStep
    );

    const longitudes = samplePoints.map(
      ([, dx]) => coords.lng + dx * lonStep
    );

    // ============================================================
    // LIVE ELEVATION
    // ============================================================

    const elevationUrl =
      `${this.API.OPEN_METEO_ELEVATION}` +
      `?latitude=${latitudes.join(',')}` +
      `&longitude=${longitudes.join(',')}`;

    // ============================================================
    // LIVE SOIL MOISTURE
    // ============================================================

    const soilUrl =
      `${this.API.OPEN_METEO}` +
      `?latitude=${coords.lat}` +
      `&longitude=${coords.lng}` +
      `&hourly=soil_moisture_0_to_7cm` +
      `&past_hours=3` +
      `&forecast_hours=1` +
      `&timezone=auto`;

    const [elevationData, soilData] = await Promise.all([
      this._safeFetch(elevationUrl, null),
      this._safeFetch(soilUrl, null)
    ]);

    // ============================================================
    // PROCESS ELEVATION
    // ============================================================

    const elevations = Array.isArray(elevationData?.elevation)
      ? elevationData.elevation.map(Number)
      : [];

    const valid = elevations.filter(Number.isFinite);

    if (valid.length < 5) {

      return {
        location,
        latitude: coords.lat,
        longitude: coords.lng,

        isDemo: true,

        source: 'Open-Meteo Elevation unavailable',

        dataset: 'Copernicus DEM GLO-90 (90 m)',

        soilMoisture: null,

        slope: null,

        elevation: null,

        aspect: null,

        soilType: 'Not available from selected live APIs',

        stability: 'UNAVAILABLE',

        stabilitySource:
          'Not calculated because terrain elevation is unavailable'
      };
    }

    // ============================================================
    // GET CENTRE + CARDINAL ELEVATIONS
    // ============================================================

    const centerElevation = Number(elevations[0]);

    const north = Number(elevations[1]);

    const south = Number(elevations[2]);

    const east = Number(elevations[3]);

    const west = Number(elevations[4]);

    // ============================================================
    // CALCULATE TERRAIN GRADIENT
    // ============================================================

    const dxMeters =
      lonStep *
      111320 *
      Math.cos(
        coords.lat * Math.PI / 180
      );

    const dyMeters =
      latStep *
      111320;

    const dzDx =
      (east - west) /
      (2 * dxMeters);

    const dzDy =
      (north - south) /
      (2 * dyMeters);

    // ============================================================
    // CALCULATE SLOPE
    // ============================================================

    const slope =
      Math.round(
        (
          Math.atan(
            Math.sqrt(
              dzDx ** 2 +
              dzDy ** 2
            )
          ) *
          180 /
          Math.PI
        ) * 10
      ) / 10;

    // ============================================================
    // CALCULATE ASPECT
    // ============================================================

    const aspectDegrees =
      (
        Math.atan2(
          dzDx,
          dzDy
        ) *
        180 /
        Math.PI +
        360
      ) % 360;

    const aspect =
      this._aspectFromDegrees(
        aspectDegrees
      );

    // ============================================================
    // SOIL MOISTURE
    // ============================================================

    const soilSeries =
      soilData?.hourly?.soil_moisture_0_to_7cm || [];

    const rawSoil =
      soilSeries.length
        ? Number(
          soilSeries[
          soilSeries.length - 1
          ]
        )
        : NaN;

    // Open-Meteo soil moisture is m³/m³.
    // Convert to percentage.
    const soilMoisture =
      Number.isFinite(rawSoil)
        ? Math.round(
          rawSoil * 1000
        ) / 10
        : null;

    // ============================================================
    // DERIVED STABILITY INDICATOR
    // ============================================================
    //
    // This is NOT a measured landslide probability.
    // It is only a simple derived indicator based on
    // terrain slope + modelled soil moisture.

    const stability =
      !Number.isFinite(soilMoisture)

        ? 'UNAVAILABLE'

        : (
          slope >= 35 &&
          soilMoisture >= 65
        )

          ? 'REDUCED'

          : (
            slope >= 25 ||
            soilMoisture >= 50
          )

            ? 'MODERATE'

            : 'STABLE';

    // ============================================================
    // FINAL TERRAIN RESULT
    // ============================================================

    return {

      location,

      latitude:
        coords.lat,

      longitude:
        coords.lng,

      elevation:
        Math.round(
          centerElevation
        ),

      dataset:
        'Copernicus DEM GLO-90 (90 m)',

      slope,

      slopeSource:
        'Derived from 3x3 Copernicus GLO-90 DEM neighbourhood',

      aspect,

      soilMoisture,

      soilMoistureSource:
        'Open-Meteo modelled soil moisture, 0-7 cm',

      soilType:
        'Not available from selected live APIs',

      stability,

      stabilitySource:
        'Derived indicator (slope + soil moisture)',

      curvature:
        'Not calculated',

      normal:
        null,

      isDemo:
        false,

      source:
        'Open-Meteo Elevation + Open-Meteo'
    };
  },

  _aspectFromDegrees(degrees) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(degrees / 45) % 8];
  },

  _getSatelliteImageryBlock(location, coords, demoSatellite) {
    if (!coords) return { location, isDemo: true, source: 'No coordinates available' };

    // Esri World Imagery is used as the visible satellite basemap because it
    // remains usable if a NASA GIBS tile is temporarily unavailable. NASA GIBS
    // is exposed as an optional imagery overlay in monitoring.js.
    return {
      location,
      latitude: coords.lat,
      longitude: coords.lng,
      imageryProvider: 'Esri World Imagery + NASA GIBS',
      isDemo: false,
      source: 'Esri World Imagery; NASA GIBS optional overlay',
      note: 'Real remote-sensing imagery. NDVI/NDWI/SAR/landslide classification is not fabricated.'
    };
  },

  // Real historical rainfall from Open-Meteo Historical Weather API.
  async getHistoricalRainfall(location = 'Tawang', days = 30) {
    const coords = await this._resolveCoordinates(location);
    if (!coords) return { location, data: [], isDemo: true, source: 'No coordinates' };

    const safeDays = Math.max(1, Math.min(Number(days) || 30, 365));
    const end = new Date();
    const start = new Date(end.getTime() - (safeDays - 1) * 86400000);
    const fmt = d => d.toISOString().slice(0, 10);

    const url =
      `${this.API.OPEN_METEO_ARCHIVE}` +
      `?latitude=${coords.lat}` +
      `&longitude=${coords.lng}` +
      `&start_date=${fmt(start)}` +
      `&end_date=${fmt(end)}` +
      `&hourly=precipitation,rain` +
      `&timezone=auto`;

    const data = await this._safeFetch(url, null);
    if (!data?.hourly?.time) {
      return { location, data: [], isDemo: true, source: 'Historical API unavailable' };
    }

    return {
      location,
      data: data.hourly.time.map((timestamp, i) => ({
        timestamp,
        precipitation: Number(data.hourly.precipitation?.[i] || 0),
        rain: Number(data.hourly.rain?.[i] || 0)
      })),
      isDemo: false,
      source: 'Open-Meteo Historical Weather API'
    };
  },

  async getRainfallMonitoring(location = 'Tawang') {

    const rainfall = await this.getRainfall(
      location,
      '24h'
    );

    return {
      data: rainfall,
      rainfall,
      isDemo: rainfall.some(r => r.isDemo)
    };
  },

  async getTerrainMonitoring(location = 'Tawang') {
    return this.getTerrainAnalysis(location);
  },

  async getSatelliteMonitoring(location = 'Tawang') {
    return this.getSatelliteAnalysis(location);
  },


  // ============================================================
  // HISTORICAL EVENTS
  // ============================================================

  async getHistoricalEvents(filters = {}) {
    // Use published ISRO/NRSC inventory counts instead of synthetic event rows.
    const inventory = this.ISRO_LANDSLIDE_INVENTORY;
    let rows = inventory.northeast.map(item => ({
      state: item.state,
      year2014: item[2014],
      year2017: item[2017],
      seasonalTotal: item[2014] + item[2017],
      source: inventory.source,
      coverage: inventory.coverage
    }));

    if (filters.state && filters.state !== 'all') {
      rows = rows.filter(row => row.state === filters.state);
    }

    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      rows = rows.filter(row => row.state.toLowerCase().includes(q));
    }

    return rows;
  },

  // ============================================================
  // NOTIFICATIONS / DASHBOARD
  // ============================================================

  async getNotifications() {

    await this._delay(30);

    return (
      DEMO_DATA.notifications || []
    ).map(n => ({
      ...n,
      isDemo: true
    }));
  },


  async getDataFreshness() {

    await this._delay(30);

    return (
      DEMO_DATA.dataFreshness || []
    ).map(d => ({
      ...d,
      isDemo: true
    }));
  },


  async getExposureSummary() {

    await this._delay(30);

    return {
      ...(DEMO_DATA.exposureSummary || {}),
      isDemo: true
    };
  },


  async getFieldStats() {

    await this._delay(30);

    return {
      ...(DEMO_DATA.fieldStats || {}),
      isDemo: true
    };
  },


  async getMetrics() {

    await this._delay(30);

    return Object.entries(
      DEMO_DATA.metrics || {}
    ).reduce(
      (acc, [key, val]) => {

        acc[key] = {
          ...val,
          isDemo: true
        };

        return acc;
      },
      {}
    );
  },

    // ============================================================
  // EXPOSURE ACTIVITY (NEW)
  // ============================================================

  async getExposureActivity(locationName = 'Tawang') {
    await this._delay(50);

    // Generate demo activity data
    const activities = [
      {
        id: 'ACT-001',
        type: 'inspection',
        icon: '🔍',
        title: 'Infrastructure inspection completed',
        location: locationName,
        time: '2 hours ago',
        officer: 'Rajesh Kumar'
      },
      {
        id: 'ACT-002',
        type: 'assessment',
        icon: '📊',
        title: 'Population exposure assessment updated',
        location: locationName,
        time: '5 hours ago',
        officer: 'System'
      },
      {
        id: 'ACT-003',
        type: 'verification',
        icon: '✓',
        title: 'Road segment verified - operational',
        location: locationName,
        time: '1 day ago',
        officer: 'Priya Sharma'
      },
      {
        id: 'ACT-004',
        type: 'alert',
        icon: '⚠',
        title: 'Risk level updated to WATCH',
        location: locationName,
        time: '1 day ago',
        officer: 'AI System'
      },
      {
        id: 'ACT-005',
        type: 'report',
        icon: '📝',
        title: 'Field report submitted',
        location: locationName,
        time: '2 days ago',
        officer: 'Amit Singh'
      }
    ];

    return {
      location: locationName,
      activity: activities,
      isDemo: true
    };
  },
  // ADD THESE 3 methods inside "const Services = { ... }" in services.js
// (paste anywhere inside the object, e.g. right after getMetrics())
// risk-map.js calls these but they were not carried over when
// services.js was rewritten with the live-API architecture.

async getCitizenReports() {
  await this._delay(50);
  return (DEMO_DATA.citizenReports || []).map(r => ({ ...r, isDemo: true }));
},

async getSatelliteAnomalies() {
  await this._delay(50);
  return (DEMO_DATA.satelliteAnomalies || []).map(a => ({ ...a, isDemo: true }));
},

// risk-map.js's rainfall map-marker layer needs spatial points
// ({lat, lng, location, intensity, level}), not the hourly time-series
// that getRainfallData() now correctly returns for the monitoring page.
// This keeps both use cases working without changing getRainfallData().
async getRainfallMapData() {
  await this._delay(50);
  return (DEMO_DATA.rainfallData || []).map(r => ({ ...r, isDemo: true }));
},
  // ============================================================
  // SIMULATOR (MISSING FUNCTIONS)
  // ============================================================

  async getSimulationPresets() {
    await this._delay(50);

    return {
      current: {
        name: 'Current Conditions',
        rainfallMultiplier: 1.0,
        rainProbabilityMultiplier: 1.0,
        soilMoistureMultiplier: 1.0,
        slopeMultiplier: 1.0,
        windSpeedMultiplier: 1.0,
        windGustsMultiplier: 1.0
      },

      moderate: {
        name: 'Moderate Scenario',
        rainfallMultiplier: 1.4,
        rainProbabilityMultiplier: 1.3,
        soilMoistureMultiplier: 1.2,
        slopeMultiplier: 1.0,
        windSpeedMultiplier: 1.2,
        windGustsMultiplier: 1.3
      },

      severe: {
        name: 'Severe Scenario',
        rainfallMultiplier: 1.8,
        rainProbabilityMultiplier: 1.7,
        soilMoistureMultiplier: 1.5,
        slopeMultiplier: 1.1,
        windSpeedMultiplier: 1.5,
        windGustsMultiplier: 1.7
      }
    };
  },
  // ============================================================
  // LEGACY COMPATIBILITY
  // ============================================================

  async getLocations() {

    await this._delay(30);

    return (
      DEMO_DATA.demoLocations || []
    ).map(loc => ({
      ...loc,
      isDemo: true
    }));
  },


  async getRiskFactorsLegacy(location = 'Tawang') {

    return this.getRiskFactors(
      location
    );
  },


  async getRainfallAnalysis(location = 'Tawang') {

    const rainfall =
      await this.getRainfall(
        location
      );

    return {
      rainfall,
      isDemo:
        rainfall.some(
          r => r.isDemo
        )
    };
  },
  async addUser(userData) {
  await this._delay(100);

  const storedUsers = SahayakState.get('users');

  const users = Array.isArray(storedUsers)
    ? storedUsers
    : [...(DEMO_DATA.users || [])];

  const newUser = {
    id: 'USR-' + String(Date.now()).slice(-6),
    name: userData.name,
    email: userData.email,
    phone: userData.phone || '',
    password: userData.password,
    role: userData.role,
    region: userData.region || 'Northeast India',
    district: userData.district || 'All',
    status: userData.status || 'active',
    lastActive: 'Just now',
    incidents: 0
  };

  users.unshift(newUser);

  SahayakState.set('users', users);

  SahayakState.addNotification({
    type: 'info',
    icon: '👤',
    title: 'New user created',
    message: `${newUser.name} added as ${newUser.role.replace('_', ' ')}`,
    timestamp: 'Just now',
    read: false
  });

      return {
      ...newUser,
      isDemo: false
    };
  },

  // ============================================================
  // ROUTE RISK ANALYSIS
  // ============================================================

    async analyzeRoute(startLocation, destination) {

    const start = await this._resolveCoordinates(startLocation);
    const end = await this._resolveCoordinates(destination);

    if (!start || !end) {
        return {
            error: 'Unable to find coordinates for the selected locations.'
        };
    }

    // ============================================================
    // 1. GET REAL ROAD ROUTES FROM OSRM
    // ============================================================

    const url =
        `${this.API.OSRM}/` +
        `${start.lng},${start.lat};` +
        `${end.lng},${end.lat}` +
        `?overview=full&geometries=geojson&steps=true&alternatives=true`;

    const data = await this._safeFetch(url, null);

    if (!data || data.code !== 'Ok' || !data.routes?.length) {
        return {
            error: 'Unable to find a road route between these locations.'
        };
    }

    // ============================================================
    // 2. WEATHER RISK CALCULATOR
    // ============================================================

    const calculateWeatherRisk = async (lat, lng) => {

        const weatherUrl =
            `${this.API.OPEN_METEO}` +
            `?latitude=${encodeURIComponent(lat)}` +
            `&longitude=${encodeURIComponent(lng)}` +
            `&hourly=precipitation,relative_humidity_2m,cloud_cover,` +
            `precipitation_probability,wind_speed_10m,wind_gusts_10m,` +
            `weather_code,soil_moisture_0_to_7cm` +
            `&forecast_days=1` +
            `&timezone=auto`;

        const weatherData =
            await this._safeFetch(weatherUrl, null);

        if (!weatherData?.hourly) {
            return null;
        }

        const h = weatherData.hourly;
        const times = h.time || [];

        if (!times.length) {
            return null;
        }

        const precipitation = h.precipitation || [];
        const humidity = h.relative_humidity_2m || [];
        const cloud = h.cloud_cover || [];
        const probability = h.precipitation_probability || [];
        const wind = h.wind_speed_10m || [];
        const gusts = h.wind_gusts_10m || [];
        const codes = h.weather_code || [];
        const soil = h.soil_moisture_0_to_7cm || [];

        const now = new Date();

        let currentIndex =
            times.findIndex(t => new Date(t) >= now);

        if (currentIndex < 0) {
            currentIndex = 0;
        }

        // Look at the next 6 hours at this route location.
        let highestRisk = 0;
        let highestPoint = null;

        for (
            let i = currentIndex;
            i < Math.min(currentIndex + 6, times.length);
            i++
        ) {

            const rain = Number(precipitation[i] || 0);
            const hum = Number(humidity[i] || 0);
            const clouds = Number(cloud[i] || 0);
            const prob = Number(probability[i] || 0);
            const windSpeed = Number(wind[i] || 0);
            const windGust = Number(gusts[i] || 0);
            const weatherCode = Number(codes[i] ?? -1);
            const soilMoisture = Number(soil[i] || 0);

            let score = 0;

            // Rainfall intensity
            score += Math.min(30, rain * 3);

            // Probability of precipitation
            score += prob * 0.20;

            // Humidity
            score += Math.min(
                10,
                Math.max(0, hum - 70) * 0.33
            );

            // Cloud cover
            score += clouds * 0.10;

            // Wind
            score += Math.min(10, windSpeed * 0.25);

            // Wind gusts
            score += Math.min(10, windGust * 0.15);

            // Thunderstorm
            if ([95, 96, 99].includes(weatherCode)) {
                score += 10;
            }

            // Wet soil adds a small vulnerability contribution.
            score += Math.min(
                5,
                Math.max(0, soilMoisture - 0.30) * 10
            );

            score = Math.round(
                Math.max(0, Math.min(100, score))
            );

            if (score > highestRisk) {
                highestRisk = score;

                highestPoint = {
                    timestamp: times[i],
                    rainfall: rain,
                    humidity: hum,
                    cloudCover: clouds,
                    precipitationProbability: prob,
                    windSpeed,
                    windGusts: windGust,
                    weatherCode,
                    soilMoisture
                };
            }
        }

        return {
            risk: highestRisk,
            weather: highestPoint
        };
    };

    // ============================================================
    // 3. CALCULATE RISK FOR A SPECIFIC ROAD ROUTE
    // ============================================================

    const analyzeRoadRoute = async (roadRoute) => {

        const routeGeometry =
            roadRoute.geometry?.coordinates?.map(
                p => [p[1], p[0]]
            ) || [];

        if (!routeGeometry.length) {
            return null;
        }

        const startPoint = routeGeometry[0];

        const midpoint =
            routeGeometry[
                Math.floor(routeGeometry.length / 2)
            ];

        const endPoint =
            routeGeometry[routeGeometry.length - 1];

        // Check weather at three different points.
        const weatherResults = await Promise.all([
            calculateWeatherRisk(
                startPoint[0],
                startPoint[1]
            ),
            calculateWeatherRisk(
                midpoint[0],
                midpoint[1]
            ),
            calculateWeatherRisk(
                endPoint[0],
                endPoint[1]
            )
        ]);

        const validResults =
            weatherResults.filter(Boolean);

        if (!validResults.length) {
            return null;
        }

        // Use the highest-risk point because one dangerous
        // section can make the route unsafe.
        const highest =
            validResults.reduce(
                (best, current) =>
                    current.risk > best.risk
                        ? current
                        : best
            );

        const highestWeather =
            highest.weather || {};

        let level = 'SAFE';

        if (highest.risk >= 81) {
            level = 'CRITICAL';
        } else if (highest.risk >= 61) {
            level = 'HIGH';
        } else if (highest.risk >= 31) {
            level = 'WATCH';
        }

        const reasons = [];

        if (highestWeather.rainfall >= 10) {
            reasons.push('heavy rainfall');
        } else if (highestWeather.rainfall >= 5) {
            reasons.push('elevated rainfall');
        }

        if (
            highestWeather.precipitationProbability >= 60
        ) {
            reasons.push('high rain probability');
        }

        if (highestWeather.windGusts >= 50) {
            reasons.push('strong wind gusts');
        } else if (highestWeather.windSpeed >= 30) {
            reasons.push('elevated wind speed');
        }

        if (
            [95, 96, 99].includes(
                Number(highestWeather.weatherCode ?? -1)
            )
        ) {
            reasons.push('thunderstorm conditions');
        }

        if (highestWeather.cloudCover >= 80) {
            reasons.push('high cloud cover');
        }

        if (highestWeather.soilMoisture >= 0.60) {
            reasons.push('high soil moisture');
        }

        const reason =
            reasons.length
                ? reasons.join(', ') + '.'
                : 'No major severe-weather indicators detected in the next 6 hours.';

        const distance =
            Number(roadRoute.distance || 0) / 1000;

        const time =
            Math.round(
                Number(roadRoute.duration || 0) / 60
            );

        const riskFactors = [
            {
                label: 'Rainfall',
                value: Math.round(
                    Math.min(
                        30,
                        Number(highestWeather.rainfall || 0) * 3
                    )
                ),
                description:
                    'Live rainfall intensity along the route'
            },
            {
                label: 'Rain Probability',
                value: Math.round(
                    Number(
                        highestWeather.precipitationProbability || 0
                    ) * 0.20
                ),
                description:
                    'Forecast precipitation probability'
            },
            {
                label: 'Wind',
                value: Math.round(
                    Math.min(
                        20,
                        Number(highestWeather.windSpeed || 0) * 0.25 +
                        Number(highestWeather.windGusts || 0) * 0.15
                    )
                ),
                description:
                    'Wind speed and gust conditions'
            },
            {
                label: 'Thunderstorm',
                value:
                    [95, 96, 99].includes(
                        Number(
                            highestWeather.weatherCode ?? -1
                        )
                    )
                        ? 10
                        : 0,
                description:
                    'WMO weather-code thunderstorm indicator'
            },
            {
                label: 'Soil Moisture',
                value: Math.round(
                    Math.min(
                        5,
                        Math.max(
                            0,
                            Number(
                                highestWeather.soilMoisture || 0
                            ) - 0.30
                        ) * 10
                    )
                ),
                description:
                    'Live soil moisture supporting factor'
            }
        ].filter(f => f.value > 0);

        return {
            distance: Number(distance.toFixed(1)),
            time,
            risk: highest.risk,
            level,
            reason,
            riskFactors,
            geometry: routeGeometry,
            source: 'OSRM + Open-Meteo'
        };
    };

    // ============================================================
    // 4. ANALYZE PRIMARY ROUTE
    // ============================================================

    const primaryAnalysis =
        await analyzeRoadRoute(data.routes[0]);

    if (!primaryAnalysis) {
        return {
            error: 'Unable to calculate live weather risk for this route.'
        };
    }

    const primary = {
        name: `${startLocation} → ${destination}`,
        distance: primaryAnalysis.distance,
        time: primaryAnalysis.time,
        overallRisk: primaryAnalysis.risk,
        level: primaryAnalysis.level,
        segments: [{
            id: 'segment-1',
            name: 'Live Weather Route',
            level: primaryAnalysis.level,
            risk: primaryAnalysis.risk,
            distance: primaryAnalysis.distance,
            reason: primaryAnalysis.reason,
            geometry: primaryAnalysis.geometry,
            source: primaryAnalysis.source
        }],
        waypoints: primaryAnalysis.geometry
    };

    // ============================================================
    // 5. ANALYZE REAL ALTERNATIVE IF OSRM RETURNS ONE
    // ============================================================

    let alternative = null;

    if (data.routes[1]) {

        const alternativeAnalysis =
            await analyzeRoadRoute(data.routes[1]);

        if (alternativeAnalysis) {

            alternative = {
                name:
                    `${startLocation} → ${destination} (Alternative)`,

                distance:
                    alternativeAnalysis.distance,

                time:
                    alternativeAnalysis.time,

                overallRisk:
                    alternativeAnalysis.risk,

                level:
                    alternativeAnalysis.level,

                segments: [{
                    id: 'alternative-segment-1',
                    name: 'Alternative Weather Route',
                    level: alternativeAnalysis.level,
                    risk: alternativeAnalysis.risk,
                    distance: alternativeAnalysis.distance,
                    reason: alternativeAnalysis.reason,
                    geometry: alternativeAnalysis.geometry,
                    source: alternativeAnalysis.source
                }],

                waypoints:
                    alternativeAnalysis.geometry
            };
        }
    }

    return {
        start: startLocation,
        destination,

        startCoordinates: [
            start.lat,
            start.lng
        ],

        destinationCoordinates: [
            end.lat,
            end.lng
        ],

        primary,

        alternative,

        riskFactors:
            primaryAnalysis.riskFactors,

        isDemo: false
    };
},};


// ============================================================
// GLOBAL EXPORT
// ============================================================

if (typeof window !== 'undefined') {
  window.Services = Services;
}



// ============================================================
// GLOBAL EXPORT
// ============================================================

if (typeof window !== 'undefined') {
  window.Services = Services;
}
