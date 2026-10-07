/**
 * LabDrop Admin Intelligence — Interactive Stock Dashboard
 * Powered by ApexCharts & Live Node/MongoDB Telemetry
 */

(function () {
  'use strict';

  // --- Global State ---
  let adminKey = '';
  let dashboardData = null;
  let activeRange = '30D'; // '24H', '7D', '14D', '30D', '90D', 'ALL'
  let viewMode = 'daily';   // 'daily' (volume spikes) or 'cumulative' (rising curve)
  let autoRefreshActive = true;
  let autoRefreshIntervalSec = 15;
  let refreshCountdown = autoRefreshIntervalSec;
  let countdownTimerId = null;
  let tickerIntervalId = null;

  // Chart instances
  let tradingChartInstance = null;
  let sparklines = {};
  let chartMode = 'dayWise'; // 'dayWise' (primary slidable growth view) or 'intraday'
  let currentWindowSpan = null; // null means full or auto sliding window

  const activeSeries = {
    transfers: true,
    downloads: true,
    visitors: true,
    files: true
  };

  const METRIC_COLORS = {
    transfers: '#FFD166', // Gold
    files: '#06D6A0',     // Emerald / Cyan
    downloads: '#8B5CF6', // Purple
    visitors: '#F43F5E',  // Sunset Rose
    active: '#FB923C',    // Orange
    storage: '#38BDF8'    // Blue
  };

  // --- DOM Elements ---
  const authModal = document.getElementById('authModal');
  const authInput = document.getElementById('authInput');
  const authForm = document.getElementById('authForm');
  const authError = document.getElementById('authError');
  const btnRefresh = document.getElementById('btnRefresh');
  const btnAutoRefresh = document.getElementById('btnAutoRefresh');
  const autoRefreshText = document.getElementById('autoRefreshText');
  const btnLogout = document.getElementById('btnLogout');
  const toastNotice = document.getElementById('toastNotice');

  // --- Initialize on Page Load ---
  document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    setupEventHandlers();
  });

  // ============================================================
  // Authentication & Initialization
  // ============================================================

  function initAuth() {
    const urlParams = new URLSearchParams(window.location.search);
    const passFromUrl = urlParams.get('pass') || urlParams.get('key');
    const storedPass = sessionStorage.getItem('labdrop_admin_key');

    if (passFromUrl) {
      adminKey = passFromUrl;
      sessionStorage.setItem('labdrop_admin_key', passFromUrl);
    } else if (storedPass) {
      adminKey = storedPass;
    }

    if (adminKey) {
      hideAuthModal();
      fetchDashboardData();
    } else {
      showAuthModal();
    }
  }

  function showAuthModal() {
    authModal.classList.remove('hidden');
    setTimeout(() => authInput.focus(), 100);
  }

  function hideAuthModal() {
    authModal.classList.add('hidden');
  }

  function setupEventHandlers() {
    // Auth Form
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = authInput.value.trim();
      if (!val) return;
      adminKey = val;
      sessionStorage.setItem('labdrop_admin_key', val);
      fetchDashboardData(true);
    });

    // Logout / Lock
    btnLogout.addEventListener('click', () => {
      sessionStorage.removeItem('labdrop_admin_key');
      adminKey = '';
      showAuthModal();
      showToast('Dashboard locked.');
    });

    // Refresh Now
    btnRefresh.addEventListener('click', () => {
      btnRefresh.classList.add('spinning');
      fetchDashboardData().finally(() => {
        setTimeout(() => btnRefresh.classList.remove('spinning'), 600);
      });
    });

    // Auto-refresh Toggle
    btnAutoRefresh.addEventListener('click', () => {
      autoRefreshActive = !autoRefreshActive;
      if (autoRefreshActive) {
        btnAutoRefresh.classList.add('active');
        refreshCountdown = autoRefreshIntervalSec;
        autoRefreshText.textContent = `Auto-Refresh: ${refreshCountdown}s`;
      } else {
        btnAutoRefresh.classList.remove('active');
        autoRefreshText.textContent = 'Auto-Refresh: Paused';
      }
    });

    // Range Buttons
    document.querySelectorAll('[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeRange = btn.dataset.range;
        if (tradingChartInstance && tradingChartInstance.w) {
          const { max } = tradingChartInstance.w.globals;
          let days = 30;
          if (activeRange === '7D') days = 7;
          else if (activeRange === '14D') days = 14;
          else if (activeRange === '90D') days = 90;
          else if (activeRange === 'ALL') {
            tradingChartInstance.resetSeries();
            return;
          }
          const minTime = max - (days * 24 * 3600 * 1000);
          tradingChartInstance.zoomX(minTime, max);
        }
      });
    });

    // Metric Series Toggles
    document.querySelectorAll('[data-toggle-metric]').forEach(pill => {
      pill.addEventListener('click', () => {
        const metric = pill.dataset.toggleMetric;
        activeSeries[metric] = !activeSeries[metric];
        pill.classList.toggle('active', activeSeries[metric]);
        updateTradingChartSeries();
      });
    });

    // Chart Mode Toggles (Intraday 24H Pulse vs Day-Wise Growth)
    const btnModeIntraday = document.getElementById('btnModeIntraday');
    const btnModeDayWise = document.getElementById('btnModeDayWise');
    const chartTitleIcon = document.getElementById('chartTitleIcon');
    const chartTitleText = document.getElementById('chartTitleText');
    const chartSubtitleText = document.getElementById('chartSubtitleText');

    function setChartMode(mode) {
      chartMode = mode;
      currentWindowSpan = null;
      if (mode === 'dayWise') {
        if (btnModeDayWise) btnModeDayWise.classList.add('active');
        if (btnModeIntraday) btnModeIntraday.classList.remove('active');
        if (chartTitleIcon) chartTitleIcon.textContent = '📈';
        if (chartTitleText) chartTitleText.textContent = 'LabDrop Day-Wise Growth';
        if (chartSubtitleText) chartSubtitleText.textContent = 'Event timeline recorded on count increases starting from current counters — Slidable across time';
        const pillFiles = document.getElementById('pillFiles');
        if (pillFiles) {
          activeSeries.files = true;
          pillFiles.classList.add('active');
        }
      } else {
        if (btnModeIntraday) btnModeIntraday.classList.add('active');
        if (btnModeDayWise) btnModeDayWise.classList.remove('active');
        if (chartTitleIcon) chartTitleIcon.textContent = '⏱️';
        if (chartTitleText) chartTitleText.textContent = "Today's Intraday 24-Hour Pulse";
        if (chartSubtitleText) chartSubtitleText.textContent = 'Hourly velocity showing activity distribution across morning, afternoon, and evening';
        const pillFiles = document.getElementById('pillFiles');
        if (pillFiles) {
          activeSeries.files = false;
          pillFiles.classList.remove('active');
        }
      }
      updateTradingChartSeries();
      const slider = document.getElementById('timelineRangeSlider');
      if (slider) slider.value = 100;
      const bounds = getTimelineBounds();
      if (bounds) updateSliderLabels(bounds.minT, bounds.maxT, bounds.minT, bounds.maxT);
    }

    if (btnModeIntraday && btnModeDayWise) {
      btnModeIntraday.addEventListener('click', () => setChartMode('intraday'));
      btnModeDayWise.addEventListener('click', () => setChartMode('dayWise'));
    }

    // Interactive Timeline Range Slider Scrubber
    const timelineSlider = document.getElementById('timelineRangeSlider');
    const btnSlideBarLeft = document.getElementById('btnSlideBarLeft');
    const btnSlideBarRight = document.getElementById('btnSlideBarRight');

    if (timelineSlider) {
      timelineSlider.addEventListener('input', (e) => {
        applySliderWindow(parseInt(e.target.value, 10));
      });
    }

    const slideTimelineStep = (direction) => {
      if (!timelineSlider) return;
      const cur = parseInt(timelineSlider.value, 10);
      const step = 15;
      const next = direction === 'left' ? Math.max(0, cur - step) : Math.min(100, cur + step);
      timelineSlider.value = next;
      applySliderWindow(next);
    };

    if (btnSlideBarLeft) btnSlideBarLeft.addEventListener('click', () => slideTimelineStep('left'));
    if (btnSlideBarRight) btnSlideBarRight.addEventListener('click', () => slideTimelineStep('right'));

    // Trading Navigation Controls (Pan Left/Right, Zoom In/Out, Reset)
    const btnPanLeft = document.getElementById('btnPanLeft');
    const btnPanRight = document.getElementById('btnPanRight');
    const btnZoomIn = document.getElementById('btnZoomIn');
    const btnZoomOut = document.getElementById('btnZoomOut');
    const btnChartReset = document.getElementById('btnChartReset');

    if (btnPanLeft) btnPanLeft.addEventListener('click', () => slideTimelineStep('left'));
    if (btnPanRight) btnPanRight.addEventListener('click', () => slideTimelineStep('right'));

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        const bounds = getTimelineBounds();
        if (!bounds) return;
        const totalSpan = bounds.maxT - bounds.minT;
        currentWindowSpan = Math.max(3600 * 1000 * 2, (currentWindowSpan || totalSpan * 0.65) * 0.7);
        const curVal = timelineSlider ? parseInt(timelineSlider.value, 10) : 100;
        applySliderWindow(curVal);
      });
    }
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        const bounds = getTimelineBounds();
        if (!bounds) return;
        const totalSpan = bounds.maxT - bounds.minT;
        currentWindowSpan = Math.min(totalSpan, (currentWindowSpan || totalSpan * 0.65) * 1.35);
        const curVal = timelineSlider ? parseInt(timelineSlider.value, 10) : 100;
        applySliderWindow(curVal);
      });
    }
    if (btnChartReset) {
      btnChartReset.addEventListener('click', () => {
        currentWindowSpan = null;
        if (timelineSlider) timelineSlider.value = 100;
        if (tradingChartInstance) tradingChartInstance.resetSeries();
        const bounds = getTimelineBounds();
        if (bounds) updateSliderLabels(bounds.minT, bounds.maxT, bounds.minT, bounds.maxT);
      });
    }

    // Daily Ledger Search
    const searchInput = document.getElementById('ledgerSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filterLedgerTable(e.target.value.trim().toLowerCase());
      });
    }

    // Export CSV
    const btnExportCsv = document.getElementById('btnExportCsv');
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', exportLedgerCsv);
    }

    // Auto-refresh countdown loop
    startCountdownLoop();

    // Start live countdown ticker for active transfers
    tickerIntervalId = setInterval(updateActiveTransferTimers, 1000);
  }

  function startCountdownLoop() {
    if (countdownTimerId) clearInterval(countdownTimerId);
    countdownTimerId = setInterval(() => {
      if (!autoRefreshActive || !dashboardData) return;
      refreshCountdown--;
      if (refreshCountdown <= 0) {
        refreshCountdown = autoRefreshIntervalSec;
        fetchDashboardData(false, true);
      }
      autoRefreshText.textContent = `Auto-Refresh: ${refreshCountdown}s`;
    }, 1000);
  }

  // ============================================================
  // Data Fetching
  // ============================================================

  async function fetchDashboardData(fromLogin = false, isSilent = false) {
    if (!adminKey) return;
    try {
      const res = await fetch(`/api/admin/dashboard-data?pass=${encodeURIComponent(adminKey)}`);
      if (res.status === 401 || res.status === 403) {
        if (fromLogin) {
          authError.textContent = 'Invalid passkey. Access denied.';
          authError.classList.add('visible');
          authForm.classList.add('shake');
          setTimeout(() => authForm.classList.remove('shake'), 500);
        } else {
          showAuthModal();
        }
        return;
      }
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);

      dashboardData = await res.json();
      hideAuthModal();
      authError.classList.remove('visible');

      updateHeaderSystemMeta();
      updateKPICards();
      renderAllCharts();
      renderActiveTransfersTable();
      renderLedgerTable();

      if (!isSilent) {
        showToast('Dashboard data updated');
      }
    } catch (err) {
      console.error('Fetch dashboard error:', err);
      if (fromLogin) {
        authError.textContent = 'Server connection failed. Try again.';
        authError.classList.add('visible');
      }
    }
  }

  // ============================================================
  // Header & Meta Updates
  // ============================================================

  function updateHeaderSystemMeta() {
    if (!dashboardData) return;
    const sys = dashboardData.system || {};
    const sysUptime = document.getElementById('sysUptime');
    const sysRam = document.getElementById('sysRam');
    const sysMongo = document.getElementById('sysMongo');
    const sysSockets = document.getElementById('sysSockets');

    if (sysUptime) {
      const mins = Math.floor((sys.uptimeSeconds || 0) / 60);
      const hrs = Math.floor(mins / 60);
      sysUptime.textContent = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
    }
    if (sysRam) sysRam.textContent = `${sys.memoryRssMB || 0} MB`;
    if (sysMongo) sysMongo.textContent = sys.mongoStatus || 'Connected';
    if (sysSockets) sysSockets.textContent = `${sys.activeSockets || 0}`;
  }

  // ============================================================
  // KPI Cards & Mini Sparklines
  // ============================================================

  function updateKPICards() {
    if (!dashboardData) return;
    const { totals, trends } = dashboardData;

    // Totals
    setElementText('kpiTransfersVal', formatNumber(totals.transfers));
    setElementText('kpiFilesVal', formatNumber(totals.files));
    setElementText('kpiDownloadsVal', formatNumber(totals.downloads));
    setElementText('kpiVisitorsVal', formatNumber(totals.visitors));
    setElementText('kpiActiveVal', formatNumber(totals.activeTransfers));
    setElementText('kpiStorageVal', formatBytes(totals.activeStorageBytes));

    // Deltas
    if (trends.isDayOne) {
      updateDeltaBadge('kpiTransfersDelta', trends.transfers.today, null, true);
      updateDeltaBadge('kpiFilesDelta', trends.files.today, null, true);
      updateDeltaBadge('kpiDownloadsDelta', trends.downloads.today, null, true);
      updateDeltaBadge('kpiVisitorsDelta', trends.visitors.today, null, true);
    } else {
      updateDeltaBadge('kpiTransfersDelta', trends.transfers.change24h, trends.transfers.pct24h);
      updateDeltaBadge('kpiFilesDelta', trends.files.change24h, trends.files.pct24h);
      updateDeltaBadge('kpiDownloadsDelta', trends.downloads.change24h, trends.downloads.pct24h);
      updateDeltaBadge('kpiVisitorsDelta', trends.visitors.change24h, trends.visitors.pct24h);
    }

    // Subtext
    setElementText('kpiTransfersSub', trends.isDayOne ? `Today: +${trends.transfers.today} (Realtime Live)` : `Today: +${trends.transfers.today} | 24h: ${trends.transfers.change24h}`);
    const avgFiles = totals.transfers > 0 ? (totals.files / totals.transfers).toFixed(1) : '1.0';
    setElementText('kpiFilesSub', `Avg: ${avgFiles} files / transfer`);
    const dlRatio = totals.transfers > 0 ? (totals.downloads / totals.transfers).toFixed(2) : '1.0';
    setElementText('kpiDownloadsSub', `Conversion: ${dlRatio}x per transfer`);
    setElementText('kpiVisitorsSub', `Baseline: 240 | +${trends.visitors.today} today`);
    setElementText('kpiActiveSub', `${totals.activeFiles} files currently live`);
    setElementText('kpiStorageSub', `Uploaded today: ${formatBytes(totals.todayStorageBytes)}`);

    // Render Sparklines
    renderSparklines();
  }

  function updateDeltaBadge(id, change, pct, isDayOne = false) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isDayOne) {
      el.className = 'kpi-delta delta-positive';
      el.textContent = `● Today: +${change}`;
      return;
    }
    const isPos = change > 0;
    const isZero = change === 0;
    el.className = `kpi-delta ${isZero ? 'delta-neutral' : isPos ? 'delta-positive' : 'delta-neutral'}`;
    const sign = isPos ? '▲ +' : isZero ? '● ' : '▼ ';
    el.textContent = `${sign}${change} (${pct}%)`;
  }

  function renderSparklines() {
    const ts = dashboardData.timeseries || [];
    const intra = dashboardData.intraday || [];
    // If timeseries has only 1 day, use real intraday hourly points for rich sparkline curve
    const useHourly = ts.length <= 1 && intra.length > 0;

    const getSparkPoints = (metricKey) => {
      if (useHourly) {
        return intra.map(h => ({ timestamp: h.timestamp, val: h[metricKey] || 0 }));
      }
      return ts.slice(-14).map(d => ({
        timestamp: d.timestamp,
        val: metricKey === 'transfers' ? d.dailyTransfers
           : metricKey === 'files' ? d.dailyFiles
           : metricKey === 'downloads' ? d.dailyDownloads
           : metricKey === 'visitors' ? d.dailyVisitors
           : metricKey === 'active' ? d.activeTransfers
           : (d.storageBytes || 0)
      }));
    };

    const sparkConfig = (elId, seriesData, color) => {
      const el = document.getElementById(elId);
      if (!el) return;
      const formattedData = seriesData.map(item => ({ x: item.timestamp, y: item.val }));

      if (sparklines[elId]) {
        sparklines[elId].updateSeries([{ data: formattedData }]);
        return;
      }

      const options = {
        series: [{ data: formattedData }],
        chart: {
          type: 'area',
          height: 48,
          sparkline: { enabled: true },
          animations: { enabled: true, speed: 400 }
        },
        stroke: { curve: 'smooth', width: 2 },
        colors: [color],
        fill: {
          type: 'gradient',
          gradient: {
            shadeIntensity: 1,
            opacityFrom: 0.55,
            opacityTo: 0.05,
            stops: [0, 100]
          }
        },
        tooltip: {
          theme: 'dark',
          fixed: { enabled: false },
          x: { show: false },
          y: {
            title: { formatter: () => '' },
            formatter: (val) => formatNumber(val)
          },
          marker: { show: false }
        }
      };

      sparklines[elId] = new ApexCharts(el, options);
      sparklines[elId].render();
    };

    sparkConfig('sparkTransfers', getSparkPoints('transfers'), METRIC_COLORS.transfers);
    sparkConfig('sparkFiles', getSparkPoints('files'), METRIC_COLORS.files);
    sparkConfig('sparkDownloads', getSparkPoints('downloads'), METRIC_COLORS.downloads);
    sparkConfig('sparkVisitors', getSparkPoints('visitors'), METRIC_COLORS.visitors);
    sparkConfig('sparkActive', getSparkPoints('active'), METRIC_COLORS.active);
    sparkConfig('sparkStorage', getSparkPoints('storageBytes'), METRIC_COLORS.storage);
  }

  // ============================================================
  // Trading Pulse Chart (Attached Reference Style Everywhere)
  // Day-Wise Growth Recorded Strictly on Count Increases — Slidable Timeline
  // Stock-style Non-Zero Baselines & Interactive Range Slider
  // ============================================================

  function formatTimelineDate(ts, short = false) {
    if (!ts) return '';
    const d = new Date(ts);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate().toString().padStart(2, '0');
    const mo = months[d.getMonth()];
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    if (short) return `${day} ${mo}`;
    return `${day} ${mo} ${hh}:${mm}`;
  }

  function getTimelineBounds() {
    const data = getTradingSeriesData();
    const allPts = [];
    if (activeSeries.transfers) allPts.push(...(data.transfers || []));
    if (activeSeries.downloads) allPts.push(...(data.downloads || []));
    if (activeSeries.visitors) allPts.push(...(data.visitors || []));
    if (activeSeries.files) allPts.push(...(data.files || []));

    if (allPts.length === 0) return null;
    const times = allPts.map(p => p[0]);
    return {
      minT: Math.min(...times),
      maxT: Math.max(...times)
    };
  }

  function updateSliderLabels(startT, endT, minT, maxT) {
    const elMin = document.getElementById('sliderDateMin');
    const elMax = document.getElementById('sliderDateMax');
    const elText = document.getElementById('sliderRangeText');
    if (elMin) elMin.textContent = formatTimelineDate(minT, true);
    if (elMax) elMax.textContent = formatTimelineDate(maxT, true) + ' (Live)';
    if (elText) {
      elText.textContent = `${formatTimelineDate(startT)} — ${formatTimelineDate(endT)}`;
    }
  }

  function applySliderWindow(sliderVal) {
    if (!tradingChartInstance) return;
    const bounds = getTimelineBounds();
    if (!bounds) return;
    const { minT, maxT } = bounds;
    const totalSpan = maxT - minT;

    if (totalSpan <= 0) {
      updateSliderLabels(minT, maxT, minT, maxT);
      return;
    }

    const effectiveWindow = currentWindowSpan || Math.max(3600 * 1000 * 3, totalSpan * 0.65);
    const travel = Math.max(0, totalSpan - effectiveWindow);

    const progress = sliderVal / 100;
    const startT = minT + (travel * progress);
    const endT = Math.min(maxT, startT + effectiveWindow);

    tradingChartInstance.zoomX(startT, endT);
    updateSliderLabels(startT, endT, minT, maxT);
  }

  function syncSliderFromChart(chartContext, { xaxis }) {
    if (!xaxis) return;
    const bounds = getTimelineBounds();
    if (!bounds) return;
    const { minT, maxT } = bounds;
    const totalSpan = maxT - minT;
    if (totalSpan <= 0) return;

    const visibleSpan = xaxis.max - xaxis.min;
    currentWindowSpan = visibleSpan;
    const travel = totalSpan - visibleSpan;

    const slider = document.getElementById('timelineRangeSlider');
    if (slider && travel > 0) {
      const progress = Math.max(0, Math.min(1, (xaxis.min - minT) / travel));
      slider.value = Math.round(progress * 100);
    }
    updateSliderLabels(xaxis.min, xaxis.max, minT, maxT);
  }

  function renderAllCharts() {
    if (!dashboardData) return;
    renderTradingPulseChart();
  }

  function getTradingSeriesData() {
    if (!dashboardData) return { transfers: [], downloads: [], visitors: [], files: [] };
    if (chartMode === 'intraday') {
      const intraday = dashboardData.intraday || [];
      return {
        transfers: intraday.map(h => [h.timestamp, h.transfers || 0]),
        downloads: intraday.map(h => [h.timestamp, h.downloads || 0]),
        visitors: intraday.map(h => [h.timestamp, h.visitors || 0]),
        files: intraday.map(h => [h.timestamp, h.files || 0])
      };
    }
    // Day-Wise Growth: plot increase milestones across days so each event has a badge!
    const inc = dashboardData.increaseSeries || {};
    const source = (inc.eventTicks && inc.eventTicks.transfers && inc.eventTicks.transfers.length > 0)
      ? inc.eventTicks
      : (inc.dayWise || {});

    return {
      transfers: source.transfers || [],
      downloads: source.downloads || [],
      visitors: source.visitors || [],
      files: source.files || []
    };
  }

  function renderTradingPulseChart() {
    const el = document.getElementById('tradingPulseChart');
    if (!el || !dashboardData) return;

    // If chart instance already exists, update smoothly
    if (tradingChartInstance) {
      updateTradingChartSeries();
      return;
    }

    const data = getTradingSeriesData();
    const series = [];
    if (activeSeries.transfers) {
      series.push({
        name: 'Transfers',
        data: data.transfers,
        color: METRIC_COLORS.transfers
      });
    }
    if (activeSeries.downloads) {
      series.push({
        name: 'Downloads',
        data: data.downloads,
        color: METRIC_COLORS.downloads
      });
    }
    if (activeSeries.visitors) {
      series.push({
        name: 'Visitors',
        data: data.visitors,
        color: METRIC_COLORS.visitors
      });
    }
    if (activeSeries.files) {
      series.push({
        name: 'Files',
        data: data.files,
        color: METRIC_COLORS.files
      });
    }

    const options = {
      series,
      chart: {
        id: 'tradingStockChart',
        type: 'area',
        height: 380,
        background: 'transparent',
        toolbar: {
          show: true,
          autoSelected: 'pan', // Trading pan by default: drag to slide across timeline
          tools: {
            download: true,
            selection: true,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true
          }
        },
        zoom: {
          enabled: true,
          type: 'x',
          autoScaleYaxis: true
        },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 350
        },
        events: {
          scrolled: syncSliderFromChart,
          zoomed: syncSliderFromChart
        }
      },
      colors: series.map(s => s.color),
      stroke: {
        curve: 'smooth',
        width: chartMode === 'intraday' ? 2.5 : 3
      },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.52,
          opacityTo: 0.05,
          stops: [0, 90, 100]
        }
      },
      // Data labels badges matching the user's reference screenshot
      dataLabels: {
        enabled: true,
        style: {
          fontSize: '10px',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: '700'
        },
        background: {
          enabled: true,
          foreColor: '#ffffff',
          padding: 3,
          borderRadius: 3,
          borderWidth: 0,
          opacity: 0.92,
          dropShadow: {
            enabled: true,
            top: 1,
            left: 1,
            blur: 2,
            color: '#000',
            opacity: 0.35
          }
        },
        offsetY: -5,
        formatter: (val) => val
      },
      markers: {
        size: chartMode === 'intraday' ? 4 : 5,
        strokeWidth: 2,
        strokeColors: '#0a0d14',
        hover: { size: 7 }
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
          datetimeUTC: false,
          format: chartMode === 'dayWise' ? 'dd MMM HH:mm' : 'HH:mm'
        },
        axisBorder: { color: 'rgba(255, 255, 255, 0.08)' },
        axisTicks: { color: 'rgba(255, 255, 255, 0.08)' }
      },
      // Intraday: 0-6 nice integer scale; DayWise: Non-zero baseline starting from current counters
      yaxis: chartMode === 'intraday' ? {
        min: 0,
        max: function(max) {
          return max <= 8 ? Math.max(6, Math.ceil(max)) : Math.ceil(max + 1);
        },
        forceNiceScale: true,
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
          formatter: (val) => Math.round(val)
        }
      } : {
        min: function(min) {
          return Math.max(0, Math.floor(min - 5));
        },
        max: function(max) {
          return Math.ceil(max + 5);
        },
        forceNiceScale: true,
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
          formatter: (val) => Math.round(val)
        }
      },
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        strokeDashArray: 4,
        padding: {
          left: 15,
          right: 25,
          top: 10,
          bottom: 10
        }
      },
      theme: { mode: 'dark' },
      // Centered bottom legend matching reference screenshot
      legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'center',
        fontSize: '12px',
        labels: { colors: '#E5E7EB' },
        markers: { radius: 12, width: 10, height: 10 },
        itemMargin: { horizontal: 14, vertical: 8 }
      },
      tooltip: {
        theme: 'dark',
        x: {
          format: 'dd MMM yyyy HH:mm'
        },
        y: {
          formatter: (val) => `${val} count`
        }
      }
    };

    tradingChartInstance = new ApexCharts(el, options);
    tradingChartInstance.render();

    const bounds = getTimelineBounds();
    if (bounds) {
      applySliderWindow(100);
    }
  }

  function updateTradingChartSeries() {
    if (!tradingChartInstance) {
      renderTradingPulseChart();
      return;
    }
    const data = getTradingSeriesData();
    const series = [];
    if (activeSeries.transfers) series.push({ name: 'Transfers', data: data.transfers, color: METRIC_COLORS.transfers });
    if (activeSeries.downloads) series.push({ name: 'Downloads', data: data.downloads, color: METRIC_COLORS.downloads });
    if (activeSeries.visitors) series.push({ name: 'Visitors', data: data.visitors, color: METRIC_COLORS.visitors });
    if (activeSeries.files) series.push({ name: 'Files', data: data.files, color: METRIC_COLORS.files });

    tradingChartInstance.updateOptions({
      colors: series.map(s => s.color),
      stroke: {
        curve: 'smooth',
        width: chartMode === 'intraday' ? 2.5 : 3
      },
      markers: {
        size: chartMode === 'intraday' ? 4 : 5
      },
      xaxis: {
        labels: {
          format: chartMode === 'dayWise' ? 'dd MMM HH:mm' : 'HH:mm'
        }
      },
      yaxis: chartMode === 'intraday' ? {
        min: 0,
        max: function(max) {
          return max <= 8 ? Math.max(6, Math.ceil(max)) : Math.ceil(max + 1);
        },
        forceNiceScale: true,
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
          formatter: (val) => Math.round(val)
        }
      } : {
        min: function(min) {
          return Math.max(0, Math.floor(min - 5));
        },
        max: function(max) {
          return Math.ceil(max + 5);
        },
        forceNiceScale: true,
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
          formatter: (val) => Math.round(val)
        }
      },
      tooltip: {
        x: {
          format: 'dd MMM yyyy HH:mm'
        }
      }
    }, false, false);
    tradingChartInstance.updateSeries(series);

    const bounds = getTimelineBounds();
    if (bounds) {
      const slider = document.getElementById('timelineRangeSlider');
      const curVal = slider ? parseInt(slider.value, 10) : 100;
      applySliderWindow(curVal);
    }
  }

  // ============================================================
  // Tables: Active Live Transfers & Daily Activity Ledger
  // ============================================================

  function renderActiveTransfersTable() {
    const tbody = document.getElementById('activeTransfersBody');
    const emptyNotice = document.getElementById('activeTransfersEmpty');
    if (!tbody || !dashboardData) return;

    const list = dashboardData.activeTransfers || [];
    tbody.innerHTML = '';

    if (list.length === 0) {
      if (emptyNotice) emptyNotice.style.display = 'block';
      return;
    }

    if (emptyNotice) emptyNotice.style.display = 'none';

    list.forEach(t => {
      const tr = document.createElement('tr');
      const shortCode = t.shortCode || '------';
      const name = escapeHtml(t.name || 'Untitled');
      const sizeStr = formatBytes(t.totalSize);
      const expiresSec = Math.max(0, Math.floor(t.timeLeftMs / 1000));
      const minStr = Math.floor(expiresSec / 60);
      const secStr = (expiresSec % 60).toString().padStart(2, '0');

      tr.innerHTML = `
        <td>
          <span class="tag-code" data-copy="${shortCode}" title="Click to copy code">
            ${shortCode} <span style="opacity:0.6;font-size:0.7em;">📋</span>
          </span>
        </td>
        <td style="font-weight:600;max-width:240px;overflow:hidden;text-overflow:ellipsis;">${name}</td>
        <td>${t.filesCount} file(s)</td>
        <td>${sizeStr}</td>
        <td>${t.downloadCount} dl</td>
        <td>
          <span class="expiry-countdown" data-expires="${t.expiresAt}">
            ⏳ ${minStr}m ${secStr}s
          </span>
        </td>
        <td>
          <a href="/t/${t.id}" target="_blank" style="color:var(--accent-gold);text-decoration:none;font-weight:600;font-size:0.78rem;">
            Open ↗
          </a>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Copy event on code pills
    tbody.querySelectorAll('[data-copy]').forEach(el => {
      el.addEventListener('click', () => {
        navigator.clipboard.writeText(el.dataset.copy).then(() => {
          showToast(`Copied code: ${el.dataset.copy}`);
        });
      });
    });
  }

  function updateActiveTransferTimers() {
    document.querySelectorAll('[data-expires]').forEach(el => {
      const expiresAt = parseInt(el.dataset.expires, 10);
      const remainingMs = Math.max(0, expiresAt - Date.now());
      const remainingSec = Math.floor(remainingMs / 1000);
      const mins = Math.floor(remainingSec / 60);
      const secs = (remainingSec % 60).toString().padStart(2, '0');
      if (remainingSec <= 0) {
        el.textContent = 'Expired';
        el.style.color = '#EF4444';
      } else {
        el.textContent = `⏳ ${mins}m ${secs}s`;
      }
    });
  }

  function renderLedgerTable() {
    const tbody = document.getElementById('ledgerTableBody');
    if (!tbody || !dashboardData) return;

    const ts = (dashboardData.timeseries || []).slice().reverse(); // newest first
    tbody.innerHTML = '';

    ts.forEach((d, idx) => {
      const tr = document.createElement('tr');
      const prev = ts[idx + 1] || {};
      const diffT = prev.dailyTransfers ? d.dailyTransfers - prev.dailyTransfers : 0;
      const trendTag = diffT > 0 ? `<span style="color:var(--emerald-green);">▲ +${diffT}</span>`
        : diffT < 0 ? `<span style="color:#EF4444;">▼ ${diffT}</span>`
        : `<span style="color:var(--text-dim);">● 0</span>`;

      tr.innerHTML = `
        <td style="font-family:var(--font-mono);font-weight:600;">${d.date}</td>
        <td><strong>${formatNumber(d.dailyTransfers)}</strong></td>
        <td>${formatNumber(d.dailyFiles)}</td>
        <td>${formatNumber(d.dailyDownloads)}</td>
        <td>${formatNumber(d.dailyVisitors)}</td>
        <td>${d.storageMB} MB</td>
        <td>${formatNumber(d.cumulativeTransfers)}</td>
        <td>${trendTag}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function filterLedgerTable(query) {
    const rows = document.querySelectorAll('#ledgerTableBody tr');
    rows.forEach(r => {
      const text = r.textContent.toLowerCase();
      r.style.display = text.includes(query) ? '' : 'none';
    });
  }

  function exportLedgerCsv() {
    if (!dashboardData || !dashboardData.timeseries) return;
    const ts = dashboardData.timeseries;
    let csv = 'Date,Daily Transfers,Cumulative Transfers,Daily Files,Cumulative Files,Daily Downloads,Cumulative Downloads,Daily Visitors,Cumulative Visitors,Active Transfers,Storage MB,Cumulative Storage MB\n';

    ts.forEach(d => {
      csv += `${d.date},${d.dailyTransfers},${d.cumulativeTransfers},${d.dailyFiles},${d.cumulativeFiles},${d.dailyDownloads},${d.cumulativeDownloads},${d.dailyVisitors},${d.cumulativeVisitors},${d.activeTransfers},${d.storageMB},${d.cumulativeStorageMB}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labdrop-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported CSV successfully!');
  }

  // ============================================================
  // Utilities
  // ============================================================

  function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function formatNumber(num) {
    if (typeof num !== 'number') num = Number(num) || 0;
    return num.toLocaleString();
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function showToast(msg) {
    if (!toastNotice) return;
    toastNotice.textContent = msg;
    toastNotice.classList.add('show');
    setTimeout(() => toastNotice.classList.remove('show'), 2500);
  }

})();
