/**
 * RideCheck Dynamic Surge & Weather Pricing Engine (Thailand Nationwide)
 * Version: 1.0.0
 * 
 * Implements Specification A6:
 * 1. Live Weather Integration via Open-Meteo API
 * 2. Deterministic Bangkok/Thailand Time Peak-Hour Model
 * 3. Graceful Offline / Network Failure Fallback to Historical Peak Baselines
 * 4. App-Specific Surge Sensitivity (Grab, Bolt, LINE MAN, Maxim, inDrive)
 * 5. Dual Runtime: Browser (window.SurgeEngine) & Node.js (CommonJS)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const exported = factory();
        root.SurgeEngine = exported;
        if (typeof window !== 'undefined') {
            window.getSurgeMultiplier = exported.getSurgeMultiplier;
        }
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ENGINE_VERSION = '1.0.0';

    // Weather code mappings from Open-Meteo WMO interpretation
    const WMO_WEATHER_CODES = {
        0: { desc: 'ท้องฟ้าแจ่มใส', isRain: false, rainSeverity: 'none' },
        1: { desc: 'ท้องฟ้าโปร่งเกือบทั้งหมด', isRain: false, rainSeverity: 'none' },
        2: { desc: 'มีเมฆบางส่วน', isRain: false, rainSeverity: 'none' },
        3: { desc: 'มีเมฆมาก', isRain: false, rainSeverity: 'none' },
        45: { desc: 'หมอกลง', isRain: false, rainSeverity: 'none' },
        48: { desc: 'หมอกน้ำค้างแข็ง', isRain: false, rainSeverity: 'none' },
        51: { desc: 'ฝนละอองเบาบาง', isRain: true, rainSeverity: 'drizzle' },
        53: { desc: 'ฝนละอองปานกลาง', isRain: true, rainSeverity: 'drizzle' },
        55: { desc: 'ฝนละอองหนาแน่น', isRain: true, rainSeverity: 'drizzle' },
        61: { desc: 'ฝนตกเล็กน้อย', isRain: true, rainSeverity: 'light' },
        63: { desc: 'ฝนตกปานกลาง', isRain: true, rainSeverity: 'moderate' },
        65: { desc: 'ฝนตกหนัก', isRain: true, rainSeverity: 'heavy' },
        80: { desc: 'ฝนซู่เล็กน้อย', isRain: true, rainSeverity: 'light' },
        81: { desc: 'ฝนซู่ปานกลาง', isRain: true, rainSeverity: 'moderate' },
        82: { desc: 'ฝนซู่รุนแรงมาก', isRain: true, rainSeverity: 'heavy' },
        95: { desc: 'พายุฝนฟ้าคะนอง', isRain: true, rainSeverity: 'heavy' },
        96: { desc: 'พายุฝนฟ้าคะนองรุนแรง', isRain: true, rainSeverity: 'heavy' },
        99: { desc: 'พายุฝนฟ้าคะนองพร้อมลูกเห็บ', isRain: true, rainSeverity: 'heavy' }
    };

    /**
     * Converts any date/time into Asia/Bangkok hour and minute
     */
    function getBangkokTime(timeInput) {
        let d = timeInput instanceof Date ? timeInput : (timeInput ? new Date(timeInput) : new Date());
        if (isNaN(d.getTime())) d = new Date();

        try {
            const bkkStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Bangkok',
                hour: 'numeric',
                minute: 'numeric',
                weekday: 'short',
                hour12: false
            }).format(d);
            const [wday, timeStr] = bkkStr.split(' ');
            const [h, m] = (timeStr || '').split(':');
            return {
                hour: parseInt(h, 10) % 24,
                minute: parseInt(m, 10) || 0,
                weekday: wday || 'Mon',
                date: d
            };
        } catch (e) {
            const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
            const bkk = new Date(utc + (3600000 * 7));
            return {
                hour: bkk.getHours(),
                minute: bkk.getMinutes(),
                weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][bkk.getDay()],
                date: bkk
            };
        }
    }

    /**
     * Historical baseline time-of-day traffic & surge calculation
     */
    function calculateTimeBaseline(bkkTime) {
        const { hour, minute, weekday } = bkkTime;
        const timeDecimal = hour + (minute / 60);
        const isWeekend = (weekday === 'Sat' || weekday === 'Sun');
        const isFriday = (weekday === 'Fri');

        let multiplier = 1.0;
        let trafficLevel = 'low';
        let reason = null;
        let isPeak = false;

        if (!isWeekend) {
            // Weekday Morning Peak: 07:00 - 09:30
            if (timeDecimal >= 7.0 && timeDecimal <= 9.5) {
                isPeak = true;
                trafficLevel = 'high';
                // Peak at 08:15
                const distFromCenter = Math.abs(timeDecimal - 8.25);
                multiplier = Number((1.30 - (distFromCenter * 0.10)).toFixed(2));
                reason = 'ช่วงเวลาเร่งด่วนเช้า วันทำงาน (07:00 - 09:30 น.)';
            }
            // Weekday Evening Peak: 17:00 - 20:00 (Friday extends to 20:30)
            else if (timeDecimal >= 17.0 && timeDecimal <= (isFriday ? 20.5 : 20.0)) {
                isPeak = true;
                trafficLevel = 'heavy';
                // Peak at 18:30
                const distFromCenter = Math.abs(timeDecimal - 18.5);
                const baseSurge = isFriday ? 1.45 : 1.38;
                multiplier = Number((baseSurge - (distFromCenter * 0.10)).toFixed(2));
                reason = `ช่วงเวลาเร่งด่วนเย็น ${isFriday ? 'ศุกร์หรรษา' : 'วันทำงาน'} (17:00 - 20:00 น.)`;
            }
            // Lunch Peak: 11:45 - 13:15
            else if (timeDecimal >= 11.75 && timeDecimal <= 13.25) {
                multiplier = 1.10;
                trafficLevel = 'moderate';
                reason = 'ช่วงพักกลางวันย่านธุรกิจ (12:00 - 13:00 น.)';
            }
            // Late Night: 00:00 - 04:30
            else if (timeDecimal >= 0.0 && timeDecimal <= 4.5) {
                multiplier = 1.05;
                trafficLevel = 'low';
                reason = 'ช่วงเวลากลางดึก รถบนถนนน้อย แต่จำนวนคนขับจำกัด';
            }
        } else {
            // Weekend Afternoon / Night: 14:00 - 21:00
            if (timeDecimal >= 14.0 && timeDecimal <= 21.0) {
                multiplier = 1.15;
                trafficLevel = 'moderate';
                reason = 'วันหยุดสุดสัปดาห์ การเดินทางท่องเที่ยวและห้างสรรพสินค้าหนาแน่น';
            }
            // Weekend Late Night (Nightlife): 23:00 - 02:30
            else if (timeDecimal >= 23.0 || timeDecimal <= 2.5) {
                multiplier = 1.20;
                trafficLevel = 'moderate';
                reason = 'คืนวันหยุดสุดสัปดาห์ ความต้องการเรียกรถย่านสถานบันเทิงสูง';
            }
        }

        return {
            multiplier: Math.max(1.0, multiplier),
            trafficLevel,
            reason,
            isPeakHour: isPeak
        };
    }

    /**
     * Fetches live weather from Open-Meteo API
     */
    async function fetchLiveWeather(lat, lng, timeoutMs = 3500) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat).toFixed(4)}&longitude=${Number(lng).toFixed(4)}&current=temperature_2m,rain,weather_code,wind_speed_10m`;

        const fetchFn = (typeof fetch !== 'undefined') ? fetch : require('node-fetch');
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

        try {
            const res = await fetchFn(url, { signal: controller ? controller.signal : undefined });
            if (timer) clearTimeout(timer);

            if (res.ok) {
                const data = await res.json();
                if (data.current) {
                    const c = data.current;
                    const code = c.weather_code !== undefined ? c.weather_code : 0;
                    const wmoInfo = WMO_WEATHER_CODES[code] || { desc: 'อากาศแปรปรวน', isRain: false, rainSeverity: 'none' };
                    const rainMm = Number(c.rain || 0);
                    const isRaining = wmoInfo.isRain || rainMm > 0.1;

                    return {
                        success: true,
                        isRaining,
                        rainMm,
                        weatherCode: code,
                        weatherDescription: wmoInfo.desc,
                        rainSeverity: isRaining ? (rainMm >= 5.0 ? 'heavy' : (rainMm >= 1.5 ? 'moderate' : 'light')) : 'none',
                        temperatureC: Number(c.temperature_2m || 30.0),
                        windSpeedKmh: Number(c.wind_speed_10m || 5.0)
                    };
                }
            }
        } catch (e) {
            // Offline or timeout
        } finally {
            if (timer) clearTimeout(timer);
        }

        return { success: false };
    }

    /**
     * Calculates App-Specific Surge Multiplier based on demand sensitivity
     */
    function calculateAppSurge(baseSurge) {
        const s = Math.max(1.0, baseSurge);
        const excess = s - 1.0;

        return {
            // Grab: High dynamic surge matching algorithm
            grab: Number(Math.min(2.2, 1.0 + (excess * 1.10)).toFixed(2)),
            // Bolt: Dynamic surge with quick response
            bolt: Number(Math.min(2.0, 1.0 + (excess * 1.05)).toFixed(2)),
            // LINE MAN: Moderate surge capping
            lineman: Number(Math.min(1.8, 1.0 + (excess * 0.95)).toFixed(2)),
            // Maxim: Semi-fixed rate with lower surge sensitivity
            maxim: Number(Math.min(1.4, 1.0 + (excess * 0.50)).toFixed(2)),
            // inDrive: Base is 1.0, but passenger recommended bid adjusts
            indrive: 1.0
        };
    }

    /**
     * Primary API: Get Dynamic Surge Multiplier for Location and Time
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {Object} [options={}] - Optional overrides (time, forceOffline, weatherOverride)
     * @returns {Promise<Object>} Surge result object satisfying Specification A6
     */
    async function getSurgeMultiplier(lat = 13.7563, lng = 100.5018, options = {}) {
        const bkkTime = getBangkokTime(options.time);
        const timeBaseline = calculateTimeBaseline(bkkTime);

        let weatherData = null;
        let isLiveWeather = false;

        // Check if caller injected a weather override (for unit testing)
        if (options.weatherOverride) {
            weatherData = {
                success: true,
                ...options.weatherOverride
            };
            isLiveWeather = true;
        } else if (!options.forceOffline) {
            weatherData = await fetchLiveWeather(lat, lng, options.timeoutMs || 3000);
            if (weatherData && weatherData.success) {
                isLiveWeather = true;
            }
        }

        // Calculate combined surge multiplier
        let combinedMultiplier = timeBaseline.multiplier;
        const reasons = [];

        if (timeBaseline.reason) {
            reasons.push(timeBaseline.reason);
        }

        let weatherReport = {
            isRaining: false,
            rainMm: 0,
            weatherDescription: 'ไม่มีข้อมูลสภาพอากาศสด (ใช้ค่าประมาณตามเวลา)',
            weatherCode: 0,
            temperatureC: 30.0
        };

        if (isLiveWeather && weatherData) {
            weatherReport = {
                isRaining: weatherData.isRaining,
                rainMm: weatherData.rainMm,
                weatherDescription: weatherData.weatherDescription,
                weatherCode: weatherData.weatherCode,
                temperatureC: weatherData.temperatureC
            };

            if (weatherData.isRaining) {
                let rainSurge = 0;
                if (weatherData.rainSeverity === 'heavy') {
                    rainSurge = 0.35;
                    reasons.push(`สภาพอากาศ: ${weatherData.weatherDescription} (ฝนหนัก ${weatherData.rainMm} มม./ชม.) รถหายากขึ้น`);
                } else if (weatherData.rainSeverity === 'moderate') {
                    rainSurge = 0.20;
                    reasons.push(`สภาพอากาศ: ${weatherData.weatherDescription} (${weatherData.rainMm} มม./ชม.) ความต้องการรถเพิ่มขึ้น`);
                } else {
                    rainSurge = 0.08;
                    reasons.push(`สภาพอากาศ: ${weatherData.weatherDescription} (ละอองฝนเบาบาง)`);
                }
                combinedMultiplier += rainSurge;
            } else {
                reasons.push(`สภาพอากาศปกติ: ${weatherData.weatherDescription} (${weatherData.temperatureC}°C)`);
            }
        } else {
            // Fallback reason
            reasons.push('ระบบใช้สถิติความหนาแน่นการจราจรตามช่วงเวลา (Offline Baseline)');
        }

        // Hard cap at realistic 2.50x
        combinedMultiplier = Number(Math.min(2.5, Math.max(1.0, combinedMultiplier)).toFixed(2));
        const appSurge = calculateAppSurge(combinedMultiplier);

        return {
            overallMultiplier: combinedMultiplier,
            appSurge,
            reasons,
            isPeakHour: timeBaseline.isPeakHour,
            trafficLevel: timeBaseline.trafficLevel,
            weather: weatherReport,
            confidence: isLiveWeather ? 'high' : 'medium',
            provider: isLiveWeather ? 'open-meteo-live' : 'historical-time-baseline',
            evaluatedAt: bkkTime.date.toISOString(),
            bkkHour: bkkTime.hour
        };
    }

    return {
        ENGINE_VERSION,
        WMO_WEATHER_CODES,
        getBangkokTime,
        calculateTimeBaseline,
        fetchLiveWeather,
        calculateAppSurge,
        getSurgeMultiplier
    };
}));
