// js/simulator.js — Landslide Scenario Simulator Logic

(function() {
    'use strict';

    const state = {
        currentLocation: 'Tawang',
        zone: null,
        baseline: null,
        currentParams: {},
        simulatedResult: null,
        miniMap: null,
        miniMapZone: null,
        charts: { projection: null }
    };

    const SLIDER_CONFIG = {
    rainfall: {
        min: 0,
        max: 100,
        unit: ' mm/h',
        icon: 'cloud-rain',
        label: 'Rainfall'
    },

    rainProbability: {
        min: 0,
        max: 100,
        unit: '%',
        icon: 'cloud',
        label: 'Rain Probability'
    },

    soilMoisture: {
        min: 0,
        max: 100,
        unit: '%',
        icon: 'droplet',
        label: 'Soil Moisture'
    },

    slope: {
        min: 0,
        max: 60,
        unit: '°',
        icon: 'mountain',
        label: 'Slope'
    },

    windSpeed: {
        min: 0,
        max: 100,
        unit: ' km/h',
        icon: 'wind',
        label: 'Wind Speed'
    },

    windGusts: {
        min: 0,
        max: 150,
        unit: ' km/h',
        icon: 'wind',
        label: 'Wind Gusts'
    }
};
    // ============ INIT ============
    async function init() {
        setPageUser();
        renderSidebar();
        renderLocationSelector();
        await loadLocation(state.currentLocation);
        setupEventListeners();
    }

    // ============ SIDEBAR ============
    function renderSidebar() {
        const nav = document.getElementById('sidebarNav');
        if (!nav) return;

        const html = DEMO_DATA.sidebarSections.map(section => `
            <div class="sidebar-section">
                <div class="sidebar-section-label">${section.label}</div>
                ${section.items.map(item => `
                    <a href="${ROUTES[item.key] || '#'}" class="sidebar-item ${item.key === 'simulator' ? 'active' : ''}">
                        <span class="sidebar-icon">${getIcon(item.icon)}</span>
                        <span>${item.label}</span>
                    </a>
                `).join('')}
            </div>
        `).join('');
        nav.innerHTML = html;
    }

    // ============ LOCATION SELECTOR ============
    function renderLocationSelector() {
        const select = document.getElementById('locationSelect');
        if (!select) return;

        select.innerHTML = DEMO_DATA.riskZones
            .slice()
            .sort((a, b) => a.location.localeCompare(b.location))
            .map(z => `<option value="${z.location}" ${z.location === state.currentLocation ? 'selected' : ''}>${z.location}, ${z.state}</option>`)
            .join('');
    }

    // ============ LOAD LOCATION ============
   async function loadLocation(locationName) {
    const zone = DEMO_DATA.riskZones.find(z => z.location === locationName);
    if (!zone) return;

    state.zone = zone;
    state.currentLocation = locationName;

    const oldBaseline = zone.simulatorBaseline || {};

    // Get current live weather from Open-Meteo
    let liveWeather = [];

    try {
        liveWeather = await Services.getSevereWeatherForecast(locationName);
    } catch (error) {
        console.warn('Unable to load live weather for simulator:', error);
    }

    const weather = liveWeather?.[0] || {};

    // Open-Meteo soil moisture is normally 0–1.
    // Convert it to percentage for the simulator.
    let liveSoilMoisture = Number(weather.soilMoisture);

    if (Number.isFinite(liveSoilMoisture) && liveSoilMoisture <= 1) {
        liveSoilMoisture = liveSoilMoisture * 100;
    }

    state.baseline = {
        rainfall: Number.isFinite(Number(weather.rainfall))
            ? Number(weather.rainfall)
            : Number(zone.rainfall) || Number(oldBaseline.rainfall) || 0,

        rainProbability: Number.isFinite(Number(weather.precipitationProbability))
            ? Number(weather.precipitationProbability)
            : Number(zone.rainProbability) || Number(oldBaseline.rainProbability) || 0,

        soilMoisture: Number.isFinite(liveSoilMoisture)
            ? liveSoilMoisture
            : Number(zone.soilMoisture) || Number(oldBaseline.soilMoisture) || 0,

        slope: Number.isFinite(Number(zone.slope))
            ? Number(zone.slope)
            : Number(oldBaseline.slope) || 0,

        windSpeed: Number.isFinite(Number(weather.windSpeed))
            ? Number(weather.windSpeed)
            : Number(zone.windSpeed) || Number(oldBaseline.windSpeed) || 0,

        windGusts: Number.isFinite(Number(weather.windGusts))
            ? Number(weather.windGusts)
            : Number(zone.windGusts) || Number(oldBaseline.windGusts) || 0
    };

    state.currentParams = { ...state.baseline };

    updateLocationInfo();

    renderSliders();

    // IMPORTANT:
    // Calculate current risk from the live baseline,
    // instead of using DEMO_DATA's zone.risk.
    updateCurrentRisk();

    updateLivePreview();
    updatePresetScenarioCards();

    initMiniMap();

    hideResultSection();
}

    function updateLocationInfo() {
        const stateEl = document.getElementById('locationState');
        if (stateEl) stateEl.textContent = state.zone.state;
    }

    // ============ RENDER SLIDERS ============
    function renderSliders() {
        const container = document.getElementById('slidersContainer');
        if (!container) return;

        container.innerHTML = Object.entries(SLIDER_CONFIG).map(([key, cfg]) => {
            const value = state.currentParams[key];
            const baseline = state.baseline[key];
            return `
                <div class="slider-control">
                    <div class="slider-header">
                        <label class="slider-label" for="slider-${key}">
                            <span class="slider-label-icon">${getIcon(cfg.icon)}</span>
                            ${cfg.label}
                        </label>
                        <span class="slider-value" id="value-${key}">${value}${cfg.unit}</span>
                    </div>
                    <div class="slider-track-wrap">
                        <input type="range" class="slider-input" id="slider-${key}"
                               min="${cfg.min}" max="${cfg.max}" value="${value}"
                               data-key="${key}" data-unit="${cfg.unit}"
                               aria-label="${cfg.label}">
                    </div>
                    <div class="slider-range">
                        <span>${cfg.min}${cfg.unit}</span>
                        <span>${cfg.max}${cfg.unit}</span>
                    </div>
                    <div class="slider-baseline">Baseline: ${baseline}${cfg.unit}</div>
                </div>
            `;
        }).join('');

        // Attach listeners
        container.querySelectorAll('.slider-input').forEach(slider => {
            slider.addEventListener('input', handleSliderChange);
        });
    }

    function handleSliderChange(e) {
        const key = e.target.dataset.key;
        const unit = e.target.dataset.unit;
        const value = parseFloat(e.target.value);

        state.currentParams[key] = value;

        // Update display
        const valueEl = document.getElementById(`value-${key}`);
        if (valueEl) valueEl.textContent = `${value}${unit}`;

        // Live preview update
        updateLivePreview();
updatePresetScenarioCards();
    }

    // ============ CURRENT RISK ============
function updateCurrentRisk() {
    const scoreEl = document.getElementById('currentRiskScore');
    const levelEl = document.getElementById('currentRiskLevel');

    if (!scoreEl || !levelEl || !state.baseline) return;

    const rainfall = Number(state.baseline.rainfall) || 0;
    const rainProbability = Number(state.baseline.rainProbability) || 0;
    const soilMoisture = Number(state.baseline.soilMoisture) || 0;
    const slope = Number(state.baseline.slope) || 0;
    const windSpeed = Number(state.baseline.windSpeed) || 0;
    const windGusts = Number(state.baseline.windGusts) || 0;

    let risk = 0;

    risk += Math.min(30, rainfall * 3);
    risk += rainProbability * 0.20;
    risk += Math.min(10, Math.max(0, soilMoisture - 70) * 0.33);
    risk += Math.min(10, Math.max(0, slope - 30) * 0.33);
    risk += Math.min(10, windSpeed * 0.25);
    risk += Math.min(10, windGusts * 0.15);

    risk = Math.round(Math.max(0, Math.min(100, risk)));

    let level;

    if (risk >= 81) {
        level = 'WARNING';
    } else if (risk >= 61) {
        level = 'ALERT';
    } else if (risk >= 31) {
        level = 'WATCH';
    } else {
        level = 'SAFE';
    }

    scoreEl.textContent = risk;
    levelEl.textContent = level;
    levelEl.className =
        `risk-compare-level ${level.toLowerCase()}`;
        const presetScore = document.getElementById('presetCurrentScore');
const presetLevel = document.getElementById('presetCurrentLevel');

if (presetScore) {
    presetScore.textContent = `${risk}/100`;
}

if (presetLevel) {
    presetLevel.textContent = level;
    presetLevel.className =
        `scenario-preset-level ${level.toLowerCase()}`;
}
}
    // ============ LIVE PREVIEW ============
  function updateLivePreview() {
    const result = calculateSimulation(state.currentParams);

    const currentRisk =
        Number(document.getElementById('currentRiskScore')?.textContent) || 0;

    const currentLevel =
        document.getElementById('currentRiskLevel')?.textContent || 'SAFE';

    const isCurrentConditions =
        JSON.stringify(state.currentParams) ===
        JSON.stringify(state.baseline);

    if (isCurrentConditions) {
        result.simulatedRisk = currentRisk;
        result.simulatedLevel = currentLevel;
        result.delta = 0;
    }

    state.simulatedResult = result;

    const scoreEl = document.getElementById('livePreviewValue');
    const levelEl = document.getElementById('livePreviewLevel');
    const deltaEl = document.getElementById('riskTransitionDelta');

    if (scoreEl) {
        scoreEl.textContent = result.simulatedRisk;
        scoreEl.className =
            `live-preview-value level-${result.simulatedLevel.toLowerCase()}`;
    }

    if (levelEl) {
        levelEl.textContent = result.simulatedLevel;
        levelEl.className =
            `live-preview-level ${result.simulatedLevel.toLowerCase()}`;
    }

    // Update simulated card
    const simCard =
        document.querySelector('.risk-compare-card.simulated');

    if (simCard) {
        simCard.className =
            `risk-compare-card simulated level-${result.simulatedLevel.toLowerCase()}`;

        if (
            result.simulatedLevel === 'WARNING' ||
            result.simulatedLevel === 'CRITICAL'
        ) {
            simCard.classList.add('pulse-warning');
        } else {
            simCard.classList.remove('pulse-warning');
        }
    }

    const simScoreEl =
        document.getElementById('simulatedRiskScore');

    const simLevelEl =
        document.getElementById('simulatedRiskLevel');

    if (simScoreEl) {
        simScoreEl.textContent = result.simulatedRisk;
        simScoreEl.className =
            `risk-compare-score level-${result.simulatedLevel.toLowerCase()}`;
    }

    if (simLevelEl) {
        simLevelEl.textContent = result.simulatedLevel;
        simLevelEl.className =
            `risk-compare-level ${result.simulatedLevel.toLowerCase()}`;
    }

    // Delta relative to real current risk
    if (deltaEl) {
        const delta = result.simulatedRisk - currentRisk;
        const sign = delta > 0 ? '+' : '';

        deltaEl.textContent = `${sign}${delta} points`;

        deltaEl.className =
            'risk-transition-delta ' +
            (
                delta > 0
                    ? 'positive'
                    : delta < 0
                        ? 'negative'
                        : 'neutral'
            );
    }

    // Contributions in live preview
    updateLiveContributions(result.contributions);

    // Update mini map zone color
    updateMiniMapZone(
        result.simulatedRisk,
        result.simulatedLevel
    );
}
    function updateLiveContributions(contributions) {
        const container = document.getElementById('liveContributions');
        if (!container) return;

        const maxVal = 30;
        const labels = {
    rainfall: 'Rainfall',
    rainProbability: 'Rain Probability',
    soil: 'Soil Moisture',
    slope: 'Slope',
    windSpeed: 'Wind Speed',
    windGusts: 'Wind Gusts'
};
        container.innerHTML = Object.entries(contributions).map(([key, val]) => {
            const pct = Math.min(100, Math.abs(val) / maxVal * 100);
            return `
                <div class="live-contrib-row">
                    <div class="live-contrib-label">${labels[key]}</div>
                    <div class="live-contrib-track">
                        <div class="live-contrib-fill" style="width: ${pct}%"></div>
                    </div>
                    <div class="live-contrib-value">${val > 0 ? '+' : ''}${val}</div>
                </div>
            `;
        }).join('');
    }

    // ============ CALCULATE SIMULATION ============
    function calculateSimulation(params) {
    const baseline = state.baseline || {};
    const baselineRisk = Number.isFinite(Number(state.zone?.risk))
        ? Number(state.zone.risk)
        : 0;

    const safe = (value, fallback = 0) => {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    };

    const rainfall = safe(params.rainfall, baseline.rainfall);
    const rainProbability = safe(
        params.rainProbability,
        baseline.rainProbability
    );
    const soilMoisture = safe(
        params.soilMoisture,
        baseline.soilMoisture
    );
    const slope = safe(params.slope, baseline.slope);
    const windSpeed = safe(params.windSpeed, baseline.windSpeed);
    const windGusts = safe(params.windGusts, baseline.windGusts);

    /*
     * Transparent modeled-risk calculation.
     * This is a scenario risk index, not a validated probability.
     */

    const rainfallDelta =
        ((rainfall - safe(baseline.rainfall)) / 100) * 25;

    const rainProbabilityDelta =
        ((rainProbability - safe(baseline.rainProbability)) / 100) * 15;

    const soilDelta =
        ((soilMoisture - safe(baseline.soilMoisture)) / 100) * 15;

    const slopeDelta =
        ((slope - safe(baseline.slope)) / 60) * 15;

    const windSpeedDelta =
        ((windSpeed - safe(baseline.windSpeed)) / 100) * 10;

    const windGustsDelta =
        ((windGusts - safe(baseline.windGusts)) / 150) * 10;

    const totalDelta =
        rainfallDelta +
        rainProbabilityDelta +
        soilDelta +
        slopeDelta +
        windSpeedDelta +
        windGustsDelta;

    const simulatedRisk = Math.max(
        0,
        Math.min(
            100,
            Math.round(baselineRisk + totalDelta)
        )
    );

    const contributions = {
        rainfall: Math.round(rainfallDelta),
        rainProbability: Math.round(rainProbabilityDelta),
        soil: Math.round(soilDelta),
        slope: Math.round(slopeDelta),
        windSpeed: Math.round(windSpeedDelta),
        windGusts: Math.round(windGustsDelta)
    };

    const getLevel = (score) => {
        if (score >= 80) return 'WARNING';
        if (score >= 60) return 'ALERT';
        if (score >= 30) return 'WATCH';
        return 'SAFE';
    };

    return {
        simulatedRisk,
        simulatedLevel: getLevel(simulatedRisk),
        delta: Math.round(totalDelta),
        contributions
    };
}

    // ============ RUN SIMULATION ============
    async function runSimulation() {
    showLoading();

    try {
        const calculated = calculateSimulation(state.currentParams);

        const result = {
            delta: calculated.delta,

           baseline: {
    risk: Number(document.getElementById('currentRiskScore')?.textContent) || 0,
    level: document.getElementById('currentRiskLevel')?.textContent || 'SAFE'
},

            simulated: {
                risk: calculated.simulatedRisk,
                level: calculated.simulatedLevel
            },

            contributions: calculated.contributions,

            projection: [
                {
                    label: 'Current',
                    risk: Number(document.getElementById('currentRiskScore')?.textContent) || 0
                },
                {
                    label: 'Scenario',
                    risk: calculated.simulatedRisk
                }
            ]
        };

        state.simulatedResult = result;

        hideLoading();

        animateRiskScore(result.simulated.risk);
        renderResultSection(result);
        renderProjectionChart(result.projection);
        updateMiniMapZone(
            result.simulated.risk,
            result.simulated.level
        );

        showToast('Scenario analysis complete', 'success');

    } catch (err) {
        console.error('Simulation error:', err);
        hideLoading();
        showToast('Unable to run simulation', 'error');
    }
}

    function animateRiskScore(targetScore) {
        const scoreEl = document.getElementById('simulatedRiskScore');
        if (!scoreEl || Utils.prefersReducedMotion()) {
            if (scoreEl) scoreEl.textContent = targetScore;
            return;
        }

        const startScore = parseInt(scoreEl.textContent) || 0;
        const duration = 1000;
        const startTime = performance.now();

        const animate = (now) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            scoreEl.textContent = Math.round(startScore + (targetScore - startScore) * eased);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    // ============ RESULT SECTION ============
    function renderResultSection(result) {
        const container = document.getElementById('resultSection');
        if (!container) return;

        container.style.display = 'block';

        const delta = result.delta;
        const baselineLevel = result.baseline.level;
        const simulatedLevel = result.simulated.level;

        const driversHtml = Object.entries(result.contributions).map(([key, val]) => {
const labels = {
    rainfall: 'Rainfall',
    rainProbability: 'Rain Probability',
    soil: 'Soil Moisture',
    slope: 'Slope',
    windSpeed: 'Wind Speed',
    windGusts: 'Wind Gusts'
};
            const maxVal = 30;
            const pct = Math.min(100, Math.abs(val) / maxVal * 100);
            const cls = val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral';
            return `
                <div class="change-driver" style="--target-width: ${pct}%;">
                    <div class="change-driver-label">${labels[key]}</div>
                    <div class="change-driver-track">
                        <div class="change-driver-fill ${cls}"></div>
                    </div>
                    <div class="change-driver-value ${cls}">${val > 0 ? '+' : ''}${val}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="sim-result-section">
                <div class="sim-result-header">
                    <div class="sim-result-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        Scenario Result
                    </div>
                   
                </div>
                <div class="sim-result-body">
                    <div class="risk-change-summary">
                        <div class="risk-change-main">
                            <div class="risk-change-label">Risk Change</div>
                            <div class="risk-change-delta ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'}">
                                ${delta > 0 ? '+' : ''}${delta} points
                            </div>
                            <div class="risk-change-path">${result.baseline.risk} → ${result.simulated.risk}</div>
                        </div>
                        <div class="risk-change-levels">
                            <div class="risk-change-level-item">
                                <div class="risk-change-level-label">Before</div>
                                <span class="risk-change-level-badge ${baselineLevel.toLowerCase()}">${baselineLevel}</span>
                            </div>
                            <div class="risk-change-arrow">→</div>
                            <div class="risk-change-level-item">
                                <div class="risk-change-level-label">After</div>
                                <span class="risk-change-level-badge ${simulatedLevel.toLowerCase()}">${simulatedLevel}</span>
                            </div>
                        </div>
                    </div>

                    <div class="change-drivers-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                        Change Drivers
                    </div>
                    <div class="change-drivers-bars" id="changeDriversBars">${driversHtml}</div>
                </div>
            </div>
        `;

        // Animate bars
        setTimeout(() => {
            document.querySelectorAll('#changeDriversBars .change-driver').forEach((bar, i) => {
                setTimeout(() => bar.classList.add('revealed'), i * 100);
            });
        }, 100);
    }

    function hideResultSection() {
        const container = document.getElementById('resultSection');
        if (container) container.style.display = 'none';
    }

    // ============ PROJECTION CHART ============
    function renderProjectionChart(projection) {
        const canvas = document.getElementById('projectionChart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (state.charts.projection) state.charts.projection.destroy();

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, 'rgba(25, 184, 199, 0.25)');
        gradient.addColorStop(1, 'rgba(25, 184, 199, 0)');

        state.charts.projection = new Chart(ctx, {
            type: 'line',
            data: {
                labels: projection.map(p => p.label),
                datasets: [{
                    label: 'Projected Risk',
                    data: projection.map(p => p.risk),
                    borderColor: '#19B8C7',
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#19B8C7',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 1200, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0B1728',
                        titleColor: '#fff',
                        bodyColor: '#E5EAF2',
                        borderColor: '#19B8C7',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: { label: (ctx) => `Risk: ${ctx.parsed.y}/100` }
                    }
                },
                scales: {
                    y: {
                        min: 0, max: 100,
                        grid: { color: 'rgba(217, 224, 232, 0.5)', drawBorder: false },
                        ticks: { color: '#8A9BB5', font: { size: 11, family: 'Inter' } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#8A9BB5', font: { size: 11, family: 'Inter' } }
                    }
                }
            },
            plugins: [{
                id: 'thresholdLine',
                afterDraw: (chart) => {
                    const ctx = chart.ctx;
                    const yScale = chart.scales.y;
                    const y = yScale.getPixelForValue(80);
                    ctx.save();
                    ctx.strokeStyle = '#DC2626';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([6, 4]);
                    ctx.beginPath();
                    ctx.moveTo(chart.chartArea.left, y);
                    ctx.lineTo(chart.chartArea.right, y);
                    ctx.stroke();
                    ctx.fillStyle = '#DC2626';
                    ctx.font = '600 10px Inter';
                    ctx.textAlign = 'right';
                    ctx.fillText('Warning Threshold', chart.chartArea.right - 4, y - 6);
                    ctx.restore();
                }
            }]
        });
    }

    // ============ MINI MAP ============
        // ============ MINI MAP ============
    function initMiniMap() {
        if (typeof L === 'undefined' || !state.zone) return;

        if (state.miniMap) {
            state.miniMap.remove();
        }

        // 100% Free, NO API KEY required (OpenStreetMap)
        const osmTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        });

        state.miniMap = L.map('simMiniMap', {
            center: [state.zone.lat, state.zone.lng],
            zoom: 9,
            zoomControl: false,
            attributionControl: false,
            layers: [osmTiles] // Sirf osmTiles use karo, darkTiles hata do
        });

        // Risk zone circle
        const color = DEMO_DATA.riskLevels[state.zone.level.toLowerCase()]?.color || '#19B8C7';
        const radius = 10000 + (state.zone.risk / 100) * 15000;

        state.miniMapZone = L.circle([state.zone.lat, state.zone.lng], {
            radius: radius,
            color: color,
            weight: 1.5,
            fillColor: color,
            fillOpacity: 0.2
        }).addTo(state.miniMap);

        // Location marker
        const markerIcon = L.divIcon({
            className: '',
            html: `<div style="width: 24px; height: 24px; background: ${color}; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 10px;">${state.zone.risk}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        L.marker([state.zone.lat, state.zone.lng], { icon: markerIcon }).addTo(state.miniMap);
    }

    function updateMiniMapZone(risk, level) {
        if (!state.miniMapZone) return;

        const color = DEMO_DATA.riskLevels[level.toLowerCase()]?.color || '#19B8C7';
        state.miniMapZone.setStyle({
            color: color,
            fillColor: color,
            fillOpacity: 0.25
        });
    }

    // ============ SCENARIO PRESETS ============
    async function applyPreset(presetType) {
        const presets = await Services.getSimulationPresets();
        const preset = presets[presetType];
        if (!preset) return;

        const baseline = state.baseline;

        // Calculate new values based on multipliers
// Calculate new values based on multipliers
const newParams = {
    rainfall: Math.round(
        baseline.rainfall * preset.rainfallMultiplier
    ),

    rainProbability: Math.round(
        baseline.rainProbability * preset.rainProbabilityMultiplier
    ),

    soilMoisture: Math.round(
        baseline.soilMoisture * preset.soilMoistureMultiplier
    ),

    slope: Math.round(
        baseline.slope * preset.slopeMultiplier
    ),

    windSpeed: Math.round(
        baseline.windSpeed * preset.windSpeedMultiplier
    ),

    windGusts: Math.round(
        baseline.windGusts * preset.windGustsMultiplier
    )
};

        // Clamp to slider ranges
        Object.keys(newParams).forEach(key => {
            const cfg = SLIDER_CONFIG[key];
            newParams[key] = Math.max(cfg.min, Math.min(cfg.max, newParams[key]));
        });

        state.currentParams = newParams;

        // Update sliders
        Object.entries(newParams).forEach(([key, value]) => {
            const slider = document.getElementById(`slider-${key}`);
            const valueEl = document.getElementById(`value-${key}`);
            if (slider) slider.value = value;
            if (valueEl) valueEl.textContent = `${value}${SLIDER_CONFIG[key].unit}`;
        });

        updateLivePreview();
        showToast(`${preset.name} applied`, 'info');
    }
    function updatePresetScenarioCards() {
    if (!state.baseline) return;

    const moderatePreset = {
        rainfall: Math.max(10, state.baseline.rainfall * 1.4),
        rainProbability: Math.max(20, state.baseline.rainProbability * 1.3),
        soilMoisture: Math.max(30, state.baseline.soilMoisture * 1.2),
        slope: state.baseline.slope * 1.0,
        windSpeed: Math.max(20, state.baseline.windSpeed * 1.2),
        windGusts: Math.max(30, state.baseline.windGusts * 1.3)
    };

    const severePreset = {
        rainfall: Math.max(25, state.baseline.rainfall * 1.8),
        rainProbability: Math.max(50, state.baseline.rainProbability * 1.7),
        soilMoisture: Math.max(50, state.baseline.soilMoisture * 1.5),
        slope: state.baseline.slope * 1.1,
        windSpeed: Math.max(35, state.baseline.windSpeed * 1.5),
        windGusts: Math.max(50, state.baseline.windGusts * 1.7)
    };

    const moderate = calculateSimulation(moderatePreset);
    const severe = calculateSimulation(severePreset);

    const moderateScore = document.getElementById('presetModerateScore');
    const moderateLevel = document.getElementById('presetModerateLevel');

    const severeScore = document.getElementById('presetSevereScore');
    const severeLevel = document.getElementById('presetSevereLevel');

    if (moderateScore) {
        moderateScore.textContent = `${moderate.simulatedRisk}/100`;
    }

    if (moderateLevel) {
        moderateLevel.textContent = moderate.simulatedLevel;
        moderateLevel.className =
            `scenario-preset-level ${moderate.simulatedLevel.toLowerCase()}`;
    }

    if (severeScore) {
        severeScore.textContent = `${severe.simulatedRisk}/100`;
    }

    if (severeLevel) {
        severeLevel.textContent = severe.simulatedLevel;
        severeLevel.className =
            `scenario-preset-level ${severe.simulatedLevel.toLowerCase()}`;
    }
}

    function resetScenario() {
        state.currentParams = { ...state.baseline };

        // Update sliders
        Object.entries(state.baseline).forEach(([key, value]) => {
            const slider = document.getElementById(`slider-${key}`);
            const valueEl = document.getElementById(`value-${key}`);
            if (slider) slider.value = value;
            if (valueEl) valueEl.textContent = `${value}${SLIDER_CONFIG[key].unit}`;
        });

        updateLivePreview();
        hideResultSection();
        showToast('Scenario reset to current conditions', 'info');
    }

    // ============ UI HELPERS ============
    function showLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.add('active');
    }

    function hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;

        const iconSvg = type === 'success' 
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

        toast.className = `sim-toast ${type}`;
        toast.querySelector('.sim-toast-icon').innerHTML = iconSvg;
        toast.querySelector('.sim-toast-message').textContent = message;
        toast.classList.add('active');

        setTimeout(() => toast.classList.remove('active'), 3000);
    }

    // ============ EVENT LISTENERS ============
    function setupEventListeners() {
        // Location change
        const locationSelect = document.getElementById('locationSelect');
        if (locationSelect) {
            locationSelect.addEventListener('change', (e) => loadLocation(e.target.value));
        }

        // Run simulation
        const runBtn = document.getElementById('runSimulationBtn');
        if (runBtn) {
            runBtn.addEventListener('click', runSimulation);
        }

        // Reset
        const resetBtn = document.getElementById('resetScenarioBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetScenario);
        }

        // Scenario presets
        document.querySelectorAll('[data-preset]').forEach(btn => {
            btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
        });

        // Mobile sidebar
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
    }

    // ============ ICON HELPER ============
    function getIcon(name) {
        const icons = {
            'grid': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
            'map': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
            'chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
            'bell': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
            'clipboard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
            'check': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
            'cloud': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
            'mountain': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l4-8 4 4 4-10 6 14"/></svg>',
            'satellite': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>',
            'clock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
            'building': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/></svg>',
            'route': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
            'sliders': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
            'bar-chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
            'cpu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/></svg>',
            'users': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
            'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>',
            'cloud-rain': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',

'wind': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7a3 3 0 1 1-3 3"/></svg>',

'droplet': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'
        };
        return icons[name] || '';
    }

    // ============ EXPOSE PUBLIC API ============
    window.SahayakSimulator = {
        runSimulation,
        resetScenario,
        applyPreset
    };

    // ============ BOOT ============
    document.addEventListener('DOMContentLoaded', init);
})();