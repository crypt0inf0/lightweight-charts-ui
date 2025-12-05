export const getKlines = async (symbol, interval = '1d', limit = 1000, signal) => {
    const safeLimit = Number.isFinite(limit) ? limit : 1000;
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${safeLimit}`;
    try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
            throw new Error(`Binance klines error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            return [];
        }
        return data.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
        })).filter(candle =>
            [candle.open, candle.high, candle.low, candle.close].every(value => Number.isFinite(value))
        );
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error fetching klines:', error);
        }
        return [];
    }
};

export const getTickerPrice = async (symbol) => {
    try {
        const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
        if (!response.ok) {
            throw new Error(`Binance ticker error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching ticker price:", error);
        return null;
    }
};

export const subscribeToTicker = (symbol, interval, callback) => {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`);

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (!message || !message.k) return;

            const kline = message.k;
            const candle = {
                time: kline.t / 1000,
                open: parseFloat(kline.o),
                high: parseFloat(kline.h),
                low: parseFloat(kline.l),
                close: parseFloat(kline.c),
            };
            callback(candle);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    return ws;
};

export const subscribeToMultiTicker = (symbols, callback) => {
    if (!symbols || symbols.length === 0) return null;

    const streams = symbols.map(s => `${s.toLowerCase()}@miniTicker`).join('/');
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (!message || !message.data) return;

            const ticker = message.data;
            // miniTicker format:
            // e: event type, E: event time, s: symbol, c: close, o: open, h: high, l: low, v: volume, q: quote volume
            const data = {
                symbol: ticker.s,
                last: parseFloat(ticker.c),
                open: parseFloat(ticker.o),
                // Calculate change and change% based on open (approximate for miniTicker) or use 24hr ticker if needed.
                // Note: miniTicker 'o' is 24hr open price? No, it's usually candle open.
                // Actually @miniTicker gives 24hr rolling window stats?
                // Binance docs: @miniTicker "24hr Rolling Window Mini-Ticker Statistics"
                // So 'o' is Open Price (24hr).
                chg: parseFloat(ticker.c) - parseFloat(ticker.o),
                chgP: ((parseFloat(ticker.c) - parseFloat(ticker.o)) / parseFloat(ticker.o)) * 100
            };
            callback(data);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    return ws;
};
