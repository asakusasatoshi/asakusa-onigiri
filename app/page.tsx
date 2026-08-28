'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface SlotConfig {
  time: string;
  limit: number;
  is_active: boolean;
}

interface HotelItem {
  id: string | number;
  name: string;
  nameJa?: string;
  lat: number;
  lng: number;
  areaGroup?: string;
  area?: string;
}

const DEFAULT_SLOTS: SlotConfig[] = [
  { time: '07:00', limit: 10, is_active: true },
  { time: '08:00', limit: 15, is_active: true },
  { time: '09:00', limit: 15, is_active: true },
  { time: '10:00', limit: 10, is_active: true },
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

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function OrderPage() {
  const [hotels, setHotels] = useState<HotelItem[]>([]);
  
  const [selectedHotel, setSelectedHotel] = useState<HotelItem | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [roomNumber, setRoomNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('');
  const [quantity, setQuantity] = useState(1);

  const [itemPrice, setItemPrice] = useState(1600);
  const [deliveryFee, setDeliveryFee] = useState(150);
  const [vatRate, setVatRate] = useState(10);
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(2.5);
  const [isStoreMasterOpen, setIsStoreMasterOpen] = useState(true);
  const [isCalendarOpenToday, setIsCalendarOpenToday] = useState(true);
  const [businessCutoffTime, setBusinessCutoffTime] = useState('18:00');
  const [orderAcceptanceStart, setOrderAcceptanceStart] = useState('07:00');
  const [orderAcceptanceEnd, setOrderAcceptanceEnd] = useState('22:00');

  const [activeSlots, setActiveSlots] = useState<SlotConfig[]>(DEFAULT_SLOTS);
  const [slotBookedBoxes, setSlotBookedBoxes] = useState<Record<string, number>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<any>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000); 
    return () => clearInterval(timer);
  }, []);
  
  const rawCurrentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<{ [key: string]: any }>({});
  const userMarkerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const isMapInitializedRef = useRef(false);
  const hasAutoLocatedRef = useRef(false);

  const isTimeWithinAcceptance = useMemo(() => {
    const [startH, startM] = orderAcceptanceStart.split(':').map(Number);
    const [endH, endM] = orderAcceptanceEnd.split(':').map(Number);

    const startMinutes = (startH || 0) * 60 + (startM || 0);
    let endMinutes = (endH || 22) * 60 + (endM || 0);
    
    if (endMinutes <= startMinutes) {
      endMinutes += 1440;
    }

    let checkMinutes = rawCurrentMinutes;
    if (checkMinutes < startMinutes && endMinutes > 1440) {
      checkMinutes += 1440;
    }

    return checkMinutes >= startMinutes && checkMinutes <= endMinutes;
  }, [orderAcceptanceStart, orderAcceptanceEnd, rawCurrentMinutes]);

  const cutoffHour = parseInt((businessCutoffTime || '18:00').split(':')[0], 10) || 18;
  const isStoreOpen = isStoreMasterOpen && isCalendarOpenToday && isTimeWithinAcceptance;

  const vatAmount = useMemo(() => {
    return Math.round(itemPrice * (vatRate / 100));
  }, [itemPrice, vatRate]);

  useEffect(() => {
    const fetchHotels = async () => {
      const { data, error } = await supabase
        .from('hotels')
        .select('*')
        .eq('status', 'published');

      if (data && !error) {
        const loadedHotels: HotelItem[] = data.map((h: any) => ({
          id: h.id,
          name: h.name,
          nameJa: h.name_ja,
          lat: h.lat,
          lng: h.lng,
          area: h.area,
        }));
        setHotels(loadedHotels);
      }
    };
    fetchHotels();
  }, []);

  const fetchPageData = async () => {
    let cutoff = '18:00';
    let start = '07:00';
    let end = '22:00';
    let defaultSlots = DEFAULT_SLOTS;

    const { data: setData } = await supabase.from('settings').select('*').eq('id', 'default_settings').maybeSingle();
    if (setData) {
      setItemPrice(setData.item_price ?? 1600);
      setDeliveryFee(setData.delivery_fee ?? 150);
      
      if (setData.vat_rate != null) {
        setVatRate(setData.vat_rate);
      } else if (setData.tax_amount != null && setData.item_price) {
        setVatRate(Math.round((setData.tax_amount / setData.item_price) * 100));
      } else {
        setVatRate(10);
      }

      setDeliveryRadiusKm(setData.delivery_radius_km ?? 2.5);
      setIsStoreMasterOpen(setData.is_open ?? true);

      if (setData.business_cutoff_time) cutoff = setData.business_cutoff_time;
      if (setData.order_acceptance_start) start = setData.order_acceptance_start;
      if (setData.order_acceptance_end) end = setData.order_acceptance_end;

      setBusinessCutoffTime(cutoff);
      setOrderAcceptanceStart(start);
      setOrderAcceptanceEnd(end);

      if (Array.isArray(setData.delivery_slots) && setData.delivery_slots.length > 0) {
        defaultSlots = setData.delivery_slots;
      } else if (typeof setData.delivery_slots === 'string') {
        try {
          defaultSlots = JSON.parse(setData.delivery_slots);
        } catch {
          defaultSlots = DEFAULT_SLOTS;
        }
      }
    }

    const todayBizDate = getBusinessDateStr(new Date(), parseInt(cutoff.split(':')[0], 10) || 18);

    let finalSlots = defaultSlots;
    const { data: calData } = await supabase.from('store_calendar').select('*').eq('date', todayBizDate).maybeSingle();
    if (calData) {
      setIsCalendarOpenToday(calData.is_open ?? true);

      if (calData.custom_cutoff_time) setBusinessCutoffTime(calData.custom_cutoff_time);
      if (calData.custom_acceptance_start) setOrderAcceptanceStart(calData.custom_acceptance_start);
      if (calData.custom_acceptance_end) setOrderAcceptanceEnd(calData.custom_acceptance_end);

      let customSlots = calData.custom_slots;
      if (typeof customSlots === 'string') {
        try {
          customSlots = JSON.parse(customSlots);
        } catch {
          customSlots = null;
        }
      }
      if (Array.isArray(customSlots) && customSlots.length > 0) {
        finalSlots = customSlots;
      }
    } else {
      setIsCalendarOpenToday(true);
    }

    const enabledSlots = finalSlots.filter((s) => s.is_active);
    const slotsToApply = enabledSlots.length > 0 ? enabledSlots : finalSlots;
    setActiveSlots(slotsToApply);

    const { data: orderData } = await supabase.from('orders').select('*');
    if (orderData) {
      const counts: Record<string, number> = {};
      orderData.forEach((o: any) => {
        const orderDateStr = getBusinessDateStr(new Date(o.created_at), cutoffHour);
        if (orderDateStr === todayBizDate && o.status !== 'cancelled' && o.status !== 'undelivered') {
          const slot = o.delivery_time || o.delivery_slot || o.slot || '08:00';
          const qty = o.quantity || o.qty || 1;
          counts[slot] = (counts[slot] || 0) + qty;
        }
      });
      setSlotBookedBoxes(counts);
    }
  };

  useEffect(() => {
    fetchPageData();
    const interval = setInterval(fetchPageData, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeSlots.length > 0) {
      const exists = activeSlots.some((s) => s.time === deliverySlot);
      if (!exists) {
        setDeliverySlot(activeSlots[0].time);
      }
    }
  }, [activeSlots, deliverySlot]);

  const availableHotels = useMemo(() => {
    return hotels.filter((h) => {
      const dist = calculateDistanceKm(35.7148, 139.7967, h.lat, h.lng);
      return dist <= deliveryRadiusKm;
    });
  }, [hotels, deliveryRadiusKm]);

  // ★変更箇所：既存のエリア名フォーマットに完全対応
  const groupedHotels = useMemo(() => {
    const formatAreaName = (areaStr?: string) => {
      if (!areaStr) return 'Other Areas';
      if (areaStr.toLowerCase().endsWith('area')) {
        return areaStr;
      }
      const match = areaStr.match(/\((.*?)\)/);
      if (match && match[1]) {
        return match[1].trim() + ' Area';
      }
      return areaStr + ' Area';
    };

    const groups: Record<string, HotelItem[]> = {};

    availableHotels.forEach((h: any) => {
      const areaName = formatAreaName(h.area); 
      if (!groups[areaName]) {
        groups[areaName] = [];
      }
      groups[areaName].push(h);
    });

    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => a.name.localeCompare(b.name));
    });

    return Object.keys(groups).sort().map((key) => ({
      area: key,
      hotels: groups[key],
    }));
  }, [availableHotels]);

  const availableSlotsCount = useMemo(() => {
    return activeSlots.filter((slot) => {
      const booked = slotBookedBoxes[slot.time] || 0;
      const [slotH, slotM] = slot.time.split(':').map(Number);
      
      let slotMinutes = slotH * 60 + slotM;
      const [startH] = orderAcceptanceStart.split(':').map(Number);
      
      if ((startH || 0) > slotH) {
        slotMinutes += 1440;
      }
      
      let checkMinutes = rawCurrentMinutes;
      if (checkMinutes < (startH || 0) * 60 && ((startH || 0) > parseInt(orderAcceptanceEnd.split(':')[0] || '22'))) {
        checkMinutes += 1440;
      }

      const isPastCutoff = checkMinutes >= (slotMinutes - 120);
      
      const isSoldOut = !slot.is_active || booked >= slot.limit || !isStoreOpen || isPastCutoff;
      return !isSoldOut;
    }).length;
  }, [activeSlots, slotBookedBoxes, isStoreOpen, rawCurrentMinutes, orderAcceptanceStart, orderAcceptanceEnd]);

  const isOrderingAvailable = isStoreOpen && availableSlotsCount > 0;

  const handleDetectLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;
        setUserLocation({ lat: uLat, lng: uLng });
        setIsLocating(false);

        let nearest: HotelItem | null = null;
        let minDistance = 0.5;

        hotels.forEach((h) => {
          const dist = calculateDistanceKm(uLat, uLng, h.lat, h.lng);
          if (dist < minDistance) {
            minDistance = dist;
            nearest = h;
          }
        });

        if (nearest) {
          setSelectedHotel(nearest);
        } else if (mapInstanceRef.current) {
          mapInstanceRef.current.panTo([uLat, uLng], { animate: true });
        }
      },
      () => {
        setIsLocating(false);
        alert('Could not retrieve your location. Please select your hotel manually below.');
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  useEffect(() => {
    if (hotels.length > 0 && !hasAutoLocatedRef.current) {
      hasAutoLocatedRef.current = true;
      handleDetectLocation();
    }
  }, [hotels]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadLeaflet = () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!(window as any).L) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => buildMap();
        document.body.appendChild(script);
      } else {
        buildMap();
      }
    };

    const buildMap = () => {
      const L = (window as any).L;
      if (!L || !mapContainerRef.current || isMapInitializedRef.current) return;

      const shopLat = 35.7148;
      const shopLng = 139.7967;

      const map = L.map(mapContainerRef.current, {
        center: [shopLat, shopLng],
        zoom: 14.5,
        minZoom: 12,
        maxZoom: 19,
        zoomControl: true,
      });

      L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        maxZoom: 20,
      }).addTo(map);

      const circle = L.circle([shopLat, shopLng], {
        radius: deliveryRadiusKm * 1000,
        color: '#059669',
        fillColor: '#10b981',
        fillOpacity: 0.1,
        weight: 2,
      }).addTo(map);
      circleRef.current = circle;

      const shopIcon = L.divIcon({
        className: 'custom-shop-pin',
        html: `<div style="background-color: #1c1917; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; border: 2.5px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4);">🍙</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      L.marker([shopLat, shopLng], { icon: shopIcon })
        .addTo(map)
        .bindPopup('<b style="font-size:12px; color:#1c1917;">ASAKUSA ONIGIRI (Kitchen)</b>');

      mapInstanceRef.current = map;
      isMapInitializedRef.current = true;
      renderHotelMarkers();
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        isMapInitializedRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstanceRef.current || !userLocation) return;
    const map = mapInstanceRef.current;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
    }

    const userIcon = L.divIcon({
      className: 'custom-user-pin',
      html: `
        <div style="position: relative; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;">
          <div style="width: 14px; height: 14px; background-color: #2563eb; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 0 8px rgba(37,99,235,0.8); z-index: 2;"></div>
          <div style="position: absolute; top: -4px; left: -4px; width: 22px; height: 22px; border-radius: 50%; background-color: rgba(37,99,235,0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        </div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    const marker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
      .addTo(map)
      .bindTooltip('<b style="font-size:11px;">Your Location / 現在地</b>', { direction: 'top', offset: [0, -10] });

    userMarkerRef.current = marker;
  }, [userLocation]);

  const renderHotelMarkers = () => {
    const L = (window as any).L;
    if (!L || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    Object.values(markersRef.current).forEach((m: any) => map.removeLayer(m));
    markersRef.current = {};

    availableHotels.forEach((h) => {
      const hotelIcon = L.divIcon({
        className: 'custom-hotel-pin',
        html: `<div id="pin-${h.id}" style="background-color: #ffffff; color: #1c1917; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid #57534e; box-shadow: 0 2px 6px rgba(0,0,0,0.3); cursor: pointer; transition: all 0.2s ease;">🏨</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const marker = L.marker([h.lat, h.lng], { icon: hotelIcon }).addTo(map);

      marker.bindTooltip(
        `<div style="font-family:sans-serif; font-weight:bold; font-size:11px; color:#1c1917; padding:1px 3px;">${h.name}</div>`,
        { direction: 'top', offset: [0, -13], opacity: 0.95 }
      );

      marker.bindPopup(`
        <div style="font-family:sans-serif; min-width:160px; padding:2px;">
          <div style="font-size:12px; font-weight:800; color:#1c1917;">${h.name}</div>
          ${h.nameJa ? `<div style="font-size:10px; color:#78716c; margin-top:1px;">${h.nameJa}</div>` : ''}
          <div style="margin-top:6px;">
            <span style="font-size:9px; font-weight:bold; background:#ecfdf5; color:#047857; padding:2px 6px; border-radius:4px; border:1px solid #a7f3d0;">
              ✓ Delivery Available
            </span>
          </div>
        </div>
      `, {
        offset: [0, -10],
        autoPan: false
      });

      marker.on('click', () => {
        setSelectedHotel(h);
      });

      markersRef.current[String(h.id)] = marker;
    });
  };

  useEffect(() => {
    if (isMapInitializedRef.current) {
      renderHotelMarkers();
    }
  }, [availableHotels]);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstanceRef.current || !selectedHotel) return;

    const map = mapInstanceRef.current;
    const targetMarker = markersRef.current[String(selectedHotel.id)];

    availableHotels.forEach((h) => {
      const el = document.getElementById(`pin-${h.id}`);
      if (el) {
        if (String(h.id) === String(selectedHotel.id)) {
          el.style.backgroundColor = '#059669';
          el.style.color = '#ffffff';
          el.style.borderColor = '#ffffff';
          el.style.transform = 'scale(1.3)';
          el.style.boxShadow = '0 0 12px rgba(5, 150, 105, 0.7)';
        } else {
          el.style.backgroundColor = '#ffffff';
          el.style.color = '#1c1917';
          el.style.borderColor = '#57534e';
          el.style.transform = 'scale(1)';
          el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        }
      }
    });

    if (targetMarker) {
      map.setView([selectedHotel.lat, selectedHotel.lng], 15.5, { animate: true, duration: 0.5 });
      targetMarker.openPopup();
    }
  }, [selectedHotel, availableHotels]);

  const subtotal = itemPrice * quantity;
  const deliveryTotal = deliveryFee;
  const vatTotal = vatAmount * quantity;
  const totalPrice = subtotal + deliveryTotal + vatTotal;

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOrderingAvailable) {
      alert('Sorry, we are currently closed or all slots are sold out. / 現在受付時間外、または全てのスロットが完売しています。');
      return;
    }
    if (!selectedHotel) {
      alert('Please select your hotel.');
      return;
    }
    if (!roomNumber.trim() || !firstName.trim() || !lastName.trim() || !contactEmail.trim()) {
      alert('Please fill in all required fields.');
      return;
    }

    const roomRegex = /^[0-9A-Z]+$/;
    if (!roomRegex.test(roomNumber.trim())) {
      alert('Room Number must be half-width numbers and uppercase letters only (e.g., 502A). / 部屋番号は半角の数字と大文字アルファベットのみで入力してください。');
      return;
    }

    const nameRegex = /^[A-Za-z\s\-'\.]+$/;
    if (!nameRegex.test(firstName.trim()) || !nameRegex.test(lastName.trim())) {
      alert('Names must be in English alphabet only. / お名前はアルファベット（英字）のみで入力してください。');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail.trim())) {
      alert('Please enter a valid email address. / 有効なメールアドレスを入力してください。');
      return;
    }

    const [slotH, slotM] = deliverySlot.split(':').map(Number);
    let slotMinutes = slotH * 60 + slotM;
    const [startH] = orderAcceptanceStart.split(':').map(Number);
    
    if ((startH || 0) > slotH) {
      slotMinutes += 1440; 
    }
    
    let checkMinutes = rawCurrentMinutes;
    if (checkMinutes < (startH || 0) * 60 && ((startH || 0) > parseInt(orderAcceptanceEnd.split(':')[0] || '22'))) {
      checkMinutes += 1440;
    }

    if (checkMinutes >= (slotMinutes - 120)) {
      alert(`The deadline for the ${deliverySlot} slot has passed. Please select a later time. / この配達枠の締め切り時間を過ぎています。`);
      return;
    }

    const currentBooked = slotBookedBoxes[deliverySlot] || 0;
    const currentSlotConfig = activeSlots.find((s) => s.time === deliverySlot);
    const maxLimit = currentSlotConfig ? currentSlotConfig.limit : 10;

    if (currentBooked + quantity > maxLimit) {
      alert(`Sorry, the ${deliverySlot} slot only has ${Math.max(0, maxLimit - currentBooked)} boxes remaining.`);
      return;
    }

    setIsSubmitting(true);

    const guestFullName = `${firstName.trim()} ${lastName.trim()}`;
    const orderPayload = {
      hotel_name: selectedHotel.nameJa || selectedHotel.name,
      hotel_id: String(selectedHotel.id),
      room_number: roomNumber.trim(),
      guest_name: guestFullName,
      contact_email: contactEmail.trim(),
      delivery_time: deliverySlot,
      delivery_slot: deliverySlot,
      quantity: quantity,
      total_price: totalPrice,
      status: 'order_received',
    };

    const { data, error } = await supabase.from('orders').insert([orderPayload]).select().maybeSingle();

    setIsSubmitting(false);

    if (error) {
      alert('Failed to place order: ' + error.message);
    } else {
      setConfirmedOrder(data);
      setOrderComplete(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (orderComplete && confirmedOrder) {
    return (
      <div className="min-h-screen bg-[#fafaf9] text-stone-900 font-sans flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 shadow-xl p-8 space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
            ✓
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-700">Order Confirmed</span>
            <h2 className="text-2xl font-black text-stone-900 tracking-tight">THANK YOU!</h2>
            <p className="text-xs text-stone-500 font-mono">Order ID: #{confirmedOrder.id}</p>
          </div>

          <div className="bg-stone-50 rounded-2xl p-4 text-left space-y-2.5 text-xs border border-stone-200">
            <div className="flex justify-between">
              <span className="text-stone-500">Destination:</span>
              <span className="font-bold text-stone-800">{confirmedOrder.hotel_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Room Number:</span>
              <span className="font-bold text-stone-900 font-mono text-sm">{confirmedOrder.room_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Delivery Time:</span>
              <span className="font-bold text-stone-900">{confirmedOrder.delivery_time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Quantity:</span>
              <span className="font-bold text-stone-900">{confirmedOrder.quantity} Bento Box</span>
            </div>
            <div className="pt-2 border-t border-stone-200 flex justify-between items-baseline">
              <span className="font-bold text-stone-700">Total Amount:</span>
              <span className="text-base font-extrabold text-stone-900">¥{confirmedOrder.total_price?.toLocaleString()}</span>
            </div>
          </div>

          <p className="text-[11px] text-stone-400">
            We are preparing your fresh breakfast. Our delivery partner will deliver directly to your hotel front / room at the scheduled time.
          </p>

          <button
            onClick={() => {
              setOrderComplete(false);
              setConfirmedOrder(null);
              fetchPageData();
            }}
            className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Place Another Order
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <div className="min-h-screen bg-[#fafaf9] text-stone-900 font-sans pb-24">
        
        {!isStoreOpen ? (
          <div className="bg-rose-600 text-white py-3 px-4 text-center text-xs font-bold tracking-wide shadow-sm sticky top-0 z-50">
            ⚠️ STORE CLOSED / 営業時間外: Today's orders are accepted between {orderAcceptanceStart} and {orderAcceptanceEnd}. (本日の受付時間: {orderAcceptanceStart}〜{orderAcceptanceEnd})
          </div>
        ) : availableSlotsCount === 0 ? (
          <div className="bg-rose-600 text-white py-3 px-4 text-center text-xs font-bold tracking-wide shadow-sm sticky top-0 z-50">
            ⚠️ RECEPTION CLOSED / 本日の受付終了: All delivery slots are currently sold out or past the deadline. (全てのスロットが完売、または受付締切時間を過ぎました)
          </div>
        ) : null}

        <header className="border-b border-stone-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
          <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-black tracking-tight text-stone-900">ASAKUSA ONIGIRI</h1>
              <p className="text-[10px] text-stone-400 font-medium tracking-wider uppercase">Authentic Hotel Breakfast Delivery</p>
            </div>
            <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
              isOrderingAvailable ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300'
            }`}>
              {isOrderingAvailable ? '● OPEN' : '✕ CLOSED'}
            </span>
          </div>
        </header>

        <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
          
          <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-2xs space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  Signature Morning Bento
                </span>
                <h2 className="text-lg font-extrabold text-stone-900 mt-1">Traditional Asakusa Onigiri Set</h2>
                <p className="text-xs text-stone-500 mt-0.5">Wrapped in authentic bamboo skin with seasonal sides.</p>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-stone-900">¥{itemPrice.toLocaleString()}</span>
                <span className="text-[10px] text-stone-400 block">+ VAT & room delivery</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleOrderSubmit} className="space-y-6">
            
            <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-2xs space-y-4">
              
              <div className="flex justify-between items-baseline">
                <div>
                  <label className="text-xs font-bold text-stone-800 uppercase tracking-wider block">
                    1. Select Your Hotel / 配達先ホテル <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-[11px] text-stone-400 mt-0.5">Find automatically with GPS or select from list.</p>
                </div>
                {selectedHotel && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shrink-0">
                    ✓ Hotel Selected
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={isLocating}
                  className="w-full py-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-emerald-600 text-stone-800 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-60"
                >
                  <span className="text-sm">📍</span>
                  <span>{isLocating ? 'Detecting your current location...' : 'Find my hotel via GPS (現在地から探す)'}</span>
                </button>

                <div className="flex items-center gap-3">
                  <hr className="flex-1 border-stone-200" />
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">or select manually</span>
                  <hr className="flex-1 border-stone-200" />
                </div>

                <select
                  value={selectedHotel ? String(selectedHotel.id) : ''}
                  onChange={(e) => {
                    const found = hotels.find((h) => String(h.id) === e.target.value);
                    setSelectedHotel(found || null);
                  }}
                  className="w-full bg-stone-50 border border-stone-300 rounded-2xl px-4 py-3 text-xs font-bold text-stone-800 outline-none focus:border-stone-900 cursor-pointer"
                >
                  <option value="">-- Choose hotel from list ({availableHotels.length} hotels in range) --</option>
                  
                  {groupedHotels.map((group) => (
                    <optgroup key={group.area} label={`▼ ${group.area}`}>
                      {group.hotels.map((h) => (
                        <option key={h.id} value={String(h.id)}>
                          {h.name} {h.nameJa ? `(${h.nameJa})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="relative w-full h-56 sm:h-64 rounded-2xl overflow-hidden border border-stone-200 shadow-inner bg-stone-100 mt-2">
                <div ref={mapContainerRef} className="w-full h-full z-10" />
                <div className="absolute top-2.5 left-2.5 z-20 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-full text-[10px] font-bold text-stone-700 shadow-xs border border-stone-200 flex items-center gap-1.5 pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                  Within {Number(deliveryRadiusKm).toFixed(1)}km Delivery Zone
                </div>
              </div>

              <div className="pt-2 pb-1 px-1 text-[11px] text-stone-500 leading-relaxed space-y-1">
                <p className="font-semibold text-stone-700">
                  Can't find your hotel?
                </p>
                <p>
                  To ensure optimal food quality and timely morning delivery, we exclusively deliver to the designated hotels listed above. Delivery to other accommodations or private rentals is currently unavailable.
                </p>
              </div>

            </div>

            <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-2xs space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-800 uppercase tracking-wider block mb-1.5">
                  2. Room Number / 部屋番号 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 502A"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  required
                  className="w-full bg-stone-50 border border-stone-300 rounded-2xl px-4 py-3 text-xs font-bold text-stone-900 outline-none focus:border-stone-900 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-800 uppercase tracking-wider block mb-1.5">
                    3. First Name / 名 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Satoshi"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full bg-stone-50 border border-stone-300 rounded-2xl px-4 py-3 text-xs font-bold text-stone-900 outline-none focus:border-stone-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-800 uppercase tracking-wider block mb-1.5">
                    4. Last Name / 姓 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sanaka"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full bg-stone-50 border border-stone-300 rounded-2xl px-4 py-3 text-xs font-bold text-stone-900 outline-none focus:border-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-800 uppercase tracking-wider block mb-1.5">
                  5. Email Address / 連絡先メール <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="e.g. guest@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                  className="w-full bg-stone-50 border border-stone-300 rounded-2xl px-4 py-3 text-xs font-bold text-stone-900 outline-none focus:border-stone-900"
                />
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-2xs space-y-3">
              <div className="flex justify-between items-baseline">
                <label className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                  6. Delivery Slots / 配達時間枠 <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-stone-400 font-mono">
                  Showing {availableSlotsCount} available {availableSlotsCount === 1 ? 'slot' : 'slots'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {activeSlots.map((slot) => {
                  const booked = slotBookedBoxes[slot.time] || 0;
                  const [slotH, slotM] = slot.time.split(':').map(Number);
                  
                  let slotMinutes = slotH * 60 + slotM;
                  const [startH] = orderAcceptanceStart.split(':').map(Number);
                  if ((startH || 0) > slotH) slotMinutes += 1440; 

                  let checkMinutes = rawCurrentMinutes;
                  if (checkMinutes < (startH || 0) * 60 && ((startH || 0) > parseInt(orderAcceptanceEnd.split(':')[0] || '22'))) {
                    checkMinutes += 1440;
                  }
                  
                  const isPastCutoff = checkMinutes >= (slotMinutes - 120);
                  const isSoldOut = !slot.is_active || booked >= slot.limit || !isStoreOpen || isPastCutoff;
                  const isSelected = deliverySlot === slot.time;
                  const remaining = Math.max(0, slot.limit - booked);

                  return (
                    <button
                      key={slot.time}
                      type="button"
                      disabled={isSoldOut}
                      onClick={() => setDeliverySlot(slot.time)}
                      className={`py-3 px-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center cursor-pointer w-full ${
                        isSoldOut
                          ? 'bg-stone-50/40 border-stone-100 text-stone-300 cursor-not-allowed opacity-40 shadow-none'
                          : isSelected
                          ? 'bg-emerald-50 border-2 border-emerald-600 text-emerald-950 shadow-md'
                          : 'bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 hover:border-stone-400 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>}
                        <span className={`text-base font-extrabold ${isSelected ? 'text-emerald-950' : isSoldOut ? 'text-stone-400' : 'text-stone-800'}`}>
                          {slot.time}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold mt-0.5 tracking-wide ${
                        isSoldOut
                          ? 'text-stone-300'
                          : isSelected
                          ? 'text-emerald-700 font-extrabold'
                          : 'text-stone-500'
                      }`}>
                        {isSoldOut ? (isPastCutoff ? 'Time Over' : 'Sold Out') : `${remaining} left`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-2xs space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                  7. Quantity / 注文数
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl font-black text-sm flex items-center justify-center cursor-pointer transition active:scale-95"
                  >
                    -
                  </button>
                  <span className="text-lg font-black text-stone-900 w-6 text-center font-mono">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                    className="w-9 h-9 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl font-black text-sm flex items-center justify-center cursor-pointer transition active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100 space-y-1.5 text-xs text-stone-600">
                <div className="flex justify-between">
                  <span>Onigiri Bento Box (¥{itemPrice.toLocaleString()} × {quantity}):</span>
                  <span className="font-bold text-stone-900">¥{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Hotel Room Delivery (客室配達料 / 一律):</span>
                  <span className="font-bold text-stone-900">¥{deliveryTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT ({vatRate}% / ¥{vatAmount.toLocaleString()} × {quantity}):</span>
                  <span className="font-bold text-stone-900">¥{vatTotal.toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-stone-200 flex justify-between items-baseline">
                  <span className="text-xs font-extrabold uppercase text-stone-700">Total / お支払い合計:</span>
                  <span className="text-2xl font-black text-stone-900 tracking-tight">¥{totalPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!isOrderingAvailable || isSubmitting}
              className={`w-full py-4 rounded-2xl text-sm font-extrabold tracking-wide uppercase shadow-lg transition active:scale-[0.99] cursor-pointer ${
                !isOrderingAvailable
                  ? 'bg-stone-300 text-stone-500 cursor-not-allowed shadow-none'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-900/20'
              }`}
            >
              {isSubmitting ? 'Processing Order...' : isOrderingAvailable ? `Place Order • ¥${totalPrice.toLocaleString()}` : 'Reception Closed (受付終了)'}
            </button>
          </form>
        </main>
      </div>
    </>
  );
}