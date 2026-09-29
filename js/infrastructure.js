// js/infrastructure.js — Infrastructure & Impact Assessment Logic

(function() {
    'use strict';

    const state = {
        currentLocation: 'Tawang',
        map: null,
        markers: {},
        activeTab: 'all',
        charts: { breakdown: null },
        data: {}
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
                    <a href="${ROUTES[item.key] || '#'}" class="sidebar-item ${item.key === 'infrastructure' ? 'active' : ''}">
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

        const locations = [
            ['Tawang', 'Arunachal Pradesh'],
            ['Itanagar', 'Arunachal Pradesh'],
            ['Gangtok', 'Sikkim'],
            ['Shillong', 'Meghalaya'],
            ['Aizawl', 'Mizoram'],
            ['Kohima', 'Nagaland'],
            ['Imphal', 'Manipur'],
            ['Agartala', 'Tripura'],
            ['Guwahati', 'Assam']
        ];

        select.innerHTML = locations.map(([name, stateName]) =>
            `<option value="${name}" ${name === state.currentLocation ? 'selected' : ''}>${name}, ${stateName}</option>`
        ).join('');
        select.value = state.currentLocation;
    }

    // ============ LOAD LIVE LOCATION ============
    async function loadLocation(locationName) {
        showLoading();
        try {
            const live = await Services.getLiveInfrastructureBundle(locationName);
            if (!live || live.error) {
                showError(live?.error || 'Live infrastructure data is temporarily unavailable');
                return;
            }

            state.currentLocation = locationName;
            state.data = {
                live,
                exposure: { exposure: live.exposure },
                infrastructure: { infrastructure: live.infrastructure },
                roads: { roads: live.roads, summary: {
                    total: live.roads.length,
                    critical: 0,
                    high: 0,
                    moderate: 0
                }},
                villages: { villages: live.villages },
                emergency: live.emergency,
                priority: { priority: {
                    score: live.priority.score ?? 0,
                    level: live.priority.level,
                    factors: live.priority.factors
                }},
                activity: { activity: [] }
            };
            renderAll();
        } catch (err) {
            console.error('Live infrastructure load failed:', err);
            showError('Live infrastructure data is temporarily unavailable');
        }
    }

    function showLoading() {
        const main = document.getElementById('infraContent');
        if (!main) return;
        main.innerHTML = `
            <div class="infra-card">
                <div class="infra-card-body" style="padding: var(--space-10); text-align: center;">
                    <div class="loading-spinner" style="margin: 0 auto var(--space-3);"></div>
                    <div style="font-size: var(--fs-sm); color: var(--text-500);">Loading exposure intelligence...</div>
                </div>
            </div>
        `;
    }

    function showError(message) {
        const main = document.getElementById('infraContent');
        if (!main) return;
        main.innerHTML = `
            <div class="infra-card">
                <div class="infra-card-body" style="padding: var(--space-10); text-align: center;">
                    <div style="width: 56px; height: 56px; margin: 0 auto var(--space-3); background: var(--surface); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--text-400);">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <div style="font-size: var(--fs-base); font-weight: 600; color: var(--text-700); margin-bottom: var(--space-2);">${message}</div>
                    <button class="btn btn-outline" onclick="window.SahayakInfra.retry()">Retry</button>
                </div>
            </div>
        `;
    }

    // ============ RENDER ALL ============
    function renderAll() {
        const main = document.getElementById('infraContent');
        if (!main) return;

        const d = state.data;
        const live = d.live;
        const zone = {
            location: live.coords.name || state.currentLocation,
            state: live.coords.state || '',
            lat: live.coords.lat,
            lng: live.coords.lng,
            risk: live.risk,
            level: live.riskLevel,
            probability: null,
            interpretation: { trend: 'Current model result' }
        };

        const level = String(zone.level || 'unavailable').toLowerCase();
        const riskAvailable = Number.isFinite(Number(zone.risk));

        const breadcrumbLoc = document.getElementById('breadcrumbLocation');
        if (breadcrumbLoc) breadcrumbLoc.textContent = zone.location;

        main.innerHTML = `
            ${renderRiskContext(zone, level, live)}
            ${renderExposureMetrics(d.exposure, live)}
            <div class="infra-grid">
                <div>
                    ${renderMap(zone, d.infrastructure.infrastructure, d.villages.villages, live)}
                    ${renderCriticalInfra(d.infrastructure.infrastructure)}
                    ${renderRoadExposure(d.roads, live)}
                    ${renderPopulationExposure(d.exposure, live)}
                    ${renderVillageExposure(d.villages, live)}
                </div>
                <div>
                    ${renderPriorityPanel(d.priority, live)}
                    ${renderEmergencyServices(d.emergency, live)}
                    ${renderDataFreshness(live)}
                </div>
            </div>
            ${riskAvailable ? renderHazardExposure(zone, d.exposure, d.priority, live) : renderUnavailableHazard(live)}
            ${renderAIPriorityExplanation(d.priority, zone, live)}
            <div class="infra-grid-full">
                ${renderRecommendations(zone, live)}
                ${renderActivity(d.activity, live)}
            </div>
        `;

        setTimeout(() => {
            initMap(zone, d.infrastructure.infrastructure, d.villages.villages, live);
            initPriorityAnimation(d.priority);
            if (typeof initBreakdownChart === 'function') initBreakdownChart(d.exposure);
            animatePriorityFactors();
            animateMetrics();
        }, 50);
    }

    // ============ RISK CONTEXT ============
    function renderRiskContext(zone, level, live) {
        const riskAvailable = Number.isFinite(Number(zone.risk));
        const riskText = riskAvailable ? `${Math.round(zone.risk)}` : '—';
        const weather = live.weather;
        const rainText = weather ? `${weather.last24hMm} mm / 24h` : 'Unavailable';
        return `
            <section class="risk-context">
                <div class="risk-context-main">
                    <div class="risk-context-location">${zone.location}</div>
                    <div class="risk-context-state">${zone.state || 'India'}</div>
                    <div class="risk-context-score">
                        <span class="risk-context-value">${riskText}</span>
                        <span class="risk-context-max">${riskAvailable ? '/ 100' : ''}</span>
                    </div>
                    <div class="risk-context-level ${level}">${riskAvailable ? zone.level : 'RISK UNAVAILABLE'}</div>
                </div>
                <div class="risk-context-details">
                    <div class="risk-context-item">
                        <div class="risk-context-item-label">RISK SOURCE</div>
                        <div class="risk-context-item-value">${live.riskSource || 'Unavailable'}</div>
                    </div>
                    <div class="risk-context-item">
                        <div class="risk-context-item-label">24H RAINFALL</div>
                        <div class="risk-context-item-value">${rainText}</div>
                    </div>
                    <div class="risk-context-item">
                        <div class="risk-context-item-label">ASSESSMENT RADIUS</div>
                        <div class="risk-context-item-value">${live.radiusKm} km</div>
                    </div>
                    <div class="risk-context-item">
                        <div class="risk-context-item-label">RETRIEVED</div>
                        <div class="risk-context-item-value">Just now</div>
                    </div>
                </div>
                <div class="risk-context-actions">
                    <a href="risk-analysis.html?location=${encodeURIComponent(zone.location)}" class="btn btn-primary">View Risk Analysis →</a>
                    <a href="risk-map.html?location=${encodeURIComponent(zone.location)}" class="btn btn-outline">View on Risk Map</a>
                </div>
            </section>
        `;
    }

    // ============ EXPOSURE METRICS ============
    function renderExposureMetrics(exposure, live) {
        const exp = exposure.exposure;
        const fmt = value => value == null ? 'N/A' : Utils.formatNumber(value);
        const metrics = [
            { icon: 'users', value: fmt(exp.population), label: 'Population' },
            { icon: 'home', value: fmt(exp.villages), label: 'Villages' },
            { icon: 'route', value: fmt(exp.roads), label: 'Roads' },
            { icon: 'book', value: fmt(exp.schools), label: 'Schools' },
            { icon: 'heart', value: fmt(exp.hospitals), label: 'Hospitals' },
            { icon: 'bridge', value: fmt(exp.bridges), label: 'Bridges' }
        ];

        return `
            <div class="exposure-metrics">
                ${metrics.map(m => `
                    <div class="exposure-metric">
                        <div class="exposure-metric-icon">${getIcon(m.icon)}</div>
                        <div class="exposure-metric-value">${m.value}</div>
                        <div class="exposure-metric-label">${m.label}</div>
                    </div>
                `).join('')}
            </div>
            <div class="exposure-metrics-note">Current mapped features within ${live.radiusKm} km · Google Places</div>
        `;
    }

    function animateMetrics() {
        if (Utils.prefersReducedMotion()) return;
        document.querySelectorAll('.exposure-metric-value').forEach(el => {
            const finalText = el.textContent;
            const finalNum = parseInt(finalText.replace(/,/g, ''), 10);
            if (isNaN(finalNum)) return;
            const duration = 1000;
            const start = performance.now();
            const animate = (now) => {
                const progress = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = Utils.formatNumber(Math.round(eased * finalNum));
                if (progress < 1) requestAnimationFrame(animate);
                else el.textContent = finalText;
            };
            requestAnimationFrame(animate);
        });
    }

    // ============ MAP ============
    function renderMap(zone, infrastructure, villages, live) {
        return `
            <div class="infra-map-wrap">
                <div class="infra-map-header">
                    <div class="infra-map-title">
                        <span class="infra-map-title-dot"></span>
                        Live Exposure Map — ${zone.location}
                    </div>
                    <span class="infra-card-badge">LIVE DATA</span>
                </div>
                <div class="infra-map-container">
                    <div id="infraMap"></div>
                    <div class="infra-map-legend">
                        <div class="infra-legend-title">Mapped Layers · ${live.radiusKm} km</div>
                        <div class="infra-legend-item"><span class="infra-legend-icon risk"></span> Current model context</div>
                        <div class="infra-legend-item"><span class="infra-legend-icon hospital">🏥</span> Hospital</div>
                        <div class="infra-legend-item"><span class="infra-legend-icon school">🏫</span> School</div>
                        <div class="infra-legend-item"><span class="infra-legend-icon bridge">🌉</span> Bridge</div>
                        <div class="infra-legend-item"><span class="infra-legend-icon police">👮</span> Police</div>
                        <div class="infra-legend-item"><span class="infra-legend-icon relief">🏕</span> Relief / social facility</div>
                        <div class="infra-legend-item"><span class="infra-legend-icon village">🏘</span> Village / town</div>
                    </div>
                    <div class="marker-info-popup" id="markerPopup"></div>
                </div>
            </div>
        `;
    }

    function initMap(zone, infrastructure, villages, live) {
        if (typeof L === 'undefined') return;
        const baseTiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri — Esri, HERE, Garmin, FAO, NOAA, USGS, EPA, NPS', maxZoom: 19
        });

        state.map = L.map('infraMap', {
            center: [zone.lat, zone.lng], zoom: 12, zoomControl: true, layers: [baseTiles]
        });

        const riskColor = {
            CRITICAL: '#DC2626', HIGH: '#F97316', WATCH: '#EAB308', SAFE: '#16A34A'
        }[String(live.riskLevel || '').toUpperCase()] || '#64748B';

        L.circle([zone.lat, zone.lng], {
            radius: live.radiusKm * 1000,
            color: riskColor,
            weight: 2,
            dashArray: '7 6',
            fillColor: riskColor,
            fillOpacity: 0.08
        }).addTo(state.map).bindTooltip(
            live.risk == null ? 'Current risk unavailable' : `Current model risk: ${Math.round(live.risk)}/100 · ${live.riskLevel}`,
            { sticky: true }
        );

        L.marker([zone.lat, zone.lng], { icon: L.divIcon({
            className: '',
            html: `<div class="infra-marker type-risk" title="Current risk location">⚠️</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14]
        })}).addTo(state.map);

        infrastructure.forEach(infra => {
            const icon = getInfraMarkerIcon(infra.type);
            const marker = L.marker([infra.lat, infra.lng], { icon }).addTo(state.map);
            marker.on('click', () => showMarkerPopup(infra));
        });

        villages.forEach(village => {
            const icon = getInfraMarkerIcon('village');
            const marker = L.marker([village.lat, village.lng], { icon }).addTo(state.map);
            marker.on('click', () => showMarkerPopup(village, 'village'));
        });

        const all = infrastructure.concat(villages);
        if (all.length) {
            const bounds = L.latLngBounds([[zone.lat, zone.lng], ...all.map(x => [x.lat, x.lng])]);
            state.map.fitBounds(bounds.pad(0.08));
        }
    }

    function getInfraMarkerIcon(type) {
        const emoji = {
            hospital: '🏥', school: '🏫', bridge: '🌉',
            police: '👮', relief: '🏕', village: '🏘'
        };
        return L.divIcon({
            className: '',
            html: `<div class="infra-marker type-${type}">${emoji[type] || '📍'}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
    }

    function showMarkerPopup(item, type = 'infra') {
        const popup = document.getElementById('markerPopup');
        if (!popup) return;

        if (type === 'village') {
            popup.innerHTML = `
                <button class="marker-info-close" onclick="document.getElementById('markerPopup').classList.remove('active')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div class="marker-info-type">Village</div>
                <div class="marker-info-name">${item.name}</div>
                <div class="marker-info-row"><span class="marker-info-label">Population</span><span class="marker-info-value">${item.population == null ? 'Not tagged' : Utils.formatNumber(item.population)}</span></div>
                <div class="marker-info-row"><span class="marker-info-label">Distance</span><span class="marker-info-value">${item.distance} km</span></div>
                <div class="marker-info-status ${item.exposure.toLowerCase()}">${item.exposure} Exposure</div>
                <div style="font-size: 10px; color: var(--text-400); font-style: italic; margin-top: var(--space-2); text-align: center;">Source: Google Places</div>
            `;
        } else {
            const statusClass = 'monitor';
            const statusLabel = item.status || 'MAPPED';

            popup.innerHTML = `
                <button class="marker-info-close" onclick="document.getElementById('markerPopup').classList.remove('active')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div class="marker-info-type">${item.type}</div>
                <div class="marker-info-name">${item.name}</div>
                <div class="marker-info-row"><span class="marker-info-label">Location</span><span class="marker-info-value">${state.currentLocation}</span></div>
                <div class="marker-info-row"><span class="marker-info-label">Distance from Risk Zone</span><span class="marker-info-value">${item.distance} km</span></div>
                ${item.capacity ? `<div class="marker-info-row"><span class="marker-info-label">Capacity</span><span class="marker-info-value">${item.capacity}</span></div>` : ''}
                <div class="marker-info-status ${statusClass}">${statusLabel}</div>
                <div style="font-size: 10px; color: var(--text-400); font-style: italic; margin-top: var(--space-2); text-align: center;">Source: Google Places</div>
            `;
        }

        popup.classList.add('active');
    }

    // ============ CRITICAL INFRASTRUCTURE ============
    function renderCriticalInfra(infrastructure) {
        const items = infrastructure.slice(0, 20).map(i => {
            const emoji = { hospital: '🏥', school: '🏫', bridge: '🌉', police: '👮', relief: '🏕', fire: '🚒' };
            const statusClass = 'monitor';
            return `
                <div class="critical-infra-item type-${i.type}">
                    <div class="critical-infra-icon">${emoji[i.type] || '📍'}</div>
                    <div class="critical-infra-info">
                        <div class="critical-infra-name">${i.name}</div>
                        <div class="critical-infra-meta">
                            <span>${i.type.replace('_', ' ')}</span>
                            ${i.capacity ? `<span>· Capacity: ${i.capacity}</span>` : ''}
                        </div>
                    </div>
                    <div class="critical-infra-distance">${i.distance} km</div>
                    <span class="critical-infra-status ${statusClass}">MAPPED</span>
                </div>
            `;
        }).join('');

        return `
            <section class="infra-card">
                <div class="infra-card-header">
                    <div class="infra-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/></svg>
                        Critical Infrastructure
                    </div>
                    <span class="infra-card-badge">GOOGLE PLACES</span>
                </div>
                <div class="infra-card-body">
                    ${items ? `<div class="critical-infra-list">${items}</div>` : `<div class="empty-live-state">No mapped critical facilities were returned within the assessment radius.</div>`}
                    <div class="live-source-note">Mapped features retrieved from Google Places API (New).</div>
                </div>
            </section>
        `;
    }

    // ============ ROAD EXPOSURE ============
    function renderRoadExposure(roadsData, live) {
        const roads = roadsData.roads || [];
        const summary = roadsData.summary || { total: roads.length };
        const rows = roads.slice(0, 30).map(r => `
            <tr>
                <td>${r.name}</td>
                <td>${r.type}</td>
                <td>${r.distance} km</td>
                <td>${r.status}</td>
            </tr>
        `).join('');

        return `
            <section class="infra-card">
                <div class="infra-card-header">
                    <div class="infra-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
                        Road Network — Live Map Data
                    </div>
                    <span class="infra-card-badge">GOOGLE PLACES</span>
                </div>
                <div class="infra-card-body">
                    <div class="road-summary">
                        <div class="road-summary-item">
                            <div class="road-summary-value">${summary.total == null ? '—' : summary.total}</div>
                            <div class="road-summary-label">Mapped Segments</div>
                        </div>
                        <div class="road-summary-item">
                            <div class="road-summary-value">${roads.length ? roads.filter(r => ['motorway','trunk','primary'].includes(r.type)).length : '—'}</div>
                            <div class="road-summary-label">Major Roads</div>
                        </div>
                        <div class="road-summary-item">
                            <div class="road-summary-value">${live.radiusKm} km</div>
                            <div class="road-summary-label">Assessment Radius</div>
                        </div>
                        <div class="road-summary-item">
                            <div class="road-summary-value">Places</div>
                            <div class="road-summary-label">Map Source</div>
                        </div>
                    </div>
                    <table class="road-table">
                        <thead><tr><th>Road</th><th>Class</th><th>Distance</th><th>Map Status</th></tr></thead>
                        <tbody>${rows || `<tr><td colspan="4">Google Places does not provide a road-network dataset. Use Route Risk for live road routing and hazard analysis.</td></tr>`}</tbody>
                    </table>
                    <div class="live-source-note">Road risk is intentionally not fabricated here. Use the Route Risk / Risk Map pages for hazard-aware road analysis.</div>
                </div>
            </section>
        `;
    }

    // ============ POPULATION EXPOSURE ============
    function renderPopulationExposure(exposure, live) {
        const pop = exposure.exposure.population;
        const popText = pop == null ? 'N/A' : Utils.formatNumber(pop);
        return `
            <section class="infra-card">
                <div class="infra-card-header">
                    <div class="infra-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        Population Exposure
                    </div>
                    <span class="infra-card-badge">MAPPED DATA</span>
                </div>
                <div class="infra-card-body">
                    <div class="population-total">
                        <span class="population-total-value">${popText}</span>
                        <span class="population-total-label">tagged population within ${live.radiusKm} km</span>
                    </div>
                    <div class="live-source-note">${live.populationSource}</div>
                    <div class="live-source-note" style="margin-top:8px;">No synthetic population estimate is used.</div>
                </div>
            </section>
        `;
    }

    // ============ VILLAGE EXPOSURE ============
    function renderVillageExposure(villagesData, live) {
        const villages = villagesData.villages || [];
        const items = villages.slice(0, 20).map(v => `
            <div class="village-item">
                <div class="village-icon">🏘</div>
                <div class="village-info">
                    <div class="village-name">${v.name}</div>
                    <div class="village-meta">Population: ${v.population == null ? 'Not tagged' : Utils.formatNumber(v.population)}</div>
                </div>
                <div class="village-distance">${v.distance} km</div>
                <span class="village-exposure">${v.exposure}</span>
            </div>
        `).join('');

        return `
            <section class="infra-card">
                <div class="infra-card-header">
                    <div class="infra-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        Nearby Villages & Towns
                    </div>
                    <span class="infra-card-badge">GOOGLE PLACES</span>
                </div>
                <div class="infra-card-body">
                    ${items ? `<div class="village-list">${items}</div>` : `<div class="empty-live-state">No nearby mapped settlements returned.</div>`}
                    <div class="live-source-note">Place features retrieved from Google Places API (New).</div>
                </div>
            </section>
        `;
    }

    // ============ PRIORITY PANEL ============
    function renderPriorityPanel(priorityData, live) {
        const p = priorityData.priority;
        const factors = p.factors || [];
        const available = Number.isFinite(Number(live.risk)) && Number.isFinite(Number(p.score));
        const score = available ? Number(p.score) : 0;
        const level = String(p.level || 'UNASSESSED').toLowerCase();
        const circumference = 2 * Math.PI * 65;
        const offset = circumference - (circumference * score / 100);
        const color = score >= 80 ? '#DC2626' : score >= 60 ? '#F97316' : score >= 40 ? '#EAB308' : '#16A34A';
        const factorsHtml = factors.map(f => {
            const pct = Math.min(100, Math.max(0, Number(f.value || 0) * 2.5));
            return `
                <div class="priority-factor" style="--target-width: ${pct}%">
                    <div class="priority-factor-label">${f.label}</div>
                    <div class="priority-factor-track"><div class="priority-factor-fill"></div></div>
                    <div class="priority-factor-value">+${f.value}</div>
                </div>
            `;
        }).join('');

        return `
            <aside class="priority-panel">
                <div class="priority-header level-${level}">
                    <div class="priority-title">Response Priority</div>
                    <div class="priority-score-wrap">
                        <svg class="priority-score-svg" viewBox="0 0 160 160">
                            <circle class="priority-bg-circle" cx="80" cy="80" r="65"/>
                            <circle class="priority-fill-circle" id="priorityCircle"
                                    cx="80" cy="80" r="65" stroke="${color}"
                                    stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"
                                    data-target-offset="${offset}"/>
                        </svg>
                        <div class="priority-score-text">
                            <div class="priority-score-value" id="priorityScore">${available ? '0' : '—'}</div>
                            <div class="priority-score-max">${available ? '/ 100' : ''}</div>
                        </div>
                    </div>
                    <span class="priority-level-badge ${level}">${available ? p.level : 'UNASSESSED'}</span>
                </div>
                <div class="priority-factors">
                    <div class="priority-factors-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        Why this priority?
                    </div>
                    <div class="priority-factor-bars" id="priorityFactors">${factorsHtml || '<div class="live-source-note">Priority unavailable until the live model responds.</div>'}</div>
                </div>
                <div class="priority-note">Derived index · live model + mapped exposure</div>
            </aside>
        `;
    }

    function initPriorityAnimation(priorityData) {
        const circle = document.getElementById('priorityCircle');
        const scoreEl = document.getElementById('priorityScore');
        if (!circle || !scoreEl) return;

        const targetOffset = parseFloat(circle.dataset.targetOffset);
        const circumference = 2 * Math.PI * 65;
        const targetScore = priorityData.priority.score;

        if (Utils.prefersReducedMotion()) {
            circle.setAttribute('stroke-dashoffset', targetOffset);
            scoreEl.textContent = targetScore;
            return;
        }

        const duration = 1500;
        const start = performance.now();
        const animate = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const currentOffset = circumference - (circumference - targetOffset) * eased;
            circle.setAttribute('stroke-dashoffset', currentOffset);
            scoreEl.textContent = Math.round(targetScore * eased);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    function animatePriorityFactors() {
        const factors = document.querySelectorAll('#priorityFactors .priority-factor');
        if (!factors.length) return;

        if (Utils.prefersReducedMotion()) {
            factors.forEach(f => f.classList.add('revealed'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const allFactors = entry.target.querySelectorAll('.priority-factor');
                    allFactors.forEach((f, i) => setTimeout(() => f.classList.add('revealed'), i * 150));
                    observer.disconnect();
                }
            });
        }, { threshold: 0.2 });

        const container = document.getElementById('priorityFactors');
        if (container) observer.observe(container);
    }

    // ============ EMERGENCY SERVICES ============
    function renderEmergencyServices(emergencyData, live) {
        const s = emergencyData || {};
        const nearest = s.nearest;
        return `
            <section class="infra-card">
                <div class="infra-card-header">
                    <div class="infra-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                        Emergency Response Coverage
                    </div>
                    <span class="infra-card-badge">GOOGLE PLACES</span>
                </div>
                <div class="infra-card-body">
                    <div class="emergency-grid">
                        <div class="emergency-item"><div class="emergency-icon">👮</div><div class="emergency-value">${s.police || 0}</div><div class="emergency-label">Police Stations</div></div>
                        <div class="emergency-item"><div class="emergency-icon">🏕</div><div class="emergency-value">${s.relief || 0}</div><div class="emergency-label">Relief / Social</div></div>
                        <div class="emergency-item"><div class="emergency-icon">🏥</div><div class="emergency-value">${s.hospitals || 0}</div><div class="emergency-label">Hospitals</div></div>
                        <div class="emergency-item"><div class="emergency-icon">🚒</div><div class="emergency-value">${s.fire || 0}</div><div class="emergency-label">Fire Stations</div></div>
                    </div>
                    <div class="nearest-response">
                        <div class="nearest-response-title">Nearest Mapped Response Facility</div>
                        <div class="nearest-response-name">${nearest ? nearest.name : 'No mapped facility returned'}</div>
                        ${nearest ? `<div class="nearest-response-stats"><span>Type: <strong>${nearest.type}</strong></span><span>Distance: <strong>${nearest.distance} km</strong></span></div>` : ''}
                        <div class="live-source-note">No synthetic response-time estimate is shown.</div>
                    </div>
                </div>
            </section>
        `;
    }

    // ============ DATA FRESHNESS ============
    function renderDataFreshness(live) {
        const statusDot = status => status === 'live' ? 'fresh' : 'delayed';
        const ago = timestamp => timestamp ? new Date(timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Unavailable';
        return `
            <section class="infra-card">
                <div class="infra-card-header">
                    <div class="infra-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Data Sources & Freshness
                    </div>
                </div>
                <div class="infra-card-body">
                    <div class="freshness-compact">
                        ${live.sources.map(src => `
                            <div class="freshness-item-compact">
                                <span class="freshness-dot-compact ${statusDot(src.status)}"></span>
                                <div class="freshness-info">
                                    <div class="freshness-source-compact">${src.name}</div>
                                    <div class="freshness-time-compact">${src.status === 'live' ? `Retrieved ${ago(src.retrievedAt)}` : 'Unavailable'}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="live-source-note">Infrastructure features: Google Places API (New) · Weather: Open-Meteo · Hazard: SAHAYAK ML model.</div>
                </div>
            </section>
        `;
    }

    // ============ HAZARD VS EXPOSURE ============
    function renderHazardExposure(zone, exposure, priority, live) {
        const hazard = Number.isFinite(Number(zone.risk)) ? Math.round(zone.risk) : null;
        const exp = exposure.exposure;
        const exposureScore = Math.min(100,
            (exp.population == null ? 0 : Math.min(40, Math.round(Math.log10(Math.max(exp.population, 1)) * 8))) +
            Math.min(25, exp.roads * 0.5) +
            Math.min(20, exp.schools * 3) +
            Math.min(15, exp.hospitals * 5)
        );
        const combined = Number.isFinite(Number(priority.priority.score)) ? Math.round(priority.priority.score) : null;

        return `
            <section class="hazard-exposure-compare">
                <div class="he-header">
                    <div class="he-title">Current Hazard vs Mapped Exposure</div>
                    <div class="he-subtitle">Live model result combined with currently mapped Google Places features</div>
                </div>
                <div class="he-scores">
                    <div class="he-score-item"><div class="he-score-label">Current Hazard</div><div class="he-score-value hazard">${hazard == null ? '—' : hazard}</div><div class="he-score-max">${hazard == null ? '' : '/ 100'}</div></div>
                    <div class="he-operator">+</div>
                    <div class="he-score-item"><div class="he-score-label">Mapped Exposure Index</div><div class="he-score-value exposure">${exposureScore}</div><div class="he-score-max">/ 100</div></div>
                    <div class="he-operator">=</div>
                    <div class="he-score-item"><div class="he-score-label">Derived Priority</div><div class="he-score-value combined">${combined == null ? '—' : combined}</div><div class="he-score-max">${combined == null ? '' : '/ 100'}</div></div>
                </div>
                <div class="he-explanation">The priority is a transparent SAHAYAK-derived index. It is not an official government warning or an observed infrastructure-damage measurement.</div>
            </section>
        `;
    }

    function renderUnavailableHazard(live) {
        return `
            <section class="hazard-exposure-compare">
                <div class="he-header"><div class="he-title">Hazard Assessment</div><div class="he-subtitle">Live infrastructure data loaded; current hazard model is unavailable.</div></div>
                <div class="he-explanation">No synthetic risk score is shown. Refresh when the SAHAYAK ML service is available.</div>
            </section>
        `;
    }

    // ============ AI PRIORITY EXPLANATION ============
    function renderAIPriorityExplanation(priority, zone, live) {
        const modelDrivers = (live.riskFactors || []).map(f => {
            const feature = String(f.feature || 'factor').replace(/_/g, ' ');
            const contribution = Number(f.contribution);
            return Number.isFinite(contribution) ? `${feature} (${contribution >= 0 ? '+' : ''}${contribution.toFixed(2)})` : feature;
        }).slice(0, 6);

        return `
            <section class="ai-priority-explanation">
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3);">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <h3 style="font-size: var(--fs-lg); font-weight: 700; margin: 0;">Why is this location a priority?</h3>
                </div>
                <div class="ai-quote">
                    ${live.risk == null ? 'The current SAHAYAK model did not return a live risk result. Infrastructure is still shown from Google Places.' : `The current model returned a risk score of ${Math.round(live.risk)}/100 (${live.riskLevel}). The response-priority index additionally considers mapped roads and critical facilities within ${live.radiusKm} km.`}
                </div>
                <div class="ai-drivers-title">Live model factors</div>
                <div class="ai-drivers-list">
                    ${modelDrivers.length ? modelDrivers.map(d => `<span class="ai-driver-chip">${d}</span>`).join('') : '<span class="ai-note">Model factors unavailable.</span>'}
                </div>
                <div class="ai-note">Sources: ${live.riskSource || 'SAHAYAK ML model'}, Google Places API (New), Open-Meteo.</div>
            </section>
        `;
    }

    // ============ RECOMMENDATIONS ============
    function renderRecommendations(zone) {
        const recommendations = [
            { icon: 'eye', title: 'Increase Monitoring', desc: 'Monitor environmental conditions more frequently in the affected zone.' },
            { icon: 'route', title: 'Review Road Access', desc: 'Inspect exposed road segments and identify alternative routes.' },
            { icon: 'check', title: 'Verify Critical Facilities', desc: 'Confirm accessibility of nearby hospitals and schools.' },
            { icon: 'clipboard', title: 'Prepare Field Inspection', desc: 'Assign a field officer to verify ground conditions.' },
            { icon: 'home', title: 'Review Relief Coverage', desc: 'Check accessibility and capacity of nearby relief centers.' }
        ];

        const items = recommendations.map(r => `
            <div class="recommendation-item">
                <div class="recommendation-icon">${getIcon(r.icon)}</div>
                <div class="recommendation-content">
                    <div class="recommendation-title">${r.title}</div>
                    <div class="recommendation-desc">${r.desc}</div>
                </div>
            </div>
        `).join('');

        return `
            <section class="infra-card">
                <div class="infra-card-header">
                    <div class="infra-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                        Suggested Actions
                    </div>
                </div>
                <div class="infra-card-body">
                    <div style="font-size: var(--fs-xs); color: var(--text-500); margin-bottom: var(--space-3); font-style: italic;">
                        Illustrative decision-support suggestions — not official orders
                    </div>
                    <div class="recommendations-list">${items}</div>
                    <div class="recommendations-actions">
                        <button class="btn btn-outline" onclick="window.SahayakInfra.openTaskModal()">Create Field Task</button>
                        <a href="alert-create.html?location=${encodeURIComponent(zone.location)}" class="btn btn-primary">Generate Warning</a>
                        <a href="route-risk.html" class="btn btn-outline">View Route Risk</a>
                    </div>
                </div>
            </section>
        `;
    }

    // ============ ACTIVITY ============
    function renderActivity(activityData, live) {
        const items = [
            { icon: '📍', title: 'Infrastructure map refreshed', meta: `Google Places API (New) · ${new Date(live.retrievedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` },
            { icon: '🌧️', title: live.weather ? `24h precipitation: ${live.weather.last24hMm} mm` : 'Weather feed unavailable', meta: 'Open-Meteo · current request' },
            { icon: '🤖', title: live.risk == null ? 'Risk model unavailable' : `Current model risk: ${Math.round(live.risk)}/100`, meta: live.riskSource || 'SAHAYAK ML model' }
        ];
        return `
            <section class="infra-card">
                <div class="infra-card-header">
                    <div class="infra-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        Live Data Activity
                    </div>
                </div>
                <div class="infra-card-body">
                    <div class="activity-list-infra">
                        ${items.map(a => `<div class="activity-item-infra"><div class="activity-icon-infra">${a.icon}</div><div class="activity-content-infra"><div class="activity-title-infra">${a.title}</div><div class="activity-meta-infra">${a.meta}</div></div></div>`).join('')}
                    </div>
                </div>
            </section>
        `;
    }

    // ============ BREAKDOWN CHART ============
    function initBreakdownChart(exposure) {
        const canvas = document.getElementById('breakdownChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const exp = exposure.exposure;
        if (state.charts.breakdown) state.charts.breakdown.destroy();

        const ctx = canvas.getContext('2d');
        state.charts.breakdown = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Population (÷10)', 'Roads', 'Schools', 'Hospitals', 'Bridges', 'Villages'],
                datasets: [{
                    data: [
                        Math.round(exp.population / 10),
                        exp.roads,
                        exp.schools,
                        exp.hospitals,
                        exp.bridges,
                        exp.villages
                    ],
                    backgroundColor: ['#19B8C7', '#0F9D8A', '#16A34A', '#EAB308', '#F97316', '#8A9BB5'],
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                animation: { duration: 1200 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0B1728',
                        titleColor: '#fff',
                        bodyColor: '#E5EAF2',
                        padding: 10,
                        cornerRadius: 6
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(217, 224, 232, 0.5)' },
                        ticks: { color: '#8A9BB5', font: { size: 10 } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#374151', font: { size: 11, weight: '600' } }
                    }
                }
            }
        });
    }

    // ============ TASK MODAL ============
    function openTaskModal() {
        const modal = document.getElementById('taskModal');
        if (!modal) return;

        const officersHtml = (DEMO_DATA.officers || []).map(o =>
            `<option value="${o.id}">${o.name} — ${o.district}</option>`
        ).join('');

        document.getElementById('taskModalBody').innerHTML = `
            <div style="margin-bottom: var(--space-4);">
                <label style="display:block; font-size: var(--fs-sm); font-weight: 500; color: var(--text-700); margin-bottom: var(--space-2);">Location</label>
                <input type="text" value="${state.currentLocation}" disabled style="width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); font-family: inherit; font-size: var(--fs-sm); background: var(--surface);">
            </div>
            <div style="margin-bottom: var(--space-4);">
                <label style="display:block; font-size: var(--fs-sm); font-weight: 500; color: var(--text-700); margin-bottom: var(--space-2);">Officer</label>
                <select id="taskOfficer" style="width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); font-family: inherit; font-size: var(--fs-sm);">
                    ${officersHtml}
                </select>
            </div>
            <div style="margin-bottom: var(--space-4);">
                <label style="display:block; font-size: var(--fs-sm); font-weight: 500; color: var(--text-700); margin-bottom: var(--space-2);">Task Type</label>
                <select id="taskType" style="width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); font-family: inherit; font-size: var(--fs-sm);">
                    <option value="Infrastructure Inspection">Infrastructure Inspection</option>
                    <option value="Road Inspection">Road Inspection</option>
                    <option value="Community Assessment">Community Assessment</option>
                    <option value="Hospital/School Verification">Hospital/School Verification</option>
                </select>
            </div>
            <div style="margin-bottom: var(--space-4);">
                <label style="display:block; font-size: var(--fs-sm); font-weight: 500; color: var(--text-700); margin-bottom: var(--space-2);">Priority</label>
                <select id="taskPriority" style="width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); font-family: inherit; font-size: var(--fs-sm);">
                    <option value="Critical">Critical</option>
                    <option value="High" selected>High</option>
                    <option value="Medium">Medium</option>
                </select>
            </div>
            <div id="taskSuccess"></div>
        `;

        modal.classList.add('active');
    }

    async function submitTask() {
        const officerId = document.getElementById('taskOfficer').value;
        const taskType = document.getElementById('taskType').value;
        const priority = document.getElementById('taskPriority').value;

        const result = await Services.assignFieldTask({
            officerId,
            taskType,
            priority,
            location: state.currentLocation
        });

        if (result.success) {
            document.getElementById('taskSuccess').innerHTML = `
                <div style="padding: var(--space-3); background: var(--safe-bg); border: 1px solid rgba(22, 163, 74, 0.2); border-radius: var(--radius-md); text-align: center; color: var(--safe); font-weight: 600; font-size: var(--fs-sm);">
                    ✓ Field task assigned successfully
                </div>
            `;
            setTimeout(() => {
                document.getElementById('taskModal').classList.remove('active');
            }, 1500);
        }
    }

    function retry() { loadLocation(state.currentLocation); }

    // ============ EVENT LISTENERS ============
    function setupEventListeners() {
        const select = document.getElementById('locationSelect');
        if (select) {
            select.addEventListener('change', (e) => loadLocation(e.target.value));
        }

        // Modal close
        const modal = document.getElementById('taskModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });
        }

        // Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal) modal.classList.remove('active');
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
            'satellite': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>',
            'clock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
            'building': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/></svg>',
            'route': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
            'sliders': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="20" y1="21" x2="20" y2="16"/></svg>',
            'bar-chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
            'cpu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/></svg>',
            'users': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
            'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>',
            'eye': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
            'home': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
            'book': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
            'heart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
            'bridge': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18M5 18V9a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v9M9 6v12M15 6v12"/></svg>'
        };
        return icons[name] || '';
    }

    // ============ EXPOSE PUBLIC API ============
    window.SahayakInfra = {
        retry,
        openTaskModal,
        submitTask
    };

    // ============ BOOT ============
    document.addEventListener('DOMContentLoaded', init);
})();