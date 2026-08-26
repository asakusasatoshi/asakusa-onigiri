'use client';

import React, { useState } from 'react';
import { HOTELS_MASTER } from '@/data/hotels';
import { supabase } from '@/lib/supabase';
import { sanitizeRoomNumber, sanitizeName, sanitizeEmail } from '@/utils/sanitize';

const PRICE_PER_SET = 1800;
const DELIVERY_SLOTS = ['07:00', '08:00', '09:00', '10:00'];

// ホテル一覧をアルファベット順（A-Z）にソート
const sortedHotels = [...HOTELS_MASTER].sort((a, b) => a.name.localeCompare(b.name));

export default function OrderPage() {
  const [selectedHotel, setSelectedHotel] = useState(sortedHotels[0]?.name || '');
  const [roomNumber, setRoomNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [deliverySlot, setDeliverySlot] = useState(DELIVERY_SLOTS[0]);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const cleanRoom = sanitizeRoomNumber(roomNumber);
    const cleanFirstName = sanitizeName(firstName);
    const cleanLastName = sanitizeName(lastName);
    const cleanEmail = sanitizeEmail(email);
    const fullName = `${cleanFirstName} ${cleanLastName}`.trim();

    if (!cleanRoom || !cleanFirstName || !cleanLastName || !cleanEmail) {
      setMessage('Please fill in all required fields correctly.');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.from('orders').insert([
        {
          hotel_name: selectedHotel,
          hotel: selectedHotel,
          room_number: cleanRoom,
          guest_name: fullName,
          name: fullName,
          contact_email: cleanEmail,
          email: cleanEmail,
          delivery_time: deliverySlot,
          delivery_slot: deliverySlot,
          quantity: quantity,
          total_price: quantity * PRICE_PER_SET,
          status: 'pending',
        },
      ]);

      if (error) throw error;

      setMessage('Order placed successfully! We will prepare your authentic breakfast.');
      setRoomNumber('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setQuantity(1);
    } catch (err: any) {
      setMessage(`Failed to place order: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-stone-50 text-stone-800 p-6 flex justify-center items-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-stone-200 space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-wide text-stone-900">ASAKUSA ONIGIRI</h1>
          <p className="text-xs text-stone-500 mt-1">Authentic Morning Delivery for Hotel Guests</p>
        </div>

        {/* ホテル選択（A-Z順） */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">Hotel</label>
          <select
            value={selectedHotel}
            onChange={(e) => setSelectedHotel(e.target.value)}
            className="w-full p-3 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
          >
            {sortedHotels.map((h) => (
              <option key={h.id || h.name} value={h.name}>
                {h.name}
              </option>
            ))}
          </select>
        </div>

        {/* 部屋番号 */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">Room Number</label>
          <input
            type="text"
            required
            placeholder="e.g. 502"
            value={roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
            className="w-full p-3 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
        </div>

        {/* 氏名（First / Last 分離） */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">First Name</label>
            <input
              type="text"
              required
              placeholder="John"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full p-3 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">Last Name</label>
            <input
              type="text"
              required
              placeholder="Doe"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full p-3 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>
        </div>

        {/* メールアドレス */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">Email (for Receipt)</label>
          <input
            type="email"
            required
            placeholder="john@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
        </div>

        {/* 配達スロット */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">Delivery Time Slot</label>
          <div className="grid grid-cols-4 gap-2">
            {DELIVERY_SLOTS.map((slot) => (
              <button
                type="button"
                key={slot}
                onClick={() => setDeliverySlot(slot)}
                className={`py-2 text-xs font-semibold rounded-xl border transition ${
                  deliverySlot === slot
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        {/* 数量 */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">Quantity (Sets)</label>
          <div className="flex items-center justify-between bg-stone-50 p-3 rounded-xl border border-stone-200">
            <span className="text-sm font-semibold text-stone-700">Traditional Onigiri Set</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 bg-white border border-stone-300 rounded-lg font-bold text-stone-700 hover:bg-stone-100"
              >
                -
              </button>
              <span className="font-bold text-base w-4 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="w-8 h-8 bg-white border border-stone-300 rounded-lg font-bold text-stone-700 hover:bg-stone-100"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* 合計金額 */}
        <div className="pt-2 border-t border-stone-200 flex justify-between items-baseline">
          <span className="text-xs text-stone-500 uppercase tracking-wider font-semibold">Total</span>
          <span className="text-2xl font-bold text-stone-900">¥{(quantity * PRICE_PER_SET).toLocaleString()}</span>
        </div>

        {message && (
          <div className="p-3 bg-stone-100 text-xs rounded-xl border border-stone-300 text-stone-700">
            {message}
          </div>
        )}

        {/* 注文ボタン */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-stone-900 text-white font-medium py-3 rounded-xl hover:bg-stone-800 disabled:bg-stone-300 transition text-sm shadow-sm"
        >
          {loading ? 'Processing...' : `Place Order (¥${(quantity * PRICE_PER_SET).toLocaleString()})`}
        </button>
      </form>
    </main>
  );
}