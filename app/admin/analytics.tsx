'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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

  // Business Date Logic (18:00 cutoff)
  const currentNow = new Date();
  if (currentNow.getHours() >= 18) currentNow.setDate(currentNow.getDate() + 1);
  const currentYearStr = String(currentNow.getFullYear());
  const currentMonthStr = String(currentNow.getMonth() + 1).padStart(2, '0');
  const currentDayStr = String(currentNow.getDate()).padStart(2, '0');
  const currentBizDate = `${currentYearStr}-${currentMonthStr}-${currentDayStr}`;

  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedDay, setSelectedDay] = useState<string>(currentDayStr);

  const [isFetching, setIsFetching] = useState(false);
  const [histOrders, setHistOrders] = useState<any[]>([]);
  const [histInventory, setHistInventory] = useState<any[]>([]);
  const [histLogs, setHistLogs] = useState<any[]>([]);

  const startYear = 2026;
  const nowYear = new Date().getFullYear() + 1; // Allows viewing upcoming year
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

  const targetPrefix = viewMode === 'daily' ? `${selectedYear}-${selectedMonth}-${selectedDay}`
    : viewMode === 'monthly' ? `${selectedYear}-${selectedMonth}`
      : `${selectedYear}`;

  const isLive = viewMode === 'daily' && targetPrefix === currentBizDate;

  useEffect(() => {
    const fetchHistory = async () => {
      if (isLive) return; // Skip DB fetch if we are looking at today (use props)

      setIsFetching(true);
      const { data: inv } = await supabase.from('store_inventory').select('*').like('target_date', `${targetPrefix}%`);
      const { data: logs } = await supabase.from('sold_out_logs').select('*').like('date', `${targetPrefix}%`);

     // Fetch a slightly wider range of orders to account for 18:00 cutoff timezone shifts
          let sDate = new Date(Number(selectedYear), viewMode === 'yearly' ? 0 : Number(selectedMonth) - 1, viewMode === 'daily' ? Number(selectedDay) : 1);
          sDate.setDate(sDate.getDate() - 3);
          let eDate = new Date(sDate);
          
          // ↓ ここを修正（yearlyの時は1年分進める）
          if (viewMode === 'yearly') {
            eDate.setFullYear(eDate.getFullYear() + 1);
          } else {
            eDate.setMonth(eDate.getMonth() + 2);
          }

      const { data: ords } = await supabase.from('orders')
        .select('*')
        .gte('created_at', sDate.toISOString())
        .lte('created_at', eDate.toISOString());

      // Filter fetched orders securely by memory matching our business date logic
      const filteredOrds = (ords || []).filter(o => {
        const d = new Date(o.created_at);
        if (d.getHours() >= 18) d.setDate(d.getDate() + 1);
        const bDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return viewMode === 'daily' ? bDate === targetPrefix : bDate.startsWith(targetPrefix);
      });

      const validOrds = filteredOrds.filter(o => o.status !== 'cancelled' && o.status !== 'undelivered');

      setHistOrders(validOrds);
      setHistInventory(inv || []);
      setHistLogs(logs || []);
      setIsFetching(false);
    };

    fetchHistory();
  }, [viewMode, selectedYear, selectedMonth, selectedDay, targetPrefix, isLive]);

  // Use props if viewing today, otherwise use fetched DB history
  const finalOrders = isLive ? activeOrders : histOrders;
  const finalInventoryList = isLive ? [inventory] : histInventory;
  const finalSoldCount = finalInventoryList.reduce((sum, inv) => sum + (inv.sold_count || 0), 0);

  // Calculate Aggregates
  const deliveryRevenue = finalOrders.reduce((sum, o) => sum + (o.total_price || o.price || 0), 0);
  const takeoutRevenue = finalSoldCount * (takeoutPrice + takeoutVat);
  const totalSales = deliveryRevenue + takeoutRevenue;

  const deliveryBoxes = finalOrders.reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
  const totalOutput = deliveryBoxes + finalSoldCount;

  // Determine Sold Out Status Text based on period
  let soldOutStatusText = "Active";
  let soldOutSubText = "(In Stock)";
  let isSoldOutColor = false;

  if (viewMode === 'daily') {
    const dailyInv = isLive ? inventory : histInventory[0];
    const dailyIsSoldOut = dailyInv ? (dailyInv.current_stock === 0 && dailyInv.sold_count > 0) : false;
    const dailyLogs = isLive ? soldOutLogs : histLogs.map(l => l.sold_at);

    if (dailyIsSoldOut) {
      soldOutStatusText = "Sold Out";
      soldOutSubText = "(0 Stock)";
      isSoldOutColor = true;
    } else if (dailyLogs.length > 0) {
      soldOutStatusText = "Restocked";
      soldOutSubText = "(Was Sold Out)";
    }
  } else {
    // Count unique days it sold out in the month/year
    const soldOutDaysSet = new Set(histLogs.map(l => l.date));
    const daysCount = soldOutDaysSet.size;
    soldOutStatusText = `${daysCount} Days`;
    soldOutSubText = `Sold out in this period`;
    isSoldOutColor = daysCount > 0;
  }

  // Ranking Calculation
  const rankingData = useMemo(() => {
    const areaMap: Record<string, number> = {};
    const hotelMap: Record<string, number> = {};

    finalOrders.forEach(order => {
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
  }, [finalOrders, hotels]);

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

          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-300 rounded-xl px-3 py-1.5 shadow-2xs transition">
            <span className="text-stone-400 text-xs">📅</span>
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {viewMode !== 'yearly' && (
              <>
                <span className="text-stone-300">/</span>
                <select value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); const newLastDay = new Date(parseInt(selectedYear, 10), parseInt(e.target.value, 10), 0).getDate(); if (parseInt(selectedDay, 10) > newLastDay) setSelectedDay(String(newLastDay).padStart(2, '0')); }} className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer">
                  {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </>
            )}
            {viewMode === 'daily' && (
              <>
                <span className="text-stone-300">/</span>
                <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer">
                  {daysList.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Loading Overlay or Contents */}
      <div className={`transition-opacity duration-300 ${isFetching ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
        
        {/* Section 1: Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col h-full">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3">Sold Out Times ({viewMode})</span>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-extrabold ${isSoldOutColor ? 'text-rose-600' : 'text-emerald-600'}`}>
                {soldOutStatusText} <span className="text-sm font-bold text-stone-400">{soldOutSubText}</span>
              </span>
            </div>
            <div className="mt-auto pt-4">
              {viewMode === 'daily' && isLive && soldOutLogs.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {soldOutLogs.map((time, idx) => (
                    <span key={idx} className="bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-bold px-2 py-0.5 rounded-md">{time}</span>
                  ))}
                </div>
              ) : viewMode === 'daily' && histLogs.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {histLogs.map((log, idx) => (
                    <span key={idx} className="bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-bold px-2 py-0.5 rounded-md">{log.sold_at}</span>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] font-medium text-stone-400 block">No records in this period</span>
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
                Takeout: {finalSoldCount}
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
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 mt-6">
          <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
            Revenue Breakdown by Channel
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex items-center justify-between">
              <div>
                <span className="font-bold text-emerald-800 text-[11px] uppercase tracking-wider block">Takeout Sales</span>
                <span className="text-[10px] text-emerald-600 mt-0.5">{finalSoldCount} boxes sold</span>
              </div>
              <span className="text-2xl font-black text-emerald-900 font-mono">¥{takeoutRevenue.toLocaleString()}</span>
            </div>
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-stone-700 text-[11px] uppercase tracking-wider block">Delivery Sales</span>
                <span className="text-[10px] text-stone-500 mt-0.5">{deliveryBoxes} boxes across {finalOrders.length} orders</span>
              </div>
              <span className="text-2xl font-black text-stone-900 font-mono">¥{deliveryRevenue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Section 3: Environment & Slot Performance (Only visible in Daily view) */}
        {viewMode === 'daily' && (
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 mt-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-stone-100 pb-3 gap-3">
              <div>
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">Slot Performance & Daily Context</h3>
                <p className="text-[10px] text-stone-500 mt-0.5">{todayCalendar?.note || 'No special events logged for this date.'}</p>
              </div>
              <div className="flex items-center gap-2 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200 text-[11px] font-bold text-stone-700 shrink-0">
                <span>🌦️ Weather: <span className="text-stone-900">{todayCalendar?.weather || 'Unspecified'}</span></span>
                <span className="text-stone-300">|</span>
                <span>📍 Radius: <span className="text-stone-900">{todayCalendar?.operating_radius ? `${todayCalendar.operating_radius} km (Override)` : 'Default Settings'}</span></span>
              </div>
            </div>

            <div className="space-y-2.5">
              {effectiveTodaySlots.map((slot) => {
                // If viewing a past date, calculate stats from fetched histOrders instead of live slotStats
                let actual = 0;
                if (isLive) {
                  actual = slotStats[slot.time]?.boxes || 0;
                } else {
                  actual = finalOrders.filter(o => (o.delivery_time || o.delivery_slot || o.slot) === slot.time)
                    .reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
                }
                
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
        )}

        {/* Section 4: Hotel & Area Ranking */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 flex flex-col">
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
              Top Delivery Areas ({viewMode})
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
              Top Hotels & Hostels ({viewMode})
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
    </div>
  );
}