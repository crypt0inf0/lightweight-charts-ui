import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import {
    createChart,
    CandlestickSeries,
    BarSeries,
    LineSeries,
    AreaSeries,
    BaselineSeries
} from 'lightweight-charts';
import styles from './ChartComponent.module.css';
import { getKlines, subscribeToTicker } from '../../services/binance';
import { calculateSMA, calculateEMA } from '../../utils/indicators';
import { calculateHeikinAshi } from '../../utils/chartUtils';
import { intervalToSeconds } from '../../utils/timeframes';
import { LineToolManager } from '../../plugins/line-tools/line-tools.js';
import '../../plugins/line-tools/line-tools.css';
import ReplayControls from '../Replay/ReplayControls';

const ChartComponent = forwardRef(({
    symbol,
    interval,
    chartType,
    indicators,
    activeTool,
    onToolUsed,
    isLogScale,
    isAutoScale,
    timeRange,
    magnetMode,
    isToolbarVisible = true,
    theme = 'dark',
    comparisonSymbols = [],
}, ref) => {
    const chartContainerRef = useRef();
    const [isLoading, setIsLoading] = useState(true);
    const chartRef = useRef(null);
    const mainSeriesRef = useRef(null);
    const smaSeriesRef = useRef(null);
    const emaSeriesRef = useRef(null);
    const lineToolManagerRef = useRef(null);
    const wsRef = useRef(null);
    const chartTypeRef = useRef(chartType);
    const dataRef = useRef([]);
    const comparisonSeriesRefs = useRef(new Map());

    // Replay State
    const [isReplayMode, setIsReplayMode] = useState(false);
    const isReplayModeRef = useRef(false); // Ref to track replay mode in callbacks
    useEffect(() => { isReplayModeRef.current = isReplayMode; }, [isReplayMode]);

    const [isPlaying, setIsPlaying] = useState(false);
    const [replaySpeed, setReplaySpeed] = useState(1);
    const [replayIndex, setReplayIndex] = useState(null);
    const [isSelectingReplayPoint, setIsSelectingReplayPoint] = useState(false);
    const fullDataRef = useRef([]); // Store full data for replay
    const replayIntervalRef = useRef(null);

    const DEFAULT_CANDLE_WINDOW = 230;
    const DEFAULT_RIGHT_OFFSET = 10;

    const applyDefaultCandlePosition = (explicitLength) => {
        if (!chartRef.current) return;

        const inferredLength = Number.isFinite(explicitLength)
            ? explicitLength
            : (mainSeriesRef.current?.data()?.length ?? 0);

        if (!inferredLength || inferredLength <= 0) {
            return;
        }

        const lastIndex = Math.max(inferredLength - 1, 0);
        const to = lastIndex + DEFAULT_RIGHT_OFFSET;
        const from = to - DEFAULT_CANDLE_WINDOW;

        try {
            const timeScale = chartRef.current.timeScale();
            timeScale.applyOptions({ rightOffset: DEFAULT_RIGHT_OFFSET });
            timeScale.setVisibleLogicalRange({ from, to });
        } catch (err) {
            console.warn('Failed to apply default candle position', err);
        }

        chartRef.current.priceScale('right').applyOptions({ autoScale: true });
        if (lineToolManagerRef.current) {
            lineToolManagerRef.current.setDefaultRange({ from, to });
        }
    };

    // Axis Label State
    const [axisLabel, setAxisLabel] = useState(null);
    const [timeRemaining, setTimeRemaining] = useState('');

    useEffect(() => {
        chartTypeRef.current = chartType;
    }, [chartType]);

    // Expose undo/redo and line tool manager to parent
    useImperativeHandle(ref, () => ({
        undo: () => {
            if (lineToolManagerRef.current) lineToolManagerRef.current.undo();
        },
        redo: () => {
            if (lineToolManagerRef.current) lineToolManagerRef.current.redo();
        },
        getLineToolManager: () => lineToolManagerRef.current,
        clearTools: () => {
            if (lineToolManagerRef.current) lineToolManagerRef.current.clearTools();
        },
        resetZoom: () => {
            applyDefaultCandlePosition(dataRef.current.length);
        },
        getChartContainer: () => chartContainerRef.current,
        getCurrentPrice: () => {
            if (dataRef.current && dataRef.current.length > 0) {
                const lastData = dataRef.current[dataRef.current.length - 1];
                return lastData.close ?? lastData.value;
            }
            return null;
        },
        toggleReplay: () => {
            setIsReplayMode(prev => !prev);
            if (!isReplayMode) {
                // Entering replay mode
                fullDataRef.current = [...dataRef.current];
                setIsPlaying(false);
                setReplayIndex(dataRef.current.length - 1);
            } else {
                // Exiting replay mode
                stopReplay();
                setIsPlaying(false);
                setReplayIndex(null);
                setIsSelectingReplayPoint(false);
                // Restore full data
                if (mainSeriesRef.current && fullDataRef.current.length > 0) {
                    dataRef.current = fullDataRef.current;
                    const transformedData = transformData(fullDataRef.current, chartTypeRef.current);
                    mainSeriesRef.current.setData(transformedData);
                    updateIndicators(fullDataRef.current);
                }
            }
        }
    }));

    // Handle active tool change
    useEffect(() => {
        if (lineToolManagerRef.current && activeTool) {
            const toolMap = {
                'cursor': 'None',
                'trendline': 'TrendLine',
                'arrow': 'Arrow',
                'ray': 'Ray',
                'extended_line': 'ExtendedLine',
                'horizontal': 'HorizontalLine',
                'horizontal_ray': 'HorizontalRay',
                'vertical': 'VerticalLine',
                'cross_line': 'CrossLine',
                'parallel_channel': 'ParallelChannel',
                'fibonacci': 'FibRetracement',
                'fib_extension': 'FibExtension',
                'pitchfork': 'Pitchfork',
                'brush': 'Brush',
                'highlighter': 'Highlighter',
                'rectangle': 'Rectangle',
                'circle': 'Circle',
                'path': 'Path',
                'text': 'Text',
                'callout': 'Callout',
                'price_label': 'PriceLabel',
                'pattern': 'Pattern',
                'triangle': 'Triangle',
                'abcd': 'ABCD',
                'xabcd': 'XABCD',
                'elliott_impulse': 'ElliottImpulseWave',
                'elliott_correction': 'ElliottCorrectionWave',
                'prediction': 'LongPosition',
                'prediction_short': 'ShortPosition',
                'date_range': 'DateRange',
                'price_range': 'PriceRange',
                'date_price_range': 'DatePriceRange',
                'measure': 'Measure',
                'head_and_shoulders': 'HeadAndShoulders',
                'eraser': 'Eraser',
                'info_line': 'TrendLine',
                'remove': 'None'
            };

            const mappedTool = toolMap[activeTool] || 'None';
            console.log(`🎨 Starting tool: ${activeTool} -> ${mappedTool}`);

            if (lineToolManagerRef.current && typeof lineToolManagerRef.current.startTool === 'function') {
                lineToolManagerRef.current.startTool(mappedTool);
                console.log('✅ Tool started successfully');
            }
        }
    }, [activeTool]);

    // Candle Countdown Timer Logic
    useEffect(() => {
        const updateTimer = () => {
            const now = Date.now() / 1000;
            const intervalSeconds = intervalToSeconds(interval);
            if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
                setTimeRemaining('00:00:00');
                return;
            }
            const nextCandleTime = Math.ceil(now / intervalSeconds) * intervalSeconds;
            const diff = nextCandleTime - now;

            if (diff > 0) {
                const hours = Math.floor(diff / 3600);
                const minutes = Math.floor((diff % 3600) / 60);
                const seconds = Math.floor(diff % 60);

                const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                setTimeRemaining(formatted);
            } else {
                setTimeRemaining('00:00:00');
            }
        };

        if (isReplayMode) {
            setTimeRemaining('');
            return;
        }

        updateTimer();
        const timerId = setInterval(updateTimer, 1000);

        return () => clearInterval(timerId);
        return () => clearInterval(timerId);
    }, [interval, isReplayMode]);

    // Update Axis Label Position and Content
    const updateAxisLabel = useCallback(() => {
        if (!chartRef.current || !mainSeriesRef.current || !chartContainerRef.current) return;

        const data = mainSeriesRef.current.data();
        if (!data || data.length === 0) {
            setAxisLabel(null);
            return;
        }

        const lastData = data[data.length - 1];
        const price = lastData.close ?? lastData.value;
        if (price === undefined) {
            setAxisLabel(null);
            return;
        }

        const coordinate = mainSeriesRef.current.priceToCoordinate(price);

        if (coordinate === null) {
            setAxisLabel(null);
            return;
        }

        let color = '#2962FF';
        if (lastData.open !== undefined && lastData.close !== undefined) {
            color = lastData.close >= lastData.open ? '#089981' : '#F23645';
        }

        try {
            let labelText = price.toFixed(2);

            // Handle Percentage Mode Label
            if (comparisonSymbols.length > 0) {
                const timeScale = chartRef.current.timeScale();
                const visibleRange = timeScale.getVisibleLogicalRange();

                if (visibleRange) {
                    const firstIndex = Math.max(0, Math.round(visibleRange.from));
                    if (dataRef.current && firstIndex < dataRef.current.length) {
                        const baseData = dataRef.current[firstIndex];
                        if (baseData) {
                            const baseValue = baseData.close ?? baseData.value;

                            if (baseValue && baseValue !== 0) {
                                const percentage = ((price - baseValue) / baseValue) * 100;
                                labelText = `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
                            }
                        }
                    }
                }
            }

            const newLabel = {
                top: coordinate,
                price: labelText,
                symbol: comparisonSymbols.length > 0 ? symbol : null, // Only show symbol if in comparison mode
                color: color
            };

            setAxisLabel(prev => {
                if (!prev || prev.top !== newLabel.top || prev.price !== newLabel.price || prev.symbol !== newLabel.symbol || prev.color !== newLabel.color) {
                    return newLabel;
                }
                return prev;
            });
        } catch (err) {
            console.error('Error in updateAxisLabel:', err);
        }
    }, [comparisonSymbols]);

    // RAF Loop for smooth updates
    useEffect(() => {
        let animationFrameId;

        const animate = () => {
            updateAxisLabel();
            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => cancelAnimationFrame(animationFrameId);
    }, [updateAxisLabel]);



    // Helper to transform OHLC data based on chart type
    const transformData = (data, type) => {
        if (!data || data.length === 0) return [];

        switch (type) {
            case 'line':
            case 'area':
            case 'baseline':
                return data.map(d => ({ time: d.time, value: d.close }));
            case 'heikin-ashi':
                return calculateHeikinAshi(data);
            default:
                return data;
        }
    };

    // Create appropriate series based on chart type
    const createSeries = (chart, type) => {
        const commonOptions = { lastValueVisible: false, priceScaleId: 'right' };

        switch (type) {
            case 'candlestick':
                return chart.addSeries(CandlestickSeries, {
                    ...commonOptions,
                    upColor: '#089981',
                    downColor: '#F23645',
                    borderVisible: false,
                    wickUpColor: '#089981',
                    wickDownColor: '#F23645',
                });
            case 'bar':
                return chart.addSeries(BarSeries, {
                    ...commonOptions,
                    upColor: '#089981',
                    downColor: '#F23645',
                    thinBars: false,
                });
            case 'hollow-candlestick':
                return chart.addSeries(CandlestickSeries, {
                    ...commonOptions,
                    upColor: 'transparent',
                    downColor: '#F23645',
                    borderUpColor: '#089981',
                    borderDownColor: '#F23645',
                    wickUpColor: '#089981',
                    wickDownColor: '#F23645',
                });
            case 'line':
                return chart.addSeries(LineSeries, {
                    ...commonOptions,
                    color: '#2962FF',
                    lineWidth: 2,
                });
            case 'area':
                return chart.addSeries(AreaSeries, {
                    ...commonOptions,
                    topColor: 'rgba(41, 98, 255, 0.4)',
                    bottomColor: 'rgba(41, 98, 255, 0.0)',
                    lineColor: '#2962FF',
                    lineWidth: 2,
                });
            case 'baseline':
                return chart.addSeries(BaselineSeries, {
                    ...commonOptions,
                    topLineColor: '#089981',
                    topFillColor1: 'rgba(8, 153, 129, 0.28)',
                    topFillColor2: 'rgba(8, 153, 129, 0.05)',
                    bottomLineColor: '#F23645',
                    bottomFillColor1: 'rgba(242, 54, 69, 0.05)',
                    bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
                });
            case 'heikin-ashi':
                return chart.addSeries(CandlestickSeries, {
                    ...commonOptions,
                    upColor: '#089981',
                    downColor: '#F23645',
                    borderVisible: false,
                    wickUpColor: '#089981',
                    wickDownColor: '#F23645',
                });
            default:
                return chart.addSeries(CandlestickSeries, {
                    ...commonOptions,
                    upColor: '#089981',
                    downColor: '#F23645',
                    borderVisible: false,
                    wickUpColor: '#089981',
                    wickDownColor: '#F23645',
                });
        }
    };

    // Keep track of active tool for the wrapper
    const activeToolRef = useRef(activeTool);
    useEffect(() => {
        activeToolRef.current = activeTool;
    }, [activeTool]);

    // Initialize LineToolManager when series is ready
    const initializeLineTools = (series) => {
        if (!lineToolManagerRef.current) {
            const manager = new LineToolManager();

            // Wrap startTool to detect when tool is cancelled/finished
            const originalStartTool = manager.startTool.bind(manager);
            manager.startTool = (tool) => {
                console.log('🔧 LineToolManager.startTool called with:', tool);
                originalStartTool(tool);

                // If tool is None, it means we are back to cursor mode
                if ((tool === 'None' || tool === null) && activeToolRef.current !== null && activeToolRef.current !== 'cursor') {
                    console.log('🔄 Tool cancelled/finished, resetting state');
                    if (onToolUsed) onToolUsed();
                }
            };

            series.attachPrimitive(manager);
            lineToolManagerRef.current = manager;
            console.log('✅ LineToolManager initialized');

            window.lineToolManager = manager;
            window.chartInstance = chartRef.current;
            window.seriesInstance = series;
        }
    };

    // Initialize chart once on mount
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                textColor: theme === 'dark' ? '#D1D4DC' : '#131722',
                background: { color: theme === 'dark' ? '#131722' : '#ffffff' },
            },
            grid: {
                vertLines: { color: theme === 'dark' ? '#2A2E39' : '#e0e3eb' },
                horzLines: { color: theme === 'dark' ? '#2A2E39' : '#e0e3eb' },
            },
            crosshair: {
                mode: magnetMode ? 1 : 0,
                vertLine: {
                    width: 1,
                    color: theme === 'dark' ? '#758696' : '#9598a1',
                    style: 3,
                    labelBackgroundColor: theme === 'dark' ? '#758696' : '#9598a1',
                },
                horzLine: {
                    width: 1,
                    color: theme === 'dark' ? '#758696' : '#9598a1',
                    style: 3,
                    labelBackgroundColor: theme === 'dark' ? '#758696' : '#9598a1',
                },
            },
            timeScale: {
                borderColor: theme === 'dark' ? '#2A2E39' : '#e0e3eb',
                timeVisible: true,
            },
            rightPriceScale: {
                borderColor: theme === 'dark' ? '#2A2E39' : '#e0e3eb',
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
            },
            handleScale: {
                mouseWheel: true,
                pinch: true,
            },
        });

        chartRef.current = chart;

        const mainSeries = createSeries(chart, chartType);
        mainSeriesRef.current = mainSeries;

        // Initialize LineToolManager
        initializeLineTools(mainSeries);

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight,
                });
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(chartContainerRef.current);

        // Handle right-click to cancel tool
        const handleContextMenu = (event) => {
            event.preventDefault(); // Prevent default right-click menu
            if (activeToolRef.current && activeToolRef.current !== 'cursor') {
                if (onToolUsed) onToolUsed();
            }
        };
        const container = chartContainerRef.current;
        container.addEventListener('contextmenu', handleContextMenu, true);

        return () => {
            container.removeEventListener('contextmenu', handleContextMenu, true);
            resizeObserver.disconnect();
            if (wsRef.current) wsRef.current.close();
            chart.remove();
            chartRef.current = null;
            mainSeriesRef.current = null;
            lineToolManagerRef.current = null;
        };
    }, []); // Only create chart once

    // Re-create main series when chart type changes
    useEffect(() => {
        if (!chartRef.current || !mainSeriesRef.current) {
            return;
        }

        const chart = chartRef.current;

        if (lineToolManagerRef.current) {
            try {
                lineToolManagerRef.current.clearTools();
            } catch (err) {
                console.warn('Failed to clear tools before switching chart type', err);
            }
            try {
                mainSeriesRef.current.detachPrimitive(lineToolManagerRef.current);
            } catch (err) {
                console.warn('Failed to detach line tools from series', err);
            }
            lineToolManagerRef.current = null;
        }

        chart.removeSeries(mainSeriesRef.current);

        const replacementSeries = createSeries(chart, chartType);
        mainSeriesRef.current = replacementSeries;
        initializeLineTools(replacementSeries);

        const existingData = transformData(dataRef.current, chartType);
        if (existingData.length) {
            replacementSeries.setData(existingData);
            updateIndicators(dataRef.current);
            applyDefaultCandlePosition(existingData.length);
            updateAxisLabel();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chartType, updateAxisLabel]);

    // Load data when symbol/interval changes
    useEffect(() => {
        if (!chartRef.current) return;

        let disposed = false;
        const abortController = new AbortController();

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        const loadData = async () => {
            setIsLoading(true);
            try {
                const data = await getKlines(symbol, interval, 1000, abortController.signal);
                if (disposed) return;

                if (Array.isArray(data) && data.length > 0 && mainSeriesRef.current) {
                    dataRef.current = data;
                    const activeType = chartTypeRef.current;
                    const transformedData = transformData(data, activeType);
                    mainSeriesRef.current.setData(transformedData);

                    updateIndicators(data);

                    applyDefaultCandlePosition(transformedData.length);

                    setTimeout(() => {
                        if (!disposed) {
                            setIsLoading(false);
                            updateAxisLabel();
                        }
                    }, 50);

                    wsRef.current = subscribeToTicker(symbol.toLowerCase(), interval, (ticker) => {
                        if (disposed || !ticker || typeof ticker.close !== 'number' || isNaN(ticker.close)) return;

                        const newCandle = {
                            time: ticker.time,
                            open: ticker.open,
                            high: ticker.high,
                            low: ticker.low,
                            close: ticker.close,
                        };

                        if (isNaN(newCandle.open) || isNaN(newCandle.high) || isNaN(newCandle.low) || isNaN(newCandle.close)) {
                            console.warn('Received invalid candle data:', newCandle);
                            return;
                        }

                        const currentData = dataRef.current.slice();
                        const lastCandle = currentData[currentData.length - 1];
                        const intervalSeconds = intervalToSeconds(interval);
                        if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
                            return;
                        }
                        const candleTime = Math.floor(newCandle.time / intervalSeconds) * intervalSeconds;
                        newCandle.time = candleTime;

                        if (lastCandle && lastCandle.time === candleTime) {
                            currentData[currentData.length - 1] = newCandle;
                        } else {
                            currentData.push(newCandle);
                        }

                        dataRef.current = currentData;

                        const currentChartType = chartTypeRef.current;
                        const transformedRealtimeData = transformData(currentData, currentChartType);
                        const latestUpdate = transformedRealtimeData[transformedRealtimeData.length - 1];

                        let isValidUpdate = false;
                        if (latestUpdate) {
                            if (latestUpdate.value !== undefined) {
                                isValidUpdate = !isNaN(latestUpdate.value);
                            } else if (latestUpdate.open !== undefined) {
                                isValidUpdate = !isNaN(latestUpdate.open) && !isNaN(latestUpdate.high) && !isNaN(latestUpdate.low) && !isNaN(latestUpdate.close);
                            }
                        }

                        if (isValidUpdate && mainSeriesRef.current) {
                            // In replay mode, do NOT update the chart with live data
                            if (!isReplayModeRef.current) {
                                mainSeriesRef.current.setData(transformedRealtimeData);
                                updateRealtimeIndicators(currentData);
                                updateAxisLabel();
                            }
                        }
                    });
                } else {
                    dataRef.current = [];
                    mainSeriesRef.current?.setData([]);
                    setIsLoading(false);
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    return;
                }
                console.error('Error loading chart data:', error);
                if (!disposed) {
                    setIsLoading(false);
                }
            }
        };

        loadData();

        return () => {
            disposed = true;
            abortController.abort();
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol, interval]);

    const updateRealtimeIndicators = useCallback((data) => {
        if (!chartRef.current) return;

        // SMA Indicator
        if (indicators.sma && smaSeriesRef.current) {
            const smaData = calculateSMA(data, 20);
            if (smaData && smaData.length > 0) {
                smaSeriesRef.current.update(smaData[smaData.length - 1]);
            }
        }

        // EMA Indicator
        if (indicators.ema && emaSeriesRef.current) {
            const emaData = calculateEMA(data, 20);
            if (emaData && emaData.length > 0) {
                emaSeriesRef.current.update(emaData[emaData.length - 1]);
            }
        }
    }, [indicators]);

    const updateIndicators = useCallback((data) => {
        if (!chartRef.current) return;

        // Batch all operations to prevent multiple redraws
        chartRef.current.applyOptions({});

        // SMA Indicator
        if (indicators.sma) {
            if (!smaSeriesRef.current) {
                smaSeriesRef.current = chartRef.current.addSeries(LineSeries, {
                    color: '#2962FF',
                    lineWidth: 2,
                    title: 'SMA 20',
                    priceLineVisible: false,
                    lastValueVisible: false
                });
            }
            const smaData = calculateSMA(data, 20);
            if (smaData && smaData.length > 0) {
                smaSeriesRef.current.setData(smaData);
            }
        } else {
            if (smaSeriesRef.current) {
                chartRef.current.removeSeries(smaSeriesRef.current);
                smaSeriesRef.current = null;
            }
        }

        // EMA Indicator
        if (indicators.ema) {
            if (!emaSeriesRef.current) {
                emaSeriesRef.current = chartRef.current.addSeries(LineSeries, {
                    color: '#FF6D00',
                    lineWidth: 2,
                    title: 'EMA 20',
                    priceLineVisible: false,
                    lastValueVisible: false
                });
            }
            const emaData = calculateEMA(data, 20);
            if (emaData && emaData.length > 0) {
                emaSeriesRef.current.setData(emaData);
            }
        } else {
            if (emaSeriesRef.current) {
                chartRef.current.removeSeries(emaSeriesRef.current);
                emaSeriesRef.current = null;
            }
        }
    }, [indicators]);

    // Separate effect for indicators to prevent data reload
    useEffect(() => {
        if (dataRef.current.length > 0) {
            updateIndicators(dataRef.current);
        }
    }, [updateIndicators]);

    // Handle Magnet Mode
    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.applyOptions({
                crosshair: {
                    mode: magnetMode ? 1 : 0,
                },
            });
        }
    }, [magnetMode]);



    // Handle Comparison Symbols
    useEffect(() => {
        if (!chartRef.current) return;

        const currentSymbols = new Set(comparisonSymbols.map(s => s.symbol));
        const activeSeries = comparisonSeriesRefs.current;

        // Remove series that are no longer in comparisonSymbols
        activeSeries.forEach((series, symbol) => {
            if (!currentSymbols.has(symbol)) {
                chartRef.current.removeSeries(series);
                activeSeries.delete(symbol);
            }
        });

        // Add new series
        comparisonSymbols.forEach(async (comp) => {
            if (!activeSeries.has(comp.symbol)) {
                const series = chartRef.current.addSeries(LineSeries, {
                    color: comp.color,
                    lineWidth: 2,
                    priceScaleId: 'right',
                    title: comp.symbol,
                });
                activeSeries.set(comp.symbol, series);

                // Fetch data
                try {
                    // Use the same interval as the main chart
                    const data = await getKlines(comp.symbol, interval, 1000);
                    if (data && data.length > 0) {
                        const transformedData = data.map(d => ({ time: d.time, value: d.close }));
                        series.setData(transformedData);
                    }
                } catch (err) {
                    console.error(`Failed to load comparison data for ${comp.symbol}`, err);
                }
            }
        });

        // Update Price Scale Mode
        // 0: Normal, 1: Log, 2: Percentage
        const mode = comparisonSymbols.length > 0 ? 2 : (isLogScale ? 1 : 0);

        chartRef.current.priceScale('right').applyOptions({
            mode: mode,
            autoScale: isAutoScale,
        });

    }, [comparisonSymbols, interval, isLogScale, isAutoScale]);

    // Handle Theme Changes
    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.applyOptions({
                layout: {
                    textColor: theme === 'dark' ? '#D1D4DC' : '#131722',
                    background: { color: theme === 'dark' ? '#131722' : '#ffffff' },
                },
                grid: {
                    vertLines: { color: theme === 'dark' ? '#2A2E39' : '#e0e3eb' },
                    horzLines: { color: theme === 'dark' ? '#2A2E39' : '#e0e3eb' },
                },
                crosshair: {
                    vertLine: {
                        color: theme === 'dark' ? '#758696' : '#9598a1',
                        labelBackgroundColor: theme === 'dark' ? '#758696' : '#9598a1',
                    },
                    horzLine: {
                        color: theme === 'dark' ? '#758696' : '#9598a1',
                        labelBackgroundColor: theme === 'dark' ? '#758696' : '#9598a1',
                    },
                },
                timeScale: {
                    borderColor: theme === 'dark' ? '#2A2E39' : '#e0e3eb',
                },
                rightPriceScale: {
                    borderColor: theme === 'dark' ? '#2A2E39' : '#e0e3eb',
                },
            });
        }
    }, [theme]);

    // Handle Time Range
    useEffect(() => {
        if (chartRef.current && timeRange && !isLoading) {
            const now = Math.floor(Date.now() / 1000);
            let from = now;
            const to = now;

            switch (timeRange) {
                case '1D': from = now - 86400; break;
                case '5D': from = now - 86400 * 5; break;
                case '1M': from = now - 86400 * 30; break;
                case '3M': from = now - 86400 * 90; break;
                case '6M': from = now - 86400 * 180; break;
                case 'YTD': {
                    const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
                    from = startOfYear;
                    break;
                }
                case '1Y': from = now - 86400 * 365; break;
                case '5Y': from = now - 86400 * 365 * 5; break;
                case 'All':
                    applyDefaultCandlePosition();
                    return;
                default: return;
            }

            if (from && to && !isNaN(from) && !isNaN(to)) {
                try {
                    chartRef.current.timeScale().setVisibleRange({ from, to });
                } catch (e) {
                    if (e.message !== 'Value is null') {
                        console.warn('Failed to set visible range:', e);
                    }
                }
            }
        }
    }, [timeRange, isLoading]);

    // Replay Logic
    const stopReplay = () => {
        if (replayIntervalRef.current) {
            clearInterval(replayIntervalRef.current);
            replayIntervalRef.current = null;
        }
    };

    const handleReplayPlayPause = () => {
        setIsPlaying(prev => !prev);
    };

    const handleReplayForward = () => {
        if (replayIndex !== null && replayIndex < fullDataRef.current.length - 1) {
            const nextIndex = replayIndex + 1;
            setReplayIndex(nextIndex);
            updateReplayData(nextIndex);
        }
    };

    const handleReplayJumpTo = () => {
        setIsSelectingReplayPoint(true);
        setIsPlaying(false);
        // Change cursor to indicate selection
        if (chartContainerRef.current) {
            chartContainerRef.current.style.cursor = 'crosshair';
        }
    };

    const updateReplayData = (index) => {
        if (!mainSeriesRef.current || !fullDataRef.current) return;

        const slicedData = fullDataRef.current.slice(0, index + 1);
        dataRef.current = slicedData;

        const transformedData = transformData(slicedData, chartTypeRef.current);
        mainSeriesRef.current.setData(transformedData);
        updateIndicators(slicedData);
        updateAxisLabel();
    };

    // Playback Effect
    useEffect(() => {
        if (isPlaying && isReplayMode) {
            stopReplay();
            const intervalMs = 1000 / replaySpeed; // 1x = 1 sec, 10x = 0.1 sec

            replayIntervalRef.current = setInterval(() => {
                setReplayIndex(prev => {
                    if (prev === null || prev >= fullDataRef.current.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    const next = prev + 1;
                    updateReplayData(next);
                    return next;
                });
            }, intervalMs);
        } else {
            stopReplay();
        }
        return () => stopReplay();
    }, [isPlaying, isReplayMode, replaySpeed]);

    // Click Handler for "Jump to Bar"
    useEffect(() => {
        if (!chartRef.current || !isSelectingReplayPoint) return;

        const handleChartClick = (param) => {
            if (!param.time || !isSelectingReplayPoint) return;

            // Find index of clicked time
            const clickedTime = param.time;
            const index = fullDataRef.current.findIndex(d => d.time === clickedTime);

            if (index !== -1) {
                setReplayIndex(index);
                updateReplayData(index);
                setIsSelectingReplayPoint(false);
                if (chartContainerRef.current) {
                    chartContainerRef.current.style.cursor = 'default';
                }
            }
        };

        chartRef.current.subscribeClick(handleChartClick);
        return () => {
            if (chartRef.current) {
                chartRef.current.unsubscribeClick(handleChartClick);
            }
        };
    }, [isSelectingReplayPoint]);

    return (
        <div className={`${styles.chartWrapper} ${isToolbarVisible ? styles.toolbarVisible : ''}`}>
            <div
                id="container"
                ref={chartContainerRef}
                className={styles.chartContainer}
                style={{
                    position: 'relative',
                    touchAction: 'none',
                    visibility: isLoading ? 'hidden' : 'visible'
                }}
            />
            {isLoading && <div className={styles.loadingOverlay}><div className={styles.spinner}></div><div>Loading...</div></div>}

            {/* Axis Label */}
            {axisLabel && (
                <div
                    className={styles.axisLabelWrapper}
                    style={{ top: axisLabel.top }}
                >
                    {axisLabel.symbol && (
                        <div className={styles.axisLabelSymbol} style={{ backgroundColor: axisLabel.color }}>
                            {axisLabel.symbol}
                        </div>
                    )}
                    <div
                        className={styles.axisLabel}
                        style={{ backgroundColor: axisLabel.color }}
                    >
                        <span className={styles.axisLabelPrice}>{axisLabel.price}</span>
                        <span className={styles.axisLabelTimer}>{timeRemaining}</span>
                    </div>
                </div>
            )}

            {/* Candle Countdown */}
            {timeRemaining && !isReplayMode && (
                <div className={styles.countdown}>
                    Next candle in: {timeRemaining}
                </div>
            )}

            {/* Replay Controls */}
            {isReplayMode && (
                <ReplayControls
                    isPlaying={isPlaying}
                    speed={replaySpeed}
                    onPlayPause={handleReplayPlayPause}
                    onForward={handleReplayForward}
                    onJumpTo={handleReplayJumpTo}
                    onSpeedChange={setReplaySpeed}
                    onClose={() => {
                        setIsReplayMode(false);
                        // Restore full data
                        if (mainSeriesRef.current && fullDataRef.current.length > 0) {
                            dataRef.current = fullDataRef.current;
                            const transformedData = transformData(fullDataRef.current, chartTypeRef.current);
                            mainSeriesRef.current.setData(transformedData);
                            updateIndicators(fullDataRef.current);
                        }
                    }}
                />
            )}

            {isLoading && (
                <div className={styles.loaderContainer}>
                    <div className={styles.loader}></div>
                </div>
            )}
        </div>
    );
});

export default ChartComponent;
