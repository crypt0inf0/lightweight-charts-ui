import React, { useState, useEffect } from 'react';
import Layout from './components/Layout/Layout';
import Topbar from './components/Topbar/Topbar';
import DrawingToolbar from './components/Toolbar/DrawingToolbar';
import Watchlist from './components/Watchlist/Watchlist';
import ChartComponent from './components/Chart/ChartComponent';
import SymbolSearch from './components/SymbolSearch/SymbolSearch';
import Toast from './components/Toast/Toast';
import SnapshotToast from './components/Toast/SnapshotToast';
import html2canvas from 'html2canvas';
import { getTickerPrice, subscribeToMultiTicker } from './services/binance';

import BottomBar from './components/BottomBar/BottomBar';
import ChartGrid from './components/Chart/ChartGrid';
import AlertDialog from './components/Alert/AlertDialog';
import RightToolbar from './components/Toolbar/RightToolbar';
import AlertsPanel from './components/Alerts/AlertsPanel';

function App() {
  // Multi-Chart State
  const [layout, setLayout] = useState(() => {
    const saved = localStorage.getItem('tv_saved_layout');
    return saved ? JSON.parse(saved).layout : '1';
  });
  const [activeChartId, setActiveChartId] = useState(1);
  const [charts, setCharts] = useState(() => {
    const saved = localStorage.getItem('tv_saved_layout');
    return saved ? JSON.parse(saved).charts : [
      { id: 1, symbol: 'BTCUSDT', interval: localStorage.getItem('tv_interval') || '1d', indicators: { sma: false, ema: false }, comparisonSymbols: [] }
    ];
  });

  // Derived state for active chart
  const activeChart = charts.find(c => c.id === activeChartId) || charts[0];
  const currentSymbol = activeChart.symbol;
  const currentInterval = activeChart.interval;

  // Refs for multiple charts
  const chartRefs = React.useRef({});

  useEffect(() => {
    localStorage.setItem('tv_interval', currentInterval);
  }, [currentInterval]);
  const [chartType, setChartType] = useState('candlestick');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState('switch'); // 'switch' or 'add'
  // const [indicators, setIndicators] = useState({ sma: false, ema: false }); // Moved to charts state
  const [toast, setToast] = useState(null);

  const [snapshotToast, setSnapshotToast] = useState(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertPrice, setAlertPrice] = useState(null);

  // Alert State
  const [alerts, setAlerts] = useState([]);
  const [alertLogs, setAlertLogs] = useState([]);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);

  // Bottom Bar State
  const [currentTimeRange, setCurrentTimeRange] = useState('All');
  const [isLogScale, setIsLogScale] = useState(false);
  const [isAutoScale, setIsAutoScale] = useState(true);

  // Right Panel State
  const [activeRightPanel, setActiveRightPanel] = useState('watchlist');

  // Theme State
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('tv_theme') || 'dark';
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tv_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Show toast helper
  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const showSnapshotToast = (message) => {
    setSnapshotToast(message);
    setTimeout(() => setSnapshotToast(null), 3000);
  };

  // Timeframe Management
  const [favoriteIntervals, setFavoriteIntervals] = useState(() => {
    const saved = localStorage.getItem('tv_fav_intervals_v2');
    return saved ? JSON.parse(saved) : ['1m', '5m', '15m', '1h', '4h', '1d'];
  });

  const [customIntervals, setCustomIntervals] = useState(() => {
    const saved = localStorage.getItem('tv_custom_intervals');
    return saved ? JSON.parse(saved) : [];
  });

  // Track last selected non-favorite interval (persisted)
  const [lastNonFavoriteInterval, setLastNonFavoriteInterval] = useState(() => {
    return localStorage.getItem('tv_last_nonfav_interval') || null;
  });

  useEffect(() => {
    localStorage.setItem('tv_fav_intervals_v2', JSON.stringify(favoriteIntervals));
  }, [favoriteIntervals]);

  useEffect(() => {
    localStorage.setItem('tv_custom_intervals', JSON.stringify(customIntervals));
  }, [customIntervals]);

  useEffect(() => {
    if (lastNonFavoriteInterval) {
      localStorage.setItem('tv_last_nonfav_interval', lastNonFavoriteInterval);
    }
  }, [lastNonFavoriteInterval]);

  // Handle interval change - track non-favorite selections
  // Handle interval change - track non-favorite selections
  const handleIntervalChange = (newInterval) => {
    setCharts(prev => prev.map(chart =>
      chart.id === activeChartId ? { ...chart, interval: newInterval } : chart
    ));

    // If the new interval is not a favorite, save it as the last non-favorite
    if (!favoriteIntervals.includes(newInterval)) {
      setLastNonFavoriteInterval(newInterval);
    }
  };

  const handleToggleFavorite = (interval) => {
    setFavoriteIntervals(prev =>
      prev.includes(interval) ? prev.filter(i => i !== interval) : [...prev, interval]
    );
  };

  const handleAddCustomInterval = (value, unit) => {
    const newValue = value + unit;
    const defaultTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];

    // Check if already exists in default or custom
    if (defaultTimeframes.includes(newValue) || customIntervals.some(i => i.value === newValue)) {
      showToast('Interval already available!', 'info');
      return;
    }

    const newInterval = { value: newValue, label: newValue, isCustom: true };
    setCustomIntervals(prev => [...prev, newInterval]);
    showToast('Custom interval added successfully!', 'success');
  };

  const handleRemoveCustomInterval = (intervalValue) => {
    setCustomIntervals(prev => prev.filter(i => i.value !== intervalValue));
    // Also remove from favorites if present
    setFavoriteIntervals(prev => prev.filter(i => i !== intervalValue));
    // If current interval is removed, switch to default
    if (currentInterval === intervalValue) {
      setCurrentInterval('1d');
    }
  };

  // Load watchlist from localStorage or default
  const [watchlistSymbols, setWatchlistSymbols] = useState(() => {
    const saved = localStorage.getItem('tv_watchlist');
    return saved ? JSON.parse(saved) : ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'DOTUSDT'];
  });

  const [watchlistData, setWatchlistData] = useState([]);

  // Persist watchlist
  useEffect(() => {
    localStorage.setItem('tv_watchlist', JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);

  // Fetch watchlist data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const promises = watchlistSymbols.map(async (sym) => {
          const data = await getTickerPrice(sym);
          if (data) {
            return {
              symbol: sym,
              last: parseFloat(data.lastPrice).toFixed(2),
              chg: parseFloat(data.priceChange).toFixed(2),
              chgP: parseFloat(data.priceChangePercent).toFixed(2) + '%',
              up: parseFloat(data.priceChange) >= 0
            };
          }
          return null;
        });

        const results = await Promise.all(promises);
        setWatchlistData(results.filter(r => r !== null));
      } catch (error) {
        console.error('Error fetching watchlist data:', error);
        showToast('Failed to load watchlist data', 'error');
      }
    };

    // Initial fetch
    fetchData();

    // Subscribe to WebSocket for real-time updates
    const ws = subscribeToMultiTicker(watchlistSymbols, (ticker) => {
      setWatchlistData(prev => {
        const index = prev.findIndex(item => item.symbol === ticker.symbol);
        if (index !== -1) {
          const newData = [...prev];
          newData[index] = {
            ...newData[index],
            last: ticker.last.toFixed(2),
            chg: ticker.chg.toFixed(2),
            chgP: ticker.chgP.toFixed(2) + '%',
            up: ticker.chg >= 0
          };
          return newData;
        }
        return prev;
      });
    });

    return () => {
      if (ws) ws.close();
    };
  }, [watchlistSymbols]);

  // Check Alerts Logic
  useEffect(() => {
    if (alerts.length === 0) return;

    // Subscribe to all alert symbols
    const alertSymbols = [...new Set(alerts.filter(a => a.status === 'Active').map(a => a.symbol))];
    if (alertSymbols.length === 0) return;

    const ws = subscribeToMultiTicker(alertSymbols, (ticker) => {
      setAlerts(prevAlerts => {
        let hasChanges = false;
        const newAlerts = prevAlerts.map(alert => {
          if (alert.status !== 'Active' || alert.symbol !== ticker.symbol) return alert;

          const currentPrice = parseFloat(ticker.last);
          const targetPrice = parseFloat(alert.price);

          // Simple crossing logic (triggered if price is within 0.1% range or crossed)
          const threshold = targetPrice * 0.001; // 0.1% tolerance

          if (Math.abs(currentPrice - targetPrice) <= threshold) {
            hasChanges = true;

            // Log the alert
            const logEntry = {
              id: Date.now(),
              alertId: alert.id,
              symbol: alert.symbol,
              message: `Alert triggered: ${alert.symbol} crossed ${targetPrice}`,
              time: new Date().toISOString()
            };
            setAlertLogs(prev => [logEntry, ...prev]);
            setUnreadAlertCount(prev => prev + 1);
            showToast(`Alert Triggered: ${alert.symbol} at ${targetPrice}`, 'info');

            return { ...alert, status: 'Triggered' };
          }
          return alert;
        });

        return hasChanges ? newAlerts : prevAlerts;
      });
    });

    return () => {
      if (ws) ws.close();
    };
  }, [alerts]);

  const handleWatchlistReorder = (newSymbols) => {
    setWatchlistSymbols(newSymbols);
    // Optimistically update data order to prevent flicker
    setWatchlistData(prev => {
      const dataMap = new Map(prev.map(item => [item.symbol, item]));
      return newSymbols.map(sym => dataMap.get(sym)).filter(Boolean);
    });
  };

  const handleSymbolChange = (symbol) => {
    if (searchMode === 'switch') {
      setCharts(prev => prev.map(chart =>
        chart.id === activeChartId ? { ...chart, symbol: symbol } : chart
      ));
    } else if (searchMode === 'compare') {
      const colors = ['#f57f17', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5'];
      setCharts(prev => prev.map(chart => {
        if (chart.id === activeChartId) {
          const currentComparisons = chart.comparisonSymbols || [];
          const exists = currentComparisons.find(c => c.symbol === symbol);

          if (exists) {
            // Remove
            return {
              ...chart,
              comparisonSymbols: currentComparisons.filter(c => c.symbol !== symbol)
            };
          } else {
            // Add
            const nextColor = colors[currentComparisons.length % colors.length];
            return {
              ...chart,
              comparisonSymbols: [
                ...currentComparisons,
                { symbol: symbol, color: nextColor }
              ]
            };
          }
        }
        return chart;
      }));
      // Do not close search in compare mode to allow multiple selections
    } else {
      if (!watchlistSymbols.includes(symbol)) {
        setWatchlistSymbols(prev => [...prev, symbol]);
        showToast(`${symbol} added to watchlist`, 'success');
      }
      setIsSearchOpen(false);
    }
  };

  const handleRemoveFromWatchlist = (symbol) => {
    setWatchlistSymbols(prev => prev.filter(s => s !== symbol));
  };

  const handleAddClick = () => {
    setSearchMode('add');
    setIsSearchOpen(true);
  };

  const handleSymbolClick = () => {
    setSearchMode('switch');
    setIsSearchOpen(true);
  };

  const handleCompareClick = () => {
    setSearchMode('compare');
    setIsSearchOpen(true);
  };

  const toggleIndicator = (name) => {
    setCharts(prev => prev.map(chart =>
      chart.id === activeChartId ? { ...chart, indicators: { ...chart.indicators, [name]: !chart.indicators[name] } } : chart
    ));
  };

  const [activeTool, setActiveTool] = useState(null);
  const [isMagnetMode, setIsMagnetMode] = useState(false);
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(true);

  const toggleDrawingToolbar = () => {
    setShowDrawingToolbar(prev => !prev);
  };

  const handleToolChange = (tool) => {
    if (tool === 'magnet') {
      setIsMagnetMode(prev => !prev);
    } else if (tool === 'undo') {
      const activeRef = chartRefs.current[activeChartId];
      if (activeRef) {
        activeRef.undo();
      }
      setActiveTool(null); // Reset active tool after undo
    } else if (tool === 'redo') {
      const activeRef = chartRefs.current[activeChartId];
      if (activeRef) {
        activeRef.redo();
      }
      setActiveTool(null); // Reset active tool after redo
    } else if (tool === 'clear') { // Renamed from 'remove' to 'clear' based on new logic
      const activeRef = chartRefs.current[activeChartId];
      if (activeRef) {
        activeRef.clearTools();
      }
      setActiveTool(null); // Reset active tool after clear
    } else if (tool === 'clear_all') { // Clear All Drawings button
      const activeRef = chartRefs.current[activeChartId];
      if (activeRef) {
        activeRef.clearTools();
      }
      setActiveTool(null); // Reset active tool after clearing all
    } else {
      setActiveTool(tool);
    }
  };

  // const chartComponentRef = React.useRef(null); // Removed in favor of chartRefs

  const handleLayoutChange = (newLayout) => {
    setLayout(newLayout);
    const count = parseInt(newLayout);
    setCharts(prev => {
      const newCharts = [...prev];
      if (newCharts.length < count) {
        // Add charts
        for (let i = newCharts.length; i < count; i++) {
          newCharts.push({
            id: i + 1,
            symbol: activeChart.symbol,
            interval: activeChart.interval,
            indicators: { sma: false, ema: false },
            comparisonSymbols: []
          });
        }
      } else if (newCharts.length > count) {
        // Remove charts
        newCharts.splice(count);
      }
      return newCharts;
    });
    // Ensure active chart is valid
    if (activeChartId > count) {
      setActiveChartId(1);
    }
  };

  const handleSaveLayout = () => {
    const layoutData = {
      layout,
      charts
    };
    localStorage.setItem('tv_saved_layout', JSON.stringify(layoutData));
    showSnapshotToast('Layout saved successfully');
  };

  // handleUndo and handleRedo are now integrated into handleToolChange, but we need wrappers for Topbar
  const handleUndo = () => handleToolChange('undo');
  const handleRedo = () => handleToolChange('redo');

  const handleDownloadImage = async () => {
    const activeRef = chartRefs.current[activeChartId];
    if (activeRef) {
      const chartContainer = activeRef.getChartContainer();
      if (chartContainer) {
        try {
          const canvas = await html2canvas(chartContainer, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#131722', // Match chart background
          });

          const image = canvas.toDataURL('image/png');
          const link = document.createElement('a');

          // Format filename: SYMBOL_YYYY-MM-DD_HH-MM-SS
          const now = new Date();
          const dateStr = now.toISOString().split('T')[0];
          const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
          const filename = `${currentSymbol}_${dateStr}_${timeStr}.png`;

          link.href = image;
          link.download = filename;
          link.click();
        } catch (error) {
          console.error('Screenshot failed:', error);
          showToast('Failed to download image', 'error');
        }
      }
    }
  };

  const handleCopyImage = async () => {
    const activeRef = chartRefs.current[activeChartId];
    if (activeRef) {
      const chartContainer = activeRef.getChartContainer();
      if (chartContainer) {
        try {
          const canvas = await html2canvas(chartContainer, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#131722', // Match chart background
          });

          canvas.toBlob(async (blob) => {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({
                  'image/png': blob
                })
              ]);
              showSnapshotToast('Link to the chart image copied to clipboard');
            } catch (err) {
              console.error('Failed to copy to clipboard:', err);
              showToast('Failed to copy to clipboard', 'error');
            }
          });
        } catch (error) {
          console.error('Screenshot failed:', error);
          showToast('Failed to capture image', 'error');
        }
      }
    }
  };

  const handleFullScreen = () => {
    const activeRef = chartRefs.current[activeChartId];
    if (activeRef) {
      const chartContainer = activeRef.getChartContainer();
      if (chartContainer) {
        if (chartContainer.requestFullscreen) {
          chartContainer.requestFullscreen();
        } else if (chartContainer.webkitRequestFullscreen) { /* Safari */
          chartContainer.webkitRequestFullscreen();
        } else if (chartContainer.msRequestFullscreen) { /* IE11 */
          chartContainer.msRequestFullscreen();
        }
      }
    }
  };


  const handleReplayClick = () => {
    const activeRef = chartRefs.current[activeChartId];
    if (activeRef) {
      activeRef.toggleReplay();
    }
  };

  const handleAlertClick = () => {
    const activeRef = chartRefs.current[activeChartId];
    if (activeRef) {
      const price = activeRef.getCurrentPrice();
      if (price !== null) {
        setAlertPrice(price);
        setIsAlertOpen(true);
      } else {
        showToast('No price data available', 'error');
      }
    }
  };

  const handleSaveAlert = (alertData) => {
    const newAlert = {
      id: Date.now(),
      symbol: currentSymbol,
      price: alertData.value,
      condition: `Crossing ${alertData.value}`,
      status: 'Active',
      created_at: new Date().toISOString()
    };
    setAlerts(prev => [newAlert, ...prev]);
    showToast(`Alert created for ${currentSymbol} at ${alertData.value}`, 'success');
  };

  const handleRemoveAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const handleRestartAlert = (id) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'Active' } : a));
  };

  const handleRightPanelToggle = (panel) => {
    setActiveRightPanel(panel);
    if (panel === 'alerts') {
      setUnreadAlertCount(0); // Clear badge when opening alerts
    }
  };

  return (
    <>
      <Layout
        isLeftToolbarVisible={showDrawingToolbar}
        topbar={
          <Topbar
            symbol={currentSymbol}
            interval={currentInterval}
            chartType={chartType}
            indicators={activeChart.indicators}
            favoriteIntervals={favoriteIntervals}
            customIntervals={customIntervals}
            lastNonFavoriteInterval={lastNonFavoriteInterval}
            onSymbolClick={handleSymbolClick}
            onIntervalChange={handleIntervalChange}
            onChartTypeChange={setChartType}
            onToggleIndicator={toggleIndicator}
            onToggleFavorite={handleToggleFavorite}
            onAddCustomInterval={handleAddCustomInterval}
            onRemoveCustomInterval={handleRemoveCustomInterval}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onMenuClick={toggleDrawingToolbar}
            theme={theme}
            onToggleTheme={toggleTheme}
            onDownloadImage={handleDownloadImage}
            onCopyImage={handleCopyImage}


            onFullScreen={handleFullScreen}
            onReplayClick={handleReplayClick}
            onAlertClick={handleAlertClick}
            onCompareClick={handleCompareClick}
            layout={layout}
            onLayoutChange={handleLayoutChange}
            onSaveLayout={handleSaveLayout}
          />
        }
        leftToolbar={
          <DrawingToolbar
            activeTool={activeTool}
            isMagnetMode={isMagnetMode}
            onToolChange={handleToolChange}
          />
        }
        bottomBar={
          <BottomBar
            currentTimeRange={currentTimeRange}
            onTimeRangeChange={setCurrentTimeRange}
            isLogScale={isLogScale}
            isAutoScale={isAutoScale}
            onToggleLogScale={() => setIsLogScale(!isLogScale)}
            onToggleAutoScale={() => setIsAutoScale(!isAutoScale)}
            onResetZoom={() => {
              const activeRef = chartRefs.current[activeChartId];
              if (activeRef) {
                activeRef.resetZoom();
              }
            }}
            isToolbarVisible={showDrawingToolbar}
          />
        }
        watchlist={
          activeRightPanel === 'watchlist' ? (
            <Watchlist
              currentSymbol={currentSymbol}
              items={watchlistData}
              onSymbolSelect={(sym) => {
                setCharts(prev => prev.map(chart =>
                  chart.id === activeChartId ? { ...chart, symbol: sym } : chart
                ));
              }}
              onAddClick={handleAddClick}
              onRemoveClick={handleRemoveFromWatchlist}
              onReorder={handleWatchlistReorder}
            />
          ) : activeRightPanel === 'alerts' ? (
            <AlertsPanel
              alerts={alerts}
              logs={alertLogs}
              onRemoveAlert={handleRemoveAlert}
              onRestartAlert={handleRestartAlert}
            />
          ) : null
        }
        rightToolbar={
          <RightToolbar
            activePanel={activeRightPanel}
            onPanelChange={handleRightPanelToggle}
            badges={{ alerts: unreadAlertCount }}
          />
        }
        chart={
          <ChartGrid
            charts={charts}
            layout={layout}
            activeChartId={activeChartId}
            onActiveChartChange={setActiveChartId}
            chartRefs={chartRefs}
            // Common props
            chartType={chartType}
            // indicators={indicators} // Handled per chart now
            activeTool={activeTool}
            onToolUsed={() => setActiveTool(null)}
            isLogScale={isLogScale}
            isAutoScale={isAutoScale}
            magnetMode={isMagnetMode}
            timeRange={currentTimeRange}
            isToolbarVisible={showDrawingToolbar}
            theme={theme}
          />
        }
      />
      <SymbolSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelect={handleSymbolChange}
        addedSymbols={searchMode === 'compare' ? (activeChart.comparisonSymbols || []).map(s => s.symbol) : []}
        isCompareMode={searchMode === 'compare'}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      {snapshotToast && (
        <SnapshotToast
          message={snapshotToast}
          onClose={() => setSnapshotToast(null)}
        />
      )}
      <AlertDialog
        isOpen={isAlertOpen}
        onClose={() => setIsAlertOpen(false)}
        onSave={handleSaveAlert}
        initialPrice={alertPrice}
        theme={theme}
      />
    </>
  );
}

export default App;
