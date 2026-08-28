'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import AnalyticsPage from './analytics';

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
  operating_radius?: number | null;
  weather?: string | null;
  note?: string | null;
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

const WEATHER_OPTIONS = [
  'Sunny (晴れ)', 'Cloudy (曇り)', 'Rainy (雨)', 'Snowy (雪)', 'Stormy (荒天)'
];

const DEFAULT_AREAS = [
  'Akihabara Area',
  'Asakusa 1 Area', 'Asakusa 2 Area', 'Asakusa 3 Area', 'Asakusa 4 Area', 'Asakusa 5 Area', 'Asakusa 6 Area', 'Asakusa 7 Area',
  'Asakusabashi 1 Area', 'Asakusabashi 2 Area', 'Asakusabashi 3 Area',
  'Hanakawado 1 Area', 'Hanakawado 2 Area',
  'Hashiba 1 Area', 'Hashiba 2 Area',
  'Higashi-Asakusa 1 Area', 'Higashi-Asakusa 2 Area',
  'Higashi-Ueno 1 Area', 'Higashi-Ueno 2 Area', 'Higashi-Ueno 3 Area', 'Higashi-Ueno 4 Area', 'Higashi-Ueno 5 Area', 'Higashi-Ueno 6 Area',
  'Ikenohata 1 Area', 'Ikenohata 2 Area', 'Ikenohata 3 Area', 'Ikenohata 4 Area',
  'Iriya 1 Area', 'Iriya 2 Area',
  'Kaminarimon 1 Area', 'Kaminarimon 2 Area',
  'Kita-Ueno 1 Area', 'Kita-Ueno 2 Area',
  'Kiyokawa 1 Area', 'Kiyokawa 2 Area',
  'Kojima 1 Area', 'Kojima 2 Area',
  'Komagata 1 Area', 'Komagata 2 Area',
  'Kotobuki 1 Area', 'Kotobuki 2 Area', 'Kotobuki 3 Area', 'Kotobuki 4 Area',
  'Kuramae 1 Area', 'Kuramae 2 Area', 'Kuramae 3 Area', 'Kuramae 4 Area',
  'Matsugaya 1 Area', 'Matsugaya 2 Area', 'Matsugaya 3 Area', 'Matsugaya 4 Area',
  'Minowa 1 Area', 'Minowa 2 Area',
  'Misuji 1 Area', 'Misuji 2 Area',
  'Motoasakusa 1 Area', 'Motoasakusa 2 Area', 'Motoasakusa 3 Area', 'Motoasakusa 4 Area',
  'Nihonzutsumi 1 Area', 'Nihonzutsumi 2 Area',
  'Nishi-Asakusa 1 Area', 'Nishi-Asakusa 2 Area', 'Nishi-Asakusa 3 Area',
  'Ryusen 1 Area', 'Ryusen 2 Area', 'Ryusen 3 Area',
  'Senzoku 1 Area', 'Senzoku 2 Area', 'Senzoku 3 Area', 'Senzoku 4 Area',
  'Shitaya 1 Area', 'Shitaya 2 Area', 'Shitaya 3 Area',
  'Taito 1 Area', 'Taito 2 Area', 'Taito 3 Area', 'Taito 4 Area',
  'Torigoe 1 Area', 'Torigoe 2 Area',
  'Ueno 1 Area', 'Ueno 2 Area', 'Ueno 3 Area', 'Ueno 4 Area', 'Ueno 5 Area', 'Ueno 6 Area', 'Ueno 7 Area',
  'Ueno-Sakuragi 1 Area', 'Ueno-Sakuragi 2 Area',
  'Yanagibashi 1 Area', 'Yanagibashi 2 Area',
  'Yanaka 1 Area', 'Yanaka 2 Area', 'Yanaka 3 Area', 'Yanaka 4 Area', 'Yanaka 5 Area', 'Yanaka 6 Area', 'Yanaka 7 Area'
];

function getBusinessDateStr(date: Date = new Date(), cutoffHour = 18): string {
  const d = new Date(date.getTime());
  if (d.getHours() >= cutoffHour) {
    d.setDate(d.getDate() + 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const timeToMinutes = (timeStr: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const validateTimeSettings = (start: string, end: string, cutoff: string, slots: SlotConfig[]) => {
  const startMin = timeToMinutes(start);
  let endMin = timeToMinutes(end);
  let cutoffMin = timeToMinutes(cutoff);

  if (endMin <= startMin && endMin < 12 * 60) endMin += 24 * 60;
  if (cutoffMin < 12 * 60) cutoffMin += 24 * 60;

  if (startMin >= endMin) {
    return "受付開始時刻は、受付終了時刻より前でなければなりません。";
  }

  if (!slots || slots.length === 0) return null;
  const activeSlots = slots.filter(s => s.is_active);
  if (activeSlots.length === 0) return null;

  const earliestSlotMin = Math.min(...activeSlots.map(s => timeToMinutes(s.time)));
  const latestSlotMin = Math.max(...activeSlots.map(s => timeToMinutes(s.time)));
  const earliestDeadlineMin = earliestSlotMin - 120;

  if (startMin >= earliestDeadlineMin) {
    return `最も早い配達枠（${Math.floor(earliestSlotMin / 60).toString().padStart(2, '0')}:${(earliestSlotMin % 60).toString().padStart(2, '0')}）の締切時刻が、受付開始時刻と同じかそれ以前になっています（注文不可能な幻の枠です）。`;
  }

  if (cutoffMin < latestSlotMin + 60) {
    return `データ切替時刻（Cutoff）は、最終配達枠の終了後、最低でも1時間以上あとに設定してください。配達中のオーダーが翌日データに消えてしまう恐れがあります。`;
  }

  return null;
};

function PendingHotelCard({
  hotel,
  existingAreas,
  onApprove,
  onReject
}: {
  hotel: any;
  existingAreas: string[];
  onApprove: (id: string, nameJa: string, area: string) => void;
  onReject: (id: string, reason: string) => void;
}) {
  const [editNameJa, setEditNameJa] = useState(hotel.name_ja || '');
  const initialArea = (hotel.area || '').includes('radius') ? '' : hotel.area;
  const [editArea, setEditArea] = useState(initialArea);
  const [isCustomArea, setIsCustomArea] = useState(false);

  return (
    <div className="bg-white p-3.5 rounded-xl border border-amber-300 shadow-sm flex flex-col gap-3 text-xs relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
      <div className="flex justify-between items-start pl-2">
        <div>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(hotel.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-extrabold text-stone-900 text-sm hover:underline hover:text-emerald-700 cursor-pointer"
            title="Click to search on Google (別タブで検索)"
          >
            {hotel.name}
          </a>
          <div className="text-[10px] text-stone-500 mt-1 font-mono bg-stone-100 px-1.5 py-0.5 rounded inline-block">
            📍 ヒント: {hotel.address}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              if (!editArea.trim()) {
                alert('エリアを選択するか、新規エリア名を入力してください。');
                return;
              }
              onApprove(hotel.id, editNameJa, editArea);
            }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition cursor-pointer shadow-xs"
          >
            ✓ Approve
          </button>
          <button
            onClick={() => onReject(hotel.id, 'Auto-discovery rejected')}
            className="px-3 py-1.5 bg-white border border-stone-200 hover:bg-rose-50 text-stone-600 hover:text-rose-700 rounded-lg font-bold text-[11px] transition cursor-pointer"
          >
            ✕ Reject
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-100 pl-2">
        <div>
          <label className="block text-[10px] font-bold text-stone-500 mb-1">日本語表記 (ない場合はブランクでOK)</label>
          <div className="relative">
            <input
              type="text"
              value={editNameJa}
              onChange={(e) => setEditNameJa(e.target.value)}
              placeholder="例: 浅草ビューホテル"
              className="w-full pl-2.5 pr-8 py-1.5 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:border-stone-400 font-semibold text-stone-800"
            />
            {editNameJa && (
              <button
                type="button"
                onClick={() => setEditNameJa('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-stone-300 hover:bg-stone-500 text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition shadow-2xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-stone-500 mb-1">Area Group (既存から選択 / 新規追加)</label>
          {!isCustomArea ? (
            <select
              value={editArea}
              onChange={(e) => {
                if (e.target.value === 'ADD_NEW_CUSTOM') {
                  setIsCustomArea(true);
                  setEditArea('');
                } else {
                  setEditArea(e.target.value);
                }
              }}
              className={`w-full px-2.5 py-1.5 border rounded-lg outline-none cursor-pointer font-bold ${editArea ? 'bg-stone-50 border-stone-200 text-stone-800' : 'bg-rose-50 border-rose-300 text-rose-700'
                }`}
            >
              <option value="" disabled>▼ エリアを選択...</option>
              {existingAreas.map(a => <option key={a} value={a}>{a}</option>)}
              <option value="ADD_NEW_CUSTOM">＋ 新規エリアを直接入力する...</option>
            </select>
          ) : (
            <div className="flex gap-1.5 items-center">
              <input
                type="text"
                placeholder="e.g. Sumida 1 Area"
                value={editArea}
                onChange={(e) => setEditArea(e.target.value)}
                autoFocus
                className="w-full px-2.5 py-1.5 bg-purple-50 border border-purple-300 rounded-lg outline-none focus:border-purple-500 text-purple-900 font-bold"
              />
              <button onClick={() => { setIsCustomArea(false); setEditArea(''); }} className="px-2 text-stone-400 hover:text-rose-500 font-bold">✕</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RegisteredHotelRow({
  hotel,
  existingAreas,
  onUpdateDetails,
  onUpdateStatus
}: {
  hotel: any;
  existingAreas: string[];
  onUpdateDetails: (id: string, name: string, nameJa: string, area: string) => void;
  onUpdateStatus: (id: string, status: string, reason?: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(hotel.name);
  const [editNameJa, setEditNameJa] = useState(hotel.name_ja || '');
  const [editArea, setEditArea] = useState(hotel.area || '');
  const [isCustomArea, setIsCustomArea] = useState(false);

  const isNg = hotel.status === 'ng';

  if (isEditing) {
    return (
      <tr className="bg-amber-50/50 border-b border-amber-100 transition">
        <td className="py-2.5 px-3">
          <div className="space-y-1.5">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="English Name"
              className="w-full px-2 py-1 bg-white border border-amber-300 rounded text-xs font-bold outline-none"
            />
            <div className="relative">
              <input
                type="text"
                value={editNameJa}
                onChange={(e) => setEditNameJa(e.target.value)}
                placeholder="日本語表記 (ブランクOK)"
                className="w-full pl-2 pr-6 py-1 bg-white border border-amber-300 rounded text-[10px] outline-none"
              />
              {editNameJa && (
                <button
                  type="button"
                  onClick={() => setEditNameJa('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-amber-200 hover:bg-amber-400 text-amber-800 flex items-center justify-center text-[9px] font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </td>
        <td className="py-2.5 px-3">
          {!isCustomArea ? (
            <select
              value={editArea}
              onChange={(e) => {
                if (e.target.value === 'ADD_NEW_CUSTOM') {
                  setIsCustomArea(true);
                  setEditArea('');
                } else {
                  setEditArea(e.target.value);
                }
              }}
              className="w-full px-2 py-1 border border-amber-300 rounded text-[10px] font-bold outline-none cursor-pointer bg-white"
            >
              <option value="" disabled>▼ エリアを選択...</option>
              {existingAreas.map(a => <option key={a} value={a}>{a}</option>)}
              <option value="ADD_NEW_CUSTOM">＋ 新規エリアを直接入力する...</option>
            </select>
          ) : (
            <div className="flex gap-1 items-center">
              <input
                type="text"
                placeholder="e.g. Sumida 1 Area"
                value={editArea}
                onChange={(e) => setEditArea(e.target.value)}
                autoFocus
                className="w-full px-2 py-1 border border-purple-300 rounded text-[10px] font-bold bg-purple-50 outline-none"
              />
              <button
                onClick={() => { setIsCustomArea(false); setEditArea(hotel.area || ''); }}
                className="text-stone-400 hover:text-rose-500 font-bold px-1"
              >
                ✕
              </button>
            </div>
          )}
        </td>
        <td className="py-2.5 px-3">
          <span className="text-[10px] text-stone-400 font-bold">Editing...</span>
        </td>
        <td className="py-2.5 px-3 text-center">
          <div className="flex flex-col gap-1 items-center">
            <button
              onClick={() => {
                if (!editArea.trim() || !editName.trim()) {
                  alert('英語名とエリア名は必須です。');
                  return;
                }
                onUpdateDetails(hotel.id, editName, editNameJa, editArea);
                setIsEditing(false);
              }}
              className="w-full px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[10px]"
            >
              Save (保存)
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditName(hotel.name);
                setEditNameJa(hotel.name_ja || '');
                setEditArea(hotel.area || '');
                setIsCustomArea(false);
              }}
              className="w-full px-2 py-1 bg-white border border-stone-200 text-stone-500 rounded font-bold text-[10px]"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`transition group ${isNg ? 'bg-rose-50/50' : 'hover:bg-stone-50'}`}>
      <td className="py-3 px-3 relative">
        <div className="flex items-center gap-1.5">
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(hotel.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-stone-900 hover:underline hover:text-emerald-700 cursor-pointer"
          >
            {hotel.name}
          </a>
          <button
            onClick={() => setIsEditing(true)}
            className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-stone-200 hover:bg-stone-300 text-stone-600 rounded text-[9px] font-bold transition"
          >
            ✎ Edit
          </button>
        </div>
        {hotel.name_ja && <div className="text-[10px] text-stone-500 mt-0.5">{hotel.name_ja}</div>}
      </td>
      <td className="py-3 px-3 text-stone-600 text-[11px]">{hotel.area}</td>
      <td className="py-3 px-3">
        {isNg ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800" title={hotel.ng_reason}>
            ✕ NG: {hotel.ng_reason || 'Reason Unspecified'}
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
            ● Published
          </span>
        )}
      </td>
      <td className="py-3 px-3 text-center">
        {isNg ? (
          <button
            onClick={() => onUpdateStatus(hotel.id, 'published')}
            className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg font-bold text-[10px]"
          >
            ↺ 復帰させる (Publish)
          </button>
        ) : (
          <select
            onChange={(e) => {
              if (e.target.value) {
                onUpdateStatus(hotel.id, 'ng', e.target.value);
                e.target.value = '';
              }
            }}
            defaultValue=""
            className="bg-stone-50 border border-stone-300 rounded-lg px-2 py-1 text-[10px] font-bold text-stone-700 outline-none w-full max-w-[140px]"
          >
            <option value="" disabled>▼ NGにする理由を選択</option>
            <option value="三社祭・イベント期間中（一時停止）">🏮 三社祭・イベント期間中</option>
            <option value="ホテル側の意向・デリバリーお断り">🚷 ホテル側の意向</option>
            <option value="改装中・一時休業中">🚧 改装中・一時休業中</option>
            <option value="その他・トラブル対応">⚠️ その他・トラブル対応</option>
          </select>
        )}
      </td>
    </tr>
  );
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'operations' | 'history' | 'calendar' | 'settings' | 'analytics'>('operations');
  const [orders, setOrders] = useState<Order[]>([]);

  const [hotels, setHotels] = useState<any[]>([]);
  const [newHotelName, setNewHotelName] = useState('');
  const [newHotelNameJa, setNewHotelNameJa] = useState('');
  const [newHotelArea, setNewHotelArea] = useState('Asakusa 1 Area');
  const [newHotelAddress, setNewHotelAddress] = useState('');
  const [newHotelLat, setNewHotelLat] = useState('35.7145');
  const [newHotelLng, setNewHotelLng] = useState('139.7944');
  const [isScanning, setIsScanning] = useState(false);

  const [inventory, setInventory] = useState<StoreInventory>({
    target_date: getBusinessDateStr(),
    target_stock: 10,
    current_stock: 10,
    sold_count: 0,
  });
  const [soldOutLogs, setSoldOutLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAlertMinuteRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio('/airport.mp3');
    }
  }, []);

  const fetchHotels = useCallback(async () => {
    const { data, error } = await supabase.from('hotels').select('*').order('name', { ascending: true });
    if (data && !error) setHotels(data);
  }, []);

  useEffect(() => { fetchHotels(); }, [fetchHotels]);

  const existingAreas = useMemo(() => {
    const formatAreaName = (areaStr?: string) => {
      if (!areaStr) return 'Other Areas';
      if (areaStr.toLowerCase().endsWith('area')) return areaStr;
      const match = areaStr.match(/\((.*?)\)/);
      if (match && match[1]) return match[1].trim() + ' Area';
      return areaStr + ' Area';
    };
    const dbAreas = hotels.filter(h => h.status === 'published' || h.status === 'ng').map(h => formatAreaName(h.area)).filter(area => area !== 'Other Areas' && !area.includes('radius'));
    return Array.from(new Set([...DEFAULT_AREAS, ...dbAreas])).sort();
  }, [hotels]);

  const handleApprovePendingHotel = async (hotelId: string, updatedNameJa: string, updatedArea: string) => {
    const { error } = await supabase.from('hotels').update({ status: 'published', name_ja: updatedNameJa.trim() || null, area: updatedArea.trim(), ng_reason: null }).eq('id', hotelId);
    if (error) alert('Failed to approve hotel: ' + error.message); else fetchHotels();
  };

  const handleUpdateHotelStatus = async (hotelId: string | number, newStatus: string, reason: string = '') => {
    const updatePayload: any = { status: newStatus };
    if (newStatus === 'ng') updatePayload.ng_reason = reason; else updatePayload.ng_reason = null;
    const { error } = await supabase.from('hotels').update(updatePayload).eq('id', hotelId);
    if (error) alert('Failed to update hotel status: ' + error.message); else fetchHotels();
  };

  const handleUpdateHotelDetails = async (hotelId: string | number, updatedName: string, updatedNameJa: string, updatedArea: string) => {
    const { error } = await supabase.from('hotels').update({ name: updatedName.trim(), name_ja: updatedNameJa.trim() || null, area: updatedArea.trim() }).eq('id', hotelId);
    if (error) alert('Failed to update hotel details: ' + error.message); else fetchHotels();
  };

  const handleAddHotelManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHotelName.trim() || !newHotelAddress.trim()) return alert('Please fill in Hotel Name and Address.');
    const slugId = newHotelName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const hotelPayload = {
      id: slugId + '-' + Date.now().toString().slice(-4),
      name: newHotelName.trim(), name_ja: newHotelNameJa.trim() || null, area: newHotelArea.trim(),
      address: newHotelAddress.trim(), lat: parseFloat(newHotelLat) || 35.7148, lng: parseFloat(newHotelLng) || 139.7967, status: 'published'
    };
    const { error } = await supabase.from('hotels').insert([hotelPayload]);
    if (error) alert('Failed to add hotel: ' + error.message);
    else { setNewHotelName(''); setNewHotelNameJa(''); setNewHotelAddress(''); alert('New hotel added successfully!'); fetchHotels(); }
  };

  const handleTriggerAutoDiscovery = async () => {
    setIsScanning(true);
    try {
      const kitchenLat = 35.7148; const kitchenLng = 139.7967;
      const radiusMeters = Math.min(50000, Math.max(1000, Math.round(settings.delivery_radius_km * 1000)));
      const response = await fetch(`/api/scan?lat=${kitchenLat}&lng=${kitchenLng}&radius=${radiusMeters}`);
      if (!response.ok) throw new Error('Failed to fetch from local API server.');
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        let addedCount = 0;
        for (const place of data.results) {
          const exists = hotels.some(h => h.name.toLowerCase() === (place.name_en || place.name).toLowerCase() || h.id === place.place_id || h.id === `gmaps-${place.place_id}`);
          if (!exists) {
            const { error: insertErr } = await supabase.from('hotels').insert([{
              id: `gmaps-${place.place_id}`, name: place.name_en || place.name, name_ja: place.name_ja || place.name,
              area: `Asakusa (${settings.delivery_radius_km}km radius)`, address: place.vicinity || place.formatted_address || 'Asakusa, Tokyo',
              lat: place.geometry.location.lat, lng: place.geometry.location.lng, status: 'pending'
            }]);
            if (!insertErr) addedCount++;
          }
        }
        alert(`🌐 Scan completed within ${settings.delivery_radius_km}km radius!\nFound ${data.results.length} properties. Newly added to Pending: ${addedCount} hotels.`);
        fetchHotels();
      } else alert('Scan completed. No new properties found in this radius.');
    } catch (err: any) { alert(`❌ Scan failed: ${err.message}`); } finally { setIsScanning(false); }
  };
  const [opStatusFilter, setOpStatusFilter] = useState<'active' | 'all' | 'delivered'>('active');
  const [opSlotFilter, setOpSlotFilter] = useState<string>('all');
  const [historyPeriod, setHistoryPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');
  const [historySearch, setHistorySearch] = useState('');

  const [currentYearMonth, setCurrentYearMonth] = useState(() => {
    const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() };
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
  const [modalRadius, setModalRadius] = useState<number | ''>('');
  const [modalWeather, setModalWeather] = useState<string>('');
  const [modalNote, setModalNote] = useState<string>('');
  const [modalErrorMessage, setModalErrorMessage] = useState('');

  const [settings, setSettings] = useState({
    takeout_price: 1200,
    delivery_price: 1500,
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

  const calculatedTakeoutVat = useMemo(() => Math.round(settings.takeout_price * (settings.vat_rate / 100)), [settings.takeout_price, settings.vat_rate]);
  const calculatedDeliveryVat = useMemo(() => Math.round(settings.delivery_price * (settings.vat_rate / 100)), [settings.delivery_price, settings.vat_rate]);

  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const fetchMasterSettings = useCallback(async () => {
    let currentSettings = {
      takeout_price: 1200, delivery_price: 1500, delivery_fee: 150, vat_rate: 10, delivery_radius_km: 2.5,
      is_open: true, default_target_stock: 10, delivery_slots: DEFAULT_SLOTS,
      business_cutoff_time: '18:00', order_acceptance_start: '07:00', order_acceptance_end: '22:00',
    };

    const { data: setData } = await supabase.from('settings').select('*').eq('id', 'default_settings').maybeSingle();

    if (setData) {
      let parsedSlots = DEFAULT_SLOTS;
      if (Array.isArray(setData.delivery_slots) && setData.delivery_slots.length > 0) parsedSlots = setData.delivery_slots;
      else if (typeof setData.delivery_slots === 'string') { try { parsedSlots = JSON.parse(setData.delivery_slots); } catch { parsedSlots = DEFAULT_SLOTS; } }

      let derivedVatRate = 10;
      if (setData.vat_rate != null) derivedVatRate = setData.vat_rate;
      else if (setData.tax_amount != null && setData.item_price) derivedVatRate = Math.round((setData.tax_amount / setData.item_price) * 100);

      currentSettings = {
        takeout_price: setData.takeout_price ?? 1200,
        delivery_price: setData.delivery_price ?? (setData.item_price ?? 1500),
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
      if (activeTabRef.current !== 'settings') setSettings(currentSettings);
    }

    const { data: calData } = await supabase.from('store_calendar').select('*');
    const calMap: Record<string, CalendarDay> = {};
    if (calData) {
      calData.forEach((row: any) => {
        let customSlots = row.custom_slots;
        if (typeof customSlots === 'string') { try { customSlots = JSON.parse(customSlots); } catch { customSlots = null; } }
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

    const { data: orderData } = await supabase.from('orders').select('*').order('id', { ascending: false });
    if (orderData) setOrders(orderData as Order[]);

    const { data: invData } = await supabase.from('store_inventory').select('*').eq('target_date', currentBizDate).maybeSingle();
    if (invData) setInventory(invData);
    else {
      const initInv = { target_date: currentBizDate, target_stock: 10, current_stock: 10, sold_count: 0 };
      const { data: createdInv } = await supabase.from('store_inventory').insert([initInv]).select().maybeSingle();
      if (createdInv) setInventory(createdInv);
    }

    const { data: logData } = await supabase.from('sold_out_logs').select('sold_at').eq('date', currentBizDate).order('id', { ascending: true });
    if (logData) setSoldOutLogs(logData.map((l: any) => l.sold_at));

    setIsLoading(false);
  }, [fetchMasterSettings]);

  useEffect(() => {
    fetchLiveOperationsData(true);
    const interval = setInterval(() => fetchLiveOperationsData(false), 15000);
    return () => clearInterval(interval);
  }, [fetchLiveOperationsData]);

  const cutoffHour = parseInt((settings.business_cutoff_time || '18:00').split(':')[0], 10) || 18;
  const todayBizDate = getBusinessDateStr(new Date(), cutoffHour);
  const todayCalendar = calendarData[todayBizDate];

  const effectiveTodaySlots: SlotConfig[] = useMemo(() => {
    if (todayCalendar && Array.isArray(todayCalendar.custom_slots) && todayCalendar.custom_slots.length > 0) return todayCalendar.custom_slots;
    return settings.delivery_slots && settings.delivery_slots.length > 0 ? settings.delivery_slots : DEFAULT_SLOTS;
  }, [todayCalendar, settings.delivery_slots]);

  const todayOperationsOrders = useMemo(() => {
    return orders.filter((o) => getBusinessDateStr(new Date(o.created_at), cutoffHour) === todayBizDate);
  }, [orders, todayBizDate, cutoffHour]);

  const activeOrders = useMemo(() => todayOperationsOrders.filter((o) => o.status !== 'cancelled' && o.status !== 'undelivered'), [todayOperationsOrders]);
  const activeDeliveryBoxes = useMemo(() => activeOrders.reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0), [activeOrders]);
  const deliveryRevenue = useMemo(() => activeOrders.reduce((sum, o) => sum + (o.total_price || o.price || 0), 0), [activeOrders]);

  const slotStats = useMemo(() => {
    const stats: Record<string, { boxes: number; orders: number }> = {};
    effectiveTodaySlots.forEach((s) => { stats[s.time] = { boxes: 0, orders: 0 }; });
    activeOrders.forEach((o) => {
      const slot = o.delivery_time || o.delivery_slot || o.slot || '08:00';
      if (!stats[slot]) stats[slot] = { boxes: 0, orders: 0 };
      stats[slot].boxes += o.quantity || o.qty || 1;
      stats[slot].orders += 1;
    });
    return stats;
  }, [activeOrders, effectiveTodaySlots]);

  const deliveryKeptBoxes = useMemo(() => todayOperationsOrders.filter((o) => o.status === 'ready_store').reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0), [todayOperationsOrders]);
  const deliveryUncookedBoxes = useMemo(() => todayOperationsOrders.filter((o) => o.status === 'order_received' || o.status === 'pending').reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0), [todayOperationsOrders]);

  const takeoutAvailable = Math.max(0, inventory.current_stock - deliveryKeptBoxes);
  const storeRestockNeeded = Math.max(0, inventory.target_stock - takeoutAvailable);
  const kitchenSuggestBoxes = deliveryUncookedBoxes + storeRestockNeeded;

  const displayedOperationsOrders = useMemo(() => {
    return todayOperationsOrders
      .filter((o) => {
        if (opStatusFilter === 'active') return o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== 'undelivered';
        if (opStatusFilter === 'delivered') return o.status === 'delivered';
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

  useEffect(() => {
    if (!isAudioEnabled) return;
    const needsAlert = activeOrders.some((o) => {
      const slot = o.delivery_time || o.delivery_slot || o.slot || '08:00';
      const [slotH, slotM] = slot.split(':').map(Number);
      const departureDeadlineMinutes = slotH * 60 + slotM - 60;
      const lateBy = currentMinutes - departureDeadlineMinutes;
      const currentStatus = o.status === 'pending' ? 'order_received' : (o.status === 'cooking' ? 'ready_kitchen' : o.status);
      const isLateStatus = ['order_received', 'ready_store', 'ready_kitchen'].includes(currentStatus);
      return isLateStatus && lateBy >= 0 && (lateBy % 3 === 0);
    });

    if (needsAlert && lastAlertMinuteRef.current !== currentMinutes) {
      lastAlertMinuteRef.current = currentMinutes;
      if (audioRef.current) audioRef.current.play().catch(() => { });
    }
  }, [activeOrders, currentMinutes, isAudioEnabled]);

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

  const historyTotalRevenue = useMemo(() => filteredHistoryOrders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total_price || o.price || 0), 0), [filteredHistoryOrders]);
  const historyTotalBoxes = useMemo(() => filteredHistoryOrders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + (o.quantity || o.qty || 1), 0), [filteredHistoryOrders]);

  const handleQuickToggleSlot = async (slotTime: string) => {
    const targetSlot = effectiveTodaySlots.find((s) => s.time === slotTime);
    const currentActive = targetSlot ? targetSlot.is_active : true;
    const nextActive = !currentActive;

    if (!nextActive) {
      const confirmed = window.confirm(`[CONFIRMATION / 確認]\n\nStop accepting orders for ${slotTime} delivery slot?\nThis slot will immediately show as SOLD OUT on the order page.\n\n${slotTime} 枠の注文受付を停止（SOLD OUT）にしますか？`);
      if (!confirmed) return;
    }

    const updatedSlots = effectiveTodaySlots.map((s) => (s.time === slotTime ? { ...s, is_active: nextActive } : s));
    if (todayCalendar && todayCalendar.custom_slots && todayCalendar.custom_slots.length > 0) {
      setCalendarData((prev) => ({ ...prev, [todayBizDate]: { ...prev[todayBizDate], custom_slots: updatedSlots } }));
      await supabase.from('store_calendar').upsert({ date: todayBizDate, is_open: todayCalendar.is_open, custom_slots: updatedSlots, updated_at: new Date().toISOString() });
    } else {
      setSettings((prev) => ({ ...prev, delivery_slots: updatedSlots }));
      await supabase.from('settings').update({ delivery_slots: updatedSlots, updated_at: new Date().toISOString() }).eq('id', 'default_settings');
    }
  };

  const handleUpdateStatus = async (orderId: number, nextStatus: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId);
    if (error) { alert('Failed to update status: ' + error.message); fetchLiveOperationsData(true); }
  };

  const recordSoldOutIfNeeded = async (newStock: number) => {
    if (newStock === 0) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const bizDate = inventory.target_date;
      await supabase.from('sold_out_logs').insert([{ date: bizDate, sold_at: timeStr }]);
      setSoldOutLogs((prev) => [...prev, timeStr]);
    }
  };

  const handleShelfChange = async (delta: number) => {
    const prevStock = inventory.current_stock;
    const newStock = Math.max(0, inventory.current_stock + delta);
    setInventory((prev) => ({ ...prev, current_stock: newStock }));
    await supabase.from('store_inventory').update({ current_stock: newStock }).eq('target_date', inventory.target_date);
    if (prevStock > 0 && newStock === 0) await recordSoldOutIfNeeded(newStock);
  };

  const handleSellCounter = async () => {
    if (takeoutAvailable <= 0) return alert('No physical stock available for takeout. Please restock shelf.');
    const prevStock = inventory.current_stock;
    const newStock = Math.max(0, inventory.current_stock - 1);
    const newSold = inventory.sold_count + 1;
    setInventory((prev) => ({ ...prev, current_stock: newStock, sold_count: newSold }));
    await supabase.from('store_inventory').update({ current_stock: newStock, sold_count: newSold }).eq('target_date', inventory.target_date);
    if (prevStock > 0 && newStock === 0) await recordSoldOutIfNeeded(newStock);
  };

  const handleOpenCalendarModal = (dateStr: string) => {
    setSelectedCalDate(dateStr);
    setModalErrorMessage('');
    const existing = calendarData[dateStr];
    if (existing) {
      setModalIsOpen(existing.is_open);
      if (existing.custom_slots && existing.custom_slots.length > 0) {
        setModalUseCustomSlots(true); setModalSlots(JSON.parse(JSON.stringify(existing.custom_slots)));
      } else {
        setModalUseCustomSlots(false); setModalSlots(JSON.parse(JSON.stringify(settings.delivery_slots)));
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
      setModalRadius(existing.operating_radius != null ? existing.operating_radius : '');
      setModalWeather(existing.weather || '');
      setModalNote(existing.note || '');
    } else {
      setModalIsOpen(true); setModalUseCustomSlots(false); setModalSlots(JSON.parse(JSON.stringify(settings.delivery_slots)));
      setModalTargetStock(''); setModalUseCustomHours(false);
      setModalCutoffTime(settings.business_cutoff_time); setModalAcceptStart(settings.order_acceptance_start); setModalAcceptEnd(settings.order_acceptance_end);
      setModalRadius(''); setModalWeather(''); setModalNote('');
    }
  };

  const handleSaveCalendarModal = async () => {
    if (!selectedCalDate) return;
    setModalErrorMessage('');

    const finalStart = modalUseCustomHours ? modalAcceptStart : settings.order_acceptance_start;
    const finalEnd = modalUseCustomHours ? modalAcceptEnd : settings.order_acceptance_end;
    const finalCutoff = modalUseCustomHours ? modalCutoffTime : settings.business_cutoff_time;
    const finalSlots = modalUseCustomSlots ? modalSlots : settings.delivery_slots;

    const errorMsg = validateTimeSettings(finalStart, finalEnd, finalCutoff, finalSlots);
    if (errorMsg) { setModalErrorMessage(errorMsg); return; }

    const finalCustomSlots = modalUseCustomSlots ? modalSlots : null;
    const finalTargetStock = modalTargetStock === '' ? null : Number(modalTargetStock);
    const finalCutoffDb = modalUseCustomHours ? modalCutoffTime : null;
    const finalStartDb = modalUseCustomHours ? modalAcceptStart : null;
    const finalEndDb = modalUseCustomHours ? modalAcceptEnd : null;
    const finalRadiusDb = modalRadius === '' ? null : Number(modalRadius);
    const finalWeatherDb = modalWeather.trim() === '' ? null : modalWeather.trim();
    const finalNoteDb = modalNote.trim() === '' ? null : modalNote.trim();

    setCalendarData((prev) => ({
      ...prev,
      [selectedCalDate]: {
        date: selectedCalDate, is_open: modalIsOpen, custom_slots: finalCustomSlots, target_stock: finalTargetStock,
        custom_cutoff_time: finalCutoffDb, custom_acceptance_start: finalStartDb, custom_acceptance_end: finalEndDb,
        operating_radius: finalRadiusDb, weather: finalWeatherDb, note: finalNoteDb
      },
    }));

    await supabase.from('store_calendar').upsert({
      date: selectedCalDate, is_open: modalIsOpen, custom_slots: finalCustomSlots, target_stock: finalTargetStock,
      custom_cutoff_time: finalCutoffDb, custom_acceptance_start: finalStartDb, custom_acceptance_end: finalEndDb,
      operating_radius: finalRadiusDb, weather: finalWeatherDb, note: finalNoteDb, updated_at: new Date().toISOString()
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
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return days;
  }, [currentYearMonth]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveErrorMessage('');

    const errorMsg = validateTimeSettings(settings.order_acceptance_start, settings.order_acceptance_end, settings.business_cutoff_time, settings.delivery_slots);
    if (errorMsg) { setSaveErrorMessage(errorMsg); setIsSaving(false); return; }

    const { error } = await supabase.from('settings').update({
      // ⚠️ 注: Supabaseの settings テーブルに takeout_price と delivery_price のカラムを追加しておく必要があります
      takeout_price: settings.takeout_price, delivery_price: settings.delivery_price,
      delivery_fee: settings.delivery_fee, tax_amount: calculatedDeliveryVat, // 代表してデリバリー税額を保存
      delivery_radius_km: settings.delivery_radius_km, is_open: settings.is_open, default_target_stock: settings.default_target_stock,
      delivery_slots: settings.delivery_slots, business_cutoff_time: settings.business_cutoff_time,
      order_acceptance_start: settings.order_acceptance_start, order_acceptance_end: settings.order_acceptance_end, updated_at: new Date().toISOString(),
    }).eq('id', 'default_settings');

    setIsSaving(false);
    if (error) { setSaveErrorMessage('Error saving settings: ' + error.message); } else { setShowSuccessModal(true); fetchLiveOperationsData(true); }
  };

  const handleAddDefaultSlot = () => setSettings((prev) => ({ ...prev, delivery_slots: [...prev.delivery_slots, { time: '11:00', limit: 10, is_active: true }] }));
  const handleUpdateDefaultSlot = (index: number, field: keyof SlotConfig, val: any) => {
    setSettings((prev) => {
      const updated = [...prev.delivery_slots];
      updated[index] = { ...updated[index], [field]: val };
      return { ...prev, delivery_slots: updated };
    });
  };
  const handleDeleteDefaultSlot = (index: number) => {
    if (settings.delivery_slots.length <= 1) return alert('You must keep at least 1 delivery slot.');
    setSettings((prev) => ({ ...prev, delivery_slots: prev.delivery_slots.filter((_, i) => i !== index) }));
  };

  const getHotelDisplayName = (order: Order) => {
    const raw = order.hotel_name || order.hotel || order.hotel_id || '';
    const found = hotels.find((h) => String(h.id) === String(raw) || h.name === raw || h.name_ja === raw);
    if (found) return `${found.name_ja || found.name}`;
    return raw || 'Hotel Unspecified';
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'order_received':
      case 'pending': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">order received</span>;
      case 'ready_store': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">ready store</span>;
      case 'ready_kitchen':
      case 'cooking': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">ready kitchen</span>;
      case 'delivering': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">delivering</span>;
      case 'delivered': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">delivered</span>;
      case 'undelivered': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">undelivered</span>;
      case 'cancelled': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-200 text-stone-600">cancelled</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700">{status}</span>;
    }
  };

  const isCalendarOpenToday = todayCalendar ? todayCalendar.is_open : true;
  const isMasterOpen = settings.is_open && isCalendarOpenToday;

  const toggleAudioAlert = () => {
    const nextState = !isAudioEnabled;
    setIsAudioEnabled(nextState);
    if (nextState && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => { });
    } else if (!nextState && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

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
              <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 overflow-x-auto">
                <button onClick={() => setActiveTab('operations')} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${activeTab === 'operations' ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}>📦 Operations</button>
                <button onClick={() => setActiveTab('history')} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${activeTab === 'history' ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}>📋 Order History</button>
                <button onClick={() => setActiveTab('calendar')} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${activeTab === 'calendar' ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}>📅 Calendar</button>
                <button onClick={() => setActiveTab('settings')} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${activeTab === 'settings' ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}>⚙️ Settings</button>
                <button onClick={() => setActiveTab('analytics')} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${activeTab === 'analytics' ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}>📊 Analytics</button>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={toggleAudioAlert} className={`text-[11px] px-3 py-2 rounded-xl border font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer active:scale-95 shrink-0 ${isAudioEnabled ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-stone-500 border-stone-300 hover:bg-stone-50'}`} title={isAudioEnabled ? 'Click to disable audio alerts' : 'Click to enable audio alerts (Plays test sound)'}>
                  {isAudioEnabled ? '🔔 Sound: ON' : '🔕 Sound: OFF'}
                </button>
                <button onClick={() => fetchLiveOperationsData(true)} className="bg-white hover:bg-stone-50 text-stone-800 px-3.5 py-2 rounded-xl border border-stone-300 flex items-center gap-2 transition shadow-2xs cursor-pointer active:scale-95 shrink-0" title="Click to force refresh data">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 uppercase tracking-wide">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    LIVE SYNC
                  </span>
                </button>
              </div>
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
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">KITCHEN SUGGEST (TODAY)</span>
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
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">ACTIVE DELIVERY ORDERS (TODAY)</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-stone-900">{activeOrders.length}</span>
                    <span className="text-xs text-stone-500">orders ({activeDeliveryBoxes} boxes)</span>
                  </div>
                  <div className="pt-3 border-t border-stone-100 text-[11px] text-stone-600">
                    Revenue: <span className="font-bold text-stone-900">¥{deliveryRevenue.toLocaleString()}</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">TAKEOUT SOLD (TODAY)</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-stone-900">{inventory.sold_count}</span>
                    <span className="text-xs text-stone-500">boxes sold</span>
                  </div>
                  <div className="pt-3 border-t border-stone-100 text-[11px] text-stone-600">
                    Takeout Rev: <span className="font-bold text-stone-900">¥{(inventory.sold_count * (settings.takeout_price + calculatedTakeoutVat)).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* 左側：スロット状況 */}
                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">DELIVERY SLOTS & INTAKE STATUS</span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${isMasterOpen ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300'}`}>
                        {isMasterOpen ? '● STORE: OPEN' : '✕ STORE: CLOSED'}
                      </span>
                    </div>

                    <div className={`grid gap-2 ${effectiveTodaySlots.length <= 3 ? 'grid-cols-3' : effectiveTodaySlots.length === 4 ? 'grid-cols-4' : effectiveTodaySlots.length === 5 ? 'grid-cols-5' : 'grid-cols-3 sm:grid-cols-4'}`}>
                      {effectiveTodaySlots.map((slot) => {
                        const booked = slotStats[slot.time]?.boxes || 0;
                        const [slotH, slotM] = slot.time.split(':').map(Number);
                        const isPastCutoff = currentMinutes >= (slotH * 60 + slotM - 120);
                        const isSoldOut = !slot.is_active || booked >= slot.limit || !isMasterOpen || isPastCutoff;

                        return (
                          <div key={slot.time} className={`p-2.5 rounded-xl border text-center transition ${isSoldOut ? 'bg-stone-50/80 border-stone-200 opacity-70' : 'bg-stone-50 border-stone-200'}`}>
                            <span className="text-[11px] font-bold text-stone-600 block">{slot.time}</span>
                            <div className="text-lg font-extrabold text-stone-900 my-0.5">{booked} <span className="text-[9px] font-normal text-stone-400">/ {slot.limit}</span></div>
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${isSoldOut ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}`}>
                              {isPastCutoff ? 'CLOSED' : (isSoldOut ? 'SOLD' : 'OPEN')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-stone-100 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold block">LIVE SLOT CONTROL (QUICK TOGGLE)</span>
                      {todayCalendar?.custom_slots && <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">★ Custom Day Slots Active</span>}
                    </div>

                    <div className="space-y-1.5">
                      {effectiveTodaySlots.map((slot) => {
                        const booked = slotStats[slot.time]?.boxes || 0;
                        const remaining = Math.max(0, slot.limit - booked);
                        const [slotH, slotM] = slot.time.split(':').map(Number);
                        const isPastCutoff = currentMinutes >= (slotH * 60 + slotM - 120);
                        const isSoldOut = !slot.is_active || remaining <= 0 || !isMasterOpen || isPastCutoff;

                        return (
                          <div key={`row-${slot.time}`} className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs transition ${isSoldOut ? 'bg-rose-50/40 border-rose-200' : 'bg-stone-50 border-stone-200'}`}>
                            <div className="flex items-center gap-2.5">
                              <button onClick={() => handleQuickToggleSlot(slot.time)} className={`w-7 h-4 rounded-full transition relative cursor-pointer ${slot.is_active ? 'bg-emerald-600' : 'bg-stone-300'}`} title={slot.is_active ? 'Click to mark as SOLD OUT' : 'Click to reopen slot'}>
                                <div className={`w-3 h-3 rounded-full bg-white transition absolute top-0.5 ${slot.is_active ? 'right-0.5' : 'left-0.5'}`}></div>
                              </button>
                              <span className="font-bold text-stone-800 text-[11px]">{slot.time} Slot</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-stone-500 font-mono">{booked}/{slot.limit} bxs</span>
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${isSoldOut ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}`}>
                                {isPastCutoff ? '✕ CLOSED (Time Over)' : (isSoldOut ? '✕ SOLD OUT' : `● OPEN (${remaining} left)`)}
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
                    <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">STORE INVENTORY & POS</span>
                    <span className="text-[11px] text-stone-500 font-medium">Target: <span className="font-extrabold text-stone-900">{inventory.target_stock}</span> boxes</span>
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

                  <button onClick={handleSellCounter} className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer">
                    Sell 1 Box at Counter
                  </button>
                </div>
              </div>

              {/* 下段：デリバリー受注一覧テーブル */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-stone-100">
                  <div>
                    <span className="text-xs font-bold text-stone-800 uppercase tracking-wider block">TODAY'S OPERATIONS QUEUE ({displayedOperationsOrders.length} orders shown)</span>
                    <span className="text-[10px] text-stone-400">Sorted chronologically by Delivery Time</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-[11px]">
                      <button onClick={() => setOpStatusFilter('active')} className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${opStatusFilter === 'active' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}>🟢 Active (未完了)</button>
                      <button onClick={() => setOpStatusFilter('all')} className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${opStatusFilter === 'all' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}>All</button>
                      <button onClick={() => setOpStatusFilter('delivered')} className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${opStatusFilter === 'delivered' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}>Delivered</button>
                    </div>

                    <div className="flex flex-wrap bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-[11px]">
                      <button onClick={() => setOpSlotFilter('all')} className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${opSlotFilter === 'all' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}>All Slots</button>
                      {effectiveTodaySlots.map((slot) => (
                        <button key={slot.time} onClick={() => setOpSlotFilter(slot.time)} className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${opSlotFilter === slot.time ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}>
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

                          const orderTimeStr = new Date(o.created_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                          const [slotH, slotM] = displaySlot.split(':').map(Number);
                          const departureDeadlineMinutes = slotH * 60 + slotM - 60;
                          const isLateAlert = currentMinutes >= departureDeadlineMinutes && ['order_received', 'ready_store', 'ready_kitchen'].includes(currentStatus);

                          return (
                            <tr key={o.id} className={`transition ${isLateAlert ? 'bg-rose-50 hover:bg-rose-100/80' : 'hover:bg-stone-50'}`}>
                              <td className={`py-3 px-3 font-extrabold flex items-center gap-1.5 ${isLateAlert ? 'text-rose-800 bg-rose-100/50' : 'text-stone-900 bg-stone-50/50'}`}>
                                {displaySlot}
                                {isLateAlert && <span className="text-[14px]" title="⚠️ Departure deadline has passed!">⚠️</span>}
                              </td>
                              <td className="py-3 px-3 font-mono text-[11px] font-bold text-stone-600 whitespace-nowrap">{orderTimeStr}</td>
                              <td className="py-3 px-3 font-mono font-bold text-stone-400 text-[11px]">#{o.id}</td>
                              <td className="py-3 px-3">{renderStatusBadge(currentStatus)}</td>
                              <td className="py-3 px-3 font-semibold text-stone-800">{displayHotel}</td>
                              <td className="py-3 px-3 font-mono text-stone-900 font-bold text-sm">{displayRoom}</td>
                              <td className="py-3 px-3">
                                <div className="font-semibold text-stone-900">{displayGuest}</div>
                                {displayEmail && <div className="text-[10px] text-stone-400">{displayEmail}</div>}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-stone-900">{displayQty}</td>
                              <td className="py-3 px-3 text-right font-bold text-stone-900">¥{displayTotal.toLocaleString()}</td>
                              <td className="py-3 px-3 text-center">
                                <select value={currentStatus} onChange={(e) => handleUpdateStatus(o.id, e.target.value)} className={`border rounded-lg px-2 py-1.5 text-[11px] font-semibold outline-none cursor-pointer ${isLateAlert ? 'bg-rose-50 border-rose-300 text-rose-900 focus:border-rose-900' : 'bg-stone-50 border-stone-300 text-stone-800 focus:border-stone-900'}`}>
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
                <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 w-full md:w-auto overflow-x-auto">
                  {[
                    { key: 'today', label: 'Today' },
                    { key: 'yesterday', label: 'Yesterday' },
                    { key: 'week', label: 'Last 7 Days' },
                    { key: 'month', label: 'Last 30 Days' },
                    { key: 'all', label: 'All Time' },
                  ].map((p) => (
                    <button key={p.key} onClick={() => setHistoryPeriod(p.key as any)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex-1 md:flex-none cursor-pointer whitespace-nowrap ${historyPeriod === p.key ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="w-full md:w-72 relative">
                  <input type="text" placeholder="Search guest, hotel, room, #ID..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="w-full bg-stone-50 border border-stone-300 rounded-xl pl-3.5 pr-8 py-2 text-xs text-stone-900 outline-none focus:border-stone-900" />
                  {historySearch && <button onClick={() => setHistorySearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-stone-300 hover:bg-stone-500 text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition shadow-2xs" title="Clear search">✕</button>}
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
                <span className="text-xs font-bold text-stone-700 uppercase tracking-wider block">ORDER ARCHIVE / 注文ログ ({filteredHistoryOrders.length} records)</span>
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
                        const createdDateStr = new Date(o.created_at).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
                  <p className="text-xs text-stone-500 mt-0.5">Click any date to configure day status, custom delivery slots & context data.</p>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentYearMonth(prev => { const d = new Date(prev.year, prev.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-bold hover:bg-stone-100 cursor-pointer">◀ Prev</button>
                  <span className="text-sm font-extrabold text-stone-800 min-w-32 text-center">{MONTH_NAMES[currentYearMonth.month]} {currentYearMonth.year}</span>
                  <button onClick={() => setCurrentYearMonth(prev => { const d = new Date(prev.year, prev.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })} className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-bold hover:bg-stone-100 cursor-pointer">Next ▶</button>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold pb-2 border-b border-stone-100">
                  <span className="text-rose-600">SUN</span><span className="text-stone-600">MON</span><span className="text-stone-600">TUE</span><span className="text-stone-600">WED</span><span className="text-stone-600">THU</span><span className="text-stone-600">FRI</span><span className="text-blue-600">SAT</span>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((dateStr, idx) => {
                    if (!dateStr) return <div key={`empty-${idx}`} className="h-24 rounded-2xl bg-stone-50/50 border border-transparent"></div>;

                    const dayNum = parseInt(dateStr.split('-')[2], 10);
                    const calEntry = calendarData[dateStr];
                    const isOpen = calEntry ? calEntry.is_open : true;
                    const hasCustomSlots = calEntry?.custom_slots && calEntry.custom_slots.length > 0;
                    const hasCustomHours = calEntry?.custom_cutoff_time || calEntry?.custom_acceptance_start;
                    const hasContext = calEntry?.weather || calEntry?.note || calEntry?.operating_radius;
                    const slotCount = hasCustomSlots ? calEntry.custom_slots!.length : settings.delivery_slots.length;
                    const dayTarget = calEntry?.target_stock != null ? calEntry.target_stock : settings.default_target_stock;
                    const isToday = dateStr === todayBizDate;

                    return (
                      <button
                        key={dateStr}
                        onClick={() => handleOpenCalendarModal(dateStr)}
                        className={`h-24 p-2 rounded-2xl border transition text-left flex flex-col justify-between cursor-pointer active:scale-95 ${isOpen ? 'bg-white hover:bg-emerald-50/50 border-stone-200 hover:border-emerald-300' : 'bg-rose-50/70 hover:bg-rose-100/80 border-rose-200'} ${isToday ? 'ring-2 ring-stone-900 shadow-md' : ''}`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className={`text-xs font-bold ${isToday ? 'text-stone-900 underline' : 'text-stone-700'}`}>{dayNum}</span>
                          {isToday && <span className="text-[9px] bg-stone-900 text-white px-1.5 py-0.2 rounded font-bold">Today</span>}
                        </div>

                        <div className="w-full space-y-1 text-center">
                          {isOpen ? (
                            <>
                              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border inline-block tracking-wide ${hasCustomSlots || hasCustomHours || hasContext ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>
                                ● {slotCount} slots {(hasCustomSlots || hasCustomHours || hasContext) ? '★' : ''}
                              </span>
                              <span className="text-[9px] text-stone-400 block">Target: {dayTarget}</span>
                            </>
                          ) : (
                            <span className="text-[10px] font-extrabold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded-full border border-rose-300 inline-block tracking-wide">✕ CLOSED</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-stone-100 text-[11px] text-stone-500">
                  <span className="text-stone-400">★ indicates date with custom settings or context data</span>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>Standard Open</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span><span>Custom Settings</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span><span>Closed</span></div>
                  </div>
                </div>
              </div>

              {/* カレンダーモーダル */}
              {selectedCalDate && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">

                    <div className="flex justify-between items-start border-b border-stone-100 pb-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-stone-400">Date Schedule & Context Configuration</span>
                        <h3 className="text-lg font-bold text-stone-900 mt-0.5">{selectedCalDate}</h3>
                      </div>
                      <button onClick={() => setSelectedCalDate(null)} className="text-stone-400 hover:text-stone-700 text-lg font-bold">✕</button>
                    </div>

                    {modalErrorMessage && <div className="p-3 rounded-xl text-xs font-bold text-left bg-rose-100 text-rose-700 border border-rose-200">{modalErrorMessage}</div>}

                    <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-2xl border border-stone-200">
                      <div>
                        <div className="text-xs font-bold text-stone-900">Day Master Status</div>
                        <div className="text-[11px] text-stone-500">Set whether this date accepts orders.</div>
                      </div>
                      <button onClick={() => setModalIsOpen(!modalIsOpen)} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${modalIsOpen ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-700 border-rose-300'}`}>
                        {modalIsOpen ? '● OPEN' : '✕ CLOSED'}
                      </button>
                    </div>

                    {modalIsOpen && (
                      <>
                        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                          <label className="text-xs font-bold text-stone-800 block">Target Shelf Stock for this Day (店頭目標在庫数)</label>
                          <div className="flex items-center gap-3">
                            <input type="number" placeholder={`Default (${settings.default_target_stock})`} value={modalTargetStock} onChange={(e) => setModalTargetStock(e.target.value === '' ? '' : Number(e.target.value))} className="w-32 px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900 text-center" />
                            <span className="text-xs text-stone-500">boxes</span>
                            {modalTargetStock !== '' && <button onClick={() => setModalTargetStock('')} className="text-[11px] text-stone-400 underline hover:text-stone-700">Reset to Default ({settings.default_target_stock})</button>}
                          </div>
                        </div>

                        {/* 個別ビジネス時間・データ切替時刻設定 */}
                        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-stone-800">Acceptance Hours & Cutoff Time</span>
                            <div className="flex gap-1 text-[10px] font-bold bg-stone-200 p-0.5 rounded-lg">
                              <button onClick={() => setModalUseCustomHours(false)} className={`px-2 py-1 rounded-md transition ${!modalUseCustomHours ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}`}>Default</button>
                              <button onClick={() => setModalUseCustomHours(true)} className={`px-2 py-1 rounded-md transition ${modalUseCustomHours ? 'bg-white text-purple-900 font-extrabold shadow-xs' : 'text-stone-500'}`}>★ Custom Hours</button>
                            </div>
                          </div>
                          {modalUseCustomHours ? (
                            <div className="space-y-3 pt-2 border-t border-stone-200 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-stone-600 font-medium">Business Cutoff (データ切替時刻):</span>
                                <select value={modalCutoffTime} onChange={(e) => setModalCutoffTime(e.target.value)} className="w-28 px-2 py-1.5 bg-white border border-stone-300 rounded-lg font-bold text-stone-800 outline-none cursor-pointer">
                                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-stone-600 font-medium">Order Acceptance Start (受付開始):</span>
                                <select value={modalAcceptStart} onChange={(e) => setModalAcceptStart(e.target.value)} className="w-28 px-2 py-1.5 bg-white border border-stone-300 rounded-lg font-bold text-stone-800 outline-none cursor-pointer">
                                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-stone-600 font-medium">Order Acceptance End (受付終了):</span>
                                <select value={modalAcceptEnd} onChange={(e) => setModalAcceptEnd(e.target.value)} className="w-28 px-2 py-1.5 bg-white border border-stone-300 rounded-lg font-bold text-stone-800 outline-none cursor-pointer">
                                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-stone-400 p-2 bg-white rounded-xl border border-dashed border-stone-200 text-center">Using default hours (Cutoff: {settings.business_cutoff_time}, Acceptance: {settings.order_acceptance_start} - {settings.order_acceptance_end}).</div>
                          )}
                        </div>

                        {/* ★ 日別のコンテキスト記録（ラディウス、天気、メモ） */}
                        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                          <span className="text-xs font-bold text-stone-800 block">Daily Context & Adjustments (日報・環境記録)</span>
                          <div className="space-y-3 pt-2 border-t border-stone-200 text-xs">
                            <div>
                              <label className="block text-[11px] font-bold text-stone-600 mb-1">Operating Radius Override (当日の配達範囲)</label>
                              <div className="flex items-center gap-3">
                                <input type="number" step="0.1" placeholder={`Default (${settings.delivery_radius_km} km)`} value={modalRadius} onChange={(e) => setModalRadius(e.target.value === '' ? '' : Number(e.target.value))} className="w-32 px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                                <span className="text-[10px] text-stone-400">km (空欄でデフォルト設定を適用)</span>
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-600 mb-1">Weather (天候)</label>
                              <select value={modalWeather} onChange={(e) => setModalWeather(e.target.value)} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900 cursor-pointer">
                                <option value="">▼ 選択しない (Unspecified)</option>
                                {WEATHER_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-stone-600 mb-1">Special Notes (特記事項・イベントなど)</label>
                              <textarea rows={2} placeholder="例: 三社祭の最終日。交通規制あり。" value={modalNote} onChange={(e) => setModalNote(e.target.value)} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-xs outline-none focus:border-stone-900 resize-none"></textarea>
                            </div>
                          </div>
                        </div>

                        {/* 個別スロット設定 */}
                        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-stone-800">Delivery Slots for this Day</span>
                            <div className="flex gap-1 text-[10px] font-bold bg-stone-200 p-0.5 rounded-lg">
                              <button onClick={() => { setModalUseCustomSlots(false); setModalSlots(JSON.parse(JSON.stringify(settings.delivery_slots))); }} className={`px-2 py-1 rounded-md transition ${!modalUseCustomSlots ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}`}>Default ({settings.delivery_slots.length} slots)</button>
                              <button onClick={() => setModalUseCustomSlots(true)} className={`px-2 py-1 rounded-md transition ${modalUseCustomSlots ? 'bg-white text-purple-900 font-extrabold shadow-xs' : 'text-stone-500'}`}>★ Custom Slots</button>
                            </div>
                          </div>
                          {modalUseCustomSlots ? (
                            <div className="space-y-2 pt-2 border-t border-stone-200">
                              {modalSlots.map((slot, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-stone-200 text-xs">
                                  <select value={slot.time} onChange={(e) => { const next = [...modalSlots]; next[idx].time = e.target.value; setModalSlots(next); }} className="w-24 px-2 py-1.5 border border-stone-300 rounded-lg text-xs font-bold bg-stone-50 text-stone-800 outline-none focus:border-stone-900 cursor-pointer">
                                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                                    {!TIME_OPTIONS.includes(slot.time) && <option key={slot.time} value={slot.time}>{slot.time}</option>}
                                  </select>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-stone-400">Max:</span>
                                    <input type="number" value={slot.limit} onChange={(e) => { const next = [...modalSlots]; next[idx].limit = Number(e.target.value); setModalSlots(next); }} className="w-14 px-2 py-1 border border-stone-300 rounded-lg text-xs font-bold text-center outline-none focus:border-stone-900" />
                                    <span className="text-[10px] text-stone-400">bxs</span>
                                  </div>
                                  <button onClick={() => { const next = [...modalSlots]; next[idx].is_active = !next[idx].is_active; setModalSlots(next); }} className={`px-2 py-1 rounded-md text-[10px] font-bold border ${slot.is_active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-stone-100 text-stone-400 border-stone-200'}`}>
                                    {slot.is_active ? 'Active' : 'Off'}
                                  </button>
                                  <button onClick={() => { if (modalSlots.length <= 1) return; setModalSlots(modalSlots.filter((_, i) => i !== idx)); }} className="text-stone-300 hover:text-rose-600 font-bold ml-auto px-1">🗑️</button>
                                </div>
                              ))}
                              <button onClick={() => setModalSlots([...modalSlots, { time: '11:00', limit: 10, is_active: true }])} className="w-full py-2 bg-stone-200/80 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold transition">＋ Add Custom Slot</button>
                            </div>
                          ) : (
                            <div className="text-[11px] text-stone-400 p-2 bg-white rounded-xl border border-dashed border-stone-200 text-center">This date uses the default {settings.delivery_slots.length} slots configured in Settings tab.</div>
                          )}
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setSelectedCalDate(null)} className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition">Cancel</button>
                      <button onClick={handleSaveCalendarModal} className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition shadow-sm">Save Date Settings</button>
                    </div>

                  </div>
                </div>
              )}

            </div>
          )}

          {/* =========================================
              4. SETTINGS TAB (完全版)
              ========================================= */}
          {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto space-y-6 pb-28">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-stone-900">Store Settings & Master Slots</h2>
                  <p className="text-xs text-stone-500 mt-0.5">Configure system defaults, distinct pricing channels, and delivery capacities.</p>
                </div>
              </div>

              {saveErrorMessage && <div className="p-3 rounded-xl text-xs font-bold text-left bg-rose-100 text-rose-700 border border-rose-200">{saveErrorMessage}</div>}

              {/* 1. 全体営業ステータス */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">1. Store Master Status</h3>
                <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                  <div>
                    <div className="text-xs font-bold text-stone-900">Accept New Orders (Instant Cutoff)</div>
                    <div className="text-[11px] text-stone-500 mt-0.5">Toggle OFF to immediately close order intake for all time slots.</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input type="checkbox" checked={settings.is_open} onChange={(e) => setSettings((prev) => ({ ...prev, is_open: e.target.checked }))} className="sr-only peer" />
                    <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              {/* 1.5. 営業時間・データ切替時刻の設定 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">1.5. Default Business Hours & Cutoff</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Business Cutoff (データ切替時刻)</label>
                    <select value={settings.business_cutoff_time} onChange={(e) => setSettings((prev) => ({ ...prev, business_cutoff_time: e.target.value }))} className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-none cursor-pointer">
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Order Acceptance Start (受付開始)</label>
                    <select value={settings.order_acceptance_start} onChange={(e) => setSettings((prev) => ({ ...prev, order_acceptance_start: e.target.value }))} className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-none cursor-pointer">
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Order Acceptance End (受付終了)</label>
                    <select value={settings.order_acceptance_end} onChange={(e) => setSettings((prev) => ({ ...prev, order_acceptance_end: e.target.value }))} className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-none cursor-pointer">
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-stone-400">※「Business Cutoff」を過ぎると、自動的に翌日の営業日に切り替わります。</p>
              </div>

              {/* 2. 店頭標準目標在庫 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">2. Store Default Target Inventory</h3>
                <div className="flex items-center justify-between">
                  <div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <label className="text-xs font-bold text-stone-700 block">Default Target Shelf Stock (/day)</label>
                    <p className="text-[10px] text-stone-400 mt-0.5">Baseline takeaway stock used to calculate Kitchen Suggestion.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" value={settings.default_target_stock} onChange={(e) => setSettings((prev) => ({ ...prev, default_target_stock: Number(e.target.value) }))} className="w-20 px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900 text-center" />
                    <span className="text-xs text-stone-500 font-medium">boxes</span>
                  </div>
                </div>
              </div>

              {/* 3. 料金 & VAT設定 (★ 店頭・デリバリー分離化) */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">3. Price & VAT Settings (Channel Independent)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Takeout Price (/box)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                      <input type="number" value={settings.takeout_price} onChange={(e) => setSettings((prev) => ({ ...prev, takeout_price: Number(e.target.value) }))} className="w-full pl-7 pr-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-600" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Delivery Price (/box)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                      <input type="number" value={settings.delivery_price} onChange={(e) => setSettings((prev) => ({ ...prev, delivery_price: Number(e.target.value) }))} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">Delivery Fee (/order)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs">¥</span>
                      <input type="number" value={settings.delivery_fee} onChange={(e) => setSettings((prev) => ({ ...prev, delivery_fee: Number(e.target.value) }))} className="w-full pl-7 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">VAT Rate (%)</label>
                    <div className="relative">
                      <input type="number" step="0.1" value={settings.vat_rate} onChange={(e) => setSettings((prev) => ({ ...prev, vat_rate: Number(e.target.value) }))} className="w-full pl-3 pr-8 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none focus:border-stone-900" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 text-xs font-bold">%</span>
                    </div>
                  </div>
                </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex flex-col items-center text-center h-full">
                    <span className="font-bold text-emerald-800 text-[11px] uppercase tracking-wider mb-1">Takeout Total (Per Box)</span>
                    <span className="text-3xl font-black text-emerald-900 font-mono">¥{(settings.takeout_price + calculatedTakeoutVat).toLocaleString()}</span>
                    <span className="text-[10px] text-emerald-600 mt-1.5 font-medium">Base: ¥{settings.takeout_price.toLocaleString()} + Tax: ¥{calculatedTakeoutVat.toLocaleString()}</span>
                  </div>
                  <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex flex-col items-center text-center h-full">
                    <span className="font-bold text-stone-700 text-[11px] uppercase tracking-wider mb-1">Delivery Total (Per Box)</span>
                    <span className="text-3xl font-black text-stone-900 font-mono">¥{(settings.delivery_price + calculatedDeliveryVat).toLocaleString()}</span>
                    <span className="text-[10px] text-stone-500 mt-1.5 font-medium">Base: ¥{settings.delivery_price.toLocaleString()} + Tax: ¥{calculatedDeliveryVat.toLocaleString()}</span>
                    <div className="mt-auto pt-3">
                      <div className="bg-white border border-stone-200 text-stone-500 text-[9px] px-2.5 py-0.5 rounded-full font-bold shadow-xs">
                        + Delivery Fee ¥{settings.delivery_fee.toLocaleString()} / Order
                      </div>
                    </div>
                  </div>
                </div>
              </div>
</div>
              {/* 4. 配達エリア設定 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-100 pb-2">4. Delivery Coverage</h3>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[11px] font-bold text-stone-600">Default Delivery Radius (km)</label>
                    <span className="font-extrabold text-sm text-stone-900">{Number(settings.delivery_radius_km).toFixed(1)} km</span>
                  </div>
                  <input type="range" min="1.0" max="5.0" step="0.1" value={settings.delivery_radius_km} onChange={(e) => setSettings((prev) => ({ ...prev, delivery_radius_km: Number(e.target.value) }))} className="w-full accent-stone-900" />
                  <p className="text-[10px] text-stone-400 mt-1">※Adjusting this value filters available hotels on customer order page automatically. Can be overridden in Daily Calendar.</p>
                </div>
              </div>

              {/* 6. ホテル・ホステル管理セクション (自動スキャン連動版) */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-5">
                <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                  <div>
                    <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">6. Hotel Master & Auto-Discovery</h3>
                    <p className="text-[10px] text-stone-400 mt-0.5">Manage delivery destinations, review auto-discovered properties, and set NG rules.</p>
                  </div>
                  <button onClick={handleTriggerAutoDiscovery} disabled={isScanning} className="text-xs bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-400 text-white px-3.5 py-2 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm">
                    <span>{isScanning ? '⏳' : '🌐'}</span> {isScanning ? 'Scanning Radius...' : 'Scan New Hotels'}
                  </button>
                </div>

                {hotels.filter(h => h.status === 'pending').length > 0 && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                      <h4 className="text-xs font-extrabold text-amber-900 uppercase tracking-wide">Pending Approval ({hotels.filter(h => h.status === 'pending').length})</h4>
                    </div>
                    <div className="space-y-2">
                      {hotels.filter(h => h.status === 'pending').map((h) => (
                        <PendingHotelCard key={h.id} hotel={h} existingAreas={existingAreas} onApprove={handleApprovePendingHotel} onReject={(id, reason) => handleUpdateHotelStatus(id, 'ng', reason)} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-stone-600 uppercase tracking-wider block">Registered Hotels & Hostels ({hotels.filter(h => h.status !== 'pending').length} items)</span>
                  <div className="overflow-x-auto max-h-96 border border-stone-200 rounded-2xl">
                    <table className="w-full text-left text-xs text-stone-700 border-collapse">
                      <thead className="bg-stone-50 sticky top-0 border-b border-stone-200 text-stone-400 uppercase text-[10px] z-10">
                        <tr>
                          <th className="py-2.5 px-3">Hotel Name</th><th className="py-2.5 px-3">Area Group</th><th className="py-2.5 px-3">Status</th><th className="py-2.5 px-3 text-center">Action / NG Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {hotels.filter(h => h.status !== 'pending').map((h) => (
                          <RegisteredHotelRow key={h.id} hotel={h} existingAreas={existingAreas} onUpdateDetails={handleUpdateHotelDetails} onUpdateStatus={handleUpdateHotelStatus} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                  <span className="text-xs font-bold text-stone-800 block">＋ Manually Add Hotel / ホテルを手学登録</span>
                  <form onSubmit={handleAddHotelManual} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 mb-1">Hotel Name (English) *</label>
                      <input type="text" placeholder="e.g. Asakusa View Hotel" value={newHotelName} onChange={(e) => setNewHotelName(e.target.value)} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl font-bold text-stone-800 outline-none focus:border-stone-900" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 mb-1">Hotel Name (Japanese)</label>
                      <input type="text" placeholder="例: 浅草ビューホテル" value={newHotelNameJa} onChange={(e) => setNewHotelNameJa(e.target.value)} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl font-bold text-stone-800 outline-none focus:border-stone-900" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 mb-1">Area Group</label>
                      <input type="text" value={newHotelArea} onChange={(e) => setNewHotelArea(e.target.value)} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl font-bold text-stone-800 outline-none focus:border-stone-900" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 mb-1">Address *</label>
                      <input type="text" placeholder="東京都台東区西浅草3-17-1" value={newHotelAddress} onChange={(e) => setNewHotelAddress(e.target.value)} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl font-bold text-stone-800 outline-none focus:border-stone-900" />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1"><label className="block text-[10px] font-bold text-stone-500 mb-1">Latitude (Lat)</label><input type="text" value={newHotelLat} onChange={(e) => setNewHotelLat(e.target.value)} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl font-mono text-xs font-bold text-stone-800 outline-none focus:border-stone-900" /></div>
                      <div className="flex-1"><label className="block text-[10px] font-bold text-stone-500 mb-1">Longitude (Lng)</label><input type="text" value={newHotelLng} onChange={(e) => setNewHotelLng(e.target.value)} className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl font-mono text-xs font-bold text-stone-800 outline-none focus:border-stone-900" /></div>
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className="w-full py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm">Add to Master Database</button>
                    </div>
                  </form>
                </div>
              </div>

              {/* 5. 動的デリバリースロット基本設定 */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
                <div className="flex justify-between items-center border-b border-stone-100 pb-2">
                  <div>
                    <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">7. Default Delivery Slots & Capacity</h3>
                    <p className="text-[10px] text-stone-400 mt-0.5">Select delivery time slots easily without typing.</p>
                  </div>
                  <button onClick={handleAddDefaultSlot} className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-800 px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer">＋ Add Slot</button>
                </div>

                <div className="space-y-2.5">
                  {settings.delivery_slots.map((slot, index) => (
                    <div key={index} className={`flex items-center justify-between p-3 rounded-2xl border transition ${slot.is_active ? 'bg-stone-50 border-stone-200' : 'bg-rose-50/40 border-rose-200'}`}>
                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={slot.is_active} onChange={(e) => handleUpdateDefaultSlot(index, 'is_active', e.target.checked)} className="sr-only peer" />
                          <div className="w-9 h-5 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-stone-500">Slot Time:</span>
                          <select value={slot.time} onChange={(e) => handleUpdateDefaultSlot(index, 'time', e.target.value)} className="w-24 px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-none focus:border-stone-900 cursor-pointer">
                            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                            {!TIME_OPTIONS.includes(slot.time) && <option key={slot.time} value={slot.time}>{slot.time}</option>}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-stone-500">Max Limit:</span>
                          <input type="number" value={slot.limit} onChange={(e) => handleUpdateDefaultSlot(index, 'limit', Number(e.target.value))} className="w-16 px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-bold text-center outline-none focus:border-stone-900" />
                          <span className="text-[10px] text-stone-400">boxes</span>
                        </div>
                        <button onClick={() => handleDeleteDefaultSlot(index)} className="text-stone-400 hover:text-rose-600 transition text-sm p-1 cursor-pointer" title="Delete this slot">🗑️</button>
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
                  <button onClick={handleSaveSettings} disabled={isSaving} className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm transition active:scale-95 disabled:bg-stone-400 cursor-pointer">
                    {isSaving ? 'Saving...' : 'Save All Settings'}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* =========================================
              5. ANALYTICS TAB
              ========================================= */}
          {activeTab === 'analytics' && (
            <AnalyticsPage
              activeOrders={activeOrders}
              inventory={inventory}
              effectiveTodaySlots={effectiveTodaySlots}
              slotStats={slotStats}
              takeoutPrice={settings.takeout_price}
              deliveryPrice={settings.delivery_price}
              takeoutVat={calculatedTakeoutVat}
              deliveryVat={calculatedDeliveryVat}
              soldOutLogs={soldOutLogs}
              hotels={hotels}
              todayCalendar={todayCalendar}
            />
          )}

        </div>

        {/* --- 保存成功ポップアップ --- */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">✓</div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-stone-900">Settings Saved Successfully!</h3>
                <p className="text-xs text-stone-500">Your store settings have been updated.</p>
              </div>
              <button onClick={() => setShowSuccessModal(false)} className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer">OK</button>
            </div>
          </div>
        )}

      </div>
    </>
  );
}