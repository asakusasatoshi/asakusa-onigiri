'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// 浅草の主要ホテル初期リスト
const INITIAL_HOTELS = [
  { id: 1, name: "Sakura Hostel Asakusa (サクラホステル浅草)" },
  { id: 2, name: "Richmond Hotel Premier Asakusa (リッチモンドホテルプレミア浅草)" },
  { id: 3, name: "Richmond Hotel Asakusa (リッチモンドホテル浅草)" },
  { id: 4, name: "Onyado Nono Asakusa Hot Springs (天然温泉 凌雲の湯 御宿 野乃 浅草)" },
  { id: 5, name: "Onyado Nono Asakusa Bettei (天然温泉 凌雲の湯 御宿 野乃 浅草別邸)" },
  { id: 6, name: "Asakusa View Hotel Annex Rokku (浅草ビューホテル アネックス 六区)" },
  { id: 7, name: "Hotel Keihan Asakusa (ホテル京阪 浅草)" },
  { id: 8, name: "Asakusa View Hotel (浅草ビューホテル)" },
  { id: 9, name: "Hotel Tavinos Asakusa (ホテルタビノス浅草)" },
  { id: 10, name: "THE KANZASHI TOKYO ASAKUSA (ザ カンザシ 東京浅草)" },
  { id: 11, name: "TOSEI HOTEL COCONE ASAKUSA (トーセイホテル ココネ浅草)" },
  { id: 12, name: "Smile Hotel Asakusa (スマイルホテル浅草)" },
  { id: 13, name: "MUSTARD HOTEL ASAKUSA 1 (マスタードホテル浅草1)" },
  { id: 14, name: "MUSTARD HOTEL ASAKUSA 2 (マスタードホテル浅草2)" },
  { id: 15, name: "Dormy Inn Express Asakusa (展望大浴場 あさひ湯 ドーミーインEXPRESS浅草)" },
  { id: 16, name: "THE GATE HOTEL Asakusa Kaminarimon by HULIC (ザ・ゲートホテル雷門 by HULIC)" }
];

export default function Home() {
  const [hotels, setHotels] = useState(INITIAL_HOTELS);
  const [hotelId, setHotelId] = useState<string>('1');
  const [roomNumber, setRoomNumber] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('08:00 AM');
  const [guestName, setGuestName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const unitPrice = 1800;

  useEffect(() => {
    const fetchHotels = async () => {
      try {
        const { data, error } = await supabase
          .from('hotels')
          .select('*')
          .order('id', { ascending: true });

        if (data && data.length > 0) {
          const formatted = data.map((h: any) => ({
            id: h.id,
            name: h.name || h.hotel_name || `${h.name_en || ''} (${h.name_ja || ''})`.trim()
          }));
          setHotels(formatted);
          setHotelId(formatted[0].id.toString());
        }
      } catch (e) {
        console.error('ホテル一覧取得:', e);
      }
    };
    fetchHotels();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccess(false);

    try {
      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('orders').insert([
        {
          order_date: today,
          delivery_slot: deliverySlot,
          hotel_id: parseInt(hotelId) || 1,
          room_number: roomNumber,
          guest_name: guestName,
          contact_email: contactEmail,
          quantity: quantity,
          total_price: quantity * unitPrice,
        },
      ]);

      if (error) throw error;

      setSuccess(true);
      setRoomNumber('');
      setGuestName('');
      setContactEmail('');
      setQuantity(1);
    } catch (err: any) {
      setErrorMsg(err.message || '注文の送信に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen py-10 px-4 flex flex-col items-center">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-[#e5e0d8] shadow-sm p-6 sm:p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-[#2d2926]">
            浅草おにぎりデリバリー
          </h1>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">
            Artisanal Tokyo Onigiri Breakfast Box
          </p>
        </div>

        {/* メニュー案内 */}
        <div className="bg-[#faf9f6] border border-[#e5e0d8] rounded-xl p-4 mb-6">
          <h2 className="text-xs font-bold text-[#8c7355] uppercase tracking-wider mb-2">
            TODAY'S 4 FLAVORS BOX (¥1,800)
          </h2>
          <ul className="text-xs space-y-1 text-gray-700">
            <li>• Grilled Salmon (秋鮭塩焼き)</li>
            <li>• Kishu Umeboshi (紀州南高梅)</li>
            <li>• Spicy Takana (辛子高菜)</li>
            <li>• Spicy Cod Roe (博多明太子)</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">
              Delivery Hotel
            </label>
            <select
              value={hotelId}
              onChange={(e) => setHotelId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c7355] bg-white"
              required
            >
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">
                Room Number
              </label>
              <input
                type="text"
                placeholder="e.g. 502"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c7355]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">
                Delivery Slot
              </label>
              <select
                value={deliverySlot}
                onChange={(e) => setDeliverySlot(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c7355] bg-white"
              >
                <option value="07:00 AM">07:00 AM</option>
                <option value="08:00 AM">08:00 AM</option>
                <option value="09:00 AM">09:00 AM</option>
                <option value="10:00 AM">10:00 AM</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">
              Guest Full Name
            </label>
            <input
              type="text"
              placeholder="John Doe"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c7355]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">
              Contact Email
            </label>
            <input
              type="email"
              placeholder="john@example.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#8c7355]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">
              Quantity (Boxes)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="1"
                max="10"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 px-3 py-2.5 rounded-lg border border-gray-300 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-[#8c7355]"
              />
              <span className="font-bold text-base text-[#2d2926]">
                Total: ¥{(quantity * unitPrice).toLocaleString()}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 bg-[#2d2926] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-black transition-colors disabled:bg-gray-400 cursor-pointer"
          >
            {isSubmitting
              ? 'Processing...'
              : `Place Order (¥${(quantity * unitPrice).toLocaleString()})`}
          </button>
        </form>

        {success && (
          <div className="mt-4 p-3 bg-green-50 text-green-700 text-xs rounded-lg border border-green-200 text-center font-medium">
            Order placed successfully! We are preparing your breakfast.
          </div>
        )}
      </div>
    </main>
  );
}