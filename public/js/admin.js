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
  let masterChart = null;
  let brushChart = null;
  let sparklines = {};
  let stockCharts = {}; // { transfers, files, downloads, visitors, active, storage, intraday }

  const activeSeries = {
    transfers: true,
    files: true,
    downloads: true,
    visitors: true,
    active: true,
    storage: false // off by default on master to prevent scale skew
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
        renderAllCharts();
      });
    });

    // View Mode Toggle (Daily Spikes vs Cumulative Equity)
    document.querySelectorAll('[data-view-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-view-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        viewMode = btn.dataset.viewMode;
        renderAllCharts();
      });
    });

    // Master Series Toggles
    document.querySelectorAll('[data-toggle-metric]').forEach(pill => {
      pill.addEventListener('click', () => {
        const metric = pill.dataset.toggleMetric;
        activeSeries[metric] = !activeSeries[metric];
        pill.classList.toggle('active', activeSeries[metric]);
        updateMasterChartSeries();
      });
    });

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
    setElementText('kpiVisitorsSub', `Active today: ${trends.visitors.today} devices`);
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
  // Master Stock Chart & Timeline Scrubber (Brush)
  // ============================================================

  function renderAllCharts() {
    if (!dashboardData) return;
    renderMasterChart();
    renderDedicatedStockCharts();
    renderIntradayChart();
  }

  function getFilteredData() {
    if (!dashboardData) return [];
    const isHourly = activeRange === '24H' || (dashboardData.timeseries && dashboardData.timeseries.length <= 1);

    if (isHourly) {
      return (dashboardData.intraday || []).map(h => ({
        date: h.hour,
        timestamp: h.timestamp,
        dailyTransfers: h.transfers,
        cumulativeTransfers: h.cumulativeTransfers,
        dailyFiles: h.files,
        cumulativeFiles: h.cumulativeFiles,
        dailyDownloads: h.downloads,
        cumulativeDownloads: h.cumulativeDownloads,
        dailyVisitors: h.visitors,
        cumulativeVisitors: h.cumulativeVisitors,
        activeTransfers: h.activeTransfers,
        storageMB: h.storageMB || 0,
        cumulativeStorageMB: h.storageMB || 0
      }));
    }

    const all = dashboardData.timeseries || [];
    let count = all.length;
    if (activeRange === '7D') count = 7;
    else if (activeRange === '14D') count = 14;
    else if (activeRange === '30D') count = 30;
    else if (activeRange === '90D') count = 90;

    return all.slice(-count);
  }

  function renderMasterChart() {
    const data = getFilteredData();
    const elMaster = document.getElementById('masterStockChart');
    const elBrush = document.getElementById('masterBrushChart');
    if (!elMaster || !elBrush) return;

    const isCum = viewMode === 'cumulative';

    const series = [];
    if (activeSeries.transfers) {
      series.push({
        name: 'Transfers Created',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeTransfers : d.dailyTransfers]),
        color: METRIC_COLORS.transfers
      });
    }
    if (activeSeries.files) {
      series.push({
        name: 'Files Uploaded',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeFiles : d.dailyFiles]),
        color: METRIC_COLORS.files
      });
    }
    if (activeSeries.downloads) {
      series.push({
        name: 'Downloads Completed',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeDownloads : d.dailyDownloads]),
        color: METRIC_COLORS.downloads
      });
    }
    if (activeSeries.visitors) {
      series.push({
        name: 'Unique Visitors',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeVisitors : d.dailyVisitors]),
        color: METRIC_COLORS.visitors
      });
    }
    if (activeSeries.active) {
      series.push({
        name: 'Active Transfers',
        data: data.map(d => [d.timestamp, d.activeTransfers]),
        color: METRIC_COLORS.active
      });
    }
    if (activeSeries.storage) {
      series.push({
        name: 'Storage (MB)',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeStorageMB : d.storageMB]),
        color: METRIC_COLORS.storage
      });
    }

    // If masterChart already exists, update smoothly
    if (masterChart) {
      masterChart.updateSeries(series);
      if (brushChart) {
        brushChart.updateSeries([{
          name: 'Volume',
          data: data.map(d => [d.timestamp, isCum ? d.cumulativeTransfers : d.dailyTransfers])
        }]);
      }
      return;
    }

    // Build Master Stock Chart Options
    const masterOptions = {
      series,
      chart: {
        id: 'masterStockArea',
        type: 'area',
        height: 380,
        background: 'transparent',
        toolbar: {
          show: true,
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
        animations: { enabled: true, easing: 'easeinout', speed: 600 }
      },
      colors: series.map(s => s.color),
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2.5 },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.65,
          opacityTo: 0.08,
          stops: [0, 95, 100]
        }
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
          datetimeUTC: false
        },
        axisBorder: { color: 'rgba(255, 255, 255, 0.08)' },
        axisTicks: { color: 'rgba(255, 255, 255, 0.08)' }
      },
      yaxis: {
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
          formatter: (val) => formatNumber(Math.round(val))
        }
      },
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        strokeDashArray: 4
      },
      theme: { mode: 'dark' },
      tooltip: {
        theme: 'dark',
        x: {
          format: activeRange === '24H' ? 'HH:mm' : 'dd MMM yyyy'
        },
        y: {
          formatter: (val) => formatNumber(val)
        }
      },
      legend: { show: false } // Controlled via custom header pills
    };

    masterChart = new ApexCharts(elMaster, masterOptions);
    masterChart.render();

    // Brush Scrubber Chart
    const brushOptions = {
      series: [{
        name: 'Volume',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeTransfers : d.dailyTransfers])
      }],
      chart: {
        id: 'masterStockBrush',
        height: 110,
        type: 'area',
        background: 'transparent',
        brush: {
          target: 'masterStockArea',
          enabled: true
        },
        selection: {
          enabled: true,
          xaxis: {
            min: data[Math.max(0, data.length - 14)] ? data[Math.max(0, data.length - 14)].timestamp : data[0].timestamp,
            max: data[data.length - 1].timestamp
          }
        }
      },
      colors: [METRIC_COLORS.transfers],
      fill: {
        type: 'gradient',
        gradient: {
          opacityFrom: 0.4,
          opacityTo: 0.05
        }
      },
      stroke: { width: 1.5 },
      xaxis: {
        type: 'datetime',
        tooltip: { enabled: false },
        labels: { show: false }
      },
      yaxis: {
        tickAmount: 2,
        labels: { show: false }
      },
      grid: { show: false }
    };

    brushChart = new ApexCharts(elBrush, brushOptions);
    brushChart.render();
  }

  function updateMasterChartSeries() {
    if (!masterChart) return;
    const data = getFilteredData();
    const isCum = viewMode === 'cumulative';

    const series = [];
    if (activeSeries.transfers) {
      series.push({
        name: 'Transfers Created',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeTransfers : d.dailyTransfers]),
        color: METRIC_COLORS.transfers
      });
    }
    if (activeSeries.files) {
      series.push({
        name: 'Files Uploaded',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeFiles : d.dailyFiles]),
        color: METRIC_COLORS.files
      });
    }
    if (activeSeries.downloads) {
      series.push({
        name: 'Downloads Completed',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeDownloads : d.dailyDownloads]),
        color: METRIC_COLORS.downloads
      });
    }
    if (activeSeries.visitors) {
      series.push({
        name: 'Unique Visitors',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeVisitors : d.dailyVisitors]),
        color: METRIC_COLORS.visitors
      });
    }
    if (activeSeries.active) {
      series.push({
        name: 'Active Transfers',
        data: data.map(d => [d.timestamp, d.activeTransfers]),
        color: METRIC_COLORS.active
      });
    }
    if (activeSeries.storage) {
      series.push({
        name: 'Storage (MB)',
        data: data.map(d => [d.timestamp, isCum ? d.cumulativeStorageMB : d.storageMB]),
        color: METRIC_COLORS.storage
      });
    }

    masterChart.updateOptions({ colors: series.map(s => s.color) });
    masterChart.updateSeries(series);
  }

  // ============================================================
  // Dedicated Individual Stock Charts (Charts for EVERY Count)
  // ============================================================

  function renderDedicatedStockCharts() {
    const data = getFilteredData();
    const isCum = viewMode === 'cumulative';

    // 1. Transfers Stock Chart
    renderSingleStockChart({
      chartKey: 'transfers',
      containerId: 'chartTransfers',
      metricTitle: 'Transfers Created',
      seriesData: data.map(d => [d.timestamp, isCum ? d.cumulativeTransfers : d.dailyTransfers]),
      color: METRIC_COLORS.transfers,
      unit: '',
      statTotalId: 'statTransfersTotal',
      statHighId: 'statTransfersHigh',
      statLowId: 'statTransfersLow',
      statAvgId: 'statTransfersAvg'
    });

    // 2. Files Uploaded Stock Chart
    renderSingleStockChart({
      chartKey: 'files',
      containerId: 'chartFiles',
      metricTitle: 'Files Uploaded',
      seriesData: data.map(d => [d.timestamp, isCum ? d.cumulativeFiles : d.dailyFiles]),
      color: METRIC_COLORS.files,
      unit: '',
      statTotalId: 'statFilesTotal',
      statHighId: 'statFilesHigh',
      statLowId: 'statFilesLow',
      statAvgId: 'statFilesAvg'
    });

    // 3. Downloads Completed Stock Chart
    renderSingleStockChart({
      chartKey: 'downloads',
      containerId: 'chartDownloads',
      metricTitle: 'Downloads Completed',
      seriesData: data.map(d => [d.timestamp, isCum ? d.cumulativeDownloads : d.dailyDownloads]),
      color: METRIC_COLORS.downloads,
      unit: '',
      statTotalId: 'statDownloadsTotal',
      statHighId: 'statDownloadsHigh',
      statLowId: 'statDownloadsLow',
      statAvgId: 'statDownloadsAvg'
    });

    // 4. Unique Visitors Stock Chart
    renderSingleStockChart({
      chartKey: 'visitors',
      containerId: 'chartVisitors',
      metricTitle: 'Unique Visitors / Devices',
      seriesData: data.map(d => [d.timestamp, isCum ? d.cumulativeVisitors : d.dailyVisitors]),
      color: METRIC_COLORS.visitors,
      unit: '',
      statTotalId: 'statVisitorsTotal',
      statHighId: 'statVisitorsHigh',
      statLowId: 'statVisitorsLow',
      statAvgId: 'statVisitorsAvg'
    });

    // 5. Active Concurrent Transfers Stock Chart
    renderSingleStockChart({
      chartKey: 'active',
      containerId: 'chartActive',
      metricTitle: 'Active Live Transfers',
      seriesData: data.map(d => [d.timestamp, d.activeTransfers]),
      color: METRIC_COLORS.active,
      unit: '',
      statTotalId: 'statActiveTotal',
      statHighId: 'statActiveHigh',
      statLowId: 'statActiveLow',
      statAvgId: 'statActiveAvg'
    });

    // 6. Transferred Storage Volume Stock Chart
    renderSingleStockChart({
      chartKey: 'storage',
      containerId: 'chartStorage',
      metricTitle: 'Transferred Storage (MB)',
      seriesData: data.map(d => [d.timestamp, isCum ? d.cumulativeStorageMB : d.storageMB]),
      color: METRIC_COLORS.storage,
      unit: ' MB',
      statTotalId: 'statStorageTotal',
      statHighId: 'statStorageHigh',
      statLowId: 'statStorageLow',
      statAvgId: 'statStorageAvg'
    });
  }

  function renderSingleStockChart({
    chartKey,
    containerId,
    metricTitle,
    seriesData,
    color,
    unit = '',
    statTotalId,
    statHighId,
    statLowId,
    statAvgId
  }) {
    const el = document.getElementById(containerId);
    if (!el) return;

    // Calculate High, Low, Average, Total for this timeframe
    const values = seriesData.map(pt => pt[1]);
    const maxVal = values.length ? Math.max(...values) : 0;
    const minVal = values.length ? Math.min(...values) : 0;
    const sumVal = values.reduce((a, b) => a + b, 0);
    const avgVal = values.length ? (sumVal / values.length).toFixed(1) : '0';

    setElementText(statHighId, `${formatNumber(maxVal)}${unit}`);
    setElementText(statLowId, `${formatNumber(minVal)}${unit}`);
    setElementText(statAvgId, `${formatNumber(avgVal)}${unit}`);
    setElementText(statTotalId, `${formatNumber(viewMode === 'cumulative' ? (values[values.length - 1] || 0) : sumVal)}${unit}`);

    // If chart already exists, update series
    if (stockCharts[chartKey]) {
      stockCharts[chartKey].updateSeries([{
        name: metricTitle,
        data: seriesData
      }]);
      return;
    }

    const options = {
      series: [{
        name: metricTitle,
        data: seriesData
      }],
      chart: {
        type: 'area',
        height: 280,
        background: 'transparent',
        toolbar: {
          show: true,
          tools: {
            download: true,
            selection: false,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true
          }
        },
        animations: { enabled: true, easing: 'easeinout', speed: 500 }
      },
      colors: [color],
      dataLabels: { enabled: false },
      stroke: { curve: 'smooth', width: 2.2 },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.6,
          opacityTo: 0.05,
          stops: [0, 95, 100]
        }
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
          datetimeUTC: false
        },
        axisBorder: { color: 'rgba(255, 255, 255, 0.08)' },
        axisTicks: { color: 'rgba(255, 255, 255, 0.08)' }
      },
      yaxis: {
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px', fontFamily: 'inherit' },
          formatter: (val) => `${formatNumber(Math.round(val))}${unit}`
        }
      },
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        strokeDashArray: 4
      },
      theme: { mode: 'dark' },
      tooltip: {
        theme: 'dark',
        x: {
          format: activeRange === '24H' ? 'HH:mm' : 'dd MMM yyyy'
        },
        y: {
          formatter: (val) => `${formatNumber(val)}${unit}`
        }
      }
    };

    stockCharts[chartKey] = new ApexCharts(el, options);
    stockCharts[chartKey].render();
  }

  // ============================================================
  // Intraday 24-Hour Velocity Pulse Chart
  // ============================================================

  function renderIntradayChart() {
    const el = document.getElementById('chartIntraday');
    if (!el || !dashboardData) return;
    const intraday = dashboardData.intraday || [];

    const series = [
      {
        name: 'Transfers',
        data: intraday.map(h => [h.timestamp, h.transfers])
      },
      {
        name: 'Downloads',
        data: intraday.map(h => [h.timestamp, h.downloads])
      },
      {
        name: 'Visitors',
        data: intraday.map(h => [h.timestamp, h.visitors])
      }
    ];

    if (stockCharts.intraday) {
      stockCharts.intraday.updateSeries(series);
      return;
    }

    const options = {
      series,
      chart: {
        type: 'area',
        height: 280,
        background: 'transparent',
        toolbar: { show: true }
      },
      colors: [METRIC_COLORS.transfers, METRIC_COLORS.downloads, METRIC_COLORS.visitors],
      stroke: { curve: 'smooth', width: 2 },
      fill: {
        type: 'gradient',
        gradient: { opacityFrom: 0.5, opacityTo: 0.05 }
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px' },
          datetimeUTC: false,
          format: 'HH:mm'
        }
      },
      yaxis: {
        labels: {
          style: { colors: '#9CA3AF', fontSize: '11px' },
          formatter: (val) => Math.round(val)
        }
      },
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        strokeDashArray: 4
      },
      theme: { mode: 'dark' },
      tooltip: {
        theme: 'dark',
        x: { format: 'HH:mm' }
      }
    };

    stockCharts.intraday = new ApexCharts(el, options);
    stockCharts.intraday.render();
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
