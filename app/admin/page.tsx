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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// 朝5:00を境界とした業務日付（YYYY-MM-DD）を取得
function getBusinessDateStr(date: Date = new Date()): string {
  const d = new Date(date.getTime());
  if (d.getHours() < 5) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'operations' | 'history' | 'calendar' | 'settings'>('operations');
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<StoreInventory>({
    target_date: getBusinessDateStr(),
    target_stock: 10,
    current_stock: 10,
    sold_count: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // === Operations Filter State ===
  const [opStatusFilter, setOpStatusFilter] = useState<'active' | 'all' | 'delivered'>('active');
  const [opSlotFilter, setOpSlotFilter] = useState<string>('all');

  // === History Filter State ===
  const [historyPeriod, setHistoryPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');
  const [historySearch, setHistorySearch] = useState('');

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
    const currentBizDate = getBusinessDateStr();

    // 1. 全Orders取得
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .order('id', { ascending: false });
    if (orderData && !orderErr) setOrders(orderData as Order[]);

    // 2. Inventory (業務日付基準)
    const { data: invData } = await supabase
      .from('store_inventory')
      .select('*')
      .eq('target_date', currentBizDate)
      .maybeSingle();

    if (invData) {
      setInventory(invData);
    } else {
      const initInv = { target_date: currentBizDate, target_stock: 10, current_stock: 10, sold_count: 0 };
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

    setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 15000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // Operations用：今日の業務日付（朝5時〜翌朝4時59分）の注文
  const todayBizDate = getBusinessDateStr();
  const todayOperationsOrders = useMemo(() => {
    return orders.filter((o) => {
      const orderBizDate = getBusinessDateStr(new Date(o.created_at));
      return orderBizDate === todayBizDate;
    });
  }, [orders, todayBizDate]);

  // 有効受注集計（当日分）
  const activeOrders = useMemo(() => {
    return todayOperationsOrders.filter((o) => o.status !== 'cancelled' && o.status !== 'undelivered');
  }, [todayOperationsOrders]);

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
    return todayOperationsOrders
      .filter((o) => o.status === 'ready_store')
      .reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
  }, [todayOperationsOrders]);

  const deliveryUncookedBoxes = useMemo(() => {
    return todayOperationsOrders
      .filter((o) => o.status === 'order_received' || o.status === 'pending')
      .reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
  }, [todayOperationsOrders]);

  const takeoutAvailable = Math.max(0, inventory.current_stock - deliveryKeptBoxes);
  const storeRestockNeeded = Math.max(0, inventory.target_stock - takeoutAvailable);
  const kitchenSuggestBoxes = deliveryUncookedBoxes + storeRestockNeeded;

  // Operationsテーブル用：ソート ＆ フィルター適用
  const displayedOperationsOrders = useMemo(() => {
    return todayOperationsOrders
      .filter((o) => {
        if (opStatusFilter === 'active') {
          return o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'undelivered';
        }
        if (opStatusFilter === 'delivered') {
          return o.status === 'delivered';
        }
        return true;
      })
      .filter((o) => {
        if (opSlotFilter !== 'all') {
          const slot = o.delivery_time || o.delivery_slot || o.slot || '08:00';
          return slot === opSlotFilter;
        }
        return true;
      })
      .sort((a, b) => {
        const slotA = a.delivery_time || a.delivery_slot || a.slot || '08:00';
        const slotB = b.delivery_time || b.delivery_slot || b.slot || '08:00';
        if (slotA !== slotB) {
          return slotA.localeCompare(slotB);
        }
        return a.id - b.id;
      });
  }, [todayOperationsOrders, opStatusFilter, opSlotFilter]);

  // History用：期間・検索フィルタリング
  const filteredHistoryOrders = useMemo(() => {
    const now = new Date();
    const todayStr = getBusinessDateStr(now);

    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = getBusinessDateStr(yesterdayDate);

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return orders.filter((o) => {
      const orderDate = new Date(o.created_at);
      const orderBizDate = getBusinessDateStr(orderDate);

      if (historyPeriod === 'today' && orderBizDate !== todayStr) return false;
      if (historyPeriod === 'yesterday' && orderBizDate !== yesterdayStr) return false;
      if (historyPeriod === 'week' && orderDate < sevenDaysAgo) return false;
      if (historyPeriod === 'month' && orderDate < thirtyDaysAgo) return false;

      if (historySearch.trim()) {
        const query = historySearch.toLowerCase();
        const hotel = (o.hotel_name || o.hotel || '').toLowerCase();
        const guest = (o.guest_name || o.name || '').toLowerCase();
        const email = (o.contact_email || o.email || '').toLowerCase();
        const room = String(o.room_number || o.room || '');
        const id = `#${o.id}`;

        return hotel.includes(query) || guest.includes(query) || email.includes(query) || room.includes(query) || id.includes(query);
      }

      return true;
    });
  }, [orders, historyPeriod, historySearch]);

  const historyTotalRevenue = useMemo(() => {
    return filteredHistoryOrders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (o.total_price || o.price || 0), 0);
  }, [filteredHistoryOrders]);

  const historyTotalBoxes = useMemo(() => {
    return filteredHistoryOrders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0);
  }, [filteredHistoryOrders]);

  // クイックトグル（安全ガード付き）
  const handleQuickToggleSlot = async (slot: string) => {
    const slotKey = slot.replace(':', '');
    const fieldName = `slot_${slotKey}_active` as keyof typeof settings;
    const currentVal = Boolean(settings[fieldName]);
    const nextVal = !currentVal;

    if (!nextVal) {
      const confirmed = window.confirm(
        `[CONFIRMATION / 確認]\n\nStop accepting orders for ${slot} delivery slot?\nThis slot will immediately show as SOLD OUT on the order page.\n\n${slot} 枠の注文受付を停止（SOLD OUT）にしますか？`
      );
      if (!confirmed) return;
    }

    setSettings((prev) => ({ ...prev, [fieldName]: nextVal }));
    await supabase
      .from('settings')
      .update({ [fieldName]: nextVal, updated_at: new Date().toISOString() })
      .eq('id', 'default_settings');
  };

  // ステータス更新
  const handleUpdateStatus = async (orderId: number, nextStatus: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId);
    if (error) {
      alert('Failed to update status: ' + error.message);
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
      alert('No physical stock available for takeout. Please restock shelf.');
      return;
    }
    const newStock = Math.max(0, inventory.current_stock - 1);
    const newSold = inventory.sold_count + 1;
    setInventory((prev) => ({ ...prev, current_stock: newStock, sold_count: newSold }));
    await supabase.from('store_inventory').update({ current_stock: newStock, sold_count: newSold }).eq('target_date', inventory.target_date);
  };

  // カレンダー操作
  const handleToggleCalendarDate = async (dateStr: string) => {
    const currentStatus = calendarData[dateStr] ? calendarData[dateStr].is_open : true;
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

  const calendarDays = useMemo(() => {
    const { year, month } = currentYearMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
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

  const todayStr = getBusinessDateStr();
  const isCalendarOpenToday = calendarData[todayStr] ? calendarData[todayStr].is_open : true;
  const isMasterOpen = settings.is_open && isCalendarOpenToday;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f5f5f4] text-stone-500 font-medium">Loading Operations Data...</div>;
  }

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
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'operations'
                    ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                📦 Operations
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                📋 Order History
              </button>
              <button
                onClick={() => setActiveTab('calendar')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'calendar'
                    ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                📅 Calendar
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                ⚙️ Settings
              </button>
            </div>

            <button
              onClick={fetchAllData}
              className="text-xs bg-white hover:bg-stone-50 text-stone-800 px-3.5 py-2 rounded-xl border border-stone-300 font-semibold flex items-center gap-2 transition shadow-2xs cursor-pointer active:scale-95"
            >
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                LIVE
              </span>
              <span className="text-stone-300 font-normal">|</span>
              <span className="text-[11px] text-stone-500 font-mono">{lastUpdated}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        
        {/* =========================================
            1. OPERATIONS TAB (現場当日ToDo)
            ========================================= */}
        {activeTab === 'operations' && (
          <div className="space-y-6">
            
            {/* 上段3カラムサマリー */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-stone-900 text-white p-5 rounded-2xl shadow-sm space-y-3">
                <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                  KITCHEN SUGGEST (TODAY)
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-white">{kitchenSuggestBoxes}</span>
                  <span className="text-xs text-stone-300">boxes to prepare</span>
                </div>
                <div className="pt-3 border-t border-stone-800 space-y-1 text-[11px] text-stone-300">
                  <div className="flex justify-between">
                    <span>Delivery (Uncooked):</span>
                    <span className="font-bold text-amber-400">{deliveryUncookedBoxes} boxes</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Store Restock:</span>
                    <span className="font-bold text-emerald-400">{storeRestockNeeded} boxes</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">
                  ACTIVE DELIVERY ORDERS (TODAY)
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
                  TAKEOUT SOLD (TODAY)
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-stone-900">{inventory.sold_count}</span>
                  <span className="text-xs text-stone-500">boxes sold</span>
                </div>
                <div className="pt-3 border-t border-stone-100 text-[11px] text-stone-600">
                  Takeout Rev: <span className="font-bold text-stone-900">¥{(inventory.sold_count * (settings.item_price + settings.tax_amount)).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* 中段：時間枠別状況 ＆ 店頭在庫POS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* 左側：DELIVERY BY TIME SLOT & LIVE STATUS MONITOR */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                      DELIVERY SLOTS & INTAKE STATUS
                    </span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                      isMasterOpen 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                        : 'bg-rose-50 text-rose-700 border-rose-300'
                    }`}>
                      {isMasterOpen ? '● STORE: OPEN' : '✕ STORE: CLOSED'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {['07:00', '08:00', '09:00', '10:00'].map((slot) => {
                      const slotKey = slot.replace(':', '');
                      const isActive = Boolean(settings[`slot_${slotKey}_active` as keyof typeof settings]);
                      const maxLimit = Number(settings[`limit_${slotKey}` as keyof typeof settings]) || 10;
                      const booked = slotStats[slot]?.boxes || 0;
                      const isSoldOut = !isActive || booked >= maxLimit || !isMasterOpen;

                      return (
                        <div key={slot} className={`p-2.5 rounded-xl border text-center transition ${
                          isSoldOut ? 'bg-stone-50/80 border-stone-200 opacity-70' : 'bg-stone-50 border-stone-200'
                        }`}>
                          <span className="text-[11px] font-bold text-stone-600 block">{slot}</span>
                          <div className="text-lg font-extrabold text-stone-900 my-0.5">
                            {booked} <span className="text-[9px] font-normal text-stone-400">/ {maxLimit}</span>
                          </div>
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                            isSoldOut ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {isSoldOut ? 'SOLD' : 'OPEN'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-stone-100 space-y-2">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                    LIVE SLOT CONTROL (QUICK TOGGLE)
                  </span>

                  <div className="space-y-1.5">
                    {['07:00', '08:00', '09:00', '10:00'].map((slot) => {
                      const slotKey = slot.replace(':', '');
                      const isActive = Boolean(settings[`slot_${slotKey}_active` as keyof typeof settings]);
                      const maxLimit = Number(settings[`limit_${slotKey}` as keyof typeof settings]) || 10;
                      const booked = slotStats[slot]?.boxes || 0;
                      const remaining = Math.max(0, maxLimit - booked);
                      const isSoldOut = !isActive || remaining <= 0 || !isMasterOpen;

                      return (
                        <div
                          key={`row-${slot}`}
                          className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs transition ${
                            isSoldOut ? 'bg-rose-50/40 border-rose-200' : 'bg-stone-50 border-stone-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <button
                              onClick={() => handleQuickToggleSlot(slot)}
                              className={`w-7 h-4 rounded-full transition relative cursor-pointer ${
                                isActive ? 'bg-emerald-600' : 'bg-stone-300'
                              }`}
                              title={isActive ? 'Click to mark as SOLD OUT (Confirm required)' : 'Click to reopen slot'}
                            >
                              <div className={`w-3 h-3 rounded-full bg-white transition absolute top-0.5 ${
                                isActive ? 'right-0.5' : 'left-0.5'
                              }`}></div>
                            </button>
                            <span className="font-bold text-stone-800 text-[11px]">{slot} Slot</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-stone-500 font-mono">
                              {booked}/{maxLimit} bxs
                            </span>
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                              isSoldOut ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {isSoldOut ? '✕ SOLD OUT' : `● OPEN (${remaining} left)`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* 右側：店頭在庫 & POS */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                    STORE INVENTORY & POS
                  </span>
                  <span className="text-[11px] text-stone-500">
                    Target: {inventory.target_stock} boxes
                  </span>
                </div>

                <div className="flex items-baseline justify-between bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                  <span className="text-xs font-bold text-stone-600">TOTAL PHYSICAL SHELF</span>
                  <span className="text-2xl font-extrabold text-stone-900">{inventory.current_stock} <span className="text-xs font-normal text-stone-500">boxes</span></span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <span className="text-[10px] text-emerald-800 font-bold block">Takeout Free</span>
                    <span className="text-lg font-bold text-emerald-900">{takeoutAvailable} boxes</span>
                  </div>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
                    <span className="text-[10px] text-purple-800 font-bold block">Delivery Kept (ready_store)</span>
                    <span className="text-lg font-bold text-purple-900">{deliveryKeptBoxes} boxes</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-stone-500 font-medium">Shelf Adjust:</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleShelfChange(-1)} className="w-8 h-8 bg-stone-100 border border-stone-300 rounded-lg font-bold hover:bg-stone-200 cursor-pointer">-</button>
                    <button onClick={() => handleShelfChange(1)} className="w-8 h-8 bg-stone-100 border border-stone-300 rounded-lg font-bold hover:bg-stone-200 cursor-pointer">+</button>
                  </div>
                </div>

                <button
                  onClick={handleSellCounter}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Sell 1 Box at Counter
                </button>
              </div>

            </div>

            {/* 下段：デリバリー受注一覧テーブル（現場ToDo ＆ フィルタリング） */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
              
              {/* テーブル上部：フィルターバー */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-stone-100">
                <div>
                  <span className="text-xs font-bold text-stone-800 uppercase tracking-wider block">
                    TODAY'S OPERATIONS QUEUE ({displayedOperationsOrders.length} orders shown)
                  </span>
                  <span className="text-[10px] text-stone-400">Sorted chronologically by Delivery Time</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-[11px]">
                    <button
                      onClick={() => setOpStatusFilter('active')}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        opStatusFilter === 'active' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                      }`}
                    >
                      🟢 Active (未完了)
                    </button>
                    <button
                      onClick={() => setOpStatusFilter('all')}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        opStatusFilter === 'all' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setOpStatusFilter('delivered')}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        opStatusFilter === 'delivered' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                      }`}
                    >
                      Delivered
                    </button>
                  </div>

                  <div className="flex bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-[11px]">
                    {['all', '07:00', '08:00', '09:00', '10:00'].map((slot) => (
                      <button
                        key={slot}
                        onClick={() => setOpSlotFilter(slot)}
                        className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${
                          opSlotFilter === slot ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                        }`}
                      >
                        {slot === 'all' ? 'All Slots' : slot}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* テーブル本体 */}
              <div className="overflow-x-auto">
                {displayedOperationsOrders.length === 0 ? (
                  <div className="py-12 text-center text-stone-400 space-y-1">
                    <div className="text-2xl">🎉</div>
                    <div className="text-xs font-bold text-stone-600">No active orders in this queue</div>
                    <div className="text-[11px] text-stone-400">All tasks are completed or no orders matched the selected filter.</div>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs text-stone-700 border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-400 uppercase text-[10px]">
                        <th className="py-2.5 px-3">Slot (Time)</th>
                        <th className="py-2.5 px-3">ID</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Hotel</th>
                        <th className="py-2.5 px-3">Room</th>
                        <th className="py-2.5 px-3">Guest Name</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {displayedOperationsOrders.map((o) => {
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
                            <td className="py-3 px-3 font-extrabold text-stone-900 bg-stone-50/50">{displaySlot}</td>
                            <td className="py-3 px-3 font-mono font-bold text-stone-400 text-[11px]">#{o.id}</td>
                            <td className="py-3 px-3">
                              {renderStatusBadge(currentStatus)}
                            </td>
                            <td className="py-3 px-3 font-semibold text-stone-800">{displayHotel}</td>
                            <td className="py-3 px-3 font-mono text-stone-900 font-bold text-sm">{displayRoom}</td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-stone-900">{displayGuest}</div>
                              {displayEmail && <div className="text-[10px] text-stone-400">{displayEmail}</div>}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-stone-900">{displayQty}</td>
                            <td className="py-3 px-3 text-right font-bold text-stone-900">¥{displayTotal.toLocaleString()}</td>
                            <td className="py-3 px-3 text-center">
                              <select
                                value={currentStatus}
                                onChange={(e) => handleUpdateStatus(o.id, e.target.value)}
                                className="bg-stone-50 border border-stone-300 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-stone-800 outline-none focus:border-stone-900 cursor-pointer"
                              >
                                <option value="order_received">1. order received (Uncooked)</option>
                                <option value="ready_store">2-A. ready store (Ready at Store)</option>
                                <option value="ready_kitchen">2-B. ready kitchen (Ready at Kitchen)</option>
                                <option value="delivering">3. delivering (In Delivery)</option>
                                <option value="delivered">4. delivered (Completed)</option>
                                <option value="undelivered">5. undelivered (Failed/No-show)</option>
                                <option value="cancelled">6. cancelled</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        )}

        {/* =========================================
            2. ORDER HISTORY TAB (過去の全履歴・検索)
            ========================================= */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            
            {/* 期間フィルター ＆ 検索バー（クリアボタン付き） */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 w-full md:w-auto">
                {[
                  { key: 'today', label: 'Today' },
                  { key: 'yesterday', label: 'Yesterday' },
                  { key: 'week', label: 'Last 7 Days' },
                  { key: 'month', label: 'Last 30 Days' },
                  { key: 'all', label: 'All Time' },
                ].map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setHistoryPeriod(p.key as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex-1 md:flex-none cursor-pointer ${
                      historyPeriod === p.key
                        ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
                        : 'text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="w-full md:w-72 relative">
                <input
                  type="text"
                  placeholder="Search guest, hotel, room, #ID..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl pl-3.5 pr-8 py-2 text-xs text-stone-900 outline-none focus:border-stone-900"
                />
                {historySearch && (
                  <button
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-stone-300 hover:bg-stone-500 text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition shadow-2xs"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* 期間集計サマリー */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
                <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">
                  Total Delivery Revenue
                </span>
                <div className="text-2xl font-extrabold text-stone-900 mt-1">
                  ¥{historyTotalRevenue.toLocaleString()}
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
                <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">
                  Total Boxes Delivered
                </span>
                <div className="text-2xl font-extrabold text-stone-900 mt-1">
                  {historyTotalBoxes} <span className="text-xs font-normal text-stone-500">boxes</span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
                <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">
                  Total Orders Placed
                </span>
                <div className="text-2xl font-extrabold text-stone-900 mt-1">
                  {filteredHistoryOrders.length} <span className="text-xs font-normal text-stone-500">orders</span>
                </div>
              </div>
            </div>

            {/* 履歴テーブル */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
              <span className="text-xs font-bold text-stone-700 uppercase tracking-wider block">
                ORDER ARCHIVE / 注文ログ ({filteredHistoryOrders.length} records)
              </span>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-700 border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 uppercase text-[10px]">
                      <th className="py-2.5 px-3">Order ID</th>
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Slot</th>
                      <th className="py-2.5 px-3">Hotel / Destination</th>
                      <th className="py-2.5 px-3">Room</th>
                      <th className="py-2.5 px-3">Guest Name</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredHistoryOrders.map((o) => {
                      const displayHotel = getHotelDisplayName(o);
                      const displaySlot = o.delivery_time || o.delivery_slot || o.slot || '08:00';
                      const displayRoom = o.room_number || o.room || '-';
                      const displayGuest = o.guest_name || o.name || '-';
                      const displayEmail = o.contact_email || o.email || '';
                      const displayQty = o.quantity || o.qty || 1;
                      const displayTotal = o.total_price || o.price || (displayQty * 1800);
                      const createdDateStr = new Date(o.created_at).toLocaleString('ja-JP', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      const currentStatus = o.status === 'pending' ? 'order_received' : (o.status === 'cooking' ? 'ready_kitchen' : o.status);

                      return (
                        <tr key={o.id} className="hover:bg-stone-50 transition">
                          <td className="py-3 px-3 font-mono font-bold text-stone-400 text-[11px]">#{o.id}</td>
                          <td className="py-3 px-3 font-mono text-[11px] text-stone-500 whitespace-nowrap">{createdDateStr}</td>
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
            3. CALENDAR TAB
            ========================================= */}
        {activeTab === 'calendar' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-stone-900">Business Calendar</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Click any date to toggle between OPEN and CLOSED (Auto-saves).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentYearMonth(prev => {
                    const d = new Date(prev.year, prev.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-bold hover:bg-stone-100 cursor-pointer"
                >
                  ◀ Prev
                </button>
                <span className="text-sm font-extrabold text-stone-800 min-w-32 text-center">
                  {MONTH_NAMES[currentYearMonth.month]} {currentYearMonth.year}
                </span>
                <button
                  onClick={() => setCurrentYearMonth(prev => {
                    const d = new Date(prev.year, prev.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                  className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-bold hover:bg-stone-100 cursor-pointer"
                >
                  Next ▶
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold pb-2 border-b border-stone-100">
                <span className="text-rose-600">SUN</span>
                <span className="text-stone-600">MON</span>
                <span className="text-stone-600">TUE</span>
                <span className="text-stone-600">WED</span>
                <span className="text-stone-600">THU</span>
                <span className="text-stone-600">FRI</span>
                <span className="text-blue-600">SAT</span>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((dateStr, idx) => {
                  if (!dateStr) {
                    return <div key={`empty-${idx}`} className="h-20 rounded-xl bg-stone-50/50 border border-transparent"></div>;
                  }

                  const dayNum = parseInt(dateStr.split('-')[2], 10);
                  const isOpen = calendarData[dateStr] ? calendarData[dateStr].is_open : true;
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
                          <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-300 inline-block tracking-wide">
                            ● OPEN
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold text-rose-700 bg-rose-100/90 px-2.5 py-0.5 rounded-full border border-rose-300 inline-block tracking-wide">
                            ✕ CLOSED
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end gap-5 pt-3 border-t border-stone-100 text-[11px] text-stone-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="font-medium text-stone-700">OPEN (Accepts orders)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  <span className="font-medium text-stone-700">CLOSED (Blocked)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================
            4. SETTINGS TAB
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

            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                1. Store Master Status
              </h3>
              <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                <div>
                  <div className="text-xs font-bold text-stone-900">Accept New Orders (Instant Cutoff)</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">Toggle OFF to immediately close order intake for all time slots.</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" name="is_open" checked={settings.is_open} onChange={handleSettingChange} className="sr-only peer" />
                  <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                2. Price & Taxes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Item Price (/box)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                    <input type="number" name="item_price" value={settings.item_price} onChange={handleSettingChange} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Delivery Fee (/order)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                    <input type="number" name="delivery_fee" value={settings.delivery_fee} onChange={handleSettingChange} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Tax Amount (/box)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                    <input type="number" name="tax_amount" value={settings.tax_amount} onChange={handleSettingChange} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                3. Delivery Coverage
              </h3>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[11px] font-bold text-stone-600">Delivery Radius (km)</label>
                  <span className="font-extrabold text-sm text-stone-900">{Number(settings.delivery_radius_km).toFixed(1)} km</span>
                </div>
                <input type="range" name="delivery_radius_km" min="1.0" max="5.0" step="0.1" value={settings.delivery_radius_km} onChange={handleSettingChange} className="w-full accent-stone-900" />
                <p className="text-[10px] text-stone-400 mt-1">※Adjusting this value filters available hotels on customer order page automatically.</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                4. Time Slot Capacity & Control
              </h3>
              <p className="text-[10px] text-stone-400">Toggle OFF to instantly mark specific slots as SOLD OUT.</p>
              
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