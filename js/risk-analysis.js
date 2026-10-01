// js/risk-analysis.js — Risk Analysis Page Logic

(function () {
    'use strict';

    const state = {
        currentLocation: 'Tawang',
        charts: { trend: null, rainfall: null },
        data: null
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
                    <a href="${ROUTES[item.key] || '#'}" class="sidebar-item ${item.key === 'riskAnalysis' ? 'active' : ''}">
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
        showLoading();
        try {
            const data = await Services.getRiskAnalysis(locationName);
            if (data.error) {
                showError(data.error);
                return;
            }
            state.data = data;
            state.currentLocation = locationName;
            renderAll();
        } catch (err) {
            showError('Risk analysis temporarily unavailable');
        }
    }

    function showLoading() {
        const main = document.getElementById('analysisContent');
        if (!main) return;
        main.innerHTML = `
            <div class="analysis-state">
                <div class="analysis-state-icon"><div class="loading-spinner"></div></div>
                <div class="analysis-state-title">Loading AI risk analysis...</div>
                <div class="analysis-state-sub">Fetching intelligence for selected location</div>
            </div>
        `;
    }

    function showError(message) {
        const main = document.getElementById('analysisContent');
        if (!main) return;
        main.innerHTML = `
            <div class="analysis-state">
                <div class="analysis-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div class="analysis-state-title">${message}</div>
                <div class="analysis-state-sub">Please try again or select a different location</div>
                <button class="btn btn-outline" onclick="window.SahayakAnalysis.retry()">Retry</button>
            </div>
        `;
    }

    // ============ RENDER ALL ============
    function renderAll() {
        const main = document.getElementById('analysisContent');
        if (!main) return;

        const d = state.data;
        const level = d.level.toLowerCase();

        // Update breadcrumb
        const breadcrumbLoc = document.getElementById('breadcrumbLocation');
        if (breadcrumbLoc) breadcrumbLoc.textContent = d.location;

        // Update page title badge
        const titleBadge = document.getElementById('titleBadge');
        if (titleBadge) titleBadge.textContent = `${d.location.toUpperCase()} · ${d.level}`;

        main.innerHTML = `
          ${renderRiskOverview(d, level)}
${renderSevereWeatherOutlook(d)}
${renderActionableWarning(d)}
<div class="analysis-grid">
                <div>
                    ${renderTrendChart(d)}
                    ${renderFactorSection(d)}
                    ${renderAIExplanation(d)}
                </div>
                <div>
                    ${renderEnvironmentalConditions(d)}
                    ${renderTerrainPanel(d)}
                    ${renderSatellitePanel(d)}
                </div>
            </div>
            <div class="analysis-grid-full">
                ${renderRainfallChart()}
                <div>
                    ${renderRiskHistoryTimeline(d)}
                    ${renderHistoricalContext(d)}
                </div>
            </div>
            ${renderInterpretation(d)}
            
            ${renderRiskSummary(d, level)}
        `;

        setTimeout(() => {
            initGauge(d);
            initTrendChart(d);
            initRainfallChart(d);
            animateFactorBars();
            animateTimeline();
        }, 50);
    }

    // ============ RISK OVERVIEW ============
    // ============ RISK OVERVIEW ============

    function renderRiskOverview(d, level) {

        const changeClass =
            d.riskChangeDir === 'up'
                ? 'up'
                : 'stable';

        const changeSymbol =
            d.riskChangeDir === 'up'
                ? '↑'
                : d.riskChangeDir === 'down'
                    ? '↓'
                    : '→';

        return `
        <section class="risk-overview" aria-label="Current risk overview">

            <div class="risk-gauge-wrap">

                ${renderGaugeSVG(d.risk, level)}

                <div class="gauge-labels">
                    <span class="gauge-label safe">SAFE</span>
                    <span class="gauge-label watch">WATCH</span>
                    <span class="gauge-label alert">ALERT</span>
                    <span class="gauge-label warning">WARNING</span>
                </div>

            </div>


            <div class="risk-stats">

               <!-- SEVERE WEATHER RISK -->
<div class="risk-stat level-${level}">

    <div class="risk-stat-label">
        Severe Weather Risk
    </div>

    <div class="risk-stat-value">
        ${Number(d.risk).toFixed(0)} / 100
    </div>

    <div class="risk-stat-sub">
        SAHAYAK risk index
    </div>

</div>

                <!-- RISK LEVEL -->
                <div class="risk-stat level-${level}">

                    <div class="risk-stat-label">
                        Risk Level
                    </div>

                    <div
                        class="risk-stat-value"
                        style="
                            color: var(
                                --${level === 'safe'
                ? 'safe'
                : level === 'watch'
                    ? 'watch'
                    : level === 'alert'
                        ? 'alert'
                        : 'warning'
            }
                            );
                        "
                    >
                        ${d.level}
                    </div>

                    <div class="risk-stat-sub">
                        Current risk classification
                    </div>

                </div>




<!-- FORECAST STATUS -->
<div class="risk-stat">

    <div class="risk-stat-label">
        Forecast Status
    </div>

    <div
        class="risk-stat-value"
        style="font-size: var(--fs-lg);"
    >
        ${d.severeWeatherForecastLive ? 'LIVE' : '—'}
    </div>

    <div class="risk-stat-sub">
        ${d.severeWeatherForecastLive
            ? 'Open-Meteo · next 6 hours'
            : 'forecast unavailable'
        }
    </div>

</div>
       </div>

        </section>
    `;
    }

    // ============ GAUGE SVG ============
    function renderGaugeSVG(score, level) {
        const arcLength = Math.PI * 90;
        const offset = arcLength - (arcLength * score / 100);
        const color = DEMO_DATA.riskLevels[level]?.color || '#19B8C7';

        return `
            <svg class="risk-gauge" viewBox="0 0 220 140" aria-label="Risk score ${score} out of 100">
                <defs>
                    <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="#16A34A"/>
                        <stop offset="33%" stop-color="#EAB308"/>
                        <stop offset="66%" stop-color="#F97316"/>
                        <stop offset="100%" stop-color="#DC2626"/>
                    </linearGradient>
                    <filter id="gaugeShadow">
                        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="${color}" flood-opacity="0.3"/>
                    </filter>
                </defs>
                <path class="gauge-bg" d="M 20 110 A 90 90 0 0 1 200 110"/>
                <path class="gauge-fill" id="gaugeFill"
                      d="M 20 110 A 90 90 0 0 1 200 110"
                      stroke="url(#gaugeGrad)"
                      stroke-dasharray="${arcLength}"
                      stroke-dashoffset="${arcLength}"
                      data-target-offset="${offset}"
                      filter="url(#gaugeShadow)"/>
                <g class="gauge-ticks">
                    <text x="20" y="130" text-anchor="middle">0</text>
                    <text x="58" y="55" text-anchor="middle">25</text>
                    <text x="110" y="25" text-anchor="middle">50</text>
                    <text x="162" y="55" text-anchor="middle">75</text>
                    <text x="200" y="130" text-anchor="middle">100</text>
                </g>
                <text class="gauge-score" x="110" y="100" id="gaugeScoreText">0</text>
                <text class="gauge-max" x="110" y="118">/ 100</text>
                <text class="gauge-level" x="110" y="138" fill="${color}" id="gaugeLevelText">${DEMO_DATA.riskLevels[level]?.label || level.toUpperCase()}</text>
            </svg>
        `;
    }

    function initGauge(d) {
        const fill = document.getElementById('gaugeFill');
        const scoreText = document.getElementById('gaugeScoreText');
        if (!fill || !scoreText) return;

        const targetOffset = parseFloat(fill.dataset.targetOffset);
        const arcLength = Math.PI * 90;

        if (Utils.prefersReducedMotion()) {
            fill.setAttribute('stroke-dashoffset', targetOffset);
            scoreText.textContent = d.risk;
            return;
        }

        const duration = 1500;
        const start = performance.now();
        const animate = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const currentOffset = arcLength - (arcLength - targetOffset) * eased;
            fill.setAttribute('stroke-dashoffset', currentOffset);
            scoreText.textContent = Math.round(d.risk * eased);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    // ============ TREND CHART ============
    function renderTrendChart(d) {
    const isLive =
    Array.isArray(d.severeWeatherForecast) &&
    d.severeWeatherForecast.length > 0;
    return `
        <section class="analysis-card" aria-label="Severe Weather Forecast">
            <div class="analysis-card-header">
                <div class="analysis-card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    Severe Weather Forecast
                </div>
                <span class="analysis-card-badge">${isLive ? 'LIVE' : 'DEMO'}</span>
            </div>
            <div class="analysis-card-body">
                <div class="risk-trend-wrap"><canvas id="trendChart"></canvas></div>
                <div class="chart-footer">    Next 6 hours · Severe Weather Risk Index
</div>
            </div>
        </section>
    `;
}

    function initTrendChart(d) {

    const canvas = document.getElementById('trendChart');

    if (!canvas || typeof Chart === 'undefined') return;

    const forecast = d.severeWeatherForecast || [];

    if (!forecast.length) return;

    const labels = forecast.map((item, index) => {
        if (index === 0) return 'NOW';
        return `+${index}h`;
    });

    const data = forecast.map(item => {

        const rain = Number(item.rainfall || 0);
        const probability =
            Number(item.precipitationProbability || 0);
        const humidity = Number(item.humidity || 0);
        const cloud = Number(item.cloudCover || 0);
        const wind = Number(item.windSpeed || 0);
        const gust = Number(item.windGusts || 0);
        const weatherCode =
            Number(item.weatherCode ?? -1);

        let score = 0;

        // Rainfall intensity
        score += Math.min(30, rain * 3);

        // Probability of precipitation
        score += probability * 0.20;

        // High humidity
        score += Math.min(
            10,
            Math.max(0, humidity - 70) * 0.33
        );

        // Cloud cover
        score += cloud * 0.10;

        // Wind speed
        score += Math.min(10, wind * 0.25);

        // Wind gusts
        score += Math.min(10, gust * 0.15);

        // WMO thunderstorm codes
        if ([95, 96, 99].includes(weatherCode)) {
            score += 10;
        }

        return Math.round(
            Math.max(0, Math.min(100, score))
        );
    });

    if (state.charts.trend) {
        state.charts.trend.destroy();
    }

    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(
        0,
        0,
        0,
        260
    );

    gradient.addColorStop(
        0,
        'rgba(25, 184, 199, 0.25)'
    );

    gradient.addColorStop(
        1,
        'rgba(25, 184, 199, 0)'
    );

    state.charts.trend = new Chart(ctx, {

        type: 'line',

        data: {

            labels: labels,

            datasets: [{

                label: 'Severe Weather Risk',

                data: data,

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

            animation: {
                duration: 1200,
                easing: 'easeOutQuart'
            },

            plugins: {

                legend: {
                    display: false
                },

                tooltip: {

                    backgroundColor: '#0B1728',

                    titleColor: '#fff',

                    bodyColor: '#E5EAF2',

                    borderColor: '#19B8C7',

                    borderWidth: 1,

                    padding: 12,

                    cornerRadius: 8,

                    callbacks: {

                        label: (ctx) =>
                            `Risk Index: ${ctx.parsed.y}/100`

                    }

                }

            },

            scales: {

                y: {

                    min: 0,

                    max: 100,

                    title: {

                        display: true,

                        text: 'Risk Index'

                    },

                    grid: {
                        color: 'rgba(217, 224, 232, 0.5)',
                        drawBorder: false
                    },

                    ticks: {
                        color: '#8A9BB5',
                        font: {
                            size: 11,
                            family: 'Inter'
                        }
                    }

                },

                x: {

                    grid: {
                        display: false
                    },

                    ticks: {
                        color: '#8A9BB5',
                        font: {
                            size: 11,
                            family: 'Inter'
                        }
                    }

                }

            }

        }

    });
}

    // ============ FACTOR SECTION ============
    function renderFactorSection(d) {

    const forecast = d.severeWeatherForecast || [];

    if (!forecast.length) {
        return `
            <section class="factor-section" aria-label="Forecast drivers">
                <h2 class="factor-section-title">Forecast Drivers</h2>
                <p class="factor-section-subtitle">
                    Weather forecast data is currently unavailable.
                </p>
            </section>
        `;
    }

    const nextHours = forecast.slice(0, 6);

    const maxRainfall = Math.max(
        ...nextHours.map(item => Number(item.rainfall || 0))
    );

    const maxProbability = Math.max(
        ...nextHours.map(
            item => Number(item.precipitationProbability || 0)
        )
    );

    const maxCloud = Math.max(
        ...nextHours.map(item => Number(item.cloudCover || 0))
    );

    const maxHumidity = Math.max(
        ...nextHours.map(item => Number(item.humidity || 0))
    );

    const maxWindGust = Math.max(
        ...nextHours.map(item => Number(item.windGusts || 0))
    );

    const hasThunderstorm = nextHours.some(item =>
        [95, 96, 99].includes(Number(item.weatherCode))
    );

    const drivers = [
        {
            label: 'Rainfall intensity',
            value: maxRainfall,
            unit: 'mm/h',
            max: 10
        },
        {
            label: 'Rain probability',
            value: maxProbability,
            unit: '%',
            max: 100
        },
        {
            label: 'Cloud cover',
            value: maxCloud,
            unit: '%',
            max: 100
        },
        {
            label: 'Humidity',
            value: maxHumidity,
            unit: '%',
            max: 100
        },
        {
            label: 'Maximum wind gust',
            value: maxWindGust,
            unit: 'km/h',
            max: 80
        }
    ];

    const barsHtml = drivers.map(driver => {

        const pct = Math.min(
            100,
            (driver.value / driver.max) * 100
        );

        const tier =
            pct >= 75
                ? 'tier-critical'
                : pct >= 50
                    ? 'tier-high'
                    : pct >= 25
                        ? 'tier-mid'
                        : 'tier-low';

        return `
            <div class="factor-bar" style="--target-width: ${pct}%">

                <div class="factor-bar-label">
                    ${driver.label}
                </div>

                <div class="factor-bar-track">
                    <div class="factor-bar-fill ${tier}"></div>
                </div>

                <div class="factor-bar-value">
                    ${driver.value.toFixed(1)} ${driver.unit}
                </div>

            </div>
        `;
    }).join('');

    return `
        <section class="factor-section" aria-label="Forecast drivers">

            <h2 class="factor-section-title">
                What is driving the forecast?
            </h2>

            <p class="factor-section-subtitle">
                Key weather conditions observed in the next 6 hours
            </p>

            <div class="factor-bars" id="factorBars">
                ${barsHtml}
            </div>

            <div class="factor-section-footer">
                Based on live Open-Meteo forecast inputs
                ${hasThunderstorm
                    ? ' · Thunderstorm conditions detected in the forecast window'
                    : ''
                }
            </div>

        </section>
    `;
}

    function animateFactorBars() {
        const bars = document.querySelectorAll('#factorBars .factor-bar');
        if (!bars.length) return;

        if (Utils.prefersReducedMotion()) {
            bars.forEach(b => b.classList.add('revealed'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const allBars = entry.target.querySelectorAll('.factor-bar');
                    allBars.forEach((bar, i) => setTimeout(() => bar.classList.add('revealed'), i * 120));
                    observer.disconnect();
                }
            });
        }, { threshold: 0.2 });

        const container = document.getElementById('factorBars');
        if (container) observer.observe(container);
    }

    // ============ AI EXPLANATION ============
function renderAIExplanation(d) {
    const factors = Array.isArray(d.modelFactors)
        ? d.modelFactors
        : [];

    const factorRows = factors.length > 0
        ? factors.map(factor => `
            <div class="ai-factor-row">
                <div class="ai-factor-info">
                    <span class="ai-factor-name">
                        ${factor.feature}
                    </span>
                    <span class="ai-factor-value">
                        ${Number(factor.contribution).toFixed(2)}
                    </span>
                </div>
                <div class="ai-factor-bar">
                    <div
                        class="ai-factor-fill"
                        style="width: ${Math.min(
                            Math.abs(Number(factor.contribution)),
                            100
                        )}%">
                    </div>
                </div>
            </div>
        `).join('')
        : `
            <div class="ai-no-factors">
                Model factor details are currently unavailable.
            </div>
        `;

    return `
        <section class="analysis-card" aria-label="AI explanation">

            <div class="analysis-card-header">
                <div class="analysis-card-title">
                    AI Explanation
                </div>

                <span class="analysis-card-badge">
                    ${d.modelConnected ? 'LIVE' : 'DEMO'}
                </span>
            </div>

            <div class="analysis-card-body">

                <p class="ai-explanation-text">
                    ${generateExplanation(d)}
                </p>

                <div class="ai-factors-section">

                    <div class="ai-factors-title">
    Top Model Risk Factors · Contribution Score
</div>

<div class="ai-factors-subtitle">
    Higher values indicate stronger influence on the model's current assessment.
</div>

                    <div class="ai-factors-list">
                        ${factorRows}
                    </div>

                </div>

            </div>

        </section>`;
}

function generateExplanation(d) {
    const level = String(d.level || '').toUpperCase();
    const score = Number(d.risk ?? d.modelRiskScore ?? 0);

    const factors = Array.isArray(d.modelFactors)
        ? d.modelFactors
        : [];

    const topFactors = factors
        .slice()
        .sort(
            (a, b) =>
                Math.abs(Number(b.contribution || 0)) -
                Math.abs(Number(a.contribution || 0))
        )
        .slice(0, 3);

    const factorText = topFactors.length > 0
        ? topFactors
            .map(f => String(f.feature || 'environmental factor'))
            .join(', ')
        : 'environmental conditions';

    if (level === 'CRITICAL') {
        return `The AI risk model currently assigns a ${score}/100 CRITICAL risk index. The main model factors contributing to this assessment are ${factorText}. These factors indicate significantly elevated hazard conditions for this location and require close monitoring and timely assessment.`;
    }

    if (level === 'HIGH') {
        return `The AI risk model currently assigns a ${score}/100 HIGH risk index. The main model factors contributing to this assessment are ${factorText}. These conditions indicate elevated hazard risk and should be monitored closely for further escalation.`;
    }

    if (level === 'WARNING') {
        return `The risk has reached the WARNING range with a ${score}/100 risk index. The model identifies ${factorText} among the main contributing factors, indicating significantly elevated hazard conditions.`;
    }

    if (level === 'ALERT') {
        return `The risk is currently at ALERT level with a ${score}/100 risk index. The model identifies ${factorText} among the main contributing factors. Continued monitoring is recommended for possible escalation.`;
    }

    if (level === 'WATCH') {
        return `The risk is currently in the WATCH range with a ${score}/100 risk index. The model identifies ${factorText} among the main contributing factors. Conditions should continue to be monitored for changes.`;
    }

    return `The AI risk model currently assigns a ${score}/100 SAFE risk index. The model does not currently indicate significantly elevated hazard conditions for this location.`;
}

    function showFullExplanation() {
        const d = state.data;
        const modal = document.getElementById('explanationModal');
        if (!modal) return;

        const factorsHtml = d.factors.map(f => `
            <div style="display: flex; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--border);">
                <span style="color: var(--text-700); font-size: var(--fs-sm);">${f.label}</span>
                <span style="font-weight: 700; color: var(--teal); font-family: 'SF Mono', monospace;">+${f.value}</span>
            </div>
        `).join('');

        document.getElementById('explanationModalBody').innerHTML = `
            <div style="margin-bottom: var(--space-4);">
                <div style="font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.1em; color: var(--text-500); margin-bottom: var(--space-2);">LOCATION</div>
                <div style="font-size: var(--fs-lg); font-weight: 700; color: var(--text-900);">${d.location}, ${d.state}</div>
            </div>
            <div style="margin-bottom: var(--space-4);">
                <div style="font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.1em; color: var(--text-500); margin-bottom: var(--space-2);">CURRENT RISK</div>
                <div style="display: flex; align-items: baseline; gap: var(--space-2);">
                    <span style="font-size: 2rem; font-weight: 800; color: var(--text-900);">${d.risk}</span>
                    <span style="color: var(--text-400);">/ 100</span>
                    <span style="padding: 3px 10px; background: var(--${d.level.toLowerCase() === 'warning' ? 'warning' : d.level.toLowerCase() === 'alert' ? 'alert' : d.level.toLowerCase() === 'watch' ? 'watch' : 'safe'}-bg); color: var(--${d.level.toLowerCase() === 'warning' ? 'warning' : d.level.toLowerCase() === 'alert' ? 'alert' : d.level.toLowerCase() === 'watch' ? 'watch' : 'safe'}); border-radius: var(--radius-sm); font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.1em;">${d.level}</span>
                </div>
            </div>
            <div style="margin-bottom: var(--space-4);">
                <div style="font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.1em; color: var(--text-500); margin-bottom: var(--space-2);">DETAILED EXPLANATION</div>
                <p style="font-size: var(--fs-sm); color: var(--text-700); line-height: 1.7;">${generateExplanation(d)}</p>
            </div>
            <div style="margin-bottom: var(--space-4);">
                <div style="font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.1em; color: var(--text-500); margin-bottom: var(--space-2);">FACTOR CONTRIBUTIONS</div>
                ${factorsHtml}
            </div>
            <div style="padding: var(--space-3); background: var(--watch-bg); border: 1px solid rgba(234, 179, 8, 0.2); border-radius: var(--radius-md); font-size: var(--fs-xs); color: var(--text-700);">
                <strong>Note:</strong> This is an illustrative demonstration. Explanations are synthetic and do not represent validated model outputs.
            </div>
        `;
        modal.classList.add('active');
    }

    // ============ ENVIRONMENTAL CONDITIONS ============
function renderEnvironmentalConditions(d) {

    const forecast = d.severeWeatherForecast || [];
    const current = forecast[0] || {};

    const rainfall = Number(current.rainfall || 0);
    const humidity = Number(current.humidity || 0);
    const cloudCover = Number(current.cloudCover || 0);
    const precipitationProbability =
        Number(current.precipitationProbability || 0);
    const windSpeed = Number(current.windSpeed || 0);
    const windGusts = Number(current.windGusts || 0);
    const temperature = Number(current.temperature || 0);

    const soilMoistureRaw = Number(current.soilMoisture || 0);

    // Open-Meteo soil moisture is a volumetric fraction.
    const soilMoisture = soilMoistureRaw <= 1
        ? soilMoistureRaw * 100
        : soilMoistureRaw;

    const cards = [

        {
            icon: 'cloud-rain',
            value: `${rainfall.toFixed(1)} mm/h`,
            label: 'Current rainfall',
            status: rainfall > 10 ? 'above' : 'normal',
            statusLabel: 'LIVE'
        },

        {
            icon: 'droplet',
            value: `${soilMoisture.toFixed(1)}%`,
            label: 'Soil moisture',
            status: soilMoisture > 75 ? 'high' : 'normal',
            statusLabel: 'LIVE'
        },

        {
            icon: 'cloud',
            value: `${cloudCover.toFixed(0)}%`,
            label: 'Cloud cover',
            status: cloudCover > 80 ? 'high' : 'normal',
            statusLabel: 'LIVE'
        },

        {
            icon: 'cloud-rain',
            value: `${precipitationProbability.toFixed(0)}%`,
            label: 'Rain probability',
            status: precipitationProbability > 70 ? 'above' : 'normal',
            statusLabel: 'LIVE'
        },

        {
            icon: 'wind',
            value: `${windSpeed.toFixed(1)} km/h`,
            label: 'Wind speed',
            status: windSpeed > 40 ? 'above' : 'normal',
            statusLabel: 'LIVE'
        },

        {
            icon: 'wind',
            value: `${windGusts.toFixed(1)} km/h`,
            label: 'Wind gusts',
            status: windGusts > 60 ? 'above' : 'normal',
            statusLabel: 'LIVE'
        },

        {
            icon: 'thermometer',
            value: `${temperature.toFixed(1)} °C`,
            label: 'Temperature',
            status: 'normal',
            statusLabel: 'LIVE'
        },

        {
            icon: 'clock',
            value: current.hour || '--',
            label: 'Forecast time',
            status: 'normal',
            statusLabel: 'LIVE'
        }

    ];

    const html = cards.map(c => `
        <div class="env-condition">

            <div class="env-condition-header">

                <div class="env-condition-icon">
                    ${getIcon(c.icon)}
                </div>

                <span class="env-condition-status ${c.status}">
                    ${c.statusLabel}
                </span>

            </div>

            <div class="env-condition-value">
                ${c.value}
            </div>

            <div class="env-condition-label">
                ${c.label}
            </div>

        </div>
    `).join('');

    return `
        <section class="analysis-card" aria-label="Current weather conditions">

            <div class="analysis-card-header">

                <div class="analysis-card-title">

                    <svg viewBox="0 0 24 24"
                         fill="none"
                         stroke="currentColor"
                         stroke-width="2"
                         stroke-linecap="round"
                         stroke-linejoin="round">

                        <path d="M3 3v18h18"/>
                        <path d="M18 17V9"/>
                        <path d="M13 17V5"/>
                        <path d="M8 17v-3"/>

                    </svg>

                    Current Weather Conditions

                </div>

                <span class="analysis-card-badge">
                    ${forecast.length > 0 ? 'LIVE' : 'UNAVAILABLE'}
                </span>

            </div>

            <div class="analysis-card-body">

                <div class="env-conditions-grid">
                    ${html}
                </div>

            </div>

        </section>
    `;
}
    // ============ TERRAIN PANEL ============
    function renderTerrainPanel(d) {
    const items = [
        {
            label: 'Slope',
            value: `${d.slope ?? 'N/A'}°`,
            indicator: d.slope > 35
                ? 'high'
                : d.slope > 25
                    ? 'moderate'
                    : 'low',
            indicatorLabel: d.slope > 35
                ? 'Steep'
                : d.slope > 25
                    ? 'Moderate'
                    : 'Gentle'
        },
        {
            label: 'Elevation',
            value: d.elevation != null
                ? `${Utils.formatNumber(d.elevation)} m`
                : 'N/A',
            indicator: d.elevation > 1800
                ? 'elevated'
                : 'low',
            indicatorLabel: d.elevation > 1800
                ? 'Elevated'
                : 'Normal'
        }
    ];

    const html = items.map(i => `
        <div class="terrain-item">
            <div class="terrain-item-label">${i.label}</div>
            <div class="terrain-item-value">${i.value}</div>
            <span class="terrain-item-indicator ${i.indicator}">
                ${i.indicatorLabel}
            </span>
        </div>
    `).join('');

    return `
        <section class="analysis-card" aria-label="Terrain context">
            <div class="analysis-card-header">
                <div class="analysis-card-title">
                    <svg viewBox="0 0 24 24" fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round">
                        <path d="M3 20l4-8 4 4 4-10 6 14"/>
                    </svg>
                    Terrain Context
                </div>
            </div>

            <div class="analysis-card-body">

                <div class="terrain-grid">
                    ${html}
                </div>

                <p class="terrain-context-note">
                    Topographic conditions are used as supporting context
                    for rainfall runoff and flash-flood risk.
                </p>

            </div>
        </section>
    `;
}

    // ============ SATELLITE PANEL ============
    function renderSatellitePanel(d) {
        const indicators = d.satelliteIndicators || {};
        const items = Object.values(indicators).map(ind => `
            <div class="satellite-indicator status-${ind.status}">
                <div class="satellite-indicator-label">${ind.label}</div>
                <div class="satellite-indicator-value">${ind.value}</div>
                <div class="satellite-indicator-status ${ind.status}">${ind.status}</div>
            </div>
        `).join('');

        return `
            <section class="analysis-card" aria-label="Satellite intelligence">
                <div class="analysis-card-header">
                    <div class="analysis-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></svg>
                        Satellite Intelligence
                    </div>
                </div>
                <div class="analysis-card-body">
                    <div class="satellite-grid">${items}</div>
                    <div style="font-size: 10px; color: var(--text-400); font-style: italic; margin-bottom: var(--space-3); text-align: center;"></div>
                    <a href="${ROUTES.satellite}" class="btn btn-outline btn-block">Open Satellite Monitor →</a>
                </div>
            </section>
        `;
    }

    // ============ RAINFALL CHART ============
    function renderRainfallChart() {
        return `
            <section class="analysis-card" aria-label="Rainfall vs risk chart">
                <div class="analysis-card-header">
                    <div class="analysis-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>
                        Rainfall vs Risk
                    </div>
                    <span class="analysis-card-badge">LIVE</span>
                </div>
                <div class="analysis-card-body">
                    <div class="dual-chart-wrap"><canvas id="rainfallChart"></canvas></div>
                    <div class="chart-footer"></div>
                </div>
            </section>
        `;
    }

    function initRainfallChart(d) {
    const canvas = document.getElementById('rainfallChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const forecast = d.severeWeatherForecast || [];

    if (!forecast.length) {
        console.warn('No severe weather forecast data available.');
        return;
    }

    const labels = forecast.map((item, index) => {
        if (index === 0) return 'NOW';
        return `+${index}h`;
    });

    const rainfall = forecast.map(item =>
        Number(item.rainfall || 0)
    );

    // Transparent prototype risk index using REAL forecast inputs.
    const risk = forecast.map(item => {

        const rain = Number(item.rainfall || 0);
        const probability =
            Number(item.precipitationProbability || 0);
        const humidity =
            Number(item.humidity || 0);
        const cloud =
            Number(item.cloudCover || 0);
        const wind =
            Number(item.windSpeed || 0);
        const gust =
            Number(item.windGusts || 0);
        const weatherCode =
            Number(item.weatherCode ?? -1);

        let score = 0;

        // Rainfall intensity: up to 30 points
        score += Math.min(30, rain * 3);

        // Probability of precipitation: up to 20 points
        score += probability * 0.20;

        // Humidity: up to 10 points
        score += Math.min(10, Math.max(0, humidity - 70) * 0.33);

        // Cloud cover: up to 10 points
        score += cloud * 0.10;

        // Wind speed: up to 10 points
        score += Math.min(10, wind * 0.25);

        // Wind gusts: up to 10 points
        score += Math.min(10, gust * 0.15);

        // Weather code contribution
        // WMO thunderstorm codes: 95, 96, 99
        if ([95, 96, 99].includes(weatherCode)) {
            score += 10;
        }

        return Math.round(
            Math.max(0, Math.min(100, score))
        );
    });

    if (state.charts.rainfall) {
        state.charts.rainfall.destroy();
    }

    const ctx = canvas.getContext('2d');

    state.charts.rainfall = new Chart(ctx, {
        type: 'line',

        data: {
            labels: labels,

            datasets: [
                {
                    label: 'Rainfall (mm)',
                    data: rainfall,
                    borderColor: '#0F9D8A',
                    backgroundColor: 'rgba(15, 157, 138, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y',
                    pointBackgroundColor: '#0F9D8A',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                },

                {
                    label: 'Severe Weather Risk',
                    data: risk,
                    borderColor: '#F97316',
                    backgroundColor: 'rgba(249, 115, 22, 0.08)',
                    borderWidth: 2,
                    borderDash: [5, 3],
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1',
                    pointBackgroundColor: '#F97316',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 1200 },

            interaction: {
                mode: 'index',
                intersect: false
            },

            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#6B7280',
                        font: {
                            size: 11,
                            family: 'Inter'
                        },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 16
                    }
                },

                tooltip: {
                    backgroundColor: '#0B1728',
                    titleColor: '#fff',
                    bodyColor: '#E5EAF2',
                    borderColor: '#19B8C7',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8
                }
            },

            scales: {
                y: {
                    type: 'linear',
                    position: 'left',

                    title: {
                        display: true,
                        text: 'Rainfall (mm)',
                        color: '#0F9D8A',
                        font: {
                            size: 10,
                            weight: '600'
                        }
                    },

                    grid: {
                        color: 'rgba(217, 224, 232, 0.5)'
                    },

                    ticks: {
                        color: '#8A9BB5',
                        font: {
                            size: 10
                        }
                    }
                },

                y1: {
                    type: 'linear',
                    position: 'right',
                    min: 0,
                    max: 100,

                    title: {
                        display: true,
                        text: 'Severe Weather Risk',
                        color: '#F97316',
                        font: {
                            size: 10,
                            weight: '600'
                        }
                    },

                    grid: {
                        drawOnChartArea: false
                    },

                    ticks: {
                        color: '#8A9BB5',
                        font: {
                            size: 10
                        }
                    }
                },

                x: {
                    grid: {
                        display: false
                    },

                    ticks: {
                        color: '#8A9BB5',
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

    // ============ RISK HISTORY TIMELINE ============
    function renderRiskHistoryTimeline(d) {
        const events = d.riskHistoryEvents || [];
        const html = events.map(e => `
            <div class="timeline-event level-${e.level}">
                <div class="timeline-dot"></div>
                <div class="timeline-time">${e.time}</div>
                <div class="timeline-content">
                    <div><div class="timeline-event-text">${e.event}</div></div>
                    <div style="display: flex; align-items: center; gap: var(--space-2);">
                        <span class="timeline-level ${e.level}">${DEMO_DATA.riskLevels[e.level]?.label || e.level.toUpperCase()}</span>
                        <span class="timeline-score">${e.score}</span>
                    </div>
                </div>
            </div>
        `).join('');

        return `
            <section class="analysis-card" aria-label="Risk history timeline">
                <div class="analysis-card-header">
                    <div class="analysis-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Risk History
                    </div>
                </div>
                <div class="analysis-card-body">
                    <div class="risk-timeline" id="riskTimeline">${html}</div>
                </div>
            </section>
        `;
    }

    function animateTimeline() {
        const events = document.querySelectorAll('#riskTimeline .timeline-event');
        if (!events.length) return;

        if (Utils.prefersReducedMotion()) {
            events.forEach(e => e.classList.add('revealed'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const allEvents = entry.target.querySelectorAll('.timeline-event');
                    allEvents.forEach((ev, i) => setTimeout(() => ev.classList.add('revealed'), i * 150));
                    observer.disconnect();
                }
            });
        }, { threshold: 0.2 });

        const timeline = document.getElementById('riskTimeline');
        if (timeline) observer.observe(timeline);
    }

    // ============ HISTORICAL CONTEXT ============
    function renderHistoricalContext(d) {
        const events = d.historicalEventsList || [];
        const count = d.historical || events.length;

        const yearsHtml = events.map(e => `
            <div class="historical-year">
                <span class="mag-dot ${e.magnitude}"></span>
                <span>${e.year}</span>
                <span style="color: var(--text-400); font-size: 10px;">${e.month || ''}</span>
            </div>
        `).join('');

        return `
            <section class="analysis-card" aria-label="Historical context">
                <div class="analysis-card-header">
                    <div class="analysis-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
                        Historical Landslide Context
                    </div>
                </div>
                <div class="analysis-card-body">
                    <div class="historical-count">
                        <span class="historical-count-value">${count}</span>
                        <span class="historical-count-label">historical events near ${d.location}</span>
                    </div>
                    <div class="historical-years">${yearsHtml || '<div style="font-size: var(--fs-xs); color: var(--text-400);">No recorded events in demonstration data</div>'}</div>
                    
                    <a href="${ROUTES.historical}" class="btn btn-outline btn-block">Explore Historical Events →</a>
                </div>
            </section>
        `;
    }

    // ============ INTERPRETATION ============
   function renderInterpretation(d) {

    const forecast = d.severeWeatherForecast || [];
    const nextHours = forecast.slice(0, 6);

    if (!nextHours.length) {
        return `
            <section class="analysis-card" aria-label="Risk interpretation">

                <div class="analysis-card-header">
                    <div class="analysis-card-title">

                        <svg viewBox="0 0 24 24"
                             fill="none"
                             stroke="currentColor"
                             stroke-width="2"
                             stroke-linecap="round"
                             stroke-linejoin="round">

                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="16" x2="12" y2="12"/>
                            <line x1="12" y1="8" x2="12.01" y2="8"/>

                        </svg>

                        Risk Interpretation

                    </div>
                </div>

                <div class="analysis-card-body">

                    <div class="interpretation-grid">

                        <div class="interpretation-item">
                            <div class="interpretation-label">
                                Current Status
                            </div>
                            <div class="interpretation-value">
                                UNAVAILABLE
                            </div>
                        </div>

                        <div class="interpretation-item">
                            <div class="interpretation-label">
                                Forecast Data
                            </div>
                            <div class="interpretation-value">
                                Unavailable
                            </div>
                        </div>

                        <div class="interpretation-item">
                            <div class="interpretation-label">
                                Forecast Trend
                            </div>
                            <div class="interpretation-value">
                                —
                            </div>
                        </div>

                        <div class="interpretation-item">
                            <div class="interpretation-label">
                                Primary Driver
                            </div>
                            <div class="interpretation-value">
                                —
                            </div>
                        </div>

                        <div class="interpretation-item">
                            <div class="interpretation-label">
                                Secondary Driver
                            </div>
                            <div class="interpretation-value">
                                —
                            </div>
                        </div>

                        <div class="interpretation-item">
                            <div class="interpretation-label">
                                Terrain Context
                            </div>
                            <div class="interpretation-value">
                                —
                            </div>
                        </div>

                    </div>

                </div>

            </section>
        `;
    }

    // ==============================
    // FORECAST VALUES
    // ==============================

    const maxRainfall = Math.max(
        ...nextHours.map(
            item => Number(item.rainfall || 0)
        )
    );

    const maxProbability = Math.max(
        ...nextHours.map(
            item => Number(item.precipitationProbability || 0)
        )
    );

    const maxCloud = Math.max(
        ...nextHours.map(
            item => Number(item.cloudCover || 0)
        )
    );

    const maxHumidity = Math.max(
        ...nextHours.map(
            item => Number(item.humidity || 0)
        )
    );

    const maxWindGust = Math.max(
        ...nextHours.map(
            item => Number(item.windGusts || 0)
        )
    );

    // ==============================
    // THUNDERSTORM CHECK
    // ==============================

    const thunderstormDetected = nextHours.some(
        item =>
            [95, 96, 99].includes(
                Number(item.weatherCode)
            )
    );

    // ==============================
    // FORECAST DRIVER SCORES
    // ==============================

    const drivers = [
        {
            name: 'Rainfall intensity',
            score: Math.min(
                100,
                maxRainfall * 10
            )
        },
        {
            name: 'Rain probability',
            score: maxProbability
        },
        {
            name: 'Cloud cover',
            score: maxCloud
        },
        {
            name: 'Humidity',
            score: maxHumidity
        },
        {
            name: 'Wind gusts',
            score: Math.min(
                100,
                maxWindGust * 1.25
            )
        }
    ];

    drivers.sort(
        (a, b) => b.score - a.score
    );

    const primaryDriver =
        drivers[0]?.name || 'Weather conditions';

    const secondaryDriver =
        drivers[1]?.name || 'Weather conditions';

    // ==============================
    // CURRENT WEATHER RISK INDEX
    // Same calculation used by graph
    // ==============================

    function calculateRisk(item) {

        const rain =
            Number(item.rainfall || 0);

        const probability =
            Number(
                item.precipitationProbability || 0
            );

        const humidity =
            Number(item.humidity || 0);

        const cloud =
            Number(item.cloudCover || 0);

        const wind =
            Number(item.windSpeed || 0);

        const gust =
            Number(item.windGusts || 0);

        const weatherCode =
            Number(item.weatherCode ?? -1);

        let score = 0;

        score += Math.min(
            30,
            rain * 3
        );

        score += probability * 0.20;

        score += Math.min(
            10,
            Math.max(
                0,
                humidity - 70
            ) * 0.33
        );

        score += cloud * 0.10;

        score += Math.min(
            10,
            wind * 0.25
        );

        score += Math.min(
            10,
            gust * 0.15
        );

        if (
            [95, 96, 99].includes(weatherCode)
        ) {
            score += 10;
        }

        return Math.round(
            Math.max(
                0,
                Math.min(100, score)
            )
        );
    }

    const currentRisk =
        calculateRisk(nextHours[0]);

    const finalRisk =
        calculateRisk(
            nextHours[nextHours.length - 1]
        );

    // ==============================
    // STATUS
    // ==============================

    let status = 'SAFE';

    if (currentRisk >= 75) {
        status = 'CRITICAL';
    } else if (currentRisk >= 60) {
        status = 'WARNING';
    } else if (currentRisk >= 40) {
        status = 'WATCH';
    }

    const statusLevel =
        status.toLowerCase();

    // ==============================
    // TREND
    // ==============================

    let trend = 'Stable';

    if (finalRisk > currentRisk + 10) {
        trend = 'Increasing';
    } else if (
        finalRisk < currentRisk - 10
    ) {
        trend = 'Decreasing';
    }

    // ==============================
    // TERRAIN CONTEXT
    // ==============================

    const slope =
        Number(d.slope);

    let terrainFactor =
        'Terrain data available';

    if (Number.isFinite(slope)) {

        if (slope > 35) {
            terrainFactor = 'Steep slope';
        } else if (slope > 20) {
            terrainFactor = 'Moderate slope';
        } else {
            terrainFactor = 'Gentle slope';
        }
    }

    // ==============================
    // RENDER
    // ==============================

    return `
        <section class="analysis-card"
                 aria-label="Risk interpretation">

            <div class="analysis-card-header">

                <div class="analysis-card-title">

                    <svg viewBox="0 0 24 24"
                         fill="none"
                         stroke="currentColor"
                         stroke-width="2"
                         stroke-linecap="round"
                         stroke-linejoin="round">

                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>

                    </svg>

                    Risk Interpretation

                </div>

            </div>

            <div class="analysis-card-body">

                <div class="interpretation-grid">

                    <div class="interpretation-item">

                        <div class="interpretation-label">
                            Current Status
                        </div>

                        <div class="interpretation-value status-${statusLevel}">
                            ${status}
                        </div>

                    </div>

                    <div class="interpretation-item">

                        <div class="interpretation-label">
                            Forecast Data
                        </div>

                        <div class="interpretation-value">
                            ${d.severeWeatherForecastLive
                                ? 'LIVE'
                                : 'Unavailable'
                            }
                        </div>

                    </div>

                    <div class="interpretation-item">

                        <div class="interpretation-label">
                            Forecast Trend
                        </div>

                        <div class="interpretation-value">
                            ${trend}
                        </div>

                    </div>

                    <div class="interpretation-item">

                        <div class="interpretation-label">
                            Primary Driver
                        </div>

                        <div class="interpretation-value">
                            ${primaryDriver}
                        </div>

                    </div>

                    <div class="interpretation-item">

                        <div class="interpretation-label">
                            Secondary Driver
                        </div>

                        <div class="interpretation-value">
                            ${secondaryDriver}
                        </div>

                    </div>

                    <div class="interpretation-item">

                        <div class="interpretation-label">
                            Terrain Context
                        </div>

                        <div class="interpretation-value">
                            ${terrainFactor}
                        </div>

                    </div>

                </div>

            </div>

        </section>
    `;
}

    // ============ EXPOSURE & ACTIONS ============
    function renderExposureAndActions(d) {
        const rp = d.responsePriority || { score: d.risk, level: d.level };
        const rpLevel = rp.level.toLowerCase();

        return `
            <div class="analysis-grid-full">
                <section class="analysis-card" aria-label="Potential exposure">
                    <div class="analysis-card-header">
                        <div class="analysis-card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            Potential Exposure
                        </div>
                    </div>
                    <div class="analysis-card-body">
                        <div class="exposure-compact">
                            <div class="exposure-compact-item">
                                <div class="exposure-compact-value">${Utils.formatNumber(d.population)}</div>
                                <div class="exposure-compact-label">Population</div>
                            </div>
                            <div class="exposure-compact-item">
                                <div class="exposure-compact-value">${Utils.formatNumber(2,3)}</div>
                                <div class="exposure-compact-label">Roads</div>
                            </div>
                            <div class="exposure-compact-item">
                                <div class="exposure-compact-value">${Utils.formatNumber(d.schools)}</div>
                                <div class="exposure-compact-label">Schools</div>
                            </div>
                            <div class="exposure-compact-item">
                                <div class="exposure-compact-value">${Utils.formatNumber(d.hospitals)}</div>
                                <div class="exposure-compact-label">Hospitals</div>
                            </div>
                            <div class="exposure-compact-item">
                                <div class="exposure-compact-value">${Utils.formatNumber(Math.max(2, Math.round(d.population / 300)))}</div>
                                <div class="exposure-compact-label">Villages</div>
                            </div>
                            <div class="exposure-compact-item">
                                <div class="exposure-compact-value">${Utils.formatNumber(d.bridges)}</div>
                                <div class="exposure-compact-label">Bridges</div>
                            </div>
                        </div>

                        <a href="${ROUTES.infrastructure}" class="btn btn-outline btn-block">View Impact Assessment →</a>
                    </div>
                </section>

                <section class="analysis-card" aria-label="Recommended actions">
                    <div class="analysis-card-header">
                        <div class="analysis-card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                            Recommended Early Actions
                        </div>
                    </div>
                    <div class="analysis-card-body">
                        <div style="font-size: var(--fs-xs); color: var(--text-500); margin-bottom: var(--space-3); font-style: italic;">
                            Illustrative decision-support recommendations — not official instructions
                        </div>
                        <div class="actions-list">
                            ${(d.recommendedActions || []).map(a => `
                                <div class="action-item priority-${a.priority}">
                                    <span class="action-priority ${a.priority}">${a.priority.toUpperCase()}</span>
                                    <span class="action-label">${a.label}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="actions-cta">
                            <a href="${ROUTES.fieldReports}" class="btn btn-outline" style="flex: 1;">Request Field Inspection</a>
                            <a href="${ROUTES.alerts}" class="btn btn-primary" style="flex: 1;">Generate Warning</a>
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    function generatePriorityExplanation(d, rp) {
        if (rp.level === 'CRITICAL') return `High hazard combined with significant population exposure and nearby critical infrastructure requires immediate attention.`;
        if (rp.level === 'HIGH') return `Elevated hazard with notable population exposure and infrastructure presence warrants priority monitoring.`;
        if (rp.level === 'MODERATE') return `Moderate hazard with some exposure. Continue monitoring and review contingency plans.`;
        return `Low hazard with minimal exposure. Routine monitoring sufficient.`;
    }

    // ============ RISK SUMMARY ============
   function renderRiskSummary(d, level) {
    const forecast = d.severeWeatherForecast || [];
    const nextHours = forecast.slice(0, 6);

    const maxRainfall = nextHours.length
        ? Math.max(...nextHours.map(item => Number(item.rainfall || 0)))
        : 0;

    const maxProbability = nextHours.length
        ? Math.max(
            ...nextHours.map(
                item => Number(item.precipitationProbability || 0)
            )
        )
        : 0;

    const maxWind = nextHours.length
        ? Math.max(
            ...nextHours.map(
                item => Number(item.windGusts || item.windSpeed || 0)
            )
        )
        : 0;

    return `
        <section class="risk-summary" aria-label="Forecast summary">

            <div class="risk-summary-score">
                <div class="risk-summary-score-value">
                    ${Number(d.risk).toFixed(0)}
                </div>

                <div class="risk-summary-score-max">
                    / 100
                </div>

                <div class="risk-summary-level ${level}">
                    ${d.level}
                </div>
            </div>

            <div class="risk-summary-details">

                <div class="risk-summary-item">
                    <div class="risk-summary-item-label">
                        FORECAST WINDOW
                    </div>

                    <div class="risk-summary-item-value">
                        Next 6 hours
                    </div>
                </div>

                <div class="risk-summary-item">
                    <div class="risk-summary-item-label">
                        PEAK RAINFALL
                    </div>

                    <div class="risk-summary-item-value">
                        ${maxRainfall.toFixed(1)} mm/h
                    </div>
                </div>

                <div class="risk-summary-item">
                    <div class="risk-summary-item-label">
                        PRECIPITATION PROBABILITY
                    </div>

                    <div class="risk-summary-item-value">
                        ${maxProbability.toFixed(0)}%
                    </div>
                </div>

                <div class="risk-summary-item">
                    <div class="risk-summary-item-label">
                        MAX WIND GUST
                    </div>

                    <div class="risk-summary-item-value">
                        ${maxWind.toFixed(1)} km/h
                    </div>
                </div>

            </div>

            <div class="risk-summary-cta">
                <a href="${ROUTES.riskMap}" class="btn btn-primary btn-lg">
                    View on Risk Map →
                </a>

                <a href="${ROUTES.dashboard}" class="btn btn-outline">
                    Back to Dashboard
                </a>
            </div>

        </section>
    `;
}
// ============ 2–6 HOUR SEVERE WEATHER OUTLOOK ============
function renderSevereWeatherOutlook(d) {
    const forecast = Array.isArray(d.severeWeatherForecast)
        ? d.severeWeatherForecast
        : [];

    if (!forecast.length) {
        return `
            <section class="analysis-card severe-outlook-card">
                <div class="analysis-card-header">
                    <div>
                        <div class="analysis-card-title">2–6 HOUR SEVERE WEATHER OUTLOOK</div>
                        <div class="analysis-card-subtitle">
                            Live forecast unavailable for this location
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    const getRiskLevel = (score) => {
        if (score >= 81) return 'WARNING';
        if (score >= 61) return 'ALERT';
        if (score >= 31) return 'WATCH';
        return 'SAFE';
    };

    const getRiskClass = (score) => {
        if (score >= 81) return 'warning';
        if (score >= 61) return 'alert';
        if (score >= 31) return 'watch';
        return 'safe';
    };

    const calculateRisks = (item) => {
        const rain = Number(item.rainfall || 0);
        const probability = Number(item.precipitationProbability || 0);
        const humidity = Number(item.humidity || 0);
        const cloud = Number(item.cloudCover || 0);
        const wind = Number(item.windSpeed || 0);
        const gust = Number(item.windGusts || 0);
        const soil = Number(item.soilMoisture || 0);
        const thunderstorm = [95, 96, 99].includes(Number(item.weatherCode));

        // Prototype risk indices — not calibrated probabilities.
        const thunderstormRisk = Math.min(
            100,
            Math.round(
                (thunderstorm ? 45 : 0) +
                rain * 2 +
                probability * 0.25 +
                Math.max(0, humidity - 70) * 0.4 +
                cloud * 0.15 +
                wind * 0.15
            )
        );

        const cloudburstRisk = Math.min(
            100,
            Math.round(
                rain * 5 +
                probability * 0.25 +
                Math.max(0, humidity - 75) * 0.6 +
                Math.max(0, cloud - 70) * 0.2
            )
        );

        const flashFloodRisk = Math.min(
            100,
            Math.round(
                rain * 4 +
                probability * 0.15 +
                soil * 0.25
            )
        );

        const strongWindRisk = Math.min(
            100,
            Math.round(
                wind * 0.6 +
                gust * 0.55
            )
        );

        return {
            thunderstorm: thunderstormRisk,
            cloudburst: cloudburstRisk,
            flashFlood: flashFloodRisk,
            strongWind: strongWindRisk
        };
    };

    const cards = forecast.map((item, index) => {
        const risks = calculateRisks(item);

        const peakRisk = Math.max(...Object.values(risks));
        const peakHazard = Object.entries(risks)
            .sort((a, b) => b[1] - a[1])[0][0];

        const hazardNames = {
            thunderstorm: 'Thunderstorm',
            cloudburst: 'Cloudburst',
            flashFlood: 'Flash Flood',
            strongWind: 'Strong Wind'
        };

        const timeLabel = index === 0
            ? 'NOW'
            : `+${index}H`;

        return `
            <div class="severe-outlook-item">
                <div class="severe-outlook-time">${timeLabel}</div>

                <div class="severe-outlook-hour">
                    ${item.hour || '--:--'}
                </div>

                <div class="severe-outlook-main-risk ${getRiskClass(peakRisk)}">
                    <strong>${peakRisk}</strong>
                    <span>${getRiskLevel(peakRisk)}</span>
                </div>

                <div class="severe-outlook-hazard">
                    ${hazardNames[peakHazard]}
                </div>

                <div class="severe-outlook-metrics">
                    <div>
                        <span>Thunderstorm</span>
                        <strong>${risks.thunderstorm}</strong>
                    </div>

                    <div>
                        <span>Cloudburst</span>
                        <strong>${risks.cloudburst}</strong>
                    </div>

                    <div>
                        <span>Flash Flood</span>
                        <strong>${risks.flashFlood}</strong>
                    </div>

                    <div>
                        <span>Strong Wind</span>
                        <strong>${risks.strongWind}</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <section class="analysis-card severe-outlook-section">
            <div class="analysis-card-header">
                <div>
                    <div class="analysis-card-title">
                        2–6 HOUR SEVERE WEATHER OUTLOOK
                    </div>

                    <div class="analysis-card-subtitle">
                        Live Open-Meteo forecast · Prototype risk indices
                    </div>
                </div>

                <span class="monitoring-section-badge">
                    LIVE API
                </span>
            </div>

            <div class="severe-outlook-grid">
                ${cards}
            </div>

            <div class="severe-outlook-note">
                Risk indices combine forecast rainfall, precipitation probability,
                humidity, cloud cover, soil moisture and wind conditions.
                Cloudburst and flash-flood values are derived indicators, not
                calibrated probabilities.
            </div>
        </section>
    `;
}
function renderActionableWarning(d) {
    const level = String(d.level || '').toUpperCase();
    const score = Number(d.risk ?? d.modelRiskScore ?? 0);

    const forecast = Array.isArray(d.severeWeatherForecast)
        ? d.severeWeatherForecast
        : [];

    const peakForecast = forecast.reduce(
        (peak, item) => {
            const values = [
                Number(item.rainfall || 0),
                Number(item.precipitationProbability || 0),
                Number(item.windGusts || 0)
            ];

            const currentValue = Math.max(...values);
            const peakValue = Math.max(...peak.values);

            return currentValue > peakValue
                ? { item, values }
                : peak;
        },
        { item: null, values: [0, 0, 0] }
    );

    let title = 'Routine Monitoring';
    let message = 'Current conditions do not indicate an immediate need for additional action.';
    let actions = [
        'Continue monitoring live weather conditions.',
        'Review the next 2–6 hour forecast for changes.',
        'Keep field teams informed of significant changes.'
    ];

    if (level === 'CRITICAL') {
        title = 'Immediate Attention Recommended';
        message =
            'The current AI risk assessment is CRITICAL. Authorities should review exposed locations and prepare appropriate field verification and response measures.';
        actions = [
            'Review high-risk locations and vulnerable infrastructure.',
            'Consider field verification where conditions warrant.',
            'Monitor the 2–6 hour severe-weather outlook closely.',
            'Prepare public or operational alerts according to local protocols.'
        ];
    } else if (level === 'HIGH') {
        title = 'Enhanced Monitoring Recommended';
        message =
            'The current AI risk assessment is HIGH. Conditions should be monitored closely for possible escalation.';
        actions = [
            'Review vulnerable locations and infrastructure.',
            'Monitor the next 2–6 hours for hazard escalation.',
            'Keep field teams ready for verification if conditions worsen.'
        ];
    } else if (level === 'WARNING') {
        title = 'Warning-Level Conditions';
        message =
            'Forecast conditions indicate a significant hazard signal. Additional monitoring and preparedness measures are recommended.';
        actions = [
            'Review exposed areas.',
            'Monitor the short-term forecast closely.',
            'Prepare field verification if impacts begin to appear.'
        ];
    } else if (level === 'ALERT') {
        title = 'Alert-Level Conditions';
        message =
            'Elevated hazard conditions have been detected. Continue close monitoring and prepare for possible escalation.';
        actions = [
            'Monitor vulnerable locations.',
            'Review the 2–6 hour outlook.',
            'Prepare field teams for verification if required.'
        ];
    } else if (level === 'WATCH') {
        title = 'Watch-Level Conditions';
        message =
            'Conditions warrant continued monitoring for possible escalation.';
        actions = [
            'Continue monitoring live conditions.',
            'Review the upcoming 2–6 hour outlook.',
            'Watch for increasing rainfall or other hazard indicators.'
        ];
    }

    const actionList = actions
        .map(action => `<li>${action}</li>`)
        .join('');

    return `
        <section class="analysis-card actionable-warning"
                 aria-label="Recommended actions">

            <div class="analysis-card-header">
                <div class="analysis-card-title">
                    Recommended Actions
                </div>

                <span class="analysis-card-badge">
                    ${level || 'MONITOR'}
                </span>
            </div>

            <div class="analysis-card-body">

                <div class="actionable-warning-main">
                    <div class="actionable-warning-title">
                        ${title}
                    </div>

                    <div class="actionable-warning-score">
                        Risk Index: <strong>${score}/100</strong>
                    </div>
                </div>

                <p class="actionable-warning-message">
                    ${message}
                </p>

                <div class="actionable-warning-actions">
                    <div class="actionable-warning-subtitle">
                        Suggested operational actions
                    </div>

                    <ul>
                        ${actionList}
                    </ul>
                </div>

                <div class="actionable-warning-note">
                    Recommendations are generated from the current
                    risk assessment and forecast signals and should
                    be reviewed by responsible authorities before action.
                </div>

            </div>
        </section>
    `;
}
    // ============ EVENT LISTENERS ============
    function setupEventListeners() {
        const select = document.getElementById('locationSelect');
        if (select) {
            select.addEventListener('change', (e) => loadLocation(e.target.value));
        }

        const modal = document.getElementById('explanationModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal) modal.classList.remove('active');
        });

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

    function retry() { loadLocation(state.currentLocation); }

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
            'sliders': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>',
            'bar-chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
            'cpu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/></svg>',
            'users': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
            'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4"/></svg>',
            'cloud-rain': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',
            'droplet': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
'arrow-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
'wind': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h9a3 3 0 1 0-3-3"/><path d="M3 14h14a3 3 0 1 1-3 3"/><path d="M5 18h5"/><path d="M5 7h3"/><path d="M17 8h3"/></svg>',
'thermometer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/><line x1="12" y1="11" x2="12" y2="18"/></svg>'
        };
        return icons[name] || '';
    }

    // ============ EXPOSE PUBLIC API ============
    window.SahayakAnalysis = {
        retry,
        showFullExplanation,
        loadLocation
    };

    // ============ BOOT ============
    document.addEventListener('DOMContentLoaded', init);
})();