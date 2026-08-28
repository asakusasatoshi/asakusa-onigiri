import React, { useState } from 'react';

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
  itemPrice: number;
  vatAmount: number;
  soldOutLogs?: string[]; // ★ 新しく追加：親から渡される売り切れ時刻の配列
}

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export default function AnalyticsPage({
  activeOrders,
  inventory,
  effectiveTodaySlots,
  slotStats,
  itemPrice,
  vatAmount,
  soldOutLogs = [], // デフォルトは空配列
}: AnalyticsPageProps) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  
  // 今日の日付から現在の年・月・日を取得して初期値にセット
  const currentNow = new Date();
  const currentYearStr = String(currentNow.getFullYear());
  const currentMonthStr = String(currentNow.getMonth() + 1).padStart(2, '0');
  const currentDayStr = String(currentNow.getDate()).padStart(2, '0');

  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedDay, setSelectedDay] = useState<string>(currentDayStr);

  // お店の創業年（2026年）から現在（今年）までの年を自動生成するリスト
  const startYear = 2026;
  const nowYear = currentNow.getFullYear();
  const YEARS: string[] = [];
  for (let y = startYear; y <= nowYear; y++) {
    YEARS.push(String(y));
  }

  // 選択された年月の日数を算出
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

  // 1. デリバリー売上の合算
  const deliveryRevenue = activeOrders.reduce((sum, o) => sum + (o.total_price || o.price || 0), 0);
  
  // 2. テイクアウト売上の合算 (sold_count × (単価 + 消費税))
  const takeoutRevenue = inventory.sold_count * (itemPrice + vatAmount);

  // 3. 総売上 ＝ デリバリー売上 ＋ テイクアウト売上
  const totalSales = deliveryRevenue + takeoutRevenue;

  // 4. 総販売数（デリバリーの箱数 ＋ テイクアウトの箱数）
  const deliveryBoxes = activeOrders.reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
  const totalOutput = deliveryBoxes + inventory.sold_count;

  // 5. 在庫連動: 現在の在庫（current_stock）が0かどうか
  const isSoldOut = inventory.current_stock === 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-4 font-sans text-stone-800">
      
      {/* Header & View Mode Switcher */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight">Analytics & Insights</h2>
          <p className="text-xs text-stone-500 mt-0.5">Live performance, environment, and financial metrics synced with Operations.</p>
        </div>

        {/* 期間切り替え ＆ プルダウンセレクター */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200">
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'daily' ? 'bg-white text-stone-900 shadow-xs border border-stone-200' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'monthly' ? 'bg-white text-stone-900 shadow-xs border border-stone-200' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setViewMode('yearly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'yearly' ? 'bg-white text-stone-900 shadow-xs border border-stone-200' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Yearly
            </button>
          </div>

          {/* Daily モード: Year / Month / Day プルダウン */}
          {viewMode === 'daily' && (
            <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-300 rounded-xl px-3 py-1.5 shadow-2xs">
              <span className="text-stone-400 text-xs">📅</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
              >
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-stone-300">/</span>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  const newLastDay = new Date(parseInt(selectedYear, 10), parseInt(e.target.value, 10), 0).getDate();
                  if (parseInt(selectedDay, 10) > newLastDay) {
                    setSelectedDay(String(newLastDay).padStart(2, '0'));
                  }
                }}
                className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
              >
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <span className="text-stone-300">/</span>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
              >
                {daysList.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          {/* Monthly モード: Year / Month プルダウン */}
          {viewMode === 'monthly' && (
            <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-300 rounded-xl px-3 py-1.5 shadow-2xs">
              <span className="text-stone-400 text-xs">📅</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
              >
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-stone-300">/</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
              >
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}

          {/* Yearly モード: Year プルダウン */}
          {viewMode === 'yearly' && (
            <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-300 rounded-xl px-3 py-1.5 shadow-2xs">
              <span className="text-stone-400 text-xs">📅</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
              >
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Section 1: Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* ★ 更新：在庫連動型 Sold Out Times カード (履歴表示対応) */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-2 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Sold Out Times (Today)</span>
          <div>
            <div className="mb-2">
              <span className={`text-xl font-extrabold ${isSoldOut ? 'text-rose-600' : 'text-emerald-600'}`}>
                {isSoldOut ? 'Sold Out (0 Stock)' : 'Active (In Stock)'}
              </span>
            </div>
            
            {/* 複数回の売り切れ時刻の履歴をバッジで並べる */}
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

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Total Output</span>
          <div className="flex items-baseline gap-2 pt-1">
            <span className="text-2xl font-extrabold text-stone-900">{totalOutput}</span>
            <span className="text-[11px] text-stone-500">boxes sold</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Gross Profit</span>
          <div className="flex items-baseline gap-2 pt-1">
            <span className="text-2xl font-extrabold text-stone-900">¥{totalSales.toLocaleString()}</span>
            <span className="text-[11px] text-stone-500">Profit</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Cost Rate</span>
          <div className="flex items-baseline gap-2 pt-1">
            <span className="text-2xl font-extrabold text-stone-900">0.0%</span>
            <span className="text-[11px] text-stone-500">Ratio</span>
          </div>
        </div>
      </div>

      {/* Section 2: Financial & Cost Breakdown */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
          Financial & Cost Breakdown (Live Operations Linked)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200">
            <span className="text-[11px] text-stone-500 block">Total Sales</span>
            <span className="text-base font-extrabold text-stone-900 mt-1 block">¥{totalSales.toLocaleString()}</span>
          </div>
          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200">
            <span className="text-[11px] text-stone-500 block">Ingredient Cost</span>
            <span className="text-base font-extrabold text-stone-900 mt-1 block">¥0</span>
          </div>
          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200">
            <span className="text-[11px] text-stone-500 block">Packaging Cost</span>
            <span className="text-base font-extrabold text-stone-900 mt-1 block">¥0</span>
          </div>
          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200">
            <span className="text-[11px] text-stone-500 block">Waste Loss Cost</span>
            <span className="text-base font-extrabold text-stone-900 mt-1 block">¥0</span>
          </div>
          <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200 col-span-2 md:col-span-1">
            <span className="text-[11px] text-stone-600 font-bold block">Total Cost</span>
            <span className="text-base font-black text-stone-900 mt-1 block">¥0</span>
          </div>
        </div>
      </div>

      {/* Section 3: Slot Performance & Environment */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-stone-100 pb-3 gap-2">
          <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            Slot Performance & Environment
          </h3>
          <div className="flex items-center gap-2 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200 text-xs font-bold text-stone-700">
            <span>🌤️ Weather: <span className="text-stone-900">Sunny</span></span>
            <span className="text-stone-300">|</span>
            <span>🌡️ Temp: <span className="text-stone-900">32°C</span></span>
            <span className="text-stone-300">|</span>
            <span>📅 Day: <span className="text-stone-900">Thu</span></span>
          </div>
        </div>

        <div className="space-y-2">
          {effectiveTodaySlots.map((slot) => {
            const actual = slotStats[slot.time]?.boxes || 0;
            const isCompleted = actual >= slot.limit;

            return (
              <div key={slot.time} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs">
                <div className="flex items-center gap-4">
                  <span className="font-extrabold text-stone-900 w-20">{slot.time} Slot</span>
                  <span className="text-stone-500">Target: <span className="font-bold text-stone-800">{slot.limit} boxes</span></span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-extrabold text-stone-900">Actual: {actual} boxes</span>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                    isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {isCompleted ? '● Completed' : '▲ In Progress'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}