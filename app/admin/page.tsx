'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { HOTELS_MASTER } from '@/data/hotels';

interface Order {
  id: number;
  created_at: string;
  hotel_name?: string;
  hotel?: string;
  hotel_id?: string;
  room_number?: string;
  room?: string;
  guest_name?: string;
  name?: string;
  contact_email?: string;
  email?: string;
  delivery_time?: string;
  delivery_slot?: string;
  slot?: string;
  quantity?: number;
  qty?: number;
  total_price?: number;
  price?: number;
  status: string;
}

interface StoreInventory {
  id?: number;
  target_date: string;
  target_stock: number;
  current_stock: number;
  sold_count: number;
}

interface CalendarDay {
  date: string;
  is_open: boolean;
  note?: string;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'operations' | 'calendar' | 'settings'>('operations');
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<StoreInventory>({
    target_date: new Date().toISOString().split('T')[0],
    target_stock: 10,
    current_stock: 10,
    sold_count: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // === Calendar State ===
  const [currentYearMonth, setCurrentYearMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [calendarData, setCalendarData] = useState<Record<string, CalendarDay>>({});

  // === Settings State ===
  const [settings, setSettings] = useState({
    item_price: 1500,
    delivery_fee: 150,
    tax_amount: 150,
    delivery_radius_km: 2.5,
    is_open: true,
    limit_0700: 10,
    limit_0800: 15,
    limit_0900: 15,
    limit_1000: 10,
    slot_0700_active: true,
    slot_0800_active: true,
    slot_0900_active: true,
    slot_1000_active: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const fetchAllData = useCallback(async () => {
    // 1. Orders
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .order('id', { ascending: false });
    if (orderData && !orderErr) setOrders(orderData as Order[]);

    // 2. Inventory
    const today = new Date().toISOString().split('T')[0];
    const { data: invData } = await supabase
      .from('store_inventory')
      .select('*')
      .eq('target_date', today)
      .maybeSingle();

    if (invData) {
      setInventory(invData);
    } else {
      const initInv = { target_date: today, target_stock: 10, current_stock: 10, sold_count: 0 };
      const { data: createdInv } = await supabase.from('store_inventory').insert([initInv]).select().maybeSingle();
      if (createdInv) setInventory(createdInv);
    }

    // 3. Settings
    const { data: setData } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 'default_settings')
      .maybeSingle();
    if (setData) setSettings(setData);

    // 4. Calendar
    const { data: calData } = await supabase.from('store_calendar').select('*');
    if (calData) {
      const calMap: Record<string, CalendarDay> = {};
      calData.forEach((row: CalendarDay) => {
        calMap[row.date] = row;
      });
      setCalendarData(calMap);
    }

    setLastUpdated(new Date().toLocaleTimeString('ja-JP'));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 15000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // 有効受注集計
  const activeOrders = useMemo(() => {
    return orders.filter((o) => o.status !== 'cancelled' && o.status !== 'undelivered');
  }, [orders]);

  const activeDeliveryBoxes = useMemo(() => {
    return activeOrders.reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
  }, [activeOrders]);

  const deliveryRevenue = useMemo(() => {
    return activeOrders.reduce((sum, o) => sum + (o.total_price || o.price || 0), 0);
  }, [activeOrders]);

  const slotStats = useMemo(() => {
    const stats: Record<string, { boxes: number; orders: number }> = {
      '07:00': { boxes: 0, orders: 0 },
      '08:00': { boxes: 0, orders: 0 },
      '09:00': { boxes: 0, orders: 0 },
      '10:00': { boxes: 0, orders: 0 },
    };
    activeOrders.forEach((o) => {
      const slot = o.delivery_time || o.delivery_slot || o.slot || '08:00';
      if (!stats[slot]) stats[slot] = { boxes: 0, orders: 0 };
      stats[slot].boxes += o.quantity || o.qty || 1;
      stats[slot].orders += 1;
    });
    return stats;
  }, [activeOrders]);

  const deliveryKeptBoxes = useMemo(() => {
    return orders
      .filter((o) => o.status === 'ready_store')
      .reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
  }, [orders]);

  const deliveryUncookedBoxes = useMemo(() => {
    return orders
      .filter((o) => o.status === 'order_received' || o.status === 'pending')
      .reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
  }, [orders]);

  const takeoutAvailable = Math.max(0, inventory.current_stock - deliveryKeptBoxes);
  const storeRestockNeeded = Math.max(0, inventory.target_stock - takeoutAvailable);
  const kitchenSuggestBoxes = deliveryUncookedBoxes + storeRestockNeeded;

  // ステータス更新
  const handleUpdateStatus = async (orderId: number, nextStatus: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId);
    if (error) {
      alert('ステータス更新に失敗しました: ' + error.message);
      fetchAllData();
    }
  };

  const handleShelfChange = async (delta: number) => {
    const newStock = Math.max(0, inventory.current_stock + delta);
    setInventory((prev) => ({ ...prev, current_stock: newStock }));
    await supabase.from('store_inventory').update({ current_stock: newStock }).eq('target_date', inventory.target_date);
  };

  const handleSellCounter = async () => {
    if (takeoutAvailable <= 0) {
      alert('店頭販売可能分がありません。現物を補充してください。');
      return;
    }
    const newStock = Math.max(0, inventory.current_stock - 1);
    const newSold = inventory.sold_count + 1;
    setInventory((prev) => ({ ...prev, current_stock: newStock, sold_count: newSold }));
    await supabase.from('store_inventory').update({ current_stock: newStock, sold_count: newSold }).eq('target_date', inventory.target_date);
  };

  // カレンダー操作: 日付タップでのトグル
  const handleToggleCalendarDate = async (dateStr: string) => {
    const currentStatus = calendarData[dateStr] ? calendarData[dateStr].is_open : true; // デフォルトは営業
    const nextStatus = !currentStatus;

    setCalendarData((prev) => ({
      ...prev,
      [dateStr]: { date: dateStr, is_open: nextStatus },
    }));

    await supabase.from('store_calendar').upsert({
      date: dateStr,
      is_open: nextStatus,
      updated_at: new Date().toISOString(),
    });
  };

  // カレンダー生成ロジック
  const calendarDays = useMemo(() => {
    const { year, month } = currentYearMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay(); // 0: Sun
    const totalDays = lastDay.getDate();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push(dateStr);
    }
    return days;
  }, [currentYearMonth]);

  // 設定保存
  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveMessage('');
    const { error } = await supabase
      .from('settings')
      .update({
        item_price: settings.item_price,
        delivery_fee: settings.delivery_fee,
        tax_amount: settings.tax_amount,
        delivery_radius_km: settings.delivery_radius_km,
        is_open: settings.is_open,
        limit_0700: settings.limit_0700,
        limit_0800: settings.limit_0800,
        limit_0900: settings.limit_0900,
        limit_1000: settings.limit_1000,
        slot_0700_active: settings.slot_0700_active,
        slot_0800_active: settings.slot_0800_active,
        slot_0900_active: settings.slot_0900_active,
        slot_1000_active: settings.slot_1000_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default_settings');

    setIsSaving(false);
    if (error) {
      setSaveMessage('❌ Error saving settings: ' + error.message);
    } else {
      setSaveMessage('✓ Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : Number(value),
    }));
  };

  const getHotelDisplayName = (order: Order) => {
    const raw = order.hotel_name || order.hotel || order.hotel_id || '';
    const found = HOTELS_MASTER.find((h) => String(h.id) === String(raw) || h.name === raw || h.nameJa === raw);
    if (found) return `${found.nameJa || found.name}`;
    return raw || 'Hotel Unspecified';
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'order_received':
      case 'pending':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">order received</span>;
      case 'ready_store':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">ready store</span>;
      case 'ready_kitchen':
      case 'cooking':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">ready kitchen</span>;
      case 'delivering':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">delivering</span>;
      case 'delivered':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">delivered</span>;
      case 'undelivered':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">undelivered</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200 text-stone-600">cancelled</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700">{status}</span>;
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f5f5f4] text-stone-500 font-medium">Loading Operations Data...</div>;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-[#f5f5f4] text-stone-800 font-sans pb-20">
      
      {/* 上部ヘッダー ＆ タブバー */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-stone-900">ASAKUSA ONIGIRI</h1>
            <span className="text-[10px] px-2 py-0.5 bg-stone-100 text-stone-600 rounded border border-stone-200 font-semibold uppercase">
              Admin Console
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200">
              <button
                onClick={() => setActiveTab('operations')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                  activeTab === 'operations'
                    ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                📦 Operations (現場管理)
              </button>
              <button
                onClick={() => setActiveTab('calendar')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                  activeTab === 'calendar'
                    ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                📅 Calendar (営業カレンダー)
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                  activeTab === 'settings'
                    ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                ⚙️ Settings (設定)
              </button>
            </div>

            <button
              onClick={fetchAllData}
              className="text-xs bg-white hover:bg-stone-50 text-stone-700 px-3 py-2 rounded-xl border border-stone-300 font-semibold flex items-center gap-1 transition shadow-2xs"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Refresh ({lastUpdated})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        
        {/* =========================================
            1. OPERATIONS TAB (現場オペレーション画面)
            ========================================= */}
        {activeTab === 'operations' && (
          <div className="space-y-6">
            
            {/* 上段3カラムサマリー */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              <div className="bg-stone-900 text-white p-5 rounded-2xl shadow-sm space-y-3">
                <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                  KITCHEN SUGGEST / 製造指示
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-white">{kitchenSuggestBoxes}</span>
                  <span className="text-xs text-stone-300">boxes to prepare / 箱</span>
                </div>
                <div className="pt-3 border-t border-stone-800 space-y-1 text-[11px] text-stone-300">
                  <div className="flex justify-between">
                    <span>Delivery (Uncooked) / デリバリー未製造:</span>
                    <span className="font-bold text-amber-400">{deliveryUncookedBoxes} boxes</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Store Restock / 店頭補充必要数:</span>
                    <span className="font-bold text-emerald-400">{storeRestockNeeded} boxes</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">
                  ACTIVE DELIVERY ORDERS / デリバリー有効受注
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-stone-900">{activeOrders.length}</span>
                  <span className="text-xs text-stone-500">orders ({activeDeliveryBoxes} boxes)</span>
                </div>
                <div className="pt-3 border-t border-stone-100 text-[11px] text-stone-600">
                  Revenue: <span className="font-bold text-stone-900">¥{deliveryRevenue.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">
                  TAKEOUT SOLD (TODAY) / 店頭販売累計
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-stone-900">{inventory.sold_count}</span>
                  <span className="text-xs text-stone-500">boxes sold / 消化</span>
                </div>
                <div className="pt-3 border-t border-stone-100 text-[11px] text-stone-600">
                  Takeout Rev: <span className="font-bold text-stone-900">¥{(inventory.sold_count * (settings.item_price + settings.tax_amount)).toLocaleString()}</span>
                </div>
              </div>

            </div>

            {/* 中段：時間枠別状況 ＆ 店頭在庫POS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <span className="text-xs font-bold text-stone-700 uppercase tracking-wider block">
                  DELIVERY BY TIME SLOT / 配達枠別 状況
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {['07:00', '08:00', '09:00', '10:00'].map((slot) => (
                    <div key={slot} className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-center">
                      <span className="text-[11px] font-bold text-stone-600 block">{slot}</span>
                      <div className="text-xl font-extrabold text-stone-900 my-1">{slotStats[slot]?.boxes || 0} <span className="text-[10px] font-normal text-stone-500">box</span></div>
                      <span className="text-[10px] text-stone-400 block">{slotStats[slot]?.orders || 0} orders</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                    STORE INVENTORY & POS / 店頭在庫
                  </span>
                  <span className="text-[11px] text-stone-500">
                    Target: {inventory.target_stock} boxes
                  </span>
                </div>

                <div className="flex items-baseline justify-between bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                  <span className="text-xs font-bold text-stone-600">TOTAL PHYSICAL SHELF / 店頭総現物</span>
                  <span className="text-2xl font-extrabold text-stone-900">{inventory.current_stock} <span className="text-xs font-normal text-stone-500">boxes</span></span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <span className="text-[10px] text-emerald-800 font-bold block">Takeout Free / 店頭販売可</span>
                    <span className="text-lg font-bold text-emerald-900">{takeoutAvailable} boxes</span>
                  </div>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
                    <span className="text-[10px] text-purple-800 font-bold block">Delivery Kept / 店頭確保 (ready_store)</span>
                    <span className="text-lg font-bold text-purple-900">{deliveryKeptBoxes} boxes</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-stone-500 font-medium">Shelf Adjust / 総現物調整:</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleShelfChange(-1)} className="w-8 h-8 bg-stone-100 border border-stone-300 rounded-lg font-bold hover:bg-stone-200">-</button>
                    <button onClick={() => handleShelfChange(1)} className="w-8 h-8 bg-stone-100 border border-stone-300 rounded-lg font-bold hover:bg-stone-200">+</button>
                  </div>
                </div>

                <button
                  onClick={handleSellCounter}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Sell 1 Box at Counter / 店頭で1箱販売
                </button>
              </div>

            </div>

            {/* 下段：デリバリー受注一覧テーブル */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
              <span className="text-xs font-bold text-stone-700 uppercase tracking-wider block">
                DELIVERY ORDERS LIST / デリバリー受注一覧
              </span>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-700 border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 uppercase text-[10px]">
                      <th className="py-2.5 px-3">ID</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Slot</th>
                      <th className="py-2.5 px-3">Hotel / お届け先</th>
                      <th className="py-2.5 px-3">Room</th>
                      <th className="py-2.5 px-3">Guest / お名前</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-center">Action / ステータス変更</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {orders.map((o) => {
                      const displayHotel = getHotelDisplayName(o);
                      const displaySlot = o.delivery_time || o.delivery_slot || o.slot || '08:00';
                      const displayRoom = o.room_number || o.room || '-';
                      const displayGuest = o.guest_name || o.name || '-';
                      const displayEmail = o.contact_email || o.email || '';
                      const displayQty = o.quantity || o.qty || 1;
                      const displayTotal = o.total_price || o.price || (displayQty * 1800);

                      const currentStatus = o.status === 'pending' ? 'order_received' : (o.status === 'cooking' ? 'ready_kitchen' : o.status);

                      return (
                        <tr key={o.id} className="hover:bg-stone-50 transition">
                          <td className="py-3 px-3 font-mono font-bold text-stone-400 text-[11px]">#{o.id}</td>
                          <td className="py-3 px-3">
                            {renderStatusBadge(currentStatus)}
                          </td>
                          <td className="py-3 px-3 font-bold text-stone-900">{displaySlot}</td>
                          <td className="py-3 px-3 font-semibold text-stone-800">{displayHotel}</td>
                          <td className="py-3 px-3 font-mono text-stone-900 font-bold">{displayRoom}</td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-stone-900">{displayGuest}</div>
                            {displayEmail && <div className="text-[10px] text-stone-400">{displayEmail}</div>}
                          </td>
                          <td className="py-3 px-3 text-right font-bold">{displayQty}</td>
                          <td className="py-3 px-3 text-right font-bold text-stone-900">¥{displayTotal.toLocaleString()}</td>
                          <td className="py-3 px-3 text-center">
                            <select
                              value={currentStatus}
                              onChange={(e) => handleUpdateStatus(o.id, e.target.value)}
                              className="bg-stone-50 border border-stone-300 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-stone-800 outline-none focus:border-stone-900 cursor-pointer"
                            >
                              <option value="order_received">1. order received (新規受付 / 未製造)</option>
                              <option value="ready_store">2-A. ready store (店頭確保・完成)</option>
                              <option value="ready_kitchen">2-B. ready kitchen (キッチン待機・完成)</option>
                              <option value="delivering">3. delivering (配達中)</option>
                              <option value="delivered">4. delivered (配達完了)</option>
                              <option value="undelivered">5. undelivered (未達・不在)</option>
                              <option value="cancelled">6. cancelled (キャンセル)</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* =========================================
            2. CALENDAR TAB (営業カレンダー設定)
            ========================================= */}
        {activeTab === 'calendar' && (
          <div className="max-w-3xl mx-auto space-y-6">
            
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-stone-900">Business Calendar / 営業カレンダー</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  日付をクリックして「🟢 営業」と「🔴 定休日」を切り替えます（自動保存）。
                </p>
              </div>

              {/* 年月送りボタン */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentYearMonth(prev => {
                    const d = new Date(prev.year, prev.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-bold hover:bg-stone-100"
                >
                  ◀ 前月
                </button>
                <span className="text-sm font-extrabold text-stone-800 min-w-24 text-center">
                  {currentYearMonth.year}年 {currentYearMonth.month + 1}月
                </span>
                <button
                  onClick={() => setCurrentYearMonth(prev => {
                    const d = new Date(prev.year, prev.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-bold hover:bg-stone-100"
                >
                  次月 ▶
                </button>
              </div>
            </div>

            {/* カレンダー本体 */}
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
              
              {/* 曜日ヘッダー */}
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold pb-2 border-b border-stone-100">
                <span className="text-rose-600">SUN</span>
                <span className="text-stone-600">MON</span>
                <span className="text-stone-600">TUE</span>
                <span className="text-stone-600">WED</span>
                <span className="text-stone-600">THU</span>
                <span className="text-stone-600">FRI</span>
                <span className="text-blue-600">SAT</span>
              </div>

              {/* 日付グリッド */}
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((dateStr, idx) => {
                  if (!dateStr) {
                    return <div key={`empty-${idx}`} className="h-20 rounded-xl bg-stone-50/50 border border-transparent"></div>;
                  }

                  const dayNum = parseInt(dateStr.split('-')[2], 10);
                  const isOpen = calendarData[dateStr] ? calendarData[dateStr].is_open : true; // デフォルトは営業
                  const isToday = dateStr === todayStr;

                  return (
                    <button
                      key={dateStr}
                      onClick={() => handleToggleCalendarDate(dateStr)}
                      className={`h-20 p-2 rounded-2xl border transition text-left flex flex-col justify-between cursor-pointer active:scale-95 ${
                        isOpen
                          ? 'bg-emerald-50/40 hover:bg-emerald-100/60 border-emerald-200'
                          : 'bg-rose-50/60 hover:bg-rose-100/80 border-rose-200'
                      } ${isToday ? 'ring-2 ring-stone-900 shadow-sm' : ''}`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className={`text-xs font-bold ${isToday ? 'text-stone-900 underline' : 'text-stone-700'}`}>
                          {dayNum}
                        </span>
                        {isToday && <span className="text-[9px] bg-stone-900 text-white px-1.5 py-0.2 rounded font-bold">Today</span>}
                      </div>

                      <div className="w-full text-center">
                        {isOpen ? (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-300 inline-block">
                            ● 営業中
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-full border border-rose-300 inline-block">
                            ✕ 定休日
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 凡例 */}
              <div className="flex justify-end gap-4 pt-3 border-t border-stone-100 text-[11px] text-stone-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-100 border border-emerald-300"></span>
                  <span>営業日（注文受付）</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-100 border border-rose-300"></span>
                  <span>定休日（受付完全停止）</span>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* =========================================
            3. SETTINGS TAB (設定コントロールパネル)
            ========================================= */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto space-y-6">
            
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-stone-900">Store Settings & Limits</h2>
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm transition active:scale-95 disabled:bg-stone-400 cursor-pointer"
              >
                {isSaving ? 'Saving...' : 'Save All Settings'}
              </button>
            </div>
            
            {saveMessage && (
              <div className={`p-3 rounded-xl text-xs font-bold text-center ${saveMessage.includes('Error') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}`}>
                {saveMessage}
              </div>
            )}

            {/* 1. 全体営業ステータス */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                1. Store Master Status (店舗全体ステータス)
              </h3>
              <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                <div>
                  <div className="text-xs font-bold text-stone-900">Accept New Orders (新規受付ON/OFF)</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">OFFにすると全時間帯が一括で受付終了となり、お客さんの注文を停止します。</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" name="is_open" checked={settings.is_open} onChange={handleSettingChange} className="sr-only peer" />
                  <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            {/* 2. 料金設定 */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                2. Price & Taxes (料金設定)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Item Price (本体価格 /箱)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                    <input type="number" name="item_price" value={settings.item_price} onChange={handleSettingChange} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Delivery Fee (配達料 /注文)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                    <input type="number" name="delivery_fee" value={settings.delivery_fee} onChange={handleSettingChange} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Tax Amount (諸税 /箱)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                    <input type="number" name="tax_amount" value={settings.tax_amount} onChange={handleSettingChange} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. 配達エリア設定 */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                3. Delivery Coverage (配達可能エリア)
              </h3>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-bold text-stone-600">Delivery Radius (配達半径 km)</label>
                  <span className="font-extrabold text-sm text-stone-900">{Number(settings.delivery_radius_km).toFixed(1)} km</span>
                </div>
                <input type="range" name="delivery_radius_km" min="1.0" max="5.0" step="0.1" value={settings.delivery_radius_km} onChange={handleSettingChange} className="w-full accent-stone-900" />
                <p className="text-[10px] text-stone-400 mt-1">※半径を変更すると、フロント画面のホテル選択一覧が自動で絞り込まれます。</p>
              </div>
            </div>

            {/* 4. 時間枠・上限設定 */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                4. Time Slot Capacity & Control (時間枠の受付上限 ＆ 強制停止)
              </h3>
              <p className="text-[10px] text-stone-400">スイッチをOFFにすると、上限に達していなくても即座に「SOLD OUT」にできます。</p>
              
              <div className="space-y-2.5">
                {['0700', '0800', '0900', '1000'].map((slot) => (
                  <div key={slot} className={`flex items-center justify-between p-3 rounded-xl border transition ${settings[`slot_${slot}_active` as keyof typeof settings] ? 'bg-stone-50 border-stone-200' : 'bg-rose-50/40 border-rose-200'}`}>
                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" name={`slot_${slot}_active`} checked={Boolean(settings[`slot_${slot}_active` as keyof typeof settings])} onChange={handleSettingChange} className="sr-only peer" />
                        <div className="w-9 h-5 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                      <span className={`text-xs font-bold ${settings[`slot_${slot}_active` as keyof typeof settings] ? 'text-stone-900' : 'text-stone-400 line-through'}`}>
                        {slot.slice(0, 2)}:{slot.slice(2)} Delivery Slot
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-stone-500">Max:</span>
                      <input type="number" name={`limit_${slot}`} value={Number(settings[`limit_${slot}` as keyof typeof settings])} onChange={handleSettingChange} className="w-16 px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-bold outline-none focus:border-stone-900 text-center" />
                      <span className="text-[10px] text-stone-400">boxes</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}