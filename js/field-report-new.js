// js/field-report-new.js — Create Field Report (Mobile-first)
(function() {
    'use strict';
  
    const state = {
      formData: {
        type: '',
        latitude: null,
        longitude: null,
        accuracy: null,
        locationName: '',
        locationState: '',
        severity: '',
        observation: '',
        aiPredictionMatch: '',
        photos: []
      },
     officer: {
      name: '',
      district: '',
      role: ''
    },
      isOffline: false,
      notifications: []
    };
  
    function init() {

  const user = AUTH.getUser();

  if (user) {
    state.officer.name = user.name || 'Citizen User';

    if (user.role === 'citizen') {
      state.officer.role = 'Citizen';
    } else if (user.role === 'field_officer') {
      state.officer.role = 'Field Officer';
    } else if (user.role === 'district_officer') {
      state.officer.role = 'District Officer';
    } else if (user.role === 'disaster_authority') {
      state.officer.role = 'Disaster Authority';
    } else {
      state.officer.role = user.role || 'User';
    }
    const displayName = user.name || 'User';

let displayRole = 'User';

if (user.role === 'citizen') {
    displayRole = 'Citizen';
} else if (user.role === 'field_officer') {
    displayRole = 'Field Officer';
} else if (user.role === 'district_officer') {
    displayRole = 'District Officer';
} else if (user.role === 'disaster_authority') {
    displayRole = 'Disaster Authority';
} else if (user.role === 'super_admin') {
    displayRole = 'Administrator';
} else {
    displayRole = user.role || 'User';
}

const initials = displayName
    .split(' ')
    .map(word => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

document.getElementById('headerUserAvatar').textContent = initials;
document.getElementById('headerUserName').textContent = displayRole;

document.getElementById('sidebarUserAvatar').textContent = initials;
document.getElementById('sidebarUserName').textContent = displayName;
document.getElementById('sidebarUserRole').textContent = displayRole;

document.getElementById('statusUserRole').textContent = displayRole;

document.getElementById('reporterName').textContent = displayName;
document.getElementById('reporterRole').textContent = displayRole;

if (user.district) {
    document.getElementById('reporterDistrict').textContent = user.district;
}
  }

  renderSidebar();
  setupForm();
  setupPhotoUpload();
  setupEventListeners();
  loadNotifications();
  updateTimestamp();
}
  
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
  
    function setupForm() {
      // Report type
      document.querySelectorAll('input[name="reportType"]').forEach(r => {
        r.addEventListener('change', (e) => { state.formData.type = e.target.value; });
      });
  
      // Severity
      document.querySelectorAll('input[name="severity"]').forEach(r => {
        r.addEventListener('change', (e) => { state.formData.severity = e.target.value; });
      });
  
      // AI match
      document.querySelectorAll('input[name="aiMatch"]').forEach(r => {
        r.addEventListener('change', (e) => { state.formData.aiPredictionMatch = e.target.value; });
      });
  
      // Observation
      const obs = document.getElementById('observation');
      if (obs) obs.addEventListener('input', (e) => { state.formData.observation = e.target.value; });
    }
  
    function formatCoordinates(latitude, longitude, digits = 4) {
      const latDirection = latitude < 0 ? 'S' : 'N';
      const lonDirection = longitude < 0 ? 'W' : 'E';
      return `${Math.abs(latitude).toFixed(digits)}° ${latDirection}, ${Math.abs(longitude).toFixed(digits)}° ${lonDirection}`;
    }

    async function resolveLocationName(latitude, longitude) {
      // Reverse-geocode the captured GPS position. If the service is unavailable,
      // coordinates remain the truthful location instead of a hardcoded demo district.
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=10&addressdetails=1`;
        const response = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        if (!response.ok) throw new Error('Reverse geocoding unavailable');
        const result = await response.json();
        const address = result.address || {};
        const locality = address.suburb || address.neighbourhood || address.city_district ||
          address.city || address.town || address.village || address.municipality ||
          address.county || address.state_district || '';
        const region = address.state || address.region || '';
        state.formData.locationName = [locality, region].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')
          || result.name || formatCoordinates(latitude, longitude, 4);
        state.formData.locationState = region || address.country || '';
      } catch (error) {
        state.formData.locationName = formatCoordinates(latitude, longitude, 4);
        state.formData.locationState = '';
      }
    }

    async function captureGPS() {
      const coordsEl = document.getElementById('gpsCoords');
      const accuracyEl = document.getElementById('gpsAccuracy');
      const captureBtn = document.getElementById('captureGpsBtn');

      if (!navigator.geolocation) {
        coordsEl.textContent = 'GPS is not available in this browser';
        accuracyEl.textContent = 'Use a browser/device with location access enabled';
        return;
      }

      captureBtn.textContent = 'Capturing...';
      captureBtn.disabled = true;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          state.formData.latitude = pos.coords.latitude;
          state.formData.longitude = pos.coords.longitude;
          state.formData.accuracy = Math.round(pos.coords.accuracy);
          state.formData.locationName = '';
          state.formData.locationState = '';
          coordsEl.textContent = formatCoordinates(pos.coords.latitude, pos.coords.longitude);
          accuracyEl.textContent = `Accuracy: ±${state.formData.accuracy}m · Resolving place name...`;
          captureBtn.textContent = '✓ Location Captured';
          captureBtn.style.background = 'var(--safe-bg)';
          captureBtn.style.color = 'var(--safe)';
          captureBtn.style.borderColor = 'var(--safe)';
          captureBtn.disabled = false;

          await resolveLocationName(pos.coords.latitude, pos.coords.longitude);
          accuracyEl.textContent = `Accuracy: ±${state.formData.accuracy}m`;
          // Show both the resolved locality and the exact coordinates so the user
          // can verify that the report is tied to the captured position.
          coordsEl.textContent = `${state.formData.locationName} · ${formatCoordinates(pos.coords.latitude, pos.coords.longitude)}`;
        },
        (error) => {
          state.formData.latitude = null;
          state.formData.longitude = null;
          state.formData.accuracy = null;
          state.formData.locationName = '';
          state.formData.locationState = '';
          coordsEl.textContent = 'Location not captured';
          accuracyEl.textContent = error && error.code === 1
            ? 'Location permission denied. Allow location access and try again.'
            : 'Could not get GPS location. Check device location and try again.';
          captureBtn.textContent = '📍 Capture Location';
          captureBtn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }

    function useDemoGPS() {
      state.formData.latitude = 27.586;
      state.formData.longitude = 91.859;
      state.formData.accuracy = 15;
      state.formData.locationName = 'Tawang (Demo)';
      state.formData.locationState = 'Arunachal Pradesh';
      const coordsEl = document.getElementById('gpsCoords');
      const accuracyEl = document.getElementById('gpsAccuracy');
      const captureBtn = document.getElementById('captureGpsBtn');
      coordsEl.textContent = 'Tawang (Demo) · 27.5860° N, 91.8590° E';
      accuracyEl.textContent = 'Accuracy: ±15m (Demo)';
      captureBtn.textContent = '✓ Demo Location';
      captureBtn.disabled = false;
    }

    function setupPhotoUpload() {
      const uploadArea = document.getElementById('photoUploadArea');
      const fileInput = document.getElementById('photoFileInput');
  
      if (!uploadArea || !fileInput) return;
  
      uploadArea.addEventListener('click', () => fileInput.click());
  
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });
      uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
      });
  
      fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }
  
    function handleFiles(files) {
      Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          state.formData.photos.push({
            id: 'photo-' + Date.now() + '-' + Math.random(),
            dataUrl: e.target.result,
            name: file.name
          });
          renderPhotoPreviews();
        };
        reader.readAsDataURL(file);
      });
    }
  
    function renderPhotoPreviews() {
      const grid = document.getElementById('photoPreviewGrid');
      if (!grid) return;
      grid.innerHTML = state.formData.photos.map(p => `
        <div class="photo-preview-item">
          <img src="${p.dataUrl}" alt="${p.name}">
          <button class="photo-preview-remove" onclick="window.SahayakFieldReportNew.removePhoto('${p.id}')" aria-label="Remove">×</button>
          <div class="photo-preview-demo-badge">DEMO UPLOAD</div>
        </div>
      `).join('');
    }
  
    function removePhoto(id) {
      state.formData.photos = state.formData.photos.filter(p => p.id !== id);
      renderPhotoPreviews();
    }
  
    function updateTimestamp() {
      const el = document.getElementById('reportTimestamp');
      if (el) el.textContent = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium', timeStyle: 'short'
      });
    }
  
    async function saveOffline() {
      if (!hasCapturedLocation()) { alert('Please capture your current GPS location before saving the report.'); return; }
      const report = buildReport();
      report.id = 'FR-OFF-' + Date.now();
      await Services.addToOfflineQueue(report);
      showSuccess(true);
    }
  
    async function submitReport() {
      if (!state.formData.type) { alert('Please select a report type'); return; }
      if (!state.formData.severity) { alert('Please select severity'); return; }
      if (!state.formData.observation) { alert('Please describe your observation'); return; }
      if (!hasCapturedLocation()) { alert('Please capture your current GPS location before submitting the report.'); return; }
  
      const report = buildReport();
  
      if (state.isOffline) {
        await Services.addToOfflineQueue(report);
      } else {
        await Services.createFieldReport(report);
      }
      showSuccess(false);
    }
  
    function hasCapturedLocation() {
      return Number.isFinite(state.formData.latitude) && Number.isFinite(state.formData.longitude);
    }

    function buildReport() {
      return {
        type: state.formData.type,
        location: state.formData.locationName || formatCoordinates(state.formData.latitude, state.formData.longitude, 4),
        state: state.formData.locationState || 'Location not resolved',
        severity: state.formData.severity,
        officer: state.officer.name,
        officerRole: state.officer.role,
        latitude: state.formData.latitude,
        longitude: state.formData.longitude,
        observation: state.formData.observation,
        aiPredictionMatch: state.formData.aiPredictionMatch || 'unable',
        aiRisk: 82,
        fieldAssessment: state.formData.severity,
        photos: state.formData.photos.map(p => p.id)
      };
    }
  
    function showSuccess(isOffline) {
      const main = document.querySelector('.main-content');
      const reportId = isOffline ? 'FR-OFF-' + Date.now().toString().slice(-4) : 'FR-' + (1000 + SahayakState.getReports().length + 1);
  
      main.innerHTML = `
        <div class="success-state" style="max-width: 640px; margin: var(--space-8) auto;">
          <div class="success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="success-title">REPORT RECEIVED</div>
          <div class="success-subtitle">Your field report has been recorded successfully.</div>
          <div class="success-details">
            <div class="success-details-row">
              <span class="success-details-label">Report ID</span>
              <span class="success-details-value">${reportId}</span>
            </div>
            <div class="success-details-row">
              <span class="success-details-label">Type</span>
              <span class="success-details-value">${state.formData.type}</span>
            </div>
            <div class="success-details-row">
              <span class="success-details-label">Severity</span>
              <span class="success-details-value">${state.formData.severity}</span>
            </div>
            <div class="success-details-row">
              <span class="success-details-label">Location</span>
              <span class="success-details-value">${state.formData.latitude?.toFixed(3)}°, ${state.formData.longitude?.toFixed(3)}°</span>
            </div>
            <div class="success-details-row">
              <span class="success-details-label">Status</span>
              <span class="success-details-value">${isOffline ? 'Saved Offline' : 'Pending Verification'}</span>
            </div>
          </div>
          <div style="display: flex; gap: var(--space-3); justify-content: center; flex-wrap: wrap;">
            <a href="field-reports.html" class="btn btn-primary">View Report →</a>
            <a href="field-report-new.html" class="btn btn-outline">Submit Another</a>
            <a href="dashboard.html" class="btn btn-outline">Back to Dashboard</a>
          </div>
          ${isOffline ? `
            <div style="margin-top: var(--space-4); padding: var(--space-3); background: var(--alert-bg); border: 1px solid rgba(249, 115, 22, 0.2); border-radius: var(--radius-md); font-size: var(--fs-xs); color: var(--alert);">
              <strong>Offline mode:</strong> Report saved locally. Will sync automatically when connection is restored.
            </div>
          ` : ''}
        </div>
      `;
    }
  
    function toggleOffline() {
      state.isOffline = !state.isOffline;
      const status = document.getElementById('offlineStatus');
      if (state.isOffline) {
        status.classList.add('offline');
        status.innerHTML = '<span class="offline-status-dot"></span><span>OFFLINE — Reports will sync automatically</span>';
      } else {
        status.classList.remove('offline');
        status.innerHTML = '<span class="offline-status-dot"></span><span>ONLINE</span>';
      }
    }
  
    async function loadNotifications() {
      state.notifications = SahayakState.getNotifications();
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
    }
  
    window.SahayakFieldReportNew = {
      captureGPS, removePhoto,
      saveOffline, submitReport, useDemoGPS,
      toggleOffline
    };
  
    document.addEventListener('DOMContentLoaded', init);
  })();