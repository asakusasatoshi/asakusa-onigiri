'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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

export interface SlotConfig {
  time: string;
  limit: number;
  is_active: boolean;
}

interface CalendarDay {
  date: string;
  is_open: boolean;
  custom_slots?: SlotConfig[] | null;
  target_stock?: number | null;
  custom_cutoff_time?: string | null;
  custom_acceptance_start?: string | null;
  custom_acceptance_end?: string | null;
  note?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DEFAULT_SLOTS: SlotConfig[] = [
  { time: '07:00', limit: 10, is_active: true },
  { time: '08:00', limit: 15, is_active: true },
  { time: '09:00', limit: 15, is_active: true },
  { time: '10:00', limit: 10, is_active: true },
];

const TIME_OPTIONS = [
  '06:00', '07:00', '08:00', '09:00', '10:00',
  '11:00', '12:00', '13:00', '14:00', '15:00',
  '16:00', '17:00', '18:00', '19:00', '20:00',
  '21:00', '22:00'
];

function getBusinessDateStr(date: Date = new Date(), cutoffHour = 18): string {
  const d = new Date(date.getTime());
  if (d.getHours() < cutoffHour) {
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

  // === Operations Filter ===
  const [opStatusFilter, setOpStatusFilter] = useState<'active' | 'all' | 'delivered'>('active');
  const [opSlotFilter, setOpSlotFilter] = useState<string>('all');

  // === History Filter ===
  const [historyPeriod, setHistoryPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');
  const [historySearch, setHistorySearch] = useState('');

  // === Calendar State ===
  const [currentYearMonth, setCurrentYearMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [calendarData, setCalendarData] = useState<Record<string, CalendarDay>>({});
  
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  const [modalIsOpen, setModalIsOpen] = useState(true);
  const [modalUseCustomSlots, setModalUseCustomSlots] = useState(false);
  const [modalSlots, setModalSlots] = useState<SlotConfig[]>(DEFAULT_SLOTS);
  const [modalTargetStock, setModalTargetStock] = useState<number | ''>('');
  
  const [modalUseCustomHours, setModalUseCustomHours] = useState(false);
  const [modalCutoffTime, setModalCutoffTime] = useState('18:00');
  const [modalAcceptStart, setModalAcceptStart] = useState('07:00');
  const [modalAcceptEnd, setModalAcceptEnd] = useState('22:00');

  // === Settings State ===
  const [settings, setSettings] = useState({
    item_price: 1500,
    delivery_fee: 150,
    vat_rate: 10,
    delivery_radius_km: 2.5,
    is_open: true,
    default_target_stock: 10,
    delivery_slots: DEFAULT_SLOTS,
    business_cutoff_time: '18:00',
    order_acceptance_start: '07:00',
    order_acceptance_end: '22:00',
  });
  const [isSaving, setIsSaving] = useState(false);
  
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState('');

  const calculatedVatAmount = useMemo(() => {
    return Math.round(settings.item_price * (settings.vat_rate / 100));
  }, [settings.item_price, settings.vat_rate]);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const fetchMasterSettings = useCallback(async () => {
    let currentSettings = {
      item_price: 1500,
      delivery_fee: 150,
      vat_rate: 10,
      delivery_radius_km: 2.5,
      is_open: true,
      default_target_stock: 10,
      delivery_slots: DEFAULT_SLOTS,
      business_cutoff_time: '18:00',
      order_acceptance_start: '07:00',
      order_acceptance_end: '22:00',
    };

    const { data: setData } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 'default_settings')
      .maybeSingle();

    if (setData) {
      let parsedSlots = DEFAULT_SLOTS;
      if (Array.isArray(setData.delivery_slots) && setData.delivery_slots.length > 0) {
        parsedSlots = setData.delivery_slots;
      } else if (typeof setData.delivery_slots === 'string') {
        try {
          parsedSlots = JSON.parse(setData.delivery_slots);
        } catch {
          parsedSlots = DEFAULT_SLOTS;
        }
      }

      let derivedVatRate = 10;
      if (setData.vat_rate != null) {
        derivedVatRate = setData.vat_rate;
      } else if (setData.tax_amount != null && setData.item_price) {
        derivedVatRate = Math.round((setData.tax_amount / setData.item_price) * 100);
      }

      currentSettings = {
        item_price: setData.item_price ?? 1500,
        delivery_fee: setData.delivery_fee ?? 150,
        vat_rate: derivedVatRate,
        delivery_radius_km: setData.delivery_radius_km ?? 2.5,
        is_open: setData.is_open ?? true,
        default_target_stock: setData.default_target_stock ?? 10,
        delivery_slots: parsedSlots,
        business_cutoff_time: setData.business_cutoff_time ?? '18:00',
        order_acceptance_start: setData.order_acceptance_start ?? '07:00',
        order_acceptance_end: setData.order_acceptance_end ?? '22:00',
      };

      if (activeTabRef.current !== 'settings') {
        setSettings(currentSettings);
      }
    }

    const { data: calData } = await supabase.from('store_calendar').select('*');
    const calMap: Record<string, CalendarDay> = {};
    if (calData) {
      calData.forEach((row: CalendarDay) => {
        let customSlots = row.custom_slots;
        if (typeof customSlots === 'string') {
          try {
            customSlots = JSON.parse(customSlots);
          } catch {
            customSlots = null;
          }
        }
        calMap[row.date] = { ...row, custom_slots: customSlots };
      });
      setCalendarData(calMap);
    }

    const cutoffHour = parseInt((currentSettings.business_cutoff_time || '18:00').split(':')[0], 10) || 18;
    const currentBizDate = getBusinessDateStr(new Date(), cutoffHour);

    return { currentSettings, calMap, currentBizDate };
  }, []);

  const fetchLiveOperationsData = useCallback(async (forcedFull = false) => {
    const masterInfo = await fetchMasterSettings();
    const currentBizDate = masterInfo ? masterInfo.currentBizDate : getBusinessDateStr();

    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .order('id', { ascending: false });
    if (orderData && !orderErr) setOrders(orderData as Order[]);

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

    setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setIsLoading(false);
  }, [fetchMasterSettings]);

  useEffect(() => {
    fetchLiveOperationsData(true);
    const interval = setInterval(() => {
      fetchLiveOperationsData(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchLiveOperationsData]);

  const cutoffHour = parseInt((settings.business_cutoff_time || '18:00').split(':')[0], 10) || 18;
  const todayBizDate = getBusinessDateStr(new Date(), cutoffHour);
  const todayCalendar = calendarData[todayBizDate];

  const effectiveTodaySlots: SlotConfig[] = useMemo(() => {
    if (todayCalendar && Array.isArray(todayCalendar.custom_slots) && todayCalendar.custom_slots.length > 0) {
      return todayCalendar.custom_slots;
    }
    return settings.delivery_slots && settings.delivery_slots.length > 0
      ? settings.delivery_slots
      : DEFAULT_SLOTS;
  }, [todayCalendar, settings.delivery_slots]);

  const todayOperationsOrders = useMemo(() => {
    return orders.filter((o) => {
      const orderBizDate = getBusinessDateStr(new Date(o.created_at), cutoffHour);
      return orderBizDate === todayBizDate;
    });
  }, [orders, todayBizDate, cutoffHour]);

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
    const stats: Record<string, { boxes: number; orders: number }> = {};
    effectiveTodaySlots.forEach((s) => {
      stats[s.time] = { boxes: 0, orders: 0 };
    });
    activeOrders.forEach((o) => {
      const slot = o.delivery_time || o.delivery_slot || o.slot || '08:00';
      if (!stats[slot]) stats[slot] = { boxes: 0, orders: 0 };
      stats[slot].boxes += o.quantity || o.qty || 1;
      stats[slot].orders += 1;
    });
    return stats;
  }, [activeOrders, effectiveTodaySlots]);

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
        if (slotA !== slotB) return slotA.localeCompare(slotB);
        return a.id - b.id;
      });
  }, [todayOperationsOrders, opStatusFilter, opSlotFilter]);

  const filteredHistoryOrders = useMemo(() => {
    const now = new Date();
    const todayStr = getBusinessDateStr(now, cutoffHour);
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = getBusinessDateStr(yesterdayDate, cutoffHour);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return orders.filter((o) => {
      const orderDate = new Date(o.created_at);
      const orderBizDate = getBusinessDateStr(orderDate, cutoffHour);

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
  }, [orders, historyPeriod, historySearch, cutoffHour]);

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

  const handleQuickToggleSlot = async (slotTime: string) => {
    const targetSlot = effectiveTodaySlots.find((s) => s.time === slotTime);
    const currentActive = targetSlot ? targetSlot.is_active : true;
    const nextActive = !currentActive;

    if (!nextActive) {
      const confirmed = window.confirm(
        `[CONFIRMATION / 確認]\n\nStop accepting orders for ${slotTime} delivery slot?\nThis slot will immediately show as SOLD OUT on the order page.\n\n${slotTime} 枠の注文受付を停止（SOLD OUT）にしますか？`
      );
      if (!confirmed) return;
    }

    const updatedSlots = effectiveTodaySlots.map((s) => (s.time === slotTime ? { ...s, is_active: nextActive } : s));

    if (todayCalendar && todayCalendar.custom_slots && todayCalendar.custom_slots.length > 0) {
      setCalendarData((prev) => ({
        ...prev,
        [todayBizDate]: { ...prev[todayBizDate], custom_slots: updatedSlots },
      }));
      await supabase.from('store_calendar').upsert({
        date: todayBizDate,
        is_open: todayCalendar.is_open,
        custom_slots: updatedSlots,
        updated_at: new Date().toISOString(),
      });
    } else {
      setSettings((prev) => ({ ...prev, delivery_slots: updatedSlots }));
      await supabase.from('settings').update({ delivery_slots: updatedSlots, updated_at: new Date().toISOString() }).eq('id', 'default_settings');
    }
  };

  const handleUpdateStatus = async (orderId: number, nextStatus: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId);
    if (error) {
      alert('Failed to update status: ' + error.message);
      fetchLiveOperationsData(true);
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

  const handleOpenCalendarModal = (dateStr: string) => {
    setSelectedCalDate(dateStr);
    const existing = calendarData[dateStr];
    if (existing) {
      setModalIsOpen(existing.is_open);
      if (existing.custom_slots && existing.custom_slots.length > 0) {
        setModalUseCustomSlots(true);
        setModalSlots(JSON.parse(JSON.stringify(existing.custom_slots)));
      } else {
        setModalUseCustomSlots(false);
        setModalSlots(JSON.parse(JSON.stringify(settings.delivery_slots)));
      }
      setModalTargetStock(existing.target_stock != null ? existing.target_stock : '');

      if (existing.custom_cutoff_time || existing.custom_acceptance_start || existing.custom_acceptance_end) {
        setModalUseCustomHours(true);
        setModalCutoffTime(existing.custom_cutoff_time || settings.business_cutoff_time);
        setModalAcceptStart(existing.custom_acceptance_start || settings.order_acceptance_start);
        setModalAcceptEnd(existing.custom_acceptance_end || settings.order_acceptance_end);
      } else {
        setModalUseCustomHours(false);
        setModalCutoffTime(settings.business_cutoff_time);
        setModalAcceptStart(settings.order_acceptance_start);
        setModalAcceptEnd(settings.order_acceptance_end);
      }
    } else {
      setModalIsOpen(true);
      setModalUseCustomSlots(false);
      setModalSlots(JSON.parse(JSON.stringify(settings.delivery_slots)));
      setModalTargetStock('');
      setModalUseCustomHours(false);
      setModalCutoffTime(settings.business_cutoff_time);
      setModalAcceptStart(settings.order_acceptance_start);
      setModalAcceptEnd(settings.order_acceptance_end);
    }
  };

  const handleSaveCalendarModal = async () => {
    if (!selectedCalDate) return;
    const finalCustomSlots = modalUseCustomSlots ? modalSlots : null;
    const finalTargetStock = modalTargetStock === '' ? null : Number(modalTargetStock);
    const finalCutoff = modalUseCustomHours ? modalCutoffTime : null;
    const finalStart = modalUseCustomHours ? modalAcceptStart : null;
    const finalEnd = modalUseCustomHours ? modalAcceptEnd : null;

    setCalendarData((prev) => ({
      ...prev,
      [selectedCalDate]: {
        date: selectedCalDate,
        is_open: modalIsOpen,
        custom_slots: finalCustomSlots,
        target_stock: finalTargetStock,
        custom_cutoff_time: finalCutoff,
        custom_acceptance_start: finalStart,
        custom_acceptance_end: finalEnd,
      },
    }));

    await supabase.from('store_calendar').upsert({
      date: selectedCalDate,
      is_open: modalIsOpen,
      custom_slots: finalCustomSlots,
      target_stock: finalTargetStock,
      custom_cutoff_time: finalCutoff,
      custom_acceptance_start: finalStart,
      custom_acceptance_end: finalEnd,
      updated_at: new Date().toISOString(),
    });

    setSelectedCalDate(null);
    fetchLiveOperationsData(true);
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

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveErrorMessage('');
    const { error } = await supabase
      .from('settings')
      .update({
        item_price: settings.item_price,
        delivery_fee: settings.delivery_fee,
        tax_amount: calculatedVatAmount,
        delivery_radius_km: settings.delivery_radius_km,
        is_open: settings.is_open,
        default_target_stock: settings.default_target_stock,
        delivery_slots: settings.delivery_slots,
        business_cutoff_time: settings.business_cutoff_time,
        order_acceptance_start: settings.order_acceptance_start,
        order_acceptance_end: settings.order_acceptance_end,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default_settings');

    setIsSaving(false);
    if (error) {
      setSaveErrorMessage('Error saving settings: ' + error.message);
    } else {
      setShowSuccessModal(true);
      fetchLiveOperationsData(true);
    }
  };

  const handleAddDefaultSlot = () => {
    setSettings((prev) => ({
      ...prev,
      delivery_slots: [...prev.delivery_slots, { time: '11:00', limit: 10, is_active: true }],
    }));
  };

  const handleUpdateDefaultSlot = (index: number, field: keyof SlotConfig, val: any) => {
    setSettings((prev) => {
      const updated = [...prev.delivery_slots];
      updated[index] = { ...updated[index], [field]: val };
      return { ...prev, delivery_slots: updated };
    });
  };

  const handleDeleteDefaultSlot = (index: number) => {
    if (settings.delivery_slots.length <= 1) {
      alert('You must keep at least 1 delivery slot.');
      return;
    }
    setSettings((prev) => ({
      ...prev,
      delivery_slots: prev.delivery_slots.filter((_, i) => i !== index),
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

  const isCalendarOpenToday = todayCalendar ? todayCalendar.is_open : true;
  const isMasterOpen = settings.is_open && isCalendarOpenToday;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f5f5f4] text-stone-500 font-medium">Loading Operations Data...</div>;
  }

  return (
    <>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
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
                onClick={() => fetchLiveOperationsData(true)}
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
              1. OPERATIONS TAB
              ========================================= */}
          {activeTab === 'operations' && (
            <div className="space-y-6">
              
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
                      <span>Store Restock (Target: {inventory.target_stock}):</span>
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
                    Takeout Rev: <span className="font-bold text-stone-900">¥{(inventory.sold_count * (settings.item_price + calculatedVatAmount)).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 左側：スロット状況 */}
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

                    <div className={`grid gap-2 ${
                      effectiveTodaySlots.length <= 3 ? 'grid-cols-3' :
                      effectiveTodaySlots.length === 4 ? 'grid-cols-4' :
                      effectiveTodaySlots.length === 5 ? 'grid-cols-5' : 'grid-cols-3 sm:grid-cols-4'
                    }`}>
                      {effectiveTodaySlots.map((slot) => {
                        const booked = slotStats[slot.time]?.boxes || 0;
                        const isSoldOut = !slot.is_active || booked >= slot.limit || !isMasterOpen;

                        return (
                          <div key={slot.time} className={`p-2.5 rounded-xl border text-center transition ${
                            isSoldOut ? 'bg-stone-50/80 border-stone-200 opacity-70' : 'bg-stone-50 border-stone-200'
                          }`}>
                            <span className="text-[11px] font-bold text-stone-600 block">{slot.time}</span>
                            <div className="text-lg font-extrabold text-stone-900 my-0.5">
                              {booked} <span className="text-[9px] font-normal text-stone-400">/ {slot.limit}</span>
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
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">
                        LIVE SLOT CONTROL (QUICK TOGGLE)
                      </span>
                      {todayCalendar?.custom_slots && (
                        <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          ★ Custom Day Slots Active
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {effectiveTodaySlots.map((slot) => {
                        const booked = slotStats[slot.time]?.boxes || 0;
                        const remaining = Math.max(0, slot.limit - booked);
                        const isSoldOut = !slot.is_active || remaining <= 0 || !isMasterOpen;

                        return (
                          <div
                            key={`row-${slot.time}`}
                            className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs transition ${
                              isSoldOut ? 'bg-rose-50/40 border-rose-200' : 'bg-stone-50 border-stone-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <button
                                onClick={() => handleQuickToggleSlot(slot.time)}
                                className={`w-7 h-4 rounded-full transition relative cursor-pointer ${
                                  slot.is_active ? 'bg-emerald-600' : 'bg-stone-300'
                                }`}
                                title={slot.is_active ? 'Click to mark as SOLD OUT (Confirm required)' : 'Click to reopen slot'}
                              >
                                <div className={`w-3 h-3 rounded-full bg-white transition absolute top-0.5 ${
                                  slot.is_active ? 'right-0.5' : 'left-0.5'
                                }`}></div>
                              </button>
                              <span className="font-bold text-stone-800 text-[11px]">{slot.time} Slot</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-stone-500 font-mono">
                                {booked}/{slot.limit} bxs
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
                    <span className="text-[11px] text-stone-500 font-medium">
                      Target: <span className="font-extrabold text-stone-900">{inventory.target_stock}</span> boxes
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

              {/* 下段：デリバリー受注一覧テーブル（Order Time列追加済み） */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
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

                    <div className="flex flex-wrap bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-[11px]">
                      <button
                        onClick={() => setOpSlotFilter('all')}
                        className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${
                          opSlotFilter === 'all' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                        }`}
                      >
                        All Slots
                      </button>
                      {effectiveTodaySlots.map((slot) => (
                        <button
                          key={slot.time}
                          onClick={() => setOpSlotFilter(slot.time)}
                          className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${
                            opSlotFilter === slot.time ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'
                          }`}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

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
                          <th className="py-2.5 px-3">Order Time (注文日時)</th>
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

                          // 注文日時
                          const orderTimeStr = new Date(o.created_at).toLocaleString('ja-JP', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          });

                          return (
                            <tr key={o.id} className="hover:bg-stone-50 transition">
                              <td className="py-3 px-3 font-extrabold text-stone-900 bg-stone-50/50">{displaySlot}</td>
                              <td className="py-3 px-3 font-mono text-[11px] font-bold text-stone-600 whitespace-nowrap">{orderTimeStr}</td>
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
              2. ORDER HISTORY TAB
              ========================================= */}
          {activeTab === 'history' && (
            <div className="space-y-6">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">Total Delivery Revenue</span>
                  <div className="text-2xl font-extrabold text-stone-900 mt-1">¥{historyTotalRevenue.toLocaleString()}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">Total Boxes Delivered</span>
                  <div className="text-2xl font-extrabold text-stone-900 mt-1">{historyTotalBoxes} <span className="text-xs font-normal text-stone-500">boxes</span></div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">Total Orders Placed</span>
                  <div className="text-2xl font-extrabold text-stone-900 mt-1">{filteredHistoryOrders.length} <span className="text-xs font-normal text-stone-500">orders</span></div>
                </div>
              </div>

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
                            <td className="py-3 px-3">{renderStatusBadge(currentStatus)}</td>
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
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-stone-900">Business Calendar</h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Click any date to configure day status, custom delivery slots & target inventory.
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
                      return <div key={`empty-${idx}`} className="h-24 rounded-2xl bg-stone-50/50 border border-transparent"></div>;
                    }

                    const dayNum = parseInt(dateStr.split('-')[2], 10);
                    const calEntry = calendarData[dateStr];
                    const isOpen = calEntry ? calEntry.is_open : true;
                    const hasCustomSlots = calEntry?.custom_slots && calEntry.custom_slots.length > 0;
                    const hasCustomHours = calEntry?.custom_cutoff_time || calEntry?.custom_acceptance_start;
                    const slotCount = hasCustomSlots ? calEntry.custom_slots!.length : settings.delivery_slots.length;
                    const dayTarget = calEntry?.target_stock != null ? calEntry.target_stock : settings.default_target_stock;
                    const isToday = dateStr === todayBizDate;

                    return (
                      <button
                        key={dateStr}
                        onClick={() => handleOpenCalendarModal(dateStr)}
                        className={`h-24 p-2 rounded-2xl border transition text-left flex flex-col justify-between cursor-pointer active:scale-95 ${
                          isOpen
                            ? 'bg-white hover:bg-emerald-50/50 border-stone-200 hover:border-emerald-300'
                            : 'bg-rose-50/70 hover:bg-rose-100/80 border-rose-200'
                        } ${isToday ? 'ring-2 ring-stone-900 shadow-md' : ''}`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className={`text-xs font-bold ${isToday ? 'text-stone-900 underline' : 'text-stone-700'}`}>
                            {dayNum}
                          </span>
                          {isToday && <span className="text-[9px] bg-stone-900 text-white px-1.5 py-0.2 rounded font-bold">Today</span>}
                        </div>

                        <div className="w-full space-y-1 text-center">
                          {isOpen ? (
                            <>
                              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border inline-block tracking-wide ${
                                hasCustomSlots || hasCustomHours
                                  ? 'bg-purple-100 text-purple-800 border-purple-300' 
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              }`}>
                                ● {slotCount} slots {(hasCustomSlots || hasCustomHours) ? '★' : ''}
                              </span>
                              <span className="text-[9px] text-stone-400 block">Target: {dayTarget}</span>
                            </>
                          ) : (
                            <span className="text-[10px] font-extrabold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded-full border border-rose-300 inline-block tracking-wide">
                              ✕ CLOSED
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-stone-100 text-[11px] text-stone-500">
                  <span className="text-stone-400">★ indicates date with custom slots or hours</span>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span>Standard Open</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                      <span>Custom Settings</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                      <span>Closed</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* モーダル */}
              {selectedCalDate && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
                    
                    <div className="flex justify-between items-start border-b border-stone-100 pb-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-stone-400">Date Schedule Configuration</span>
                        <h3 className="text-lg font-bold text-stone-900 mt-0.5">{selectedCalDate}</h3>
                      </div>
                      <button onClick={() => setSelectedCalDate(null)} className="text-stone-400 hover:text-stone-700 text-lg font-bold">✕</button>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-2xl border border-stone-200">
                      <div>
                        <div className="text-xs font-bold text-stone-900">Day Master Status</div>
                        <div className="text-[11px] text-stone-500">Set whether this date accepts orders.</div>
                      </div>
                      <button
                        onClick={() => setModalIsOpen(!modalIsOpen)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          modalIsOpen ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-700 border-rose-300'
                        }`}
                      >
                        {modalIsOpen ? '● OPEN' : '✕ CLOSED'}
                      </button>
                    </div>

                    {modalIsOpen && (
                      <>
                        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                          <label className="text-xs font-bold text-stone-800 block">
                            Target Shelf Stock for this Day (店頭目標在庫数)
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              placeholder={`Default (${settings.default_target_stock})`}
                              value={modalTargetStock}
                              onChange={(e) => setModalTargetStock(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-32 px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900 text-center"
                            />
                            <span className="text-xs text-stone-500">boxes</span>
                            {modalTargetStock !== '' && (
                              <button onClick={() => setModalTargetStock('')} className="text-[11px] text-stone-400 underline hover:text-stone-700">
                                Reset to Default ({settings.default_target_stock})
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 個別ビジネス時間・データ切替時刻設定 */}
                        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-stone-800">Acceptance Hours & Cutoff Time</span>
                            <div className="flex gap-1 text-[10px] font-bold bg-stone-200 p-0.5 rounded-lg">
                              <button
                                onClick={() => setModalUseCustomHours(false)}
                                className={`px-2 py-1 rounded-md transition ${!modalUseCustomHours ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}`}
                              >
                                Default
                              </button>
                              <button
                                onClick={() => setModalUseCustomHours(true)}
                                className={`px-2 py-1 rounded-md transition ${modalUseCustomHours ? 'bg-white text-purple-900 font-extrabold shadow-xs' : 'text-stone-500'}`}
                              >
                                ★ Custom Hours
                              </button>
                            </div>
                          </div>

                          {modalUseCustomHours ? (
                            <div className="space-y-3 pt-2 border-t border-stone-200 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-stone-600 font-medium">Business Cutoff (データ切替時刻):</span>
                                <select
                                  value={modalCutoffTime}
                                  onChange={(e) => setModalCutoffTime(e.target.value)}
                                  className="w-28 px-2 py-1.5 bg-white border border-stone-300 rounded-lg font-bold text-stone-800 outline-none cursor-pointer"
                                >
                                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-stone-600 font-medium">Order Acceptance Start (受付開始):</span>
                                <select
                                  value={modalAcceptStart}
                                  onChange={(e) => setModalAcceptStart(e.target.value)}
                                  className="w-28 px-2 py-1.5 bg-white border border-stone-300 rounded-lg font-bold text-stone-800 outline-none cursor-pointer"
                                >
                                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-stone-600 font-medium">Order Acceptance End (受付終了):</span>
                                <select
                                  value={modalAcceptEnd}
                                  onChange={(e) => setModalAcceptEnd(e.target.value)}
                                  className="w-28 px-2 py-1.5 bg-white border border-stone-300 rounded-lg font-bold text-stone-800 outline-none cursor-pointer"
                                >
                                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-stone-400 p-2 bg-white rounded-xl border border-dashed border-stone-200 text-center">
                              Using default hours (Cutoff: {settings.business_cutoff_time}, Acceptance: {settings.order_acceptance_start} - {settings.order_acceptance_end}).
                            </div>
                          )}
                        </div>

                        {/* 個別スロット設定 */}
                        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-stone-800">Delivery Slots for this Day</span>
                            <div className="flex gap-1 text-[10px] font-bold bg-stone-200 p-0.5 rounded-lg">
                              <button
                                onClick={() => {
                                  setModalUseCustomSlots(false);
                                  setModalSlots(JSON.parse(JSON.stringify(settings.delivery_slots)));
                                }}
                                className={`px-2 py-1 rounded-md transition ${!modalUseCustomSlots ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}`}
                              >
                                Default ({settings.delivery_slots.length} slots)
                              </button>
                              <button
                                onClick={() => setModalUseCustomSlots(true)}
                                className={`px-2 py-1 rounded-md transition ${modalUseCustomSlots ? 'bg-white text-purple-900 font-extrabold shadow-xs' : 'text-stone-500'}`}
                              >
                                ★ Custom Slots
                              </button>
                            </div>
                          </div>

                          {modalUseCustomSlots ? (
                            <div className="space-y-2 pt-2 border-t border-stone-200">
                              {modalSlots.map((slot, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-stone-200 text-xs">
                                  <select
                                    value={slot.time}
                                    onChange={(e) => {
                                      const next = [...modalSlots];
                                      next[idx].time = e.target.value;
                                      setModalSlots(next);
                                    }}
                                    className="w-24 px-2 py-1.5 border border-stone-300 rounded-lg text-xs font-bold bg-stone-50 text-stone-800 outline-none focus:border-stone-900 cursor-pointer"
                                  >
                                    {TIME_OPTIONS.map((t) => (
                                      <option key={t} value={t}>{t}</option>
                                    ))}
                                    {!TIME_OPTIONS.includes(slot.time) && (
                                      <option key={slot.time} value={slot.time}>{slot.time}</option>
                                    )}
                                  </select>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-stone-400">Max:</span>
                                    <input
                                      type="number"
                                      value={slot.limit}
                                      onChange={(e) => {
                                        const next = [...modalSlots];
                                        next[idx].limit = Number(e.target.value);
                                        setModalSlots(next);
                                      }}
                                      className="w-14 px-2 py-1 border border-stone-300 rounded-lg text-xs font-bold text-center outline-none focus:border-stone-900"
                                    />
                                    <span className="text-[10px] text-stone-400">bxs</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      const next = [...modalSlots];
                                      next[idx].is_active = !next[idx].is_active;
                                      setModalSlots(next);
                                    }}
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold border ${slot.is_active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-stone-100 text-stone-400 border-stone-200'}`}
                                  >
                                    {slot.is_active ? 'Active' : 'Off'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (modalSlots.length <= 1) return;
                                      setModalSlots(modalSlots.filter((_, i) => i !== idx));
                                    }}
                                    className="text-stone-300 hover:text-rose-600 font-bold ml-auto px-1"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => setModalSlots([...modalSlots, { time: '11:00', limit: 10, is_active: true }])}
                                className="w-full py-2 bg-stone-200/80 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold transition"
                              >
                                ＋ Add Custom Slot
                              </button>
                            </div>
                          ) : (
                            <div className="text-[11px] text-stone-400 p-2 bg-white rounded-xl border border-dashed border-stone-200 text-center">
                              This date uses the default {settings.delivery_slots.length} slots configured in Settings tab.
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => setSelectedCalDate(null)}
                        className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveCalendarModal}
                        className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
                      >
                        Save Date Settings
                      </button>
                    </div>

                  </div>
                </div>
              )}

            </div>
          )}

          {/* =========================================
              4. SETTINGS TAB
              ========================================= */}
          {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto space-y-6 pb-28">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-stone-900">Store Settings & Master Slots</h2>
                  <p className="text-xs text-stone-500 mt-0.5">Configure system defaults and delivery capacities.</p>
                </div>
              </div>
              
              {saveErrorMessage && (
                <div className="p-3 rounded-xl text-xs font-bold text-center bg-rose-100 text-rose-700">
                  {saveErrorMessage}
                </div>
              )}

              {/* 1. 全体営業ステータス */}
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
                    <input
                      type="checkbox"
                      checked={settings.is_open}
                      onChange={(e) => setSettings((prev) => ({ ...prev, is_open: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              {/* 1.5. 営業時間・データ切替時刻の設定 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                  1.5. Default Business Hours & Cutoff
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Business Cutoff (データ切替時刻)</label>
                    <select
                      value={settings.business_cutoff_time}
                      onChange={(e) => setSettings((prev) => ({ ...prev, business_cutoff_time: e.target.value }))}
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-none cursor-pointer"
                    >
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Order Acceptance Start (受付開始)</label>
                    <select
                      value={settings.order_acceptance_start}
                      onChange={(e) => setSettings((prev) => ({ ...prev, order_acceptance_start: e.target.value }))}
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-none cursor-pointer"
                    >
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Order Acceptance End (受付終了)</label>
                    <select
                      value={settings.order_acceptance_end}
                      onChange={(e) => setSettings((prev) => ({ ...prev, order_acceptance_end: e.target.value }))}
                      className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-none cursor-pointer"
                    >
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-stone-400">※「Business Cutoff」を過ぎると、自動的に翌営業日の売上・オーダー集計に切り替わります。</p>
              </div>

              {/* 2. 店頭標準目標在庫 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                  2. Store Default Target Inventory
                </h3>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-stone-700 block">Default Target Shelf Stock (/day)</label>
                    <p className="text-[10px] text-stone-400 mt-0.5">Baseline takeaway stock used to calculate Kitchen Suggestion.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.default_target_stock}
                      onChange={(e) => setSettings((prev) => ({ ...prev, default_target_stock: Number(e.target.value) }))}
                      className="w-20 px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900 text-center"
                    />
                    <span className="text-xs text-stone-500 font-medium">boxes</span>
                  </div>
                </div>
              </div>

              {/* 3. 料金 & VAT設定 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                  3. Price & VAT Settings
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Item Price (/box)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                      <input
                        type="number"
                        value={settings.item_price}
                        onChange={(e) => setSettings((prev) => ({ ...prev, item_price: Number(e.target.value) }))}
                        className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Delivery Fee (/order)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                      <input
                        type="number"
                        value={settings.delivery_fee}
                        onChange={(e) => setSettings((prev) => ({ ...prev, delivery_fee: Number(e.target.value) }))}
                        className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">VAT Rate (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={settings.vat_rate}
                        onChange={(e) => setSettings((prev) => ({ ...prev, vat_rate: Number(e.target.value) }))}
                        className="w-full pl-3 pr-8 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs font-bold">%</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-stone-700 block">Calculated VAT Amount (自動算出された消費税額)</span>
                    <span className="text-[10px] text-stone-400">Based on Item Price (¥{settings.item_price}) × VAT Rate ({settings.vat_rate}%)</span>
                  </div>
                  <span className="text-sm font-extrabold text-stone-900 font-mono">¥{calculatedVatAmount.toLocaleString()} /box</span>
                </div>
              </div>

              {/* 4. 配達エリア設定 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">
                  4. Delivery Coverage
                </h3>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[11px] font-bold text-stone-600">Delivery Radius (km)</label>
                    <span className="font-extrabold text-sm text-stone-900">{Number(settings.delivery_radius_km).toFixed(1)} km</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="5.0"
                    step="0.1"
                    value={settings.delivery_radius_km}
                    onChange={(e) => setSettings((prev) => ({ ...prev, delivery_radius_km: Number(e.target.value) }))}
                    className="w-full accent-stone-900"
                  />
                  <p className="text-[10px] text-stone-400 mt-1">※Adjusting this value filters available hotels on customer order page automatically.</p>
                </div>
              </div>

              {/* 5. 動的デリバリースロット基本設定 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <div className="flex justify-between items-center border-b border-stone-100 pb-2">
                  <div>
                    <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                      5. Default Delivery Slots & Capacity
                    </h3>
                    <p className="text-[10px] text-stone-400 mt-0.5">Select delivery time slots easily without typing.</p>
                  </div>
                  <button
                    onClick={handleAddDefaultSlot}
                    className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-800 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    ＋ Add Slot
                  </button>
                </div>
                
                <div className="space-y-2.5">
                  {settings.delivery_slots.map((slot, index) => (
                    <div key={index} className={`flex items-center justify-between p-3 rounded-2xl border transition ${slot.is_active ? 'bg-stone-50 border-stone-200' : 'bg-rose-50/40 border-rose-200'}`}>
                      
                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={slot.is_active}
                            onChange={(e) => handleUpdateDefaultSlot(index, 'is_active', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-stone-500">Slot Time:</span>
                          <select
                            value={slot.time}
                            onChange={(e) => handleUpdateDefaultSlot(index, 'time', e.target.value)}
                            className="w-24 px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-none focus:border-stone-900 cursor-pointer"
                          >
                            {TIME_OPTIONS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                            {!TIME_OPTIONS.includes(slot.time) && (
                              <option key={slot.time} value={slot.time}>{slot.time}</option>
                            )}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-stone-500">Max Limit:</span>
                          <input
                            type="number"
                            value={slot.limit}
                            onChange={(e) => handleUpdateDefaultSlot(index, 'limit', Number(e.target.value))}
                            className="w-16 px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none focus:border-stone-900"
                          />
                          <span className="text-[10px] text-stone-400">boxes</span>
                        </div>

                        <button
                          onClick={() => handleDeleteDefaultSlot(index)}
                          className="text-stone-400 hover:text-rose-600 transition text-sm p-1 cursor-pointer"
                          title="Delete this slot"
                        >
                          🗑️
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              </div>

              {/* --- 【フロート保存バー】 --- */}
              <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-lg py-3.5 px-6 z-50">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-rose-600 font-bold">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>⚠️ Do not forget to save your changes, or else changes will not be reflected.</span>
                  </div>
                  <button
                    onClick={handleSaveSettings}
                    disabled={isSaving}
                    className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm transition active:scale-95 disabled:bg-stone-400 cursor-pointer"
                  >
                    {isSaving ? 'Saving...' : 'Save All Settings'}
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* --- 保存成功ポップアップ --- */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                ✓
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-stone-900">Settings Saved Successfully!</h3>
                <p className="text-xs text-stone-500">Your store settings have been updated.</p>
              </div>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  );
}