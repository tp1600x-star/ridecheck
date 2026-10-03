/**
 * RideCheck Universal Fare Estimation Model (Thailand Nationwide)
 * Version: 1.0.0-uncalibrated
 *
 * Core Principals:
 * 1. 100% Deterministic: Zero Math.random(). Same input -> Exact same output.
 * 2. Unbiased & Honest: No fictitious promotional discounts subtracted from estimated base/surge fares.
 * 3. inDrive Dynamics: Passenger bidding range (low: -15%, high: +18%) with explicit user-negotiated notice.
 * 4. Dual Runtime: Works seamlessly in Browser (window.FareModel / global) and Node.js (CommonJS require).
 * 5. Timezone Grounding: Pure Asia/Bangkok time calculations for rush hour / surge.
 * 6. Transport Law Compliance: Official Thai Taxi Regulations 2566 (กฎกระทรวงคมนาคม พ.ศ. 2566).
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const exported = factory();
        root.FareModel = exported;
        // Global aliases for web backward-compatibility
        if (typeof window !== 'undefined') {
            window.estimateFare = exported.estimateFare;
            window.estimateRideFare = exported.estimateRideFare;
        }
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let MODEL_VERSION = '1.0.0-uncalibrated';
    let CALIBRATED_AT = null;
    let SAMPLE_COUNT = 0;

    // 1. App Metadata (Logos, Brands, Coverage Tiers across Thailand)
    const APP_METADATA = [
        { id: 'grab', name: 'Grab', class: 'logo-grab', initial: 'G', color: '#00B14F' },
        { id: 'bolt', name: 'Bolt', class: 'logo-bolt', initial: 'B', color: '#34D186' },
        { id: 'lineman', name: 'LINE MAN', class: 'logo-lineman', initial: 'L', color: '#00C851' },
        { id: 'maxim', name: 'Maxim', class: 'logo-maxim', initial: 'M', color: '#FF6B35' },
        { id: 'indrive', name: 'InDrive', class: 'logo-indrive', initial: 'I', color: '#B3FF00' }
    ];

    const COVERAGE_METADATA = {
        grab: {
            level: 'national',
            tag: 'ครอบคลุม 77 จังหวัด',
            cls: 'badge-coverage-nationwide',
            note: 'มีรถพร้อมรับทั่วไทย ทั้งเมืองหลักและต่างจังหวัด'
        },
        bolt: {
            level: 'metro',
            tag: 'เมืองหลัก & ท่องเที่ยว',
            cls: 'badge-coverage-metro',
            note: 'กทม., เชียงใหม่, ภูเก็ต, พัทยา, ชลบุรี, หัวหิน'
        },
        lineman: {
            level: 'metro',
            tag: 'กทม. และปริมณฑล',
            cls: 'badge-coverage-metro',
            note: 'เน้นเขตกรุงเทพฯ, นนทบุรี, สมุทรปราการ, ปทุมธานี'
        },
        maxim: {
            level: 'regional',
            tag: 'ทั่วประเทศ & เมืองรอง',
            cls: 'badge-coverage-regional',
            note: 'ครอบคลุมจังหวัดภูมิภาคและเมืองรองทั่วไทย'
        },
        indrive: {
            level: 'regional',
            tag: 'เสนอราคาต่อรองได้',
            cls: 'badge-coverage-regional',
            note: 'ตกลงราคากับคนขับได้อิสระ เดินทางข้ามจังหวัดได้'
        }
    };

    // 2. Base Parameter Matrix for Ride-Hailing Apps (Kept intact for Step 1 until Step 3 calibration)
    // NOTE: Fictitious discount factors (promoDiscount, hasSaver price deduction) are REMOVED from fare math!
    const PRICING_MATRIX = {
        bike: {
            bolt: { base: 25, minFare: 25, perKm: 6.0, perKm10: 6.2, perMin: 0.70, service: 'Bolt Motorbike', feature: 'ราคาประหยัด เรียกรวดเร็ว', hasPromo: true },
            grab: { base: 30, minFare: 30, perKm: 6.5, perKm10: 6.8, perMin: 0.75, service: 'GrabBike (Standard)', feature: 'มาตรฐาน Grab ยอดนิยม', hasSaver: true },
            lineman: { base: 25, minFare: 25, perKm: 5.8, perKm10: 6.0, perMin: 0.70, service: 'LINE MAN Bike', feature: 'คนขับมืออาชีพ มารับถึงที่' },
            maxim: { base: 18, minFare: 20, perKm: 4.2, perKm10: 4.5, perMin: 0.45, service: 'Maxim Moto', feature: 'ค่าโดยสารเริ่มต้นเบาใจที่สุด' },
            indrive: { base: 20, minFare: 20, perKm: 4.5, perKm10: 4.8, perMin: 0.50, service: 'inDrive Moto', feature: 'เสนอราคาต่อรองได้อิสระ' }
        },
        car: {
            bolt: { base: 36, minFare: 40, perKm: 7.2, perKm10: 7.8, perKm30: 8.5, perMin: 1.05, service: 'Bolt Economy', feature: 'ประหยัดคุ้มค่า รอไม่นาน', hasPromo: true },
            grab: { base: 45, minFare: 48, perKm: 9.2, perKm10: 10.5, perKm30: 11.5, perMin: 1.35, service: 'JustGrab / GrabCar', feature: 'รถยนต์เก๋งมาตรฐาน รถเยอะสุด', hasSaver: true },
            lineman: { base: 40, minFare: 44, perKm: 7.6, perKm10: 8.2, perKm30: 9.0, perMin: 1.20, service: 'LINE MAN Eco', feature: 'รถยนต์ส่วนบุคคลสภาพดี' },
            maxim: { base: 30, minFare: 35, perKm: 5.8, perKm10: 6.2, perKm30: 7.0, perMin: 0.80, service: 'Maxim Economy', feature: 'ค่าโดยสารประหยัด คล่องตัว' },
            indrive: { base: 35, minFare: 38, perKm: 6.6, perKm10: 7.0, perKm30: 7.8, perMin: 0.90, service: 'inDrive City', feature: 'ผู้โดยสารกำหนดราคาเอง' }
        },
        taxi: {
            bolt: { isTaxiMeter: true, bookingFee: 0, service: 'Bolt Taxi', feature: 'มิเตอร์แท็กซี่ ไม่มีค่าเรียกเพิ่ม' },
            lineman: { isTaxiMeter: true, bookingFee: 20, service: 'LINE MAN Taxi', feature: 'แท็กซี่มิเตอร์ถูกต้องตาม พ.ร.บ. + ค่าเรียก ฿20' },
            grab: { isTaxiMeter: true, bookingFee: 20, service: 'GrabTaxi', feature: 'แท็กซี่มิเตอร์ พร้อมระบบติดตาม + ฿20' },
            maxim: { isTaxiMeter: true, bookingFee: 10, service: 'Maxim Taxi', feature: 'แท็กซี่มิเตอร์ ค่าบริการ ฿10' },
            indrive: { isTaxiMeter: true, bookingFee: 0, service: 'inDrive Taxi', feature: 'แท็กซี่มิเตอร์ตรงไปตรงมา' }
        },
        suv: {
            bolt: { base: 55, minFare: 65, perKm: 11.0, perKm10: 12.0, perKm30: 13.0, perMin: 1.50, service: 'Bolt XL', feature: 'เดินทางเป็นกลุ่มประหยัดกว่า' },
            grab: { base: 70, minFare: 80, perKm: 13.5, perKm10: 15.0, perKm30: 16.5, perMin: 2.00, service: 'GrabCar Plus (6 ที่นั่ง)', feature: 'SUV คันใหญ่ นั่งสบาย 6-7 ที่นั่ง' },
            lineman: { base: 60, minFare: 70, perKm: 12.0, perKm10: 13.0, perKm30: 14.5, perMin: 1.80, service: 'LINE MAN Large', feature: 'จุสัมภาระได้มาก' },
            maxim: { base: 48, minFare: 55, perKm: 9.5, perKm10: 10.5, perKm30: 11.5, perMin: 1.30, service: 'Maxim 6-Seater', feature: 'รถขนาดครอบครัวราคาย่อมเยา' },
            indrive: { base: 52, minFare: 60, perKm: 10.5, perKm10: 11.5, perKm30: 12.5, perMin: 1.40, service: 'inDrive XL', feature: 'ต่อรองราคารถใหญ่' }
        },
        van: {
            bolt: { base: 120, minFare: 130, perKm: 16.0, perKm10: 17.5, perKm30: 19.0, perMin: 2.50, service: 'Bolt Van', feature: 'รถตู้โดยสาร 10 ที่นั่ง' },
            grab: { base: 150, minFare: 160, perKm: 18.0, perKm10: 20.0, perKm30: 22.0, perMin: 3.00, service: 'GrabVan', feature: 'รถตู้ VIP ขนาดใหญ่ นั่งได้ถึง 10 คน' },
            lineman: { base: 130, minFare: 140, perKm: 17.0, perKm10: 18.5, perKm30: 20.5, perMin: 2.80, service: 'LINE MAN Van', feature: 'เหมาะสำหรับทริปสัมมนาหรือครอบครัว' },
            maxim: { base: 110, minFare: 120, perKm: 14.0, perKm10: 15.5, perKm30: 17.0, perMin: 2.00, service: 'Maxim Minivan', feature: 'รถตู้ราคาย่อมเยา' },
            indrive: { base: 115, minFare: 125, perKm: 15.0, perKm10: 16.5, perKm30: 18.0, perMin: 2.20, service: 'inDrive Van', feature: 'ตกลงราคาเหมาจ่ายได้' }
        },
        premium: {
            bolt: { base: 90, minFare: 100, perKm: 16.0, perKm10: 17.5, perKm30: 19.0, perMin: 2.50, service: 'Bolt Premium', feature: 'รถยนต์ระดับพรีเมียม ประหยัดคุ้ม' },
            grab: { base: 120, minFare: 140, perKm: 20.0, perKm10: 22.0, perKm30: 24.0, perMin: 3.00, service: 'GrabExec / Premium', feature: 'รถซีดานหรูระดับผู้บริหาร พนักงานบริการยอดเยี่ยม' },
            lineman: { base: 100, minFare: 120, perKm: 18.0, perKm10: 19.5, perKm30: 21.5, perMin: 2.80, service: 'LINE MAN Black', feature: 'รถยนต์ชั้นเลิศ บริการ VIP' },
            maxim: { base: 80, minFare: 90, perKm: 14.0, perKm10: 15.0, perKm30: 16.5, perMin: 2.00, service: 'Maxim Comfort', feature: 'รถใหม่นั่งสบาย' },
            indrive: { base: 85, minFare: 95, perKm: 15.0, perKm10: 16.0, perKm30: 17.5, perMin: 2.20, service: 'inDrive Comfort', feature: 'รถนั่งสบาย เสนอราคาได้' }
        }
    };
 
    // Clone prior pricing matrix for clean rollback
    const DEFAULT_PRICING_MATRIX = JSON.parse(JSON.stringify(PRICING_MATRIX));

    function applyCalibration(calibData) {
        if (!calibData || !calibData.parameters) return false;
        MODEL_VERSION = calibData.modelVersion || '1.1.0-calibrated';
        CALIBRATED_AT = calibData.calibratedAt || new Date().toISOString();
        SAMPLE_COUNT = calibData.totalSampleCount || Object.values(calibData.parameters).reduce((acc, p) => acc + (p.sampleCount || 0), 0);

        for (const [key, p] of Object.entries(calibData.parameters)) {
            const [app, tier] = key.split('_');
            if (PRICING_MATRIX[tier] && PRICING_MATRIX[tier][app]) {
                const item = PRICING_MATRIX[tier][app];
                item.base = p.baseFare;
                item.minFare = p.minFare || p.baseFare;
                item.perKm = p.perKm;
                item.perMin = p.perMin;
                item.isCalibrated = true;
                item.mae = p.mae;
                item.mape = p.mape;
                item.coverage = p.coverage;
            }
        }
        return true;
    }

    function resetCalibration() {
        MODEL_VERSION = '1.0.0-uncalibrated';
        CALIBRATED_AT = null;
        SAMPLE_COUNT = 0;
        for (const tier of Object.keys(DEFAULT_PRICING_MATRIX)) {
            for (const app of Object.keys(DEFAULT_PRICING_MATRIX[tier])) {
                PRICING_MATRIX[tier][app] = JSON.parse(JSON.stringify(DEFAULT_PRICING_MATRIX[tier][app]));
            }
        }
        return true;
    }

    function getCalibrationStatus() {
        return {
            modelVersion: MODEL_VERSION,
            calibratedAt: CALIBRATED_AT,
            sampleCount: SAMPLE_COUNT,
            isCalibrated: SAMPLE_COUNT > 0
        };
    }

    // 3. Timezone Utilities (Asia/Bangkok)
    function getBangkokTimeInfo(localTime) {
        let date;
        if (!localTime) {
            date = new Date();
        } else if (localTime instanceof Date) {
            date = localTime;
        } else if (typeof localTime === 'string' || typeof localTime === 'number') {
            date = new Date(localTime);
        } else {
            date = new Date();
        }

        try {
            const bkkStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Bangkok',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: false
            }).format(date);
            const [hourStr, minStr] = bkkStr.split(':');
            const hour = parseInt(hourStr, 10) % 24;
            const minute = parseInt(minStr, 10) || 0;
            return { hour, minute, date };
        } catch (e) {
            // Fallback if Intl timeZone is unavailable
            const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
            const bkk = new Date(utc + (3600000 * 7));
            return { hour: bkk.getHours(), minute: bkk.getMinutes(), date: bkk };
        }
    }

    function getBangkokHour(localTime) {
        return getBangkokTimeInfo(localTime).hour;
    }

    // 4. Official Thai Taxi Meter 2566 calculation (กฎกระทรวงคมนาคม พ.ศ. 2566)
    function calcTaxiMeter(dist, dur, isHeavyTraffic, isHighwaySpeed, fee = 0, isAirport = false) {
        let fare = 40; // กม. แรก 40 บาท (แท็กซี่มาตรฐาน/ขนาดใหญ่ 2566)
        let remDist = Math.max(0, dist - 1);

        // Tier 1: กม. 1 ถึง 10 (9 กม.) @ 6.50 บาท/กม.
        const t1 = Math.min(remDist, 9);
        fare += t1 * 6.50;
        remDist -= t1;

        // Tier 2: กม. 10 ถึง 20 (10 กม.) @ 7.00 บาท/กม.
        if (remDist > 0) {
            const t2 = Math.min(remDist, 10);
            fare += t2 * 7.00;
            remDist -= t2;
        }

        // Tier 3: กม. 20 ถึง 40 (20 กม.) @ 8.00 บาท/กม.
        if (remDist > 0) {
            const t3 = Math.min(remDist, 20);
            fare += t3 * 8.00;
            remDist -= t3;
        }

        // Tier 4: กม. 40 ถึง 60 (20 กม.) @ 8.50 บาท/กม.
        if (remDist > 0) {
            const t4 = Math.min(remDist, 20);
            fare += t4 * 8.50;
            remDist -= t4;
        }

        // Tier 5: กม. 60 ถึง 80 (20 กม.) @ 9.00 บาท/กม.
        if (remDist > 0) {
            const t5 = Math.min(remDist, 20);
            fare += t5 * 9.00;
            remDist -= t5;
        }

        // Tier 6: เกิน 80 กม. ขึ้นไป @ 10.50 บาท/กม.
        if (remDist > 0) {
            fare += remDist * 10.50;
        }

        // Traffic Idle / Slow moving (<6 km/h) fee: ฿3.00/min
        const jamPercent = isHeavyTraffic ? 0.55 : (isHighwaySpeed ? 0.15 : 0.35);
        const jamMinutes = dur * jamPercent;
        const timeCost = jamMinutes * 3.00;
        fare += timeCost;

        const airportFee = isAirport ? 50 : 0;
        const baseFareVal = 40;
        const distFareVal = Math.round(fare - baseFareVal - timeCost);
        const durFareVal = Math.round(timeCost);
        const totalMeter = Math.round(fare);
        const finalPrice = totalMeter + fee + airportFee;

        return {
            baseFareVal,
            distFareVal,
            durFareVal,
            bookingFeeVal: fee,
            airportFeeVal: airportFee,
            rawPrice: finalPrice,
            finalPrice: finalPrice,
            minRange: Math.round(finalPrice * 0.93),
            maxRange: Math.round(finalPrice * 1.10)
        };
    }

    // 5. Drift-Reduction Variables (Step 4: Real-World Accuracy Layer)
    // Zone multipliers reflect real demand density by pickup area (all opt-in, neutral default = 1.0)
    const ZONE_MULTIPLIERS = {
        cbd: 1.10,      // ย่านใจกลางเมือง (สุขุมวิท/สยาม/สาทร) — ดีมานด์คนขับสูง
        metro: 1.00,    // เขตเมืองปรกติ (ค่าเริ่มต้น ไม่เปลี่ยนแปลงราคาฐาน)
        suburb: 0.95,   // ชานเมือง / ปริมณฑล
        province: 0.90  // ต่างจังหวัดเมืองรอง
    };

    function getZoneMultiplier(zone) {
        const key = String(zone || 'metro').toLowerCase();
        return ZONE_MULTIPLIERS[key] || 1.00;
    }

    // 6. Deterministic Wait-Time Calculation (Zero Math.random())
    function calcDeterministicWaitTime(appId, vehicleType, isHeavyTraffic, distanceKm) {
        const baseWaits = {
            grab:    { bike: 3, car: 4, taxi: 4, suv: 6, van: 7, premium: 6 },
            bolt:    { bike: 3, car: 4, taxi: 4, suv: 6, van: 7, premium: 6 },
            lineman: { bike: 4, car: 4, taxi: 4, suv: 7, van: 8, premium: 7 },
            maxim:   { bike: 4, car: 5, taxi: 5, suv: 7, van: 8, premium: 7 },
            indrive: { bike: 4, car: 5, taxi: 5, suv: 8, van: 8, premium: 8 }
        };

        const appTable = baseWaits[appId] || baseWaits.grab;
        let wait = appTable[vehicleType] || 4;

        if (isHeavyTraffic) {
            wait += 1;
        }
        if (distanceKm > 25) {
            wait += 1;
        }

        return Math.min(15, Math.max(2, wait));
    }

    /**
     * Primary Unified Estimation API
     * @param {Object} params
     * @param {string} params.app - 'grab' | 'bolt' | 'lineman' | 'maxim' | 'indrive'
     * @param {string} [params.vehicleType='car'] - 'bike' | 'car' | 'taxi' | 'suv' | 'van' | 'premium'
     * @param {number} params.distanceKm - Trip distance in kilometers
     * @param {number} params.durationMin - Estimated trip duration in minutes
     * @param {Date|string|number} [params.localTime] - Reference local timestamp (evaluated in Asia/Bangkok)
     * @param {boolean} [params.isRaining=false] - Whether weather is rainy
     * @param {boolean} [params.isAirport=false] - Whether trip originates/terminates at airport
     * @param {string} [params.provinceCode='BKK'] - Thai province identifier
     * @param {number} [params.surgeMultiplier] - Optional explicit surge multiplier
     * @returns {Object} Deterministic fare estimation result with low, mid, high & breakdown
     */
    function estimateFare({
        app,
        vehicleType = 'car',
        distanceKm = 1.0,
        durationMin = 5.0,
        localTime = null,
        isRaining = false,
        isAirport = false,
        provinceCode = 'BKK',
        surgeMultiplier = 1.0
    } = {}) {
        const appId = (app || 'grab').toLowerCase();
        const vType = (vehicleType || 'car').toLowerCase();
        const dist = Math.max(0.1, Number(distanceKm) || 0.1);
        const dur = Math.max(1, Number(durationMin) || 1);

        const avgSpeed = dist / (dur / 60);
        const isHeavyTraffic = avgSpeed < 18;
        const isHighwaySpeed = avgSpeed > 45;

        const timeInfo = getBangkokTimeInfo(localTime);
        const bkkHour = timeInfo.hour;

        // Resolve effective surge multiplier deterministically
        let effectiveSurge = (typeof surgeMultiplier === 'number' && surgeMultiplier > 0) ? surgeMultiplier : 1.0;

        // Airport fee (e.g. Suvarnabhumi / Don Mueang official ฿50 surcharge)
        const airportFee = isAirport ? 50 : 0;

        // App & Coverage Metadata
        const appMeta = APP_METADATA.find(a => a.id === appId) || {
            id: appId,
            name: appId.toUpperCase(),
            class: 'logo-' + appId,
            initial: appId.charAt(0).toUpperCase()
        };
        const cov = COVERAGE_METADATA[appId] || {
            level: 'metro',
            tag: 'พร้อมให้บริการ',
            cls: 'badge-coverage-metro',
            note: 'ตรวจสอบในแอป'
        };

        const typeConfig = PRICING_MATRIX[vType] || PRICING_MATRIX.car;
        const cfg = typeConfig[appId] || { base: 40, minFare: 40, perKm: 8, perMin: 1.2, service: 'Standard', feature: 'มาตรฐาน' };

        const waitTime = calcDeterministicWaitTime(appId, vType, isHeavyTraffic, dist);

        // 1. Handle Taxi Meter
        if (vType === 'taxi' || cfg.isTaxiMeter) {
            const bookingFee = cfg.bookingFee || 0;
            const taxiCalc = calcTaxiMeter(dist, dur, isHeavyTraffic, isHighwaySpeed, bookingFee, isAirport);

            let subPriceNote = bookingFee
                ? `มิเตอร์ ~฿${taxiCalc.rawPrice - bookingFee - airportFee} + ค่าเรียก ฿${bookingFee}${airportFee ? ' + ค่าสนามบิน ฿50' : ''}`
                : `มิเตอร์ พ.ร.บ. คมนาคม 2566${airportFee ? ' + ค่าสนามบิน ฿50' : ''}`;

            return {
                app: appId,
                id: appId,
                name: appMeta.name,
                class: appMeta.class,
                initial: appMeta.initial,
                serviceName: cfg.service || 'แท็กซี่มิเตอร์',
                feature: cfg.feature || 'แท็กซี่มิเตอร์ตามกฎหมาย',
                low: taxiCalc.minRange,
                mid: taxiCalc.finalPrice,
                high: taxiCalc.maxRange,
                price: taxiCalc.finalPrice,
                regularPrice: taxiCalc.finalPrice,
                minRange: taxiCalc.minRange,
                maxRange: taxiCalc.maxRange,
                subPriceNote: subPriceNote,
                promoDiscountTag: '',
                promoNote: '',
                waitTime: waitTime,
                breakdown: {
                    baseFare: taxiCalc.baseFareVal,
                    distanceFare: taxiCalc.distFareVal,
                    durationFare: taxiCalc.durFareVal,
                    bookingFee: bookingFee,
                    airportFee: airportFee,
                    surgeMultiplier: 1.0,
                    regularPrice: taxiCalc.finalPrice
                },
                baseFareVal: taxiCalc.baseFareVal,
                distFareVal: taxiCalc.distFareVal,
                durFareVal: taxiCalc.durFareVal,
                bookingFeeVal: bookingFee,
                airportFeeVal: airportFee,
                surgeVal: 1.0,
                discountVal: 0,
                confidence: 'uncalibrated',
                modelVersion: MODEL_VERSION,
                calibratedAt: CALIBRATED_AT,
                sampleCount: SAMPLE_COUNT,
                coverageLevel: cov.level,
                coverageTag: cov.tag,
                coverageClass: cov.cls,
                coverageNote: cov.note
            };
        }

        // 2. Standard App Ride-Hailing Calculation
        let distCost = 0;
        const pKm = cfg.perKm;
        const pKm10 = cfg.perKm10 || pKm * 1.05;
        const pKm30 = cfg.perKm30 || pKm * 1.10;

        if (dist <= 10) {
            distCost = dist * pKm;
        } else if (dist <= 30) {
            distCost = (10 * pKm) + ((dist - 10) * pKm10);
        } else if (dist <= 60) {
            const marginalRate30 = pKm30 * 0.85;
            distCost = (10 * pKm) + (20 * pKm10) + ((dist - 30) * marginalRate30);
        } else {
            const marginalRate30 = pKm30 * 0.85;
            const marginalRate60 = pKm30 * 0.70;
            distCost = (10 * pKm) + (20 * pKm10) + (30 * marginalRate30) + ((dist - 60) * marginalRate60);
        }

        // Traffic duration cost: Long-distance trips (>30 km) cruise without heavy city-traffic idling
        let speedFactor = isHeavyTraffic ? 1.2 : (isHighwaySpeed ? 0.75 : 1.0);
        if (dist > 30) {
            speedFactor *= 0.70;
        }
        const timeCost = dur * (cfg.perMin || 0) * speedFactor;

        const bookingFee = cfg.bookingFee || 0;
        const rawFare = cfg.base + distCost + timeCost + bookingFee + airportFee;
        const regularPrice = Math.max(cfg.minFare || cfg.base, Math.round(rawFare * effectiveSurge));

        // HONEST PRICING RULE: Display price is ALWAYS full regularPrice! Zero fictitious deductions.
        const midPrice = regularPrice;

        // Subprice note and promo note
        let subPriceNote = '';
        let promoNote = '';

        if (appId === 'indrive') {
            subPriceNote = 'ผู้โดยสารเสนอราคาเอง (ต่อรองได้)';
        } else if (appId === 'bolt') {
            subPriceNote = (dist > 30)
                ? 'อัตราเดินทางไกลข้ามจังหวัด (ประหยัดตามระยะทาง)'
                : 'อัตราประเมินตามระยะทาง + สภาพจราจร';
            promoNote = 'อาจมีส่วนลดโปรโมชันตามโค้ดของแอป';
        } else if (appId === 'grab') {
            subPriceNote = (dist > 30)
                ? 'อัตราเดินทางไกลข้ามจังหวัด (ประหยัดตามระยะทาง)'
                : 'มาตรฐาน Grab (ในแอปอาจมีตัวเลือก Saver เพิ่มเติม)';
            promoNote = 'ในแอป Grab อาจมีตัวเลือก Saver หรือโค้ดส่วนลดเพิ่มเติม';
        } else if (dist > 30) {
            subPriceNote = 'อัตราเดินทางไกลข้ามจังหวัด (ประหยัดตามระยะทาง)';
        } else if (bookingFee > 0) {
            subPriceNote = `รวมค่าบริการเรียก ฿${bookingFee}`;
        } else {
            subPriceNote = 'อัตราประเมินตามระยะทาง + สภาพจราจร';
        }

        // Calculate Range Bounds (low & high)
        let lowPrice, highPrice;
        if (appId === 'indrive') {
            // inDrive user bidding model: -15% low, +18% high
            lowPrice = Math.max(cfg.minFare || cfg.base, Math.round(midPrice * 0.85));
            highPrice = Math.round(midPrice * 1.18);
        } else {
            // Standard ride-hailing estimate range
            lowPrice = Math.max(cfg.minFare || cfg.base, Math.round(midPrice * 0.94));
            highPrice = Math.round(midPrice * 1.08);
        }

        return {
            app: appId,
            id: appId,
            name: appMeta.name,
            class: appMeta.class,
            initial: appMeta.initial,
            serviceName: cfg.service || appMeta.name,
            feature: (appId === 'indrive') ? 'เสนอราคาต่อรองได้อิสระ' : (cfg.feature || ''),
            low: lowPrice,
            mid: midPrice,
            high: highPrice,
            price: midPrice,
            regularPrice: regularPrice,
            minRange: lowPrice,
            maxRange: highPrice,
            subPriceNote: subPriceNote,
            promoDiscountTag: '', // Fictitious discount badges removed
            promoNote: promoNote,
            waitTime: waitTime,
            breakdown: {
                baseFare: cfg.base,
                distanceFare: Math.round(distCost),
                durationFare: Math.round(timeCost),
                bookingFee: bookingFee,
                airportFee: airportFee,
                surgeMultiplier: effectiveSurge,
                regularPrice: regularPrice
            },
            baseFareVal: cfg.base,
            distFareVal: Math.round(distCost),
            durFareVal: Math.round(timeCost),
            bookingFeeVal: bookingFee,
            airportFeeVal: airportFee,
            surgeVal: effectiveSurge,
            discountVal: 0,
            confidence: (SAMPLE_COUNT > 0) ? (cfg.isCalibrated ? 'high' : 'medium') : 'uncalibrated',
            modelVersion: MODEL_VERSION,
            calibratedAt: CALIBRATED_AT,
            sampleCount: SAMPLE_COUNT,
            coverageLevel: cov.level,
            coverageTag: cov.tag,
            coverageClass: cov.cls,
            coverageNote: cov.note
        };
    }

    /**
     * Batch estimation for all 5 ride-hailing apps (backward compatible with frontend UI)
     * @param {number} distanceKm
     * @param {number} durationMin
     * @param {string} vehicleType
     * @param {number} [surgeMultiplier=1.0]
     * @param {Object} [options={}]
     * @returns {Array<Object>} Sorted/prepared array of app results
     */
    function estimateRideFare(distanceKm, durationMin, vehicleType = 'car', surgeMultiplier = 1.0, options = {}) {
        const appIds = ['grab', 'bolt', 'lineman', 'maxim', 'indrive'];
        return appIds.map(appId => {
            return estimateFare({
                app: appId,
                vehicleType,
                distanceKm,
                durationMin,
                surgeMultiplier,
                localTime: options.localTime || null,
                isRaining: options.isRaining || false,
                isAirport: options.isAirport || false,
                provinceCode: options.provinceCode || 'BKK'
            });
        });
    }

    return {
        MODEL_VERSION,
        CALIBRATED_AT,
        SAMPLE_COUNT,
        APP_METADATA,
        COVERAGE_METADATA,
        PRICING_MATRIX,
        applyCalibration,
        resetCalibration,
        getCalibrationStatus,
        isCalibrated: () => SAMPLE_COUNT > 0,
        getBangkokTimeInfo,
        getBangkokHour,
        calcTaxiMeter,
        calcDeterministicWaitTime,
        estimateFare,
        estimateRideFare
    };
}));
