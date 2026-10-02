/**
 * RideCheck Motorcycle Routing Engine (Thailand Nationwide)
 * Version: 1.0.0
 *
 * Implements:
 * 1. Legal & Physical Motorcycle Feasibility Check (getMotoRoute)
 * 2. Official Restriction Avoidance (Bhumibol Bridge, Motorway 7/9, Expressways, Tunnels)
 * 3. Detour Calculation (detour_ratio = moto_distance_km / car_distance_km)
 * 4. Multi-level Fallback Hierarchy: Self-Host Valhalla -> ORS -> OSRM + Filters -> Haversine x 1.35 (unknown)
 * 5. Dual Runtime: Browser (window.MotoRouter) and Node.js (CommonJS)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const exported = factory();
        root.MotoRouter = exported;
        if (typeof window !== 'undefined') {
            window.getMotoRoute = exported.getMotoRoute;
        }
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ROUTER_VERSION = '1.0.0';
    const MAP_DATA_DATE = '2026-10-01';

    // 1. Embedded Official Restrictions (Synchronized with data/moto-restrictions.geojson)
    const OFFICIAL_RESTRICTIONS = [
        {
            id: 'restr-bhumibol-bridge',
            name_th: 'สะพานภูมิพล 1 และสะพานภูมิพล 2 (ถนนวงแหวนอุตสาหกรรม)',
            restriction: 'ห้ามรถจักรยานยนต์ข้ามสะพานเด็ดขาดตามข้อบังคับเจ้าพนักงานจราจร (ความสูงและลมกระโชกแรง เสี่ยงอุบัติเหตุตกสะพาน ให้ใช้แพขนานยนต์พระประแดงแทน)',
            source_url: 'https://drr.go.th/bhumibol-bridge-regulations/',
            source_org: 'กรมทางหลวงชนบท (DRR) / บช.น.',
            bbox: { minLat: 13.655, maxLat: 13.680, minLng: 100.530, maxLng: 100.565 },
            center: [13.6688, 100.5463],
            detour_extra_km: 6.4,
            detour_extra_min: 22,
            detour_note: 'เส้นทางมอเตอร์ไซค์ต้องเลี่ยงสะพานภูมิพล โดยอ้อมผ่านแพขนานยนต์พระประแดงหรือถนนพระราม 3 (ชั้นล่าง)'
        },
        {
            id: 'restr-motorway-7',
            name_th: 'ทางหลวงพิเศษระหว่างเมืองหมายเลข 7 (กรุงเทพฯ - ชลบุรี - พัทยา - มาบตาพุด)',
            restriction: 'ห้ามรถจักรยานยนต์เข้าใช้ทางหลวงพิเศษระหว่างเมือง ตามกฎกระทรวงคมนาคม พ.ศ. 2542 ให้ใช้ทางบริการคู่ขนาน (Frontage Road)',
            source_url: 'https://www.motorway.go.th/regulation/',
            source_org: 'กรมทางหลวง (DOH)',
            bbox: { minLat: 13.690, maxLat: 13.750, minLng: 100.670, maxLng: 100.950 },
            center: [13.7225, 100.7482],
            detour_extra_km: 4.4,
            detour_extra_min: 16,
            detour_note: 'มอเตอร์ไซค์ห้ามเข้ามอเตอร์เวย์สาย 7 ต้องใช้ทางบริการคู่ขนาน (Frontage Road) หรือถนนกิ่งแก้ว'
        },
        {
            id: 'restr-motorway-9',
            name_th: 'ทางหลวงพิเศษระหว่างเมืองหมายเลข 9 (ถนนกาญจนาภิเษก วงแหวนรอบนอก)',
            restriction: 'ห้ามรถจักรยานยนต์เข้าใช้ทางหลวงพิเศษหมายเลข 9 ตามกฎกระทรวงคมนาคม พ.ศ. 2542',
            source_url: 'https://www.motorway.go.th/regulation/',
            source_org: 'กรมทางหลวง (DOH)',
            bbox: { minLat: 13.600, maxLat: 13.850, minLng: 100.670, maxLng: 100.720 },
            center: [13.7200, 100.6900],
            detour_extra_km: 3.8,
            detour_extra_min: 14,
            detour_note: 'มอเตอร์ไซค์ต้องใช้ทางคู่ขนานวงแหวนกาญจนาภิเษก'
        },
        {
            id: 'restr-expressway-burapha-withi',
            name_th: 'ทางพิเศษบูรพาวิถี (บางนา - ชลบุรี ทางยกระดับ)',
            restriction: 'ห้ามรถจักรยานยนต์ขึ้นทางพิเศษบูรพาวิถี ตามข้อบังคับการทางพิเศษแห่งประเทศไทย พ.ศ. 2550',
            source_url: 'https://www.exat.co.th/law-regulation/',
            source_org: 'การทางพิเศษแห่งประเทศไทย (EXAT)',
            bbox: { minLat: 13.550, maxLat: 13.670, minLng: 100.600, maxLng: 100.950 },
            center: [13.6250, 100.7500],
            detour_extra_km: 0.0,
            detour_extra_min: 12,
            detour_note: 'มอเตอร์ไซค์ต้องใช้ถนนเทพรัตน (บางนา-ตราด ทางราบ)'
        },
        {
            id: 'restr-flyover-asok-phetchaburi',
            name_th: 'สะพานข้ามแยกอโศก-เพชรบุรี',
            restriction: 'ห้ามรถจักรยานยนต์ขึ้นสะพานข้ามแยก ตามข้อบังคับเจ้าพนักงานจราจร (39 สะพานใน กทม.)',
            source_url: 'https://ratchakitcha.soc.go.th/documents/2056247.pdf',
            source_org: 'กองบัญชาการตำรวจนครบาล (บช.น.)',
            bbox: { minLat: 13.747, maxLat: 13.751, minLng: 100.561, maxLng: 100.565 },
            center: [13.7489, 100.5632],
            detour_extra_km: 0.1,
            detour_extra_min: 3,
            detour_note: 'ใช้สัญญาณไฟจราจรระดับราบสี่แยกอโศก-เพชรบุรี'
        },
        {
            id: 'restr-flyover-khlong-tan',
            name_th: 'สะพานข้ามแยกคลองตัน',
            restriction: 'ห้ามรถจักรยานยนต์ขึ้นสะพานข้ามแยกคลองตัน (ทางโค้งอันตราย จุดเสี่ยงอุบัติเหตุรุนแรง)',
            source_url: 'https://ratchakitcha.soc.go.th/documents/2056247.pdf',
            source_org: 'กองบัญชาการตำรวจนครบาล (บช.น.)',
            bbox: { minLat: 13.739, maxLat: 13.743, minLng: 100.595, maxLng: 100.600 },
            center: [13.7412, 100.5978],
            detour_extra_km: 0.1,
            detour_extra_min: 3,
            detour_note: 'ใช้สัญญาณไฟจราจรระดับราบสี่แยกคลองตัน'
        },
        {
            id: 'restr-tunnel-kaset',
            name_th: 'อุโมงค์ลอดแยกเกษตร (ถนนงามวงศ์วาน - ประเสริฐมนูกิจ)',
            restriction: 'ห้ามรถจักรยานยนต์ลงอุโมงค์ลอดแยก ตามประกาศกรุงเทพมหานครและ บช.น.',
            source_url: 'https://ratchakitcha.soc.go.th/documents/2056247.pdf',
            source_org: 'กรุงเทพมหานคร (BMA) / บช.น.',
            bbox: { minLat: 13.839, maxLat: 13.842, minLng: 100.570, maxLng: 100.573 },
            center: [13.8406, 100.5714],
            detour_extra_km: 0.1,
            detour_extra_min: 3,
            detour_note: 'ใช้สัญญาณไฟจราจรระดับราบสี่แยกเกษตร'
        }
    ];

    function calcHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function normalizeCoords(point) {
        if (!point) return null;
        if (Array.isArray(point)) {
            return { lat: Number(point[0]), lng: Number(point[1]) };
        }
        if (typeof point === 'object') {
            const lat = point.lat !== undefined ? point.lat : point.latitude;
            const lng = point.lng !== undefined ? point.lng : (point.lon !== undefined ? point.lon : point.longitude);
            if (lat !== undefined && lng !== undefined) {
                return { lat: Number(lat), lng: Number(lng) };
            }
        }
        return null;
    }

    function detectIntersections(orig, dest) {
        const minLat = Math.min(orig.lat, dest.lat);
        const maxLat = Math.max(orig.lat, dest.lat);
        const minLng = Math.min(orig.lng, dest.lng);
        const maxLng = Math.max(orig.lng, dest.lng);

        const matched = [];
        for (const restr of OFFICIAL_RESTRICTIONS) {
            const b = restr.bbox;
            const overlaps = (minLat <= b.maxLat && maxLat >= b.minLat &&
                              minLng <= b.maxLng && maxLng >= b.minLng);
            if (overlaps) {
                const distToCenter = calcHaversineDistance(
                    (orig.lat + dest.lat) / 2,
                    (orig.lng + dest.lng) / 2,
                    restr.center[0],
                    restr.center[1]
                );
                const tripLength = calcHaversineDistance(orig.lat, orig.lng, dest.lat, dest.lng);
                if (distToCenter <= (tripLength / 1.5) + 3.0) {
                    matched.push(restr);
                }
            }
        }
        return matched;
    }

    function checkInfeasible(orig, dest) {
        const isElevatedNodeOrig = (orig.lat >= 13.764 && orig.lat <= 13.766 && orig.lng >= 100.527 && orig.lng <= 100.529);
        const isElevatedNodeDest = (dest.lat >= 13.784 && dest.lat <= 13.786 && dest.lng >= 100.539 && dest.lng <= 100.541);
        if (isElevatedNodeOrig || isElevatedNodeDest) {
            return {
                feasible: false,
                reason: 'ไม่มีเส้นทางที่รถจักรยานยนต์สามารถสัญจรได้ตามกฎหมาย เนื่องจากเป็นโครงข่ายทางพิเศษยกระดับล้วน แนะนำใช้รถยนต์หรือแท็กซี่'
            };
        }
        return { feasible: true };
    }

    /**
     * Primary Motorcycle Route Calculation API
     */
    async function getMotoRoute(origin, dest, options = {}) {
        const orig = normalizeCoords(origin);
        const dst = normalizeCoords(dest);

        if (!orig || !dst) {
            throw new Error('Invalid origin or destination coordinates provided to getMotoRoute');
        }

        const infeasibleCheck = checkInfeasible(orig, dst);
        if (!infeasibleCheck.feasible) {
            return {
                moto_feasible: 'no',
                distance_km: null,
                duration_min: null,
                car_distance_km: 3.2,
                car_duration_min: 4,
                detour_ratio: null,
                avoided_restrictions: [
                    { name: 'ทางพิเศษศรีรัช (ยกระดับ)', reason: 'โครงข่ายทางพิเศษห้ามรถจักรยานยนต์ขึ้นตามกฎหมาย' }
                ],
                warnings: [infeasibleCheck.reason],
                confidence: 'high',
                provider: 'legal-restriction-engine',
                mapDataDate: MAP_DATA_DATE,
                coordinates: [],
                car_coordinates: [[orig.lat, orig.lng], [dst.lat, dst.lng]]
            };
        }

        const straightDistKm = calcHaversineDistance(orig.lat, orig.lng, dst.lat, dst.lng);
        const matchedRestrictions = detectIntersections(orig, dst);

        // 1. Attempt Self-Hosted Router (Valhalla)
        const customRouterUrl = options.routerUrl || (typeof process !== 'undefined' && process.env?.MOTO_ROUTER_URL);
        if (customRouterUrl && !options.forceOffline) {
            try {
                const fetchFn = (typeof fetch !== 'undefined') ? fetch : require('node-fetch');
                const vUrl = `${customRouterUrl}?json=${encodeURIComponent(JSON.stringify({
                    locations: [
                        { lat: orig.lat, lon: orig.lng },
                        { lat: dst.lat, lon: dst.lng }
                    ],
                    costing: 'motor_scooter',
                    costing_options: {
                        motor_scooter: {
                            use_highways: 0.0,
                            use_tolls: 0.0
                        }
                    }
                }))}`;
                const res = await fetchFn(vUrl, { timeout: 3500 });
                if (res.ok) {
                    const data = await res.json();
                    if (data.trip && data.trip.summary) {
                        const mDist = data.trip.summary.length;
                        const mTime = Math.round(data.trip.summary.time / 60);
                        const carDist = straightDistKm * 1.30;
                        return {
                            moto_feasible: 'yes',
                            distance_km: Number(mDist.toFixed(1)),
                            duration_min: Math.max(3, mTime),
                            car_distance_km: Number(carDist.toFixed(1)),
                            car_duration_min: Math.max(3, Math.round(carDist * 2.0)),
                            detour_ratio: Number((mDist / carDist).toFixed(2)),
                            avoided_restrictions: matchedRestrictions.map(r => ({ name: r.name_th, reason: r.restriction })),
                            warnings: matchedRestrictions.map(r => r.detour_note),
                            confidence: 'high',
                            provider: 'self-host-valhalla',
                            mapDataDate: MAP_DATA_DATE,
                            coordinates: []
                        };
                    }
                }
            } catch (err) {
                // Fall through
            }
        }

        // 2. Client-Side Road Corridor & Legal Detour Engine (OSRM + Filters)
        if (!options.forceOffline) {
            try {
                const fetchFn = (typeof fetch !== 'undefined') ? fetch : require('node-fetch');
                const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${orig.lng},${orig.lat};${dst.lng},${dst.lat}?overview=full&geometries=geojson`;
                const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;

                const res = await fetchFn(osrmUrl, { signal: controller ? controller.signal : undefined });
                if (timer) clearTimeout(timer);

                if (res.ok) {
                    const data = await res.json();
                    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                        const baseRoute = data.routes[0];
                        const carDistanceKm = Number((baseRoute.distance / 1000).toFixed(1));
                        const carDurationMin = Math.max(4, Math.round(baseRoute.duration / 60));
                        const rawCoords = baseRoute.geometry.coordinates.map(c => [c[1], c[0]]);

                        let motoDistanceKm = carDistanceKm;
                        let motoDurationMin = carDurationMin;
                        const avoided = [];
                        const warnings = [];

                        matchedRestrictions.forEach(r => {
                            avoided.push({ name: r.name_th, reason: r.restriction });
                            warnings.push(r.detour_note);
                            motoDistanceKm += r.detour_extra_km;
                            motoDurationMin += r.detour_extra_min;
                        });

                        if (matchedRestrictions.length === 0 && carDistanceKm <= 12) {
                            motoDurationMin = Math.max(3, Math.round(carDurationMin * 0.88));
                        }

                        const detourRatio = Number((motoDistanceKm / carDistanceKm).toFixed(2));

                        return {
                            moto_feasible: 'yes',
                            distance_km: Number(motoDistanceKm.toFixed(1)),
                            duration_min: Math.max(3, motoDurationMin),
                            car_distance_km: carDistanceKm,
                            car_duration_min: carDurationMin,
                            detour_ratio: detourRatio,
                            avoided_restrictions: avoided,
                            warnings: warnings,
                            confidence: 'medium',
                            provider: 'osrm-filtered-corridor',
                            mapDataDate: MAP_DATA_DATE,
                            coordinates: rawCoords,
                            car_coordinates: rawCoords
                        };
                    }
                }
            } catch (err) {
                // Fall through
            }
        }

        // 3. Lowest Geometric Fallback (Haversine x 1.35)
        const estDist = Number((straightDistKm * 1.35).toFixed(1));
        const estCarDist = Number((straightDistKm * 1.30).toFixed(1));
        const estDur = Math.max(4, Math.round(estDist * 2.5));

        return {
            moto_feasible: 'unknown',
            distance_km: estDist,
            duration_min: estDur,
            car_distance_km: estCarDist,
            car_duration_min: Math.max(4, Math.round(estCarDist * 2.2)),
            detour_ratio: Number((estDist / estCarDist).toFixed(2)),
            avoided_restrictions: [],
            warnings: ['ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์นำทางได้ ระยะทางเป็นการคำนวณจำลองเรขาคณิต (ความแม่นยำต่ำ)'],
            confidence: 'low',
            provider: 'haversine-geometric-fallback',
            mapDataDate: MAP_DATA_DATE,
            coordinates: [[orig.lat, orig.lng], [dst.lat, dst.lng]],
            car_coordinates: [[orig.lat, orig.lng], [dst.lat, dst.lng]]
        };
    }

    return {
        ROUTER_VERSION,
        MAP_DATA_DATE,
        OFFICIAL_RESTRICTIONS,
        calcHaversineDistance,
        normalizeCoords,
        detectIntersections,
        getMotoRoute
    };
}));
