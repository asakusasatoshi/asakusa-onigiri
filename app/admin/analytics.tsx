import React, { useState, useMemo } from 'react';

interface SlotConfig {
    time: string;
    limit: number;
    is_active: boolean;
}

interface AnalyticsPageProps {
    activeOrders: any[];
    inventory: {
        target_date: string;
        target_stock: number;
        current_stock: number;
        sold_count: number;
    };
    effectiveTodaySlots: SlotConfig[];
    slotStats: Record<string, { boxes: number; orders: number }>;
    takeoutPrice: number;
    deliveryPrice: number;
    takeoutVat: number;
    deliveryVat: number;
    soldOutLogs?: string[];
    hotels: any[];
    todayCalendar?: any;
}

const MONTHS = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' },
    { value: '03', label: 'March' }, { value: '04', label: 'April' },
    { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

export default function AnalyticsPage({
    activeOrders,
    inventory,
    effectiveTodaySlots,
    slotStats,
    takeoutPrice,
    deliveryPrice,
    takeoutVat,
    deliveryVat,
    soldOutLogs = [],
    hotels = [],
    todayCalendar,
}: AnalyticsPageProps) {
    const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'yearly'>('daily');

    const currentNow = new Date();
    const currentYearStr = String(currentNow.getFullYear());
    const currentMonthStr = String(currentNow.getMonth() + 1).padStart(2, '0');
    const currentDayStr = String(currentNow.getDate()).padStart(2, '0');

    const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
    const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
    const [selectedDay, setSelectedDay] = useState<string>(currentDayStr);

    const startYear = 2026;
    const nowYear = currentNow.getFullYear();
    const YEARS: string[] = [];
    for (let y = startYear; y <= nowYear; y++) {
        YEARS.push(String(y));
    }

    const getDaysInMonth = (year: string, month: string) => {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const lastDay = new Date(y, m, 0).getDate();
        const days = [];
        for (let d = 1; d <= lastDay; d++) {
            days.push(String(d).padStart(2, '0'));
        }
        return days;
    };
    const daysList = getDaysInMonth(selectedYear, selectedMonth);

    // 1. デリバリー売上の合算 (各オーダーのトータル金額を使用)
    const deliveryRevenue = activeOrders.reduce((sum, o) => sum + (o.total_price || o.price || 0), 0);

    // 2. テイクアウト売上の合算 (売上箱数 × 税込テイクアウト単価)
    const takeoutRevenue = inventory.sold_count * (takeoutPrice + takeoutVat);

    // 3. 総売上
    const totalSales = deliveryRevenue + takeoutRevenue;

    // 4. 総販売箱数
    const deliveryBoxes = activeOrders.reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
    const totalOutput = deliveryBoxes + inventory.sold_count;

    // 5. 在庫連動フラグ
    const isSoldOut = inventory.current_stock === 0 && inventory.sold_count > 0;

    // 6. カレンダーコンテキストの取得
    const displayWeather = todayCalendar?.weather || 'Unspecified';
    const displayRadius = todayCalendar?.operating_radius ? `${todayCalendar.operating_radius} km (Override)` : 'Default Settings';
    const displayNote = todayCalendar?.note || 'No special events logged for today.';

    // 7. ホテル別・エリア別の集計（本日のデリバリー分）
    const rankingData = useMemo(() => {
        const areaMap: Record<string, number> = {};
        const hotelMap: Record<string, number> = {};

        activeOrders.forEach(order => {
            const raw = order.hotel_name || order.hotel || order.hotel_id || '';
            const found = hotels.find((h) => String(h.id) === String(raw) || h.name === raw || h.name_ja === raw);

            const hotelName = found ? (found.name_ja || found.name) : (raw || 'Unspecified');
            const areaName = found?.area || 'Unknown Area';
            const qty = order.quantity || order.qty || 1;

            areaMap[areaName] = (areaMap[areaName] || 0) + qty;
            hotelMap[hotelName] = (hotelMap[hotelName] || 0) + qty;
        });

        const topAreas = Object.entries(areaMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const topHotels = Object.entries(hotelMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

        return { topAreas, topHotels };
    }, [activeOrders, hotels]);

    return (
        <div className="space-y-6 max-w-5xl mx-auto py-4 font-sans text-stone-800">

            {/* Header & View Mode Switcher */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-stone-900 tracking-tight">Analytics & Insights</h2>
                    <p className="text-xs text-stone-500 mt-0.5">Live performance, environment, and financial metrics synced with Operations.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200">
                        <button onClick={() => setViewMode('daily')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${viewMode === 'daily' ? 'bg-white text-stone-900 shadow-xs border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}>Daily</button>
                        <button onClick={() => setViewMode('monthly')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${viewMode === 'monthly' ? 'bg-white text-stone-900 shadow-xs border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}>Monthly</button>
                        <button onClick={() => setViewMode('yearly')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${viewMode === 'yearly' ? 'bg-white text-stone-900 shadow-xs border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}>Yearly</button>
                    </div>

                    {viewMode === 'daily' && (
                        <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-300 rounded-xl px-3 py-1.5 shadow-2xs">
                            <span className="text-stone-400 text-xs">📅</span>
                            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer">
                                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <span className="text-stone-300">/</span>
                            <select value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); const newLastDay = new Date(parseInt(selectedYear, 10), parseInt(e.target.value, 10), 0).getDate(); if (parseInt(selectedDay, 10) > newLastDay) setSelectedDay(String(newLastDay).padStart(2, '0')); }} className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer">
                                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <span className="text-stone-300">/</span>
                            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer">
                                {daysList.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    )}
                </div>
            </div>

      {/* Section 1: Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col h-full">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3">Sold Out Times (Today)</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-extrabold ${isSoldOut ? 'text-rose-600' : 'text-emerald-600'}`}>
              {isSoldOut ? 'Sold Out' : 'Active'} <span className="text-sm font-bold text-stone-400">{isSoldOut ? '(0 Stock)' : '(In Stock)'}</span>
            </span>
          </div>
          <div className="mt-auto pt-4">
            {soldOutLogs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {soldOutLogs.map((time, idx) => (
                  <span key={idx} className="bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-bold px-2 py-0.5 rounded-md">
                    {time}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[10px] font-medium text-stone-400 block">No records yet today</span>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col h-full">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3">Total Output</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-stone-900 font-mono">{totalOutput}</span>
            <span className="text-[11px] text-stone-500 font-bold uppercase tracking-wider">Boxes</span>
          </div>
          <div className="mt-auto pt-4 flex gap-2 text-[10px] font-bold">
            <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
              Takeout: {inventory.sold_count}
            </span>
            <span className="text-stone-600 bg-stone-50 px-2.5 py-1 rounded-md border border-stone-200">
              Delivery: {deliveryBoxes}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col h-full">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3">Gross Sales</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-stone-900 font-mono">¥{totalSales.toLocaleString()}</span>
            <span className="text-[11px] text-stone-500 font-bold uppercase tracking-wider">Rev</span>
          </div>
          <div className="mt-auto pt-4">
            <span className="text-[10px] font-medium text-stone-400 block">Combined total revenue</span>
          </div>
        </div>
        
      </div>

            {/* Section 2: Financial & Channel Breakdown */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                    Revenue Breakdown by Channel
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                        <div>
                            <span className="font-bold text-emerald-800 text-[11px] uppercase tracking-wider block">Takeout Sales</span>
                            <span className="text-[10px] text-emerald-600 mt-0.5">{inventory.sold_count} boxes sold today</span>
                        </div>
                        <span className="text-2xl font-black text-emerald-900 font-mono">¥{takeoutRevenue.toLocaleString()}</span>
                    </div>
                    <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between">
                        <div>
                            <span className="font-bold text-stone-700 text-[11px] uppercase tracking-wider block">Delivery Sales</span>
                            <span className="text-[10px] text-stone-500 mt-0.5">{deliveryBoxes} boxes across {activeOrders.length} orders</span>
                        </div>
                        <span className="text-2xl font-black text-stone-900 font-mono">¥{deliveryRevenue.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Section 3: Environment & Slot Performance */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-stone-100 pb-3 gap-3">
                    <div>
                        <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">Slot Performance & Daily Context</h3>
                        <p className="text-[10px] text-stone-500 mt-0.5">{displayNote}</p>
                    </div>
                    <div className="flex items-center gap-2 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200 text-[11px] font-bold text-stone-700 shrink-0">
                        <span>🌦️ Weather: <span className="text-stone-900">{displayWeather}</span></span>
                        <span className="text-stone-300">|</span>
                        <span>📍 Radius: <span className="text-stone-900">{displayRadius}</span></span>
                    </div>
                </div>

                <div className="space-y-2.5">
                    {effectiveTodaySlots.map((slot) => {
                        const actual = slotStats[slot.time]?.boxes || 0;
                        const isCompleted = actual >= slot.limit;
                        const progressPercent = slot.limit > 0 ? Math.min(100, Math.round((actual / slot.limit) * 100)) : 0;

                        return (
                            <div key={slot.time} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-200 gap-3">
                                <div className="flex items-center gap-4 min-w-[200px]">
                                    <span className="font-black text-stone-900 text-sm">{slot.time} Slot</span>
                                    <span className={`px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-wider ${isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                        {isCompleted ? '● Sold Out' : '▲ Open'}
                                    </span>
                                </div>

                                <div className="flex-1 w-full max-w-md flex items-center gap-3">
                                    <div className="h-2 w-full bg-stone-200 rounded-full overflow-hidden">
                                        <div className={`h-full transition-all duration-500 ${isCompleted ? 'bg-emerald-500' : 'bg-stone-800'}`} style={{ width: `${progressPercent}%` }}></div>
                                    </div>
                                    <div className="text-[11px] font-bold text-stone-600 min-w-[80px] text-right font-mono">
                                        {actual} / {slot.limit} <span className="text-[9px] text-stone-400">bxs</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Section 4: Hotel & Area Ranking (Today) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 flex flex-col">
                    <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                        Top Delivery Areas (Today)
                    </h3>
                    <div className="space-y-2 flex-1">
                        {rankingData.topAreas.length > 0 ? (
                            rankingData.topAreas.map(([area, qty], idx) => (
                                <div key={area} className="flex items-center justify-between p-2.5 hover:bg-stone-50 rounded-xl transition">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-black text-stone-400 w-4">{idx + 1}.</span>
                                        <span className="text-xs font-bold text-stone-800">{area}</span>
                                    </div>
                                    <span className="text-xs font-black text-stone-900 font-mono">{qty} <span className="text-[9px] text-stone-400 font-bold">bxs</span></span>
                                </div>
                            ))
                        ) : (
                            <div className="h-full flex items-center justify-center text-[11px] font-bold text-stone-400 py-8">No delivery data yet.</div>
                        )}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 flex flex-col">
                    <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                        Top Hotels & Hostels (Today)
                    </h3>
                    <div className="space-y-2 flex-1">
                        {rankingData.topHotels.length > 0 ? (
                            rankingData.topHotels.map(([hotel, qty], idx) => (
                                <div key={hotel} className="flex items-center justify-between p-2.5 hover:bg-stone-50 rounded-xl transition">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-black text-stone-400 w-4">{idx + 1}.</span>
                                        <span className="text-xs font-bold text-stone-800 truncate max-w-[180px]" title={hotel}>{hotel}</span>
                                    </div>
                                    <span className="text-xs font-black text-stone-900 font-mono">{qty} <span className="text-[9px] text-stone-400 font-bold">bxs</span></span>
                                </div>
                            ))
                        ) : (
                            <div className="h-full flex items-center justify-center text-[11px] font-bold text-stone-400 py-8">No delivery data yet.</div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}