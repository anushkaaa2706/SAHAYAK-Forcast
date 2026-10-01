// js/route-risk.js — Route Risk Analysis Logic

(function() {
    'use strict';

    const state = {
        map: null,
        startLocation: '',
        destination: '',
        currentRoute: null,
        activeSegment: null,
        showAlternative: false,
        polylines: { primary: [], alternative: [] },
        segmentMarkers: {}
    };

    const LOCATIONS = ['Tawang', 'Itanagar', 'Gangtok', 'Shillong', 'Aizawl', 'Kohima', 'Imphal', 'Guwahati'];

    // ============ INIT ============
    function init() {
        setPageUser();
        renderSidebar();
        renderLocationInputs();
        initMap();
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
                    <a href="${ROUTES[item.key] || '#'}" class="sidebar-item ${item.key === 'routeRisk' ? 'active' : ''}">
                        <span class="sidebar-icon">${getIcon(item.icon)}</span>
                        <span>${item.label}</span>
                    </a>
                `).join('')}
            </div>
        `).join('');
        nav.innerHTML = html;
    }

    // ============ LOCATION INPUTS ============
    function renderLocationInputs() {
        const startSelect = document.getElementById('startSelect');
        const destSelect = document.getElementById('destSelect');
        if (!startSelect || !destSelect) return;

        const options = '<option value="">Select location...</option>' +
            LOCATIONS.map(l => `<option value="${l}">${l}</option>`).join('');

        startSelect.innerHTML = options;
        destSelect.innerHTML = options;

        // Default values
        startSelect.value = 'Tawang';
        destSelect.value = 'Itanagar';
        state.startLocation = 'Tawang';
        state.destination = 'Itanagar';
    }

    // ============ MAP ============
    function initMap() {
        if (typeof L === 'undefined') return;

        const darkTiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    });

        state.map = L.map('routeMap', {
            center: [26.5, 92.5],
            zoom: 6,
            zoomControl: true,
            layers: [darkTiles]
        });
    }

    // ============ ANALYZE ROUTE ============
    async function analyzeRoute() {
        if (!state.startLocation || !state.destination) {
            alert('Please select both start and destination locations.');
            return;
        }

        if (state.startLocation === state.destination) {
            alert('Start and destination must be different.');
            return;
        }

        showLoading();

        try {
            const routeData = await Services.analyzeRoute(state.startLocation, state.destination);
            
            if (routeData.error) {
                showError(routeData.error);
                return;
            }

            state.currentRoute = routeData;
            state.showAlternative = false;
            renderResults(routeData);
            drawRoute(routeData);
        } catch (err) {
    console.error('Route analysis error:', err);
    showError('Unable to analyze route: ' + (err.message || 'Unknown error'));
}
    }

    function showLoading() {
        const results = document.getElementById('routeResults');
        if (!results) return;
        results.innerHTML = `
            <div class="route-loading">
                <div class="loading-spinner" style="margin: 0 auto var(--space-3);"></div>
                <div style="font-size: var(--fs-sm); color: var(--text-500);">Analyzing route risk...</div>
                <div style="font-size: var(--fs-xs); color: var(--text-400); margin-top: var(--space-2);">Evaluating terrain, rainfall and historical patterns</div>
            </div>
        `;
    }

    function showError(message) {
        const results = document.getElementById('routeResults');
        if (!results) return;
        results.innerHTML = `
            <div class="route-initial-state">
                <div class="route-initial-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div class="route-initial-title">${message}</div>
                <div class="route-initial-sub">Please try different locations or retry</div>
                <button class="btn btn-outline" style="margin-top: var(--space-3);" onclick="window.SahayakRoute.retry()">Retry</button>
            </div>
        `;
    }

    // ============ RENDER RESULTS ============
    function renderResults(routeData) {
        const results = document.getElementById('routeResults');
        if (!results) return;

        const primary = routeData.primary;
        const alt = routeData.alternative;
        const pLevel = primary.level.toLowerCase();
const aLevel = alt ? alt.level.toLowerCase() : '';

        // Count segments by level
        const segCounts = { CRITICAL: 0, HIGH: 0, WATCH: 0, SAFE: 0 };
        primary.segments.forEach(s => { segCounts[s.level] = (segCounts[s.level] || 0) + 1; });

        const segmentsHtml = primary.segments.map(seg => {
            const level = seg.level.toLowerCase();
            return `
                <div class="segment-item level-${level}" data-segment-id="${seg.id}" onclick="window.SahayakRoute.selectSegment('${seg.id}')">
                    <div class="segment-item-icon">${getSegmentIcon(seg.level)}</div>
                    <div class="segment-item-info">
                        <div class="segment-item-name">${seg.name}</div>
                        <div class="segment-item-reason">${seg.reason}</div>
                    </div>
                    <div class="segment-item-risk">
                        <div class="segment-item-risk-value ${level}">${seg.risk}</div>
                        <div class="segment-item-risk-label">/ 100</div>
                    </div>
                    <span class="segment-item-level ${level}">${seg.level}</span>
                </div>
            `;
        }).join('');

       const additionalTime = alt ? alt.time - primary.time : 0; 

        results.innerHTML = `
            <!-- Primary Route -->
            <div class="route-result-card">
                <div class="route-result-header">
                    <div class="route-result-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
                        Recommended Route
                    </div>
                    <span class="route-result-badge recommended">RECOMMENDED</span>
                </div>
                <div class="route-result-body">
                    <div class="route-name">${primary.name}</div>
                    <div class="route-summary">
                        <div class="route-summary-risk">
                            <div class="route-summary-risk-value ${pLevel}">${primary.overallRisk}</div>
                            <div class="route-summary-risk-max">/ 100</div>
                            <div class="route-summary-risk-level ${pLevel}">${primary.level}</div>
                        </div>
                        <div class="route-summary-stat">
                            <div class="route-summary-stat-label">Distance</div>
                            <div class="route-summary-stat-value">${primary.distance}</div>
                            <div class="route-summary-stat-sub">km</div>
                        </div>
                        <div class="route-summary-stat">
                            <div class="route-summary-stat-label">Est. Time</div>
                            <div class="route-summary-stat-value">${formatTime(primary.time)}</div>
                            <div class="route-summary-stat-sub">hours</div>
                        </div>
                        <div class="route-summary-stat">
                            <div class="route-summary-stat-label">Segments</div>
                            <div class="route-summary-stat-value">${primary.segments.length}</div>
                            <div class="route-summary-stat-sub">total</div>
                        </div>
                    </div>

                    <div class="segments-section">
                        <div class="segments-title">
                            <span>Route Risk Summary</span>
                        </div>
                        <div class="segments-summary">
                            ${segCounts.CRITICAL > 0 ? `<span class="segments-summary-chip critical">${segCounts.CRITICAL} Critical</span>` : ''}
                            ${segCounts.HIGH > 0 ? `<span class="segments-summary-chip high">${segCounts.HIGH} High-Risk</span>` : ''}
                            ${segCounts.WATCH > 0 ? `<span class="segments-summary-chip watch">${segCounts.WATCH} Watch</span>` : ''}
                            ${segCounts.SAFE > 0 ? `<span class="segments-summary-chip safe">${segCounts.SAFE} Safe</span>` : ''}
                        </div>
                        <div class="segments-list">${segmentsHtml}</div>
                    </div>
                </div>
            </div>

            <!-- Alternative Route -->
            ${alt ? `
            <div class="alternative-card">
                <div class="alternative-header">
                    <div class="alternative-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                        Alternative Route
                    </div>
                    <span class="route-result-badge alternative">LIVE ALTERNATIVE</span>
                </div>
                <div class="alternative-body">
                    <div class="route-name">${alt.name}</div>
                    <div class="alternative-comparison">
                        <div class="alternative-stat">
                            <div class="alternative-stat-label">Risk Score</div>
                            <div class="alternative-stat-value" style="color: var(--${aLevel === 'safe' ? 'safe' : aLevel === 'watch' ? 'watch' : aLevel === 'high' ? 'alert' : 'warning'});">${alt.overallRisk}/100</div>
                            <div class="alternative-stat-sub ${alt.overallRisk < primary.overallRisk ? 'positive' : 'negative'}">
                                ${alt.overallRisk < primary.overallRisk ? '↓ Lower modeled risk' : '↑ Higher modeled risk'}
                            </div>
                        </div>
                        <div class="alternative-stat">
                            <div class="alternative-stat-label">Distance</div>
                            <div class="alternative-stat-value">${alt.distance} km</div>
                            <div class="alternative-stat-sub ${alt.distance > primary.distance ? 'negative' : 'positive'}">
                                ${alt.distance > primary.distance ? `+${(alt.distance - primary.distance).toFixed(1)} km` : `${(primary.distance - alt.distance).toFixed(1)} km shorter`}
                            </div>
                        </div>
                        <div class="alternative-stat">
                            <div class="alternative-stat-label">Est. Time</div>
                            <div class="alternative-stat-value">${formatTime(alt.time)}</div>
                            <div class="alternative-stat-sub ${additionalTime > 0 ? 'negative' : 'positive'}">
                                ${additionalTime > 0 ? `+${additionalTime} min` : `${Math.abs(additionalTime)} min faster`}
                            </div>
                        </div>
                        <div class="alternative-stat">
                            <div class="alternative-stat-label">Level</div>
                            <div class="alternative-stat-value" style="font-size: var(--fs-sm); color: var(--${aLevel === 'safe' ? 'safe' : aLevel === 'watch' ? 'watch' : aLevel === 'high' ? 'alert' : 'warning'});">${alt.level}</div>
                            <div class="alternative-stat-sub">${alt.segments.length} segments</div>
                        </div>
                    </div>
                    <div class="alternative-actions">
                        <button class="btn btn-primary" style="flex: 1;" onclick="window.SahayakRoute.useAlternative()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Use Alternative Route
                        </button>
                        <button class="btn btn-outline" style="flex: 1;" onclick="window.SahayakRoute.toggleAlternative()">
                            ${state.showAlternative ? 'Hide' : 'Show'} on Map
                        </button>
                    </div>
                </div>
            </div>` : `
            <div class="alternative-card">
                <div class="alternative-header">
                    <div class="alternative-title">Live Route Alternatives</div>
                    <span class="route-result-badge alternative">NOT AVAILABLE</span>
                </div>
                <div class="alternative-body">
                    <div class="alternative-stat-sub">No alternative route is available for this request.
                </div>
            </div>`}

            <!-- Risk Explanation -->
            <div class="route-explanation">
                <div class="route-explanation-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Why is this route risky?
                </div>
                <div class="route-explanation-subtitle">Factor contribution to modeled route risk</div>
                <div class="route-factors" id="routeFactors">
                    ${routeData.riskFactors.map(f => {
                        const pct = (f.value / 35) * 100;
                        return `
                            <div class="route-factor" style="--target-width: ${pct}%;" title="${f.description}">
                                <div class="route-factor-label">${f.label}</div>
                                <div class="route-factor-track"><div class="route-factor-fill"></div></div>
                                <div class="route-factor-value">+${f.value}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="route-explanation-quote">
                    ${generateExplanation(routeData)}
                </div>
                <div class="route-explanation-note">Derived from the live SAHAYAK risk model and current route data.</div>
            </div>

        `;

        // Load activity
       

        // Animate factors
        setTimeout(animateFactors, 100);
    }

    function generateExplanation(routeData) {
    const primary = routeData.primary;

    if (!primary) {
        return 'Live route risk information is currently unavailable.';
    }

    const risk = Number(primary.overallRisk || 0);
    const level = primary.level || 'SAFE';

    const factors = Array.isArray(routeData.riskFactors)
        ? routeData.riskFactors
        : [];

    if (factors.length === 0) {
        if (level === 'SAFE') {
            return `The live route risk index is ${risk}/100. Current forecast conditions do not show significant severe-weather indicators.`;
        }

        return `The live route risk index is ${risk}/100. Continue monitoring current weather conditions along the route.`;
    }

    const factorNames = factors
        .map(f => f.label)
        .filter(Boolean);

    const factorText =
        factorNames.length === 1
            ? factorNames[0]
            : factorNames.slice(0, 3).join(', ');

    if (level === 'SAFE') {
        return `The live route risk index is ${risk}/100. The main contributing factors are ${factorText}. Current conditions remain within the SAFE range, but weather conditions should continue to be monitored.`;
    }

    if (level === 'WATCH') {
        return `The live route risk index is ${risk}/100. The main contributing factors are ${factorText}. Conditions require increased monitoring because weather conditions may affect route safety.`;
    }

    if (level === 'HIGH') {
        return `The live route risk index is ${risk}/100. The main contributing factors are ${factorText}. Elevated weather-related risk is present along this route.`;
    }

    return `The live route risk index is ${risk}/100. The main contributing factors are ${factorText}. Severe weather indicators require close attention along this route.`;
}

    function getSegmentIcon(level) {
        const icons = {
            'CRITICAL': '🔴',
            'HIGH': '🟠',
            'WATCH': '🟡',
            'SAFE': '🟢'
        };
        return icons[level] || '⚪';
    }

    function formatTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    // ============ DRAW ROUTE ON MAP ============
    function drawRoute(routeData) {
        if (!state.map) return;

        clearMapLayers();

        const primary = routeData.primary;
        const alt = routeData.alternative;

        const drawRouteSegments = (route, bucket, opacity, weight, dashArray) => {
            if (!route) return;
            route.segments.forEach(seg => {
                if (!Array.isArray(seg.geometry) || seg.geometry.length < 2) return;
                const latlngs = seg.geometry.map(p => [p[0], p[1]]);
                const polyline = L.polyline(latlngs, {
                    color: getRiskColor(seg.level),
                    weight,
                    opacity,
                    dashArray,
                    lineCap: 'round',
                    lineJoin: 'round'
                }).addTo(state.map);
                polyline.on('click', () => selectSegment(seg.id, bucket === 'alternative'));
                state.polylines[bucket].push(polyline);
            });
        };

        drawRouteSegments(primary, 'primary', 0.95, 7, null);
        drawRouteSegments(alt, 'alternative', state.showAlternative ? 0.78 : 0.32, 4, state.showAlternative ? null : '8, 8');

        const startPoint = routeData.startCoordinates || primary.waypoints[0];
        const destPoint = routeData.destinationCoordinates || primary.waypoints[primary.waypoints.length - 1];

        const startIcon = L.divIcon({
            className: '',
            html: `<div class="route-marker start">A</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        L.marker(startPoint, { icon: startIcon }).addTo(state.map)
            .bindPopup(`<strong>Start:</strong> ${routeData.start}`);

        const destIcon = L.divIcon({
            className: '',
            html: `<div class="route-marker destination">B</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        L.marker(destPoint, { icon: destIcon }).addTo(state.map)
            .bindPopup(`<strong>Destination:</strong> ${routeData.destination}`);

        const boundsPoints = [];
        [primary, alt].filter(Boolean).forEach(route => {
            (route.waypoints || []).forEach(p => boundsPoints.push(p));
        });
        if (boundsPoints.length) state.map.fitBounds(boundsPoints, { padding: [50, 50] });

        const empty = document.querySelector('.route-map-empty');
        if (empty) empty.style.display = 'none';
    }

    function clearMapLayers() {
        state.polylines.primary.forEach(p => state.map.removeLayer(p));
        state.polylines.alternative.forEach(p => state.map.removeLayer(p));
        state.polylines = { primary: [], alternative: [] };
        
        // Remove markers
        state.map.eachLayer(layer => {
            if (layer instanceof L.Marker) state.map.removeLayer(layer);
        });
    }

    function getRiskColor(level) {
        const colors = {
            'SAFE': '#16A34A',
            'WATCH': '#EAB308',
            'HIGH': '#F97316',
            'CRITICAL': '#DC2626'
        };
        return colors[level] || '#19B8C7';
    }

    // ============ SELECT SEGMENT ============
    function selectSegment(segmentId, isAlternative = false) {
        state.activeSegment = segmentId;

        // Find segment data
        const route = state.currentRoute;
        const segments = isAlternative ? route.alternative.segments : route.primary.segments;
        const segment = segments.find(s => s.id === segmentId);
        if (!segment) return;

        // Highlight in list
        document.querySelectorAll('.segment-item').forEach(el => {
            el.classList.toggle('active', el.dataset.segmentId === segmentId);
        });

        // Show popup on map
        showSegmentPopup(segment, isAlternative);
    }

    function showSegmentPopup(segment, isAlternative) {
        const popup = document.getElementById('segmentPopup');
        if (!popup) return;

        const level = segment.level.toLowerCase();

        popup.innerHTML = `
            <button class="segment-popup-close" onclick="document.getElementById('segmentPopup').classList.remove('active')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div class="segment-popup-header">
                <div class="segment-popup-name">${segment.name}</div>
                <span class="segment-popup-level ${level}">${segment.level}</span>
            </div>
            <div class="segment-popup-row">
                <span class="segment-popup-label">Risk Score</span>
                <span class="segment-popup-value">${segment.risk} / 100</span>
            </div>
            <div class="segment-popup-row">
                <span class="segment-popup-label">Distance</span>
                <span class="segment-popup-value">${segment.distance} km</span>
            </div>
            <div class="segment-popup-row">
                <span class="segment-popup-label">Route</span>
                <span class="segment-popup-value">${isAlternative ? 'Alternative' : 'Primary'}</span>
            </div>
            <div class="segment-popup-reason">
                <strong>Reason:</strong> ${segment.reason}
            </div>
            <div class="segment-popup-demo">LIVE MODEL · ${segment.source || 'SAHAYAK risk model'}</div>
        `;

        popup.classList.add('active');
    }

    // ============ TOGGLE ALTERNATIVE ============
    function toggleAlternative() {
        state.showAlternative = !state.showAlternative;
        
        // Redraw alternative with new opacity
        state.polylines.alternative.forEach(polyline => {
            polyline.setStyle({
                opacity: state.showAlternative ? 0.8 : 0.3,
                dashArray: state.showAlternative ? null : '8, 8'
            });
        });

        // Update button text
        const btn = document.querySelector('.alternative-actions .btn-outline');
        if (btn) {
            btn.textContent = state.showAlternative ? 'Hide on Map' : 'Show on Map';
        }
    }

    function useAlternative() {
        if (!state.currentRoute || !state.currentRoute.alternative) return;

        // Swap primary and alternative
        const temp = state.currentRoute.primary;
        state.currentRoute.primary = state.currentRoute.alternative;
        state.currentRoute.alternative = temp;

        // Redraw
        renderResults(state.currentRoute);
        drawRoute(state.currentRoute);

        // Show confirmation
        const card = document.querySelector('.route-result-card');
        if (card) {
            card.style.animation = 'none';
            setTimeout(() => card.style.animation = 'slideInUp 0.4s ease-out', 10);
        }
    }

    // ============ ANIMATE FACTORS ============
    function animateFactors() {
        const factors = document.querySelectorAll('#routeFactors .route-factor');
        if (!factors.length) return;

        if (Utils.prefersReducedMotion()) {
            factors.forEach(f => f.classList.add('revealed'));
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const allFactors = entry.target.querySelectorAll('.route-factor');
                    allFactors.forEach((f, i) => setTimeout(() => f.classList.add('revealed'), i * 120));
                    observer.disconnect();
                }
            });
        }, { threshold: 0.2 });

        const container = document.getElementById('routeFactors');
        if (container) observer.observe(container);
    }



    function retry() { analyzeRoute(); }

    // ============ EVENT LISTENERS ============
    function setupEventListeners() {
        const startSelect = document.getElementById('startSelect');
        const destSelect = document.getElementById('destSelect');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const swapBtn = document.getElementById('swapBtn');

        if (startSelect) {
            startSelect.addEventListener('change', (e) => {
                state.startLocation = e.target.value;
            });
        }

        if (destSelect) {
            destSelect.addEventListener('change', (e) => {
                state.destination = e.target.value;
            });
        }

        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', analyzeRoute);
        }

        if (swapBtn) {
            swapBtn.addEventListener('click', () => {
                const temp = state.startLocation;
                state.startLocation = state.destination;
                state.destination = temp;
                startSelect.value = state.startLocation;
                destSelect.value = state.destination;
            });
        }

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

        // Close segment popup on map click
        if (state.map) {
            state.map.on('click', () => {
                const popup = document.getElementById('segmentPopup');
                if (popup) popup.classList.remove('active');
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
            'building': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/></svg>',
            'route': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>',
            'sliders': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="20" y1="21" x2="20" y2="16"/></svg>',
            'bar-chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
            'cpu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/></svg>',
            'users': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
            'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>'
        };
        return icons[name] || '';
    }

    // ============ EXPOSE PUBLIC API ============
    window.SahayakRoute = {
        analyzeRoute,
        selectSegment,
        toggleAlternative,
        useAlternative,
        retry
    };

    // ============ BOOT ============
    document.addEventListener('DOMContentLoaded', init);
})();