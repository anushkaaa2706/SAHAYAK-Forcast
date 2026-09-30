// js/monitoring.js — Environmental Intelligence Page Logic
(function () {
  'use strict';

  const state = {
    currentLocation: 'Tawang',
    currentTab: 'rainfall',
    data: null, // last data returned by Services.getMonitoringData()
    charts: { rainfall: null, byState: null, byYear: null, seasonal: null, historicalRainfall: null },
    map: null,
    mapMarkers: null,
    satelliteMap: null,
    notifications: []
  };

  // ============ TAB FROM URL HASH ============
  function getTabFromHash() {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['rainfall', 'terrain', 'satellite', 'historical'];
    return validTabs.includes(hash) ? hash : 'rainfall';
  }

  // ============ INITIALIZATION ============
  async function init() {
    renderSidebar();

    // Read tab from URL hash (if the user linked directly to a tab)
    const tabFromHash = getTabFromHash();
    state.currentTab = tabFromHash;

    document.querySelectorAll('.monitoring-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabFromHash);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.dataset.content === tabFromHash);
    });
    setupTabs();
    setupLocationSelector();
    await loadLocation();
    setupEventListeners();
    await loadNotifications();
  }

  // ============ SIDEBAR ============
  function renderSidebar() {
    const nav = document.getElementById('sidebarNav');
    if (!nav) return;
    nav.innerHTML = DEMO_DATA.sidebarSections.map(section => `
        <div class="sidebar-section">
          <div class="sidebar-section-label">${section.label}</div>
          ${section.items.map(item => `
            <a href="${ROUTES[item.key] || '#'}" class="sidebar-item ${item.active ? 'active' : ''}">
              <span class="sidebar-icon">${getSidebarIcon(item.icon)}</span>
              <span>${item.label}</span>
            </a>
          `).join('')}
        </div>
      `).join('');
    // Mark Rainfall (monitoring) as active
    nav.querySelectorAll('.sidebar-item').forEach(el => {
      const route = el.dataset.route;
      const href = el.getAttribute('href') || '';
      // Mark ANY monitoring-related route as active
      if (['rainfall', 'terrain', 'satellite', 'historical'].includes(route) ||
        href.includes('monitoring.html')) {
        el.classList.add('active');
      }
    });
  }

  function getSidebarIcon(name) {
    const icons = {
      'grid': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
      'map': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
      'chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      'bell': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
      'clipboard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
      'check': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      'cloud': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
      'mountain': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l4-8 4 4 4-10 6 14"/></svg>',
      'satellite': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/></svg>',
      'clock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      'building': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/></svg>',
      'route': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
      'sliders': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>',
      'bar-chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
      'cpu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/></svg>',
      'users': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
      'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>'
    };
    return icons[name] || '';
  }

  // ============ TABS ============
  function setupTabs() {
    document.querySelectorAll('.monitoring-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        state.currentTab = target;
        document.querySelectorAll('.monitoring-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`.tab-content[data-content="${target}"]`).classList.add('active');
        window.location.hash = target;
        // Re-render charts when tab becomes visible
        if (target === 'rainfall') renderRainfallChart();
        if (target === 'historical') { renderHistoricalCharts(); renderHistoricalMap(); renderHistoricalRainfallChart(); }
      });
    });
  }

  // ============ LOCATION SELECTOR ============
  function setupLocationSelector() {
    const select = document.getElementById('locationSelect');
    if (!select) return;
    select.innerHTML = DEMO_DATA.monitoringLocations.map(loc =>
      `<option value="${loc}" ${loc === state.currentLocation ? 'selected' : ''}>${loc}</option>`
    ).join('');
    select.addEventListener('change', async (e) => {
      state.currentLocation = e.target.value;
      await loadLocation();
    });
  }

  // ============ LOAD LOCATION ============
  async function loadLocation() {
    showLoading();
    try {
      const data = await Services.getMonitoringData(state.currentLocation);

      // Keep the full response around so the chart/render
      // functions can read live data instead of reaching into
      // DEMO_DATA directly.
      state.data = data;

      renderRainfall(data.rainfall);
      renderTerrain(data.terrain);
      renderSatellite(data.satellite);
      renderHistoricalSummary(data.historical);
      renderHistoricalCharts();

      updateDataStatus(
        'rainfall',
        data.rainfall.isDemo,
        'LIVE API',
        'DEMO DATA'
      );
      updateDataStatus(
        'terrain',
        data.terrain.isDemo,
        'LIVE OpenTopoData',
        'FALLBACK'
      );

      updateGlobalDataSourceStatus();

      if (state.currentTab === 'rainfall') renderRainfallChart();
      if (state.currentTab === 'historical') {
        renderHistoricalCharts();
        renderHistoricalMap();
        renderHistoricalRainfallChart();
      }
      hideLoading();
    } catch (err) {
      console.error('Failed to load monitoring data:', err);
      showError();
    }
  }

  // ============ LIVE / DEMO STATUS BADGES ============
  function updateDataStatus(prefix, isDemo, liveLabel, demoLabel) {
    const freshnessEl = document.getElementById(`${prefix}Freshness`);
    const badgeEl = document.getElementById(`${prefix}DataBadge`);

    if (freshnessEl) {
      const dotClass = isDemo ? 'delayed' : 'fresh';
      const label = isDemo
        ? 'Demo data (live source unavailable)'
        : 'Live data — just fetched';
      freshnessEl.innerHTML = `<span class="freshness-inline-dot ${dotClass}"></span>${label}`;
    }

    if (badgeEl) {
      badgeEl.textContent = isDemo ? demoLabel : liveLabel;
    }
  }

  function updateGlobalDataSourceStatus() {
    const el = document.getElementById('dataSourceStatus');
    if (!el || !state.data) return;

    const rainfallLive = !state.data.rainfall.isDemo;
    const terrainLive = !state.data.terrain.isDemo;

    const historicalLive = state.data.historical && !state.data.historical.isDemo;
    if (rainfallLive && terrainLive && historicalLive) el.textContent = 'Live + Official Inventory';
    else if (rainfallLive || terrainLive || historicalLive) el.textContent = 'Partial Live';
    else el.textContent = 'Fallback';
  }

  function showLoading() {
    const el = document.getElementById('monitoringLoading');
    if (el) el.style.display = 'block';
  }
  function hideLoading() {
    const el = document.getElementById('monitoringLoading');
    if (el) el.style.display = 'none';
  }
  function showError() {
    const el = document.getElementById('monitoringLoading');
    if (!el) return;
    el.innerHTML = `
        <div style="padding: var(--space-6); text-align: center;">
          <div style="font-size: var(--fs-sm); color: var(--text-700); font-weight: 600;">Environmental data temporarily unavailable</div>
          <button class="btn btn-outline" style="margin-top: var(--space-3);" onclick="window.SahayakMonitoring.retry()">Retry</button>
        </div>
      `;
    el.style.display = 'block';
  }
  async function retry() {
    hideLoading();
    await loadLocation();
  }

  // ============ RAINFALL ============
 function renderRainfall(r) {
    const cards = document.getElementById('rainfallSummaryCards');
    if (!cards) return;

    const weather = state.data?.weather || [];
    const currentWeather = weather[0] || {};

    const items = [
      { label: 'Current', value: r.current, unit: 'mm', status: null },
      { label: '24h Rainfall', value: r.h24, unit: 'mm', status: null },
      { label: '48h Rainfall', value: r.h48, unit: 'mm', status: null },
      { label: '72h Rainfall', value: r.h72, unit: 'mm', status: r.exceeded ? 'high' : null, statusLabel: r.exceeded ? 'Threshold Exceeded' : 'Normal' },
      { label: '7 Day Rainfall', value: r.h7day, unit: 'mm', status: null },
     { label: 'Wind Speed', value: Number(currentWeather.windSpeed ?? 0).toFixed(1), unit: 'km/h', status: null },
{ label: 'Rain Probability', value: Number(currentWeather.precipitationProbability ?? 0).toFixed(0), unit: '%', status: null },
{ label: 'Wind Gusts', value: Number(currentWeather.windGusts ?? 0).toFixed(1), unit: 'km/h', status: null }
    ];
    cards.innerHTML = items.map(i => `
        <div class="monitoring-summary-card ${i.status === 'high' ? 'alert-card' : ''}">
          <div class="monitoring-summary-label">${i.label}</div>
          <div class="monitoring-summary-value">${i.value}</div>
          <div class="monitoring-summary-unit">${i.unit}</div>
          ${i.status ? `<span class="monitoring-summary-status ${i.status}">${i.statusLabel}</span>` : ''}
        </div>
      `).join('');

    // Risk indicator
    const riskEl = document.getElementById('rainfallRiskIndicator');
    if (riskEl) {
      riskEl.innerHTML = `
          <div class="rainfall-risk-item">
            <div class="rainfall-risk-label">Current Condition</div>
            <div class="rainfall-risk-value ${r.exceeded ? 'alert' : 'ok'}">${r.exceeded ? 'HIGH' : 'NORMAL'}</div>
          </div>
          <div class="rainfall-risk-item">
            <div class="rainfall-risk-label">Threshold</div>
            <div class="rainfall-risk-value">${r.threshold} mm</div>
            <div class="rainfall-risk-sub">per 72h</div>
          </div>
          <div class="rainfall-risk-item">
            <div class="rainfall-risk-label">Observed</div>
            <div class="rainfall-risk-value ${r.exceeded ? 'alert' : 'ok'}">${r.h72} mm</div>
            <div class="rainfall-risk-sub">per 72h</div>
          </div>
        `;
    }

    // Alert banner
    const alertEl = document.getElementById('rainfallAlertBanner');
    if (alertEl) {
      if (r.exceeded) {
        alertEl.style.display = 'flex';
        alertEl.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            72h threshold exceeded by ${r.exceedPct}% — ${r.h72} mm observed vs ${r.threshold} mm threshold
          `;
      } else {
        alertEl.style.display = 'none';
      }
    }

    // Source caption
    const captionEl = document.getElementById('rainfallSourceCaption');
        if (captionEl) {
      captionEl.textContent = r.isDemo
        ? 'Source: Demo rainfall data (live Open-Meteo fetch unavailable for this location)'
        : 'Source: Open-Meteo precipitation data (live)';
    }

    // 6-hour severe weather forecast
    const forecastContainer = document.getElementById('weatherForecast6h');

    if (forecastContainer) {
        if (!weather.length) {
            forecastContainer.innerHTML = `
                <div class="chart-caption">
                    Live weather forecast unavailable.
                </div>
            `;
            return;
        }

        forecastContainer.innerHTML = `
            <div class="weather-forecast-grid">
                ${weather.slice(0, 6).map(w => `
                    <div class="weather-forecast-card">
                        <div class="weather-forecast-time">
                            ${w.hour}
                        </div>

                        <div class="weather-forecast-value">
                            ${Number(w.rainfall ?? 0).toFixed(1)} mm
                        </div>

                        <div class="weather-forecast-label">
                            Rainfall
                        </div>

                        <div class="weather-forecast-detail">
                            ${Number(w.precipitationProbability ?? 0).toFixed(0)}% rain probability
                        </div>

                        <div class="weather-forecast-detail">
                            ${Number(w.windSpeed ?? 0).toFixed(1)} km/h wind
                        </div>

                        <div class="weather-forecast-detail">
                            ${Number(w.windGusts ?? 0).toFixed(1)} km/h gusts
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
  }

  function renderRainfallChart() {
    const canvas = document.getElementById('rainfallChart');
    if (!canvas || typeof Chart === 'undefined') return;

    // Use the live/demo data already fetched for the current
    // location instead of reaching into DEMO_DATA directly.
    const data = state.data?.rainfall;
    if (!data || !data.hourly || !data.accumulated) return;

    if (state.charts.rainfall) state.charts.rainfall.destroy();

    const labels = Array.from({ length: data.hourly.length }, (_, i) => {
      // Label as "hours ago" relative to now, since live data
      // is anchored to the current moment rather than midnight.
      const hoursAgo = data.hourly.length - 1 - i;
return hoursAgo === 0 ? 'Now' : `${hoursAgo}h ago`;
    });

    state.charts.rainfall = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Hourly Rainfall (mm)',
            data: data.hourly,
            backgroundColor: 'rgba(25, 184, 199, 0.7)',
            borderColor: '#19B8C7',
            borderWidth: 1,
            borderRadius: 3,
            yAxisID: 'y',
            order: 2
          },
          {
            type: 'line',
            label: 'Accumulated Rainfall (mm)',
            data: data.accumulated,
            borderColor: '#F97316',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            borderWidth: 2,
            tension: 0.35,
            fill: true,
            pointRadius: 0,
            yAxisID: 'y1',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1000, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#8A9BB5', font: { size: 11, weight: '600' }, usePointStyle: true, pointStyle: 'circle' }
          },
          tooltip: {
            backgroundColor: '#0B1728',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: '#19B8C7',
            borderWidth: 1,
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
            ticks: { color: '#8A9BB5', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }
          },
          y: {
            position: 'left',
            title: { display: true, text: 'Hourly (mm)', color: '#8A9BB5', font: { size: 10 } },
            grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
            ticks: { color: '#8A9BB5', font: { size: 10 } }
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'Accumulated (mm)', color: '#F97316', font: { size: 10 } },
            grid: { display: false },
            ticks: { color: '#F97316', font: { size: 10 } }
          }
        }
      },
      plugins: [{
        id: 'thresholdLine',
        beforeDraw: (chart) => {
          const ctx = chart.ctx;
          const y1Scale = chart.scales.y1;
          const xScale = chart.scales.x;
          const y = y1Scale.getPixelForValue(data.threshold);
          ctx.save();
          ctx.strokeStyle = '#DC2626';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(xScale.left, y);
          ctx.lineTo(xScale.right, y);
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.fillStyle = '#DC2626';
          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.fillText(`Threshold: ${data.threshold} mm`, xScale.right - 110, y - 6);
          ctx.restore();
        }
      }]
    });
  }

  // ============ TERRAIN ============
  function renderTerrain(t) {
    const gauges = document.getElementById('terrainGauges');
    if (!gauges) return;

    // Soil moisture is a modelled environmental variable from Open-Meteo;
    // slope is derived from the live DEM samples returned by OpenTopoData.
    const moisture = Number.isFinite(Number(t.soilMoisture)) ? Number(t.soilMoisture) : null;
    const slope = Number.isFinite(Number(t.slope)) ? Number(t.slope) : null;
    const moistureClass = moisture == null ? 'low' : moisture > 75 ? 'high' : moisture > 55 ? 'moderate' : 'low';
    const slopeClass = slope == null ? 'low' : slope > 35 ? 'steep' : slope > 25 ? 'moderate' : 'low';
    const stabilityLabel = String(t.stability || 'UNAVAILABLE').toUpperCase();
    const stabilityClass = stabilityLabel === 'REDUCED' ? 'high' : stabilityLabel === 'MODERATE' ? 'moderate' : 'low';
    const stabilityValue = stabilityLabel === 'REDUCED' ? 30 : stabilityLabel === 'MODERATE' ? 60 : stabilityLabel === 'STABLE' ? 90 : 0;

    gauges.innerHTML = `
      ${renderGauge('Soil Moisture', moisture == null ? 0 : moisture, '%', moistureClass,
      moisture == null ? 'UNAVAILABLE' : moisture > 75 ? 'HIGH' : moisture > 55 ? 'MODERATE' : 'NORMAL')}
      ${renderGauge('Slope', slope == null ? 0 : slope, '°', slopeClass,
        slope == null ? 'UNAVAILABLE' : slope > 35 ? 'STEEP' : slope > 25 ? 'MODERATE' : 'GENTLE')}
      ${renderGauge('Stability', stabilityValue, '', stabilityClass, stabilityLabel)}
      ${renderGauge('Elevation', Number.isFinite(Number(t.elevation)) ? Number(t.elevation) : 0, 'm', 'low',
          t.isDemo ? 'FALLBACK' : 'LIVE DEM')}
    `;

    setTimeout(() => {
      gauges.querySelectorAll('.terrain-gauge-circle .progress').forEach(p => {
        const target = Number(p.dataset.target || 0);
        p.style.strokeDashoffset = 314 - (314 * Math.min(100, target) / 100);
      });
    }, 100);

    renderTerrainProfile(t);

    const compEl = document.getElementById('terrainComparison');
    if (compEl) {
      compEl.innerHTML = `
        <div class="comparison-box">
          <div class="comparison-box-title">Live Terrain Data</div>
          <div class="comparison-row"><span class="comparison-row-label">Elevation</span><span class="comparison-row-value">${Number.isFinite(Number(t.elevation)) ? `${Utils.formatNumber(t.elevation)} m` : '—'}</span></div>
          <div class="comparison-row"><span class="comparison-row-label">DEM</span><span class="comparison-row-value" style="font-family: inherit;">${t.dataset || 'ASTER 30m'}</span></div>
          <div class="comparison-row"><span class="comparison-row-label">Slope</span><span class="comparison-row-value">${slope == null ? '—' : `${slope}°`}</span></div>
          <div class="comparison-row"><span class="comparison-row-label">Aspect</span><span class="comparison-row-value">${t.aspect || '—'}</span></div>
        </div>
        <div class="comparison-box">
          <div class="comparison-box-title">Soil / Interpretation</div>
          <div class="comparison-row"><span class="comparison-row-label">Soil Moisture</span><span class="comparison-row-value">${moisture == null ? '—' : `${moisture}%`}</span></div>
          <div class="comparison-row"><span class="comparison-row-label">Soil Type</span><span class="comparison-row-value" style="font-family: inherit;">${t.soilType || 'Not available'}</span></div>
          <div class="comparison-row"><span class="comparison-row-label">Stability</span><span class="comparison-row-value"><span class="monitoring-summary-status ${stabilityLabel.toLowerCase()}">${stabilityLabel}</span></span></div>
          <div class="comparison-row"><span class="comparison-row-label">Interpretation</span><span class="comparison-row-value" style="font-family: inherit;">${t.stabilitySource || 'Derived from terrain/weather variables'}</span></div>
        </div>
      `;
    }

    const devBanner = document.getElementById('deviationBanner');
    if (devBanner) {
      devBanner.style.display = 'flex';
      devBanner.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 1 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        ${t.isDemo ? 'Live terrain source unavailable; fallback displayed.' : 'Slope is derived from the live DEM and soil moisture is supplied by Open-Meteo.'}`;
    }
  }

  function renderGauge(label, value, unit, colorClass, statusText) {
    const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
    const displayValue = Number.isInteger(numericValue) ? numericValue : numericValue.toFixed(1);
    const target = Math.min(100, Math.max(0, numericValue));
    return `
      <div class="terrain-gauge">
        <div class="terrain-gauge-circle">
          <svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="50"/><circle class="progress ${colorClass}" cx="60" cy="60" r="50" data-target="${target}"/></svg>
          <div class="terrain-gauge-center"><div class="terrain-gauge-value">${displayValue}</div><div class="terrain-gauge-unit">${unit}</div></div>
        </div>
        <div class="terrain-gauge-label">${label}</div>
        <span class="terrain-gauge-status monitoring-summary-status ${colorClass.toLowerCase()}">${statusText}</span>
      </div>`;
  }

  function renderTerrainProfile(t) {
    const container = document.getElementById('terrainProfile');
    if (!container) return;

    // Generate a terrain profile SVG
    const width = 600;
    const height = 160;
    const points = [];
    const segments = 20;
    const baseY = height - 20;

    for (let i = 0; i <= segments; i++) {
      const x = (i / segments) * width;
      const variation = Math.sin(i * 0.5) * 30 + Math.cos(i * 0.3) * 20;
      const slopeFactor = (t.slope / 45) * 40;
      const y = baseY - 40 - variation - slopeFactor * (i / segments);
      points.push([x, Math.max(20, y)]);
    }

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
    const areaD = pathD + ` L ${width} ${height} L 0 ${height} Z`;

    // Soil layers
    const colors = ['#8B6F47', '#6B5437', '#4A3825'];

    container.innerHTML = `
        <svg class="terrain-profile-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="soilGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${colors[0]}"/>
              <stop offset="50%" stop-color="${colors[1]}"/>
              <stop offset="100%" stop-color="${colors[2]}"/>
            </linearGradient>
            <linearGradient id="vegGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#22C55E" stop-opacity="0.6"/>
              <stop offset="100%" stop-color="#16A34A" stop-opacity="0.2"/>
            </linearGradient>
          </defs>
          <!-- Soil body -->
          <path d="${areaD}" fill="url(#soilGrad)"/>
          <!-- Vegetation layer -->
          <path d="${pathD}" fill="none" stroke="url(#vegGrad)" stroke-width="6" stroke-linecap="round"/>
          <!-- Surface line -->
          <path d="${pathD}" fill="none" stroke="#0F9D8A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Slope angle indicator -->
          <line x1="${width * 0.3}" y1="${points[6][1]}" x2="${width * 0.7}" y2="${points[14][1]}" stroke="#F97316" stroke-width="1" stroke-dasharray="3,3"/>
          <text x="${width * 0.5}" y="${(points[6][1] + points[14][1]) / 2 - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="#F97316">${t.slope}°</text>
          <!-- Elevation label -->
          <text x="10" y="20" font-size="10" font-weight="600" fill="#8A9BB5">${Utils.formatNumber(t.elevation)} m elevation${t.isDemo ? ' (fallback)' : ' (live DEM)'}</text>
        </svg>
      `;
  }

  // ============ SATELLITE ============
  function renderSatellite(s) {
    renderSatelliteMap(s);

    const badge = document.getElementById('satelliteDataBadge');
    const freshness = document.getElementById('satelliteFreshness');
    const notice = document.getElementById('satelliteSourceNotice');
    if (badge) badge.textContent = s?.isDemo ? 'FALLBACK' : 'LIVE SATELLITE';
    if (freshness) freshness.innerHTML = `<span class="freshness-inline-dot ${s?.isDemo ? 'delayed' : 'fresh'}"></span>${s?.isDemo ? 'Satellite source unavailable' : 'Live satellite imagery'}`;
    if (notice) notice.innerHTML = `<strong>Data Source:</strong> ${s?.source || 'Satellite imagery'}${s?.note ? ` — ${s.note}` : ''}`;

    // Indicators
    const indicators = document.getElementById('satelliteIndicators');
    if (indicators) {
      const items = [
        { label: 'NDVI', value: s.ndvi, dotClass: s.ndvi?.includes('Change') ? 'detected' : 'stable' },
        { label: 'NDWI', value: s.ndwi, dotClass: s.ndwi === 'Stable' ? 'stable' : 'detected' },
        { label: 'Surface Change', value: s.surface, dotClass: s.surface === 'Detected' ? 'detected' : 'none' },
        { label: 'SAR Indicator', value: s.sar, dotClass: s.sar === 'Elevated' ? 'elevated' : 'stable' },
        { label: 'Vegetation', value: s.vegetation, dotClass: s.vegetation === 'Moderate' ? 'moderate' : 'stable' }
      ];
      indicators.innerHTML = items.map(i => `
          <div class="satellite-indicator">
            <div class="satellite-indicator-label">${i.label}</div>
            <div class="satellite-indicator-value">
              <span class="satellite-indicator-dot ${i.dotClass}"></span>
              ${i.value ?? '—'}
            </div>
          </div>
        `).join('');
    }

    // Change bars
    const bars = document.getElementById('satelliteChangeBars');
    if (bars) {
      bars.innerHTML = `
          <div class="satellite-change-bar" style="--target-width: ${s.vegetationPct || 0}%">
            <div class="satellite-change-bar-header">
              <span class="satellite-change-bar-label">Vegetation</span>
              <span class="satellite-change-bar-value">${s.vegetationPct || 0}%</span>
            </div>
            <div class="satellite-change-bar-track"><div class="satellite-change-bar-fill"></div></div>
          </div>
          <div class="satellite-change-bar" style="--target-width: ${s.surfaceStabilityPct || 0}%">
            <div class="satellite-change-bar-header">
              <span class="satellite-change-bar-label">Surface Stability</span>
              <span class="satellite-change-bar-value">${s.surfaceStabilityPct || 0}%</span>
            </div>
            <div class="satellite-change-bar-track"><div class="satellite-change-bar-fill"></div></div>
          </div>
          <div class="satellite-change-bar" style="--target-width: ${s.waterSoilPct || 0}%">
            <div class="satellite-change-bar-header">
              <span class="satellite-change-bar-label">Water/Soil Signal</span>
              <span class="satellite-change-bar-value">${s.waterSoilPct || 0}%</span>
            </div>
            <div class="satellite-change-bar-track"><div class="satellite-change-bar-fill"></div></div>
          </div>
        `;
      setTimeout(() => {
        bars.querySelectorAll('.satellite-change-bar').forEach((bar, i) => {
          setTimeout(() => bar.classList.add('revealed'), i * 150);
        });
      }, 200);
    }

    // Anomaly alert
    const alertEl = document.getElementById('satelliteAlert');
    if (alertEl) {
      if (s.anomaly) {
        alertEl.style.display = 'flex';
        alertEl.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Surface anomaly detected near selected demonstration risk zone.
          `;
      } else {
        alertEl.style.display = 'none';
      }
    }

    // Setup comparison slider
    setupSatelliteSlider();
  }

  function renderSatelliteMap(s) {
    const el = document.getElementById('satelliteMap');
    if (!el || !window.L || !s?.latitude || !s?.longitude) return;

    if (state.satelliteMap) { state.satelliteMap.remove(); state.satelliteMap = null; }

    const map = L.map(el, { zoomControl: true }).setView([s.latitude, s.longitude], 11);

    // Reliable satellite basemap. NASA tile failures no longer black out the map.
    const esriImagery = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '&copy; Esri, Maxar, Earthstar Geographics' }
    ).addTo(map);

    // NASA GIBS remains available as an optional remote-sensing overlay.
    const gibs = L.tileLayer.wms(
      'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',
      {
        layers: 'MODIS_Terra_CorrectedReflectance_TrueColor',
        format: 'image/jpeg',
        version: '1.1.1',
        opacity: 0.75,
        attribution: 'NASA GIBS'
      }
    );
    gibs.on('tileerror', () => console.warn('NASA GIBS unavailable; Esri imagery remains active.'));

    L.marker([s.latitude, s.longitude]).addTo(map).bindPopup(`<strong>${s.location || 'Selected location'}</strong><br>Live satellite imagery`).openPopup();
    L.control.layers({ 'Esri Satellite': esriImagery }, { 'NASA GIBS': gibs }, { collapsed: false }).addTo(map);

    state.satelliteMap = map;
    setTimeout(() => map.invalidateSize(), 200);
  }

  function setupSatelliteSlider() {
    const comparison = document.querySelector('.satellite-comparison');
    const handle = comparison?.querySelector('.satellite-slider-handle');
    const afterLayer = comparison?.querySelector('.satellite-layer.after');
    if (!comparison || !handle || !afterLayer) return;

    let isDragging = false;

    const updatePosition = (clientX) => {
      const rect = comparison.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const pct = (x / rect.width) * 100;
      handle.style.left = pct + '%';
      afterLayer.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    };

    handle.addEventListener('mousedown', () => { isDragging = true; });
    handle.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) updatePosition(e.clientX);
    });
    document.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches[0]) updatePosition(e.touches[0].clientX);
    }, { passive: true });

    document.addEventListener('mouseup', () => { isDragging = false; });
    document.addEventListener('touchend', () => { isDragging = false; });

    comparison.addEventListener('click', (e) => {
      if (e.target === handle) return;
      updatePosition(e.clientX);
    });
  }

  // ============ HISTORICAL ============

  function renderHistoricalSummary(h) {
    const container = document.getElementById('historicalSummaryCards');
    if (!container) return;
    const inv = h?.inventory || Services.ISRO_LANDSLIDE_INVENTORY;
    const g = inv.global;
    const items = [
      { label: 'Mapped Landslides', value: g.total },
      { label: 'Seasonal Inventory', value: g.seasonal },
      { label: 'Event-Based Inventory', value: g.eventBased },
      { label: 'Field-Based Inventory', value: g.fieldBased }
    ];
    container.innerHTML = items.map(i => `<div class="monitoring-summary-card"><div class="monitoring-summary-label">${i.label}</div><div class="monitoring-summary-value">${Number(i.value).toLocaleString('en-IN')}</div><span class="monitoring-summary-status moderate">ISRO / NRSC</span></div>`).join('');
    const freshness = document.getElementById('historicalFreshness');
    const badge = document.getElementById('historicalDataBadge');
    const source = document.getElementById('historicalSourceCaption');
    if (freshness) freshness.innerHTML = '<span class="freshness-inline-dot fresh"></span>Authoritative inventory loaded';
    if (badge) badge.textContent = 'OFFICIAL DATASET';
    if (source) source.textContent = `Source: ${inv.source} — coverage ${inv.coverage}. Approximately 80,933 mapped landslides are reported nationally.`;
  }

  function renderHistoricalRainfallChart() {
    const canvas = document.getElementById('historicalRainfallChart');
    if (!canvas || typeof Chart === 'undefined') return;
    const rainfall = state.data?.historical?.rainfall;
    if (!rainfall?.data?.length) return;
    if (state.charts.historicalRainfall) state.charts.historicalRainfall.destroy();
    const daily = {};
    rainfall.data.forEach(row => { const day = String(row.timestamp).slice(0, 10); daily[day] = (daily[day] || 0) + Number(row.precipitation || 0); });
    const labels = Object.keys(daily), values = labels.map(d => Math.round(daily[d] * 10) / 10);
    state.charts.historicalRainfall = new Chart(canvas, { type: 'line', data: { labels, datasets: [{ label: 'Daily precipitation (mm)', data: values, borderWidth: 2, tension: .3, fill: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
    const caption = document.getElementById('historicalRainfallSourceCaption');
    if (caption) caption.textContent = `Source: ${rainfall.source || 'Open-Meteo Historical Weather API'} — ${labels.length} days`;
  }

  function renderHistoricalCharts() { renderByStateChart(); renderByCampaignChart(); renderInventoryTypeChart(); renderHistoricalRainfallChart(); }

  function renderByStateChart() {
    const canvas = document.getElementById('byStateChart'); if (!canvas || typeof Chart === 'undefined') return;
    if (state.charts.byState) state.charts.byState.destroy();
    const rows = Services.ISRO_LANDSLIDE_INVENTORY.northeast;
    state.charts.byState = new Chart(canvas, { type: 'bar', data: { labels: rows.map(r => r.state), datasets: [{ label: '2014 seasonal inventory', data: rows.map(r => r[2014]), borderWidth: 1 }, { label: '2017 seasonal inventory', data: rows.map(r => r[2017]), borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { maxRotation: 45 } }, y: { beginAtZero: true } } } });
  }

  function renderByCampaignChart() {
    const canvas = document.getElementById('byYearChart'); if (!canvas || typeof Chart === 'undefined') return;
    if (state.charts.byYear) state.charts.byYear.destroy();
    const rows = Services.ISRO_LANDSLIDE_INVENTORY.northeast;
    const total2014 = rows.reduce((sum, r) => sum + r[2014], 0), total2017 = rows.reduce((sum, r) => sum + r[2017], 0);
    const g = Services.ISRO_LANDSLIDE_INVENTORY.global;
    state.charts.byYear = new Chart(canvas, { type: 'bar', data: { labels: ['2014 seasonal (NE)', '2017 seasonal (NE)', 'National event-based', 'National field-based'], datasets: [{ label: 'Inventory records', data: [total2014, total2017, g.eventBased, g.fieldBased], borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
  }

  function renderInventoryTypeChart() {
    const canvas = document.getElementById('seasonalChart'); if (!canvas || typeof Chart === 'undefined') return;
    if (state.charts.seasonal) state.charts.seasonal.destroy();
    const g = Services.ISRO_LANDSLIDE_INVENTORY.global;
    state.charts.seasonal = new Chart(canvas, { type: 'doughnut', data: { labels: ['Seasonal', 'Event-based', 'Field-based'], datasets: [{ data: [g.seasonal, g.eventBased, g.fieldBased], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom' } } } });
  }

  function renderHistoricalMap() {
    if (typeof L === 'undefined') return;
    const el = document.getElementById('historicalMap'); if (!el) return;
    if (state.map) { state.map.remove(); state.map = null; }
    const coords = state.data?.coordinates;
    const center = coords ? [coords.lat, coords.lng] : [27.5, 93.5];
    state.map = L.map(el, { center, zoom: coords ? 9 : 5, zoomControl: true, layers: [L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' })] });
    if (coords) L.marker(center).addTo(state.map).bindPopup(`<strong>${state.currentLocation}</strong><br>Selected monitoring location`).openPopup();
    setTimeout(() => state.map.invalidateSize(), 200);
  }

  function setupHistoricalTable() {
    const searchInput = document.getElementById('historicalSearch'), stateFilter = document.getElementById('historicalState');
    const applyFilters = () => renderHistoricalTable({ search: searchInput?.value || '', state: stateFilter?.value || 'all' });
    if (searchInput) searchInput.addEventListener('input', Utils.debounce(applyFilters, 200));
    if (stateFilter) stateFilter.addEventListener('change', applyFilters);
    renderHistoricalTable({});
  }

  async function renderHistoricalTable(filters) {
    const tbody = document.getElementById('historicalTableBody'), empty = document.getElementById('historicalEmpty'); if (!tbody) return;
    const rows = await Services.getHistoricalEvents(filters);
    if (!rows.length) { tbody.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = rows.map(row => `<tr><td><strong>${row.state}</strong></td><td>${row.year2014.toLocaleString('en-IN')}</td><td>${row.year2017.toLocaleString('en-IN')}</td><td>${row.seasonalTotal.toLocaleString('en-IN')}</td><td>${row.coverage}</td><td style="color:var(--text-500);font-size:10px;">${row.source}</td></tr>`).join('');
  }

  // ============ NOTIFICATIONS ============
  async function loadNotifications() {
    state.notifications = await Services.getNotifications();
    renderNotificationBadge();
    renderNotificationPanel();
  }

  function renderNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    const unread = state.notifications.filter(n => !n.read).length;
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
  }

  function renderNotificationPanel() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    list.innerHTML = state.notifications.map(n => `
        <div class="notification-item ${n.read ? '' : 'unread'}">
          <div class="notification-icon">${n.icon}</div>
          <div class="notification-content">
            <div class="notification-title">${n.title}</div>
            <div class="notification-message">${n.message}</div>
            <div class="notification-time">${n.timestamp}</div>
          </div>
        </div>
      `).join('');
  }

  function markAllNotificationsRead() {
    state.notifications.forEach(n => n.read = true);
    renderNotificationBadge();
    renderNotificationPanel();
  }

  // ============ EVENT LISTENERS ============
  function setupEventListeners() {
    const notifBtn = document.getElementById('notificationBtn');
    const notifPanel = document.getElementById('notificationPanel');
    if (notifBtn && notifPanel) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifPanel.classList.toggle('active');
      });
      document.addEventListener('click', (e) => {
        if (!notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
          notifPanel.classList.remove('active');
        }
      });
    }

    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
      });
    }
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && notifPanel) notifPanel.classList.remove('active');
    });
  }

  // ============ PUBLIC API ============
  window.SahayakMonitoring = {
    retry,
    markAllNotificationsRead
  };

  document.addEventListener('DOMContentLoaded', () => {
    init();
    setupHistoricalTable();
  });
})();
