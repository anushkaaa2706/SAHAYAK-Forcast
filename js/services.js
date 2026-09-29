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
    console.log("🌐 API REQUEST STARTED:", url);

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, options.timeout || 10000);

    try {
      console.log("📡 Sending fetch request...");

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      });

      console.log("📥 API RESPONSE:", {
        url: url,
        status: response.status,
        ok: response.ok
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      console.log("✅ API DATA RECEIVED:", data);

      return data;

    } catch (error) {

      console.error("❌ API REQUEST ERROR:", {
        url: url,
        error: error
      });

      throw error;

    } finally {
      clearTimeout(timeout);
    }
  },

  async _safeFetch(url, fallback = null, options = {}) {
    try {
      return await this._fetchJSON(url, options);
    } catch (error) {
      console.warn('API request failed:', url, error);
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
async _fetchZoneModelScore(zone) {
  const cacheKey = `sahayak_zone_score_${zone.id}`;
  const TTL = 10 * 60 * 1000;
 
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.at < TTL) return cached.data;
  } catch (e) { /* storage unavailable, ignore */ }
 
  const url = `${this.ML_API_BASE}/risk-score?lat=${zone.lat}&lon=${zone.lng}`;
  const data = await this._safeFetch(url, null, { timeout: 60000 });
 
  if (!data || !Number.isFinite(Number(data.risk_score))) return null;
 
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data }));
  } catch (e) { /* ignore */ }
 
  return data;
},
 
// (3) REPLACE the old getAllRiskZones() (the one that returns DEMO_DATA)
// with this one. Delete the old version so there is only one.
async getAllRiskZones() {
  const zones = DEMO_DATA.riskZones || [];
  if (!zones.length) return [];
 
  const results = new Array(zones.length).fill(null);
 
  // First request goes alone: it wakes the Render instance if it is asleep.
  results[0] = await this._fetchZoneModelScore(zones[0]);
 
  if (!results[0]) {
    console.warn('ML API not reachable, risk map is showing demo scores');
    return zones.map(z => ({ ...z, isDemo: true }));
  }
 
  // Remaining zones in small batches so the API's terrain lookup
  // does not get rate limited.
  const BATCH = 3;
  for (let i = 1; i < zones.length; i += BATCH) {
    const chunk = zones.slice(i, i + BATCH);
    const out = await Promise.all(chunk.map(z => this._fetchZoneModelScore(z)));
    out.forEach((r, j) => { results[i + j] = r; });
  }
 
  // Write live values back into DEMO_DATA.riskZones itself, because
  // risk-map.js (filters, search, info panel) reads that array directly.
  zones.forEach((zone, i) => {
    const live = results[i];
    if (!live) { zone.isLive = false; return; }
 
    const score = Math.max(0, Math.min(100, Math.round(Number(live.risk_score))));
    zone.risk = score;
    zone.level = this._mapLevelFromRisk(score);
    zone.modelRiskLevel = live.risk_level;
    zone.isLive = true;
    zone.liveUpdated = new Date().toISOString();
 
    if (Array.isArray(live.top_factors) && live.top_factors.length) {
      zone.factors = live.top_factors.map(f => {
        const c = Number(f.contribution || 0);
        return {
          label: this._prettyFeature(f.feature) + (c < 0 ? ' (lowers risk)' : ''),
          value: Math.round(Math.abs(c) * 100)
        };
      });
    }
  });
 
  return zones.map(z => ({ ...z, isDemo: !z.isLive }));
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

      console.warn(
        'Rainfall data unavailable:',
        rainfallError
      );

    }

    const rainfallTotal = rainfall.reduce(
      (sum, item) =>
        sum + Number(item.value || 0),
      0
    );

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
      // TIMESTAMP
      // ----------------------------------------------------------

      timestamp:
        new Date().toISOString(),

      // This is now a real model result.
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
  // INFRASTRUCTURE
  // ============================================================

  async getInfrastructure(locationName = 'Tawang') {

    const zone = this._findZone(locationName);

    if (!zone) {
      return {
        error: 'Location not found',
        isDemo: true
      };
    }

    let infrastructure = zone.infrastructure;

    if (!infrastructure) {

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

    return {
      location: locationName,
      infrastructure,
      isDemo: true
    };
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

    const [rainfall, terrain, historicalRainfall] = await Promise.all([
      this._getLiveRainfallBlock(location, zone, demoBlock.rainfall, coords),
      this._getLiveTerrainBlock(location, zone, demoBlock.terrain, coords),
      this.getHistoricalRainfall(location, 30)
    ]);

    const satellite = this._getSatelliteImageryBlock(location, coords, demoBlock.satellite);

    return {
      location,
      coordinates: coords,
      rainfall,
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
      `&hourly=precipitation,rain,soil_moisture_0_to_7cm` +
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
    isDemo: true
  };
}
};


// ============================================================
// GLOBAL EXPORT
// ============================================================

if (typeof window !== 'undefined') {
  window.Services = Services;
}
