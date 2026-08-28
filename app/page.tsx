'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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

  const [deliveryPrice, setDeliveryPrice] = useState(1500);
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
    return Math.round(deliveryPrice * (vatRate / 100));
  }, [deliveryPrice, vatRate]);

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
      setDeliveryPrice(setData.delivery_price ?? (setData.item_price ?? 1500));
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
        alert('Could not retrieve your location. Please select your hotel manually from the list.');
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
        fillOpacity: 0.05,
        weight: 1,
      }).addTo(map);
      circleRef.current = circle;

      const shopIcon = L.divIcon({
        className: 'custom-shop-pin',
        html: `<div style="background-color: #1c1917; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([shopLat, shopLng], { icon: shopIcon })
        .addTo(map)
        .bindPopup('<b style="font-size:11px; color:#1c1917; font-family: sans-serif;">ASAKUSA ONIGIRI (Kitchen)</b>');

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
        <div style="position: relative; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
          <div style="width: 10px; height: 10px; background-color: #2563eb; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 6px rgba(37,99,235,0.6); z-index: 2;"></div>
          <div style="position: absolute; top: -3px; left: -3px; width: 16px; height: 16px; border-radius: 50%; background-color: rgba(37,99,235,0.25); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        </div>
      `,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    const marker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
      .addTo(map)
      .bindTooltip('<b style="font-size:10px; font-family: sans-serif;">Your Location</b>', { direction: 'top', offset: [0, -8] });

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
        html: `<div id="pin-${h.id}" style="background-color: #ffffff; width: 12px; height: 12px; border-radius: 50%; border: 3px solid #57534e; box-shadow: 0 2px 4px rgba(0,0,0,0.2); cursor: pointer; transition: all 0.2s ease;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      const marker = L.marker([h.lat, h.lng], { icon: hotelIcon }).addTo(map);

      marker.bindTooltip(
        `<div style="font-family:sans-serif; font-weight:bold; font-size:10px; color:#1c1917; padding:1px 2px;">${h.name}</div>`,
        { direction: 'top', offset: [0, -8], opacity: 0.95 }
      );

      marker.bindPopup(`
        <div style="font-family:sans-serif; min-width:140px; padding:2px;">
          <div style="font-size:11px; font-weight:800; color:#1c1917;">${h.name}</div>
          ${h.nameJa ? `<div style="font-size:9px; color:#78716c; margin-top:1px;">${h.nameJa}</div>` : ''}
        </div>
      `, {
        offset: [0, -6],
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
          el.style.borderColor = '#ffffff';
          el.style.transform = 'scale(1.5)';
          el.style.boxShadow = '0 0 10px rgba(5, 150, 105, 0.5)';
        } else {
          el.style.backgroundColor = '#ffffff';
          el.style.borderColor = '#57534e';
          el.style.transform = 'scale(1)';
          el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        }
      }
    });

    if (targetMarker) {
      map.setView([selectedHotel.lat, selectedHotel.lng], 15.5, { animate: true, duration: 0.5 });
      targetMarker.openPopup();
    }
  }, [selectedHotel, availableHotels]);

  const subtotal = deliveryPrice * quantity;
  const deliveryTotal = deliveryFee;
  const vatTotal = vatAmount * quantity;
  const totalPrice = subtotal + deliveryTotal + vatTotal;

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOrderingAvailable) {
      alert('We are currently closed or all slots are sold out.');
      return;
    }
    if (!selectedHotel) {
      alert('Please select your delivery destination (hotel).');
      return;
    }
    if (!roomNumber.trim() || !firstName.trim() || !lastName.trim() || !contactEmail.trim()) {
      alert('Please fill in all required fields.');
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
      alert(`The deadline for the ${deliverySlot} slot has passed. Please select a later time.`);
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
      <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-stone-200 shadow-sm p-8 space-y-8 text-center animate-in fade-in zoom-in-95 duration-300">
          
          <div className="space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-700">Order Confirmed</span>
            <h2 className="text-2xl font-black text-stone-900 tracking-tight">THANK YOU</h2>
            <p className="text-xs text-stone-500 font-mono pt-2">Order ID: #{confirmedOrder.id}</p>
          </div>

          <div className="bg-stone-50 rounded-xl p-5 text-left space-y-3 text-xs border border-stone-200">
            <div className="flex justify-between border-b border-stone-100 pb-2">
              <span className="text-stone-500 uppercase tracking-wide text-[10px] font-bold">Destination</span>
              <span className="font-bold text-stone-800 text-right max-w-[60%]">{confirmedOrder.hotel_name}</span>
            </div>
            <div className="flex justify-between border-b border-stone-100 pb-2">
              <span className="text-stone-500 uppercase tracking-wide text-[10px] font-bold">Room</span>
              <span className="font-bold text-stone-900 font-mono text-sm">{confirmedOrder.room_number}</span>
            </div>
            <div className="flex justify-between border-b border-stone-100 pb-2">
              <span className="text-stone-500 uppercase tracking-wide text-[10px] font-bold">Delivery Time</span>
              <span className="font-bold text-stone-900">{confirmedOrder.delivery_time}</span>
            </div>
            <div className="flex justify-between pb-2">
              <span className="text-stone-500 uppercase tracking-wide text-[10px] font-bold">Quantity</span>
              <span className="font-bold text-stone-900">{confirmedOrder.quantity} Box(es)</span>
            </div>
            <div className="pt-3 flex justify-between items-baseline border-t border-stone-300">
              <span className="font-bold text-stone-800 uppercase tracking-wide text-[10px]">Total Paid</span>
              <span className="text-lg font-black text-stone-900 tracking-tighter">¥{confirmedOrder.total_price?.toLocaleString()}</span>
            </div>
          </div>

          <p className="text-[11px] text-stone-500 leading-relaxed px-4">
            We are preparing your fresh breakfast. Our delivery partner will deliver directly to your room at the scheduled time.
          </p>

          <button
            onClick={() => {
              setOrderComplete(false);
              setConfirmedOrder(null);
              fetchPageData();
            }}
            className="w-full py-3.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
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
      <div className="min-h-screen bg-stone-50 text-stone-900 font-sans pb-24">
        
        {!isStoreOpen ? (
          <div className="bg-rose-600 text-white py-3 px-4 text-center text-[11px] font-bold tracking-wide shadow-sm sticky top-0 z-50">
            ⚠️ STORE CLOSED: We will resume accepting orders tomorrow at {orderAcceptanceStart}.
          </div>
        ) : availableSlotsCount === 0 ? (
          <div className="bg-rose-600 text-white py-3 px-4 text-center text-[11px] font-bold tracking-wide shadow-sm sticky top-0 z-50">
            ⚠️ RECEPTION CLOSED: All slots sold out. Next acceptance starts tomorrow at {orderAcceptanceStart}.
          </div>
        ) : null}

        <header className="border-b border-stone-200 bg-white sticky top-0 z-40">
          <div className="max-w-xl mx-auto px-5 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-black tracking-tighter text-stone-900">ASAKUSA ONIGIRI</h1>
              <p className="text-[9px] text-stone-500 font-bold tracking-widest uppercase mt-0.5">Authentic Hotel Breakfast Delivery</p>
            </div>
            <span className={`text-[9px] font-extrabold px-3 py-1 rounded border tracking-widest uppercase ${
              isOrderingAvailable ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-stone-100 text-stone-500 border-stone-200'
            }`}>
              {isOrderingAvailable ? 'OPEN' : 'CLOSED'}
            </span>
          </div>
        </header>

        <main className="max-w-xl mx-auto px-4 py-8 space-y-8">
          
          <div className="space-y-1 px-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Signature Menu</span>
            <div className="flex justify-between items-end">
              <h2 className="text-2xl font-black text-stone-900 tracking-tight">Traditional Asakusa Onigiri Set</h2>
              <div className="text-right">
                <span className="text-xl font-black text-stone-900 tracking-tighter">¥{deliveryPrice.toLocaleString()}</span>
                <span className="text-[9px] text-stone-400 block uppercase tracking-wider font-bold mt-0.5">+ VAT & Fee</span>
              </div>
            </div>
            <p className="text-[11px] text-stone-500 pt-2 leading-relaxed max-w-[85%]">
              Wrapped in authentic bamboo skin with seasonal sides. Handcrafted morning delivery.
            </p>
          </div>

          <form onSubmit={handleOrderSubmit} className="space-y-6">
            
            <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm space-y-6">
              
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block">
                    1. Delivery Destination <span className="text-rose-600">*</span>
                  </label>
                  {selectedHotel && (
                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">✓ Selected</span>
                  )}
                </div>

                <div className="relative w-full h-48 rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
                  <div ref={mapContainerRef} className="w-full h-full z-10" />
                  <div className="absolute top-2 left-2 z-20 bg-white/95 px-2 py-1 rounded text-[9px] font-bold text-stone-600 shadow-sm border border-stone-200 pointer-events-none uppercase tracking-wider">
                    {Number(deliveryRadiusKm).toFixed(1)}km Delivery Zone
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={isLocating}
                    className="w-full py-3 bg-white border border-stone-300 hover:border-stone-400 hover:bg-stone-50 text-stone-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:translate-y-[1px] disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {isLocating ? 'Detecting...' : 'Detect via GPS'}
                  </button>

                  <select
                    value={selectedHotel ? String(selectedHotel.id) : ''}
                    onChange={(e) => {
                      const found = hotels.find((h) => String(h.id) === e.target.value);
                      setSelectedHotel(found || null);
                    }}
                    className="w-full bg-white border border-stone-300 rounded-xl px-3 py-3 text-xs font-bold text-stone-800 outline-none focus:border-stone-900 cursor-pointer shadow-sm"
                  >
                    <option value="">-- Manual Selection --</option>
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
                
                <div className="mt-4 p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                  <p className="text-xs font-bold text-stone-800 mb-1">Can't find your hotel?</p>
                  <p className="text-[11px] text-stone-500 leading-relaxed">
                    To ensure optimal food quality, we exclusively deliver to the designated hotels listed above. Delivery to other accommodations or private rentals is currently unavailable.
                  </p>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-stone-100">
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-2">
                    2. Room Number <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 502A"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''))}
                    required
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs font-bold text-stone-900 outline-none focus:border-stone-900 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-2">
                      3. First Name <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Satoshi"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value.replace(/[^A-Za-z\s\-'\.]/g, ''))}
                      required
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs font-bold text-stone-900 outline-none focus:border-stone-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-2">
                      4. Last Name <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sanaka"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value.replace(/[^A-Za-z\s\-'\.]/g, ''))}
                      required
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs font-bold text-stone-900 outline-none focus:border-stone-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-2">
                    5. Email Address <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. guest@example.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value.replace(/[^a-zA-Z0-9@\.\-_+~]/g, ''))}
                    required
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl px-4 py-3 text-xs font-bold text-stone-900 outline-none focus:border-stone-900"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-stone-100">
                <div className="flex justify-between items-baseline">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                    6. Delivery Slot <span className="text-rose-600">*</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                    
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={isSoldOut}
                        onClick={() => setDeliverySlot(slot.time)}
                        className={`py-3.5 px-4 rounded-xl border text-left transition-all flex justify-between items-center cursor-pointer w-full ${
                          isSoldOut
                            ? 'bg-stone-50 border-stone-200 text-stone-400 cursor-not-allowed shadow-none'
                            : isSelected
                            ? 'bg-stone-900 border-stone-900 text-white shadow-md'
                            : 'bg-white hover:bg-stone-50 border-stone-300 text-stone-800'
                        }`}
                      >
                        <span className="text-sm font-black tracking-tighter">
                          {slot.time}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${
                          isSoldOut ? 'text-stone-400' : isSelected ? 'text-stone-300' : 'text-stone-500'
                        }`}>
                          {isSoldOut ? 'Closed' : 'Select'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-stone-100">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                    7. Quantity
                  </label>
                  <div className="flex items-center gap-4 bg-stone-50 border border-stone-200 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg font-black text-stone-600 flex items-center justify-center cursor-pointer transition shadow-sm"
                    >
                      -
                    </button>
                    <span className="text-sm font-black text-stone-900 w-4 text-center font-mono">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(10, q + 1))}
                      className="w-8 h-8 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg font-black text-stone-600 flex items-center justify-center cursor-pointer transition shadow-sm"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="bg-stone-50 rounded-xl p-4 space-y-2.5 text-xs text-stone-600 border border-stone-200">
                  <div className="flex justify-between">
                    <span className="font-medium text-stone-500">Breakfast Box (¥{deliveryPrice.toLocaleString()} × {quantity})</span>
                    <span className="font-bold text-stone-900 font-mono">¥{subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-stone-500">Hotel Delivery Fee</span>
                    <span className="font-bold text-stone-900 font-mono">¥{deliveryTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-stone-200">
                    <span className="font-medium text-stone-500">VAT ({vatRate}%)</span>
                    <span className="font-bold text-stone-900 font-mono">¥{vatTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-stone-800">Total</span>
                    <span className="text-xl font-black text-stone-900 tracking-tighter font-mono">¥{totalPrice.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!isOrderingAvailable || isSubmitting}
                className={`w-full py-4 rounded-xl text-[11px] font-black tracking-widest uppercase transition-all duration-200 ${
                  !isOrderingAvailable
                    ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                    : 'bg-stone-900 hover:bg-stone-800 text-white shadow-md active:scale-[0.99] cursor-pointer'
                }`}
              >
                {isSubmitting ? 'Processing...' : isOrderingAvailable ? 'Confirm Order' : 'Reception Closed'}
              </button>
            </div>
          </form>
        </main>
      </div>
    </>
  );
}