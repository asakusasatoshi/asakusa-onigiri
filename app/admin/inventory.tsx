'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ==========================================
// Types & Interfaces
// ==========================================
type InventoryTab = 'materials' | 'recipes' | 'sets' | 'purchases';
type MaterialCategory = 'food' | 'packaging' | 'others';
type BaseUnit = 'g' | 'ml' | 'cm' | 'pcs';

interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  base_unit: BaseUnit;
  current_cost: number;
  current_stock: number;
  cost_multiplier: number;
  is_archived: boolean;
}

interface MaterialPurchase {
  id: string;
  material_id: string;
  purchase_date: string;
  price: number;
  amount: number;
  unit_cost: number;
  receipt_note: string;
  created_at: string;
}

interface PurchaseItemInput {
  uid: string;
  materialId: string;
  price: number | '';
  amount: number | '';
  displayUnit: string;
}

export default function InventoryPage() {
  const [activeSubTab, setActiveSubTab] = useState<InventoryTab>('materials');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [purchases, setPurchases] = useState<MaterialPurchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<MaterialCategory | 'all'>('all');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<MaterialCategory>('food');
  const [newBaseUnit, setNewBaseUnit] = useState<BaseUnit>('g');
  const [newCostMultiplier, setNewCostMultiplier] = useState<number>(100);

  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [receiptNo, setReceiptNo] = useState('');
  const [receiptVendor, setReceiptVendor] = useState('');
  const [isTaxIncluded, setIsTaxIncluded] = useState(false);
  const [shippingFee, setShippingFee] = useState<number | ''>('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemInput[]>([
    { uid: Date.now().toString(), materialId: '', price: '', amount: '', displayUnit: 'g' }
  ]);

  const fetchData = async () => {
    setIsLoading(true);
    const [matRes, purRes] = await Promise.all([
      supabase.from('materials').select('*').order('created_at', { ascending: false }),
      supabase.from('material_purchases').select('*').order('created_at', { ascending: false })
    ]);
    if (matRes.data) setMaterials(matRes.data);
    if (purRes.data) setPurchases(purRes.data);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetMasterForm = () => {
    setNewName('');
    setNewCategory('food');
    setNewBaseUnit('g');
    setNewCostMultiplier(100);
  };

  const duplicateWarning = useMemo(() => {
    if (!newName.trim()) return null;
    const existing = materials.find(m => m.name.toLowerCase() === newName.trim().toLowerCase());
    if (existing) return `"${existing.name} (${existing.base_unit})" is already registered.`;
    return null;
  }, [newName, materials]);

  const handleSaveMaterial = async () => {
    if (!newName.trim() || duplicateWarning) return;
    setIsSaving(true);
    
    const newMaterial = { 
      name: newName.trim(), 
      category: newCategory, 
      base_unit: newBaseUnit, 
      current_cost: 0, 
      current_stock: 0, 
      cost_multiplier: newCostMultiplier,
      is_archived: false 
    };
    
    const { data, error } = await supabase.from('materials').insert([newMaterial]).select().single();
    setIsSaving(false);
    
    if (error) return alert('Failed to save material: ' + error.message);
    
    setMaterials([data, ...materials]);
    setIsAddModalOpen(false);
    resetMasterForm();
  };

  const handleUpdateMultiplier = async (id: string, newMult: number) => {
    setMaterials(materials.map(m => m.id === id ? { ...m, cost_multiplier: newMult } : m));
    const { error } = await supabase.from('materials').update({ cost_multiplier: newMult }).eq('id', id);
    if (error) {
      alert('Failed to update unit display: ' + error.message);
      fetchData();
    }
  };

  const resetPurchaseForm = () => {
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setReceiptNo('');
    setReceiptVendor('');
    setIsTaxIncluded(false);
    setShippingFee('');
    setPurchaseItems([{ uid: Date.now().toString(), materialId: '', price: '', amount: '', displayUnit: 'g' }]);
  };

  const handleAddPurchaseRow = () => {
    setPurchaseItems([...purchaseItems, { uid: Date.now().toString(), materialId: '', price: '', amount: '', displayUnit: 'g' }]);
  };

  const handleRemovePurchaseRow = (uid: string) => {
    if (purchaseItems.length === 1) return;
    setPurchaseItems(purchaseItems.filter(item => item.uid !== uid));
  };

  const handleMaterialChange = (uid: string, matId: string) => {
    const mat = materials.find(m => m.id === matId);
    setPurchaseItems(purchaseItems.map(item => item.uid === uid ? { ...item, materialId: matId, displayUnit: mat?.base_unit || 'g' } : item));
  };

  const handleNumberInput = (uid: string, field: 'price' | 'amount', value: string) => {
    const sanitized = value.replace(/[^0-9]/g, '');
    setPurchaseItems(purchaseItems.map(item => item.uid === uid ? { ...item, [field]: sanitized === '' ? '' : Number(sanitized) } : item));
  };

  const handleDisplayUnitChange = (uid: string, unit: string) => {
    setPurchaseItems(purchaseItems.map(item => item.uid === uid ? { ...item, displayUnit: unit } : item));
  };

  const receiptTotal = useMemo(() => {
    const itemsTotal = purchaseItems.reduce((acc, item) => {
      if (!item.materialId || item.price === '') return acc;
      const mat = materials.find(m => m.id === item.materialId);
      let itemPrice = Number(item.price);
      if (!isTaxIncluded && mat) {
        itemPrice = mat.category === 'food' ? Math.round(itemPrice * 1.08) : Math.round(itemPrice * 1.10);
      }
      return acc + itemPrice;
    }, 0);
    return itemsTotal + (shippingFee === '' ? 0 : Number(shippingFee));
  }, [purchaseItems, materials, isTaxIncluded, shippingFee]);

  const handleSavePurchase = async () => {
    if (!receiptNo.trim()) return alert('Receipt No. is required. Please enter the stamped number.');
    if (!receiptVendor.trim()) return alert('Vendor name is required.');

    const validItems = purchaseItems.filter(i => i.materialId !== '' && i.price !== '' && i.amount !== '');
    if (validItems.length === 0) return alert('No valid items entered.');

    setIsSaving(true);
    const combinedNote = `[#${receiptNo.trim()}] ${receiptVendor.trim()}`;

    try {
      for (const item of validItems) {
        const mat = materials.find(m => m.id === item.materialId);
        if (!mat) continue;

        let finalAmount = Number(item.amount);
        if (mat.base_unit === 'g' && item.displayUnit === 'kg') finalAmount *= 1000;
        if (mat.base_unit === 'ml' && item.displayUnit === 'L') finalAmount *= 1000;

        let finalPrice = Number(item.price);
        if (!isTaxIncluded) {
          finalPrice = mat.category === 'food' ? Math.round(finalPrice * 1.08) : Math.round(finalPrice * 1.10);
        }

        const unitCost = finalPrice / finalAmount;

        await supabase.from('material_purchases').insert([{
          material_id: item.materialId,
          purchase_date: purchaseDate,
          price: finalPrice,
          amount: finalAmount,
          unit_cost: unitCost,
          receipt_note: combinedNote
        }]);

        await supabase.from('materials').update({
          current_stock: mat.current_stock + finalAmount,
          current_cost: unitCost 
        }).eq('id', mat.id);
      }

      await fetchData();
      setIsPurchaseModalOpen(false);
      resetPurchaseForm();
    } catch (err: any) {
      alert('An error occurred: ' + err.message);
    }
    setIsSaving(false);
  };

  const handleCancelReceipt = async (groupDate: string, groupNote: string) => {
    if (!window.confirm(`Cancel this receipt (${groupNote})?\nStock additions will be reverted to previous state.`)) return;
    
    setIsLoading(true);
    try {
      const { data: targets } = await supabase.from('material_purchases').select('*').eq('purchase_date', groupDate).eq('receipt_note', groupNote);
      
      if (targets) {
        for (const p of targets) {
          const mat = materials.find(m => m.id === p.material_id);
          if (mat) {
            const newStock = Math.max(0, mat.current_stock - p.amount);
            await supabase.from('materials').update({ current_stock: newStock }).eq('id', mat.id);
          }
        }
        await supabase.from('material_purchases').delete().eq('purchase_date', groupDate).eq('receipt_note', groupNote);
      }
      await fetchData();
    } catch (err: any) {
      alert('Failed to cancel receipt: ' + err.message);
    }
    setIsLoading(false);
  };

  const groupedPurchases = useMemo(() => {
    const groups: Record<string, { date: string; note: string; total: number; items: (MaterialPurchase & { materialName: string; unit: string })[] }> = {};
    purchases.forEach(p => {
      const mat = materials.find(m => m.id === p.material_id);
      const key = `${p.purchase_date}_${p.receipt_note}`;
      if (!groups[key]) groups[key] = { date: p.purchase_date, note: p.receipt_note, total: 0, items: [] };
      groups[key].total += Number(p.price);
      groups[key].items.push({ ...p, materialName: mat?.name || 'Unknown', unit: mat?.base_unit || '' });
    });
    return Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [purchases, materials]);

  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      if (m.is_archived) return false;
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (searchQuery.trim()) return m.name.toLowerCase().includes(searchQuery.toLowerCase());
      return true;
    });
  }, [materials, searchQuery, categoryFilter]);

  return (
    <div className="space-y-6">
      <style>{`
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      {/* Navigation */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col md:flex-row items-center gap-4">
        <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 w-full overflow-x-auto">
          {[
            { key: 'materials', label: 'Materials' }, 
            { key: 'recipes', label: 'Recipes' }, 
            { key: 'sets', label: 'Daily Sets' }, 
            { key: 'purchases', label: 'Purchases' }
          ].map((tab) => (
            <button 
              key={tab.key} 
              onClick={() => { setActiveSubTab(tab.key as InventoryTab); setSearchQuery(''); }} 
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex-1 md:flex-none cursor-pointer whitespace-nowrap ${activeSubTab === tab.key ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Materials Tab */}
      {activeSubTab === 'materials' && (
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 relative">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-3 border-b border-stone-100">
            <div className="flex bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-[11px] shrink-0">
              {[{ key: 'all', label: 'All Items' }, { key: 'food', label: 'Food' }, { key: 'packaging', label: 'Packaging' }, { key: 'others', label: 'Others' }].map((cat) => (
                <button 
                  key={cat.key} 
                  onClick={() => setCategoryFilter(cat.key as any)} 
                  className={`px-3 py-1 rounded-md font-bold transition cursor-pointer ${categoryFilter === cat.key ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
              <div className="relative w-full sm:w-56 shrink-0">
                <input 
                  type="text" 
                  placeholder="Search materials..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl pl-3.5 pr-8 py-2 text-xs text-stone-900 outline-none focus:border-stone-900" 
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')} 
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-stone-300 hover:bg-stone-500 text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button 
                onClick={() => setIsAddModalOpen(true)} 
                className="w-full sm:w-auto bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5 shrink-0"
              >
                ＋ Add Material
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="py-12 text-center text-stone-400 font-bold text-sm">Loading materials...</div>
            ) : (
              <table className="w-full text-left text-xs text-stone-700 border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-400 uppercase text-[10px]">
                    <th className="py-2.5 px-3">Item Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Base Unit</th>
                    <th className="py-2.5 px-3 text-right">Current Stock</th>
                    <th className="py-2.5 px-3 text-right">Current Cost (Avg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredMaterials.map((m) => (
                    <tr key={m.id} className="hover:bg-stone-50 transition group">
                      <td className="py-3 px-3 font-bold text-stone-900">{m.name}</td>
                      <td className="py-3 px-3 capitalize font-semibold text-stone-600">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${m.category === 'food' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-stone-100 text-stone-600 border border-stone-200'}`}>
                          {m.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-stone-500">{m.base_unit}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">{m.current_stock || 0}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">
                        <div className="flex items-center justify-end gap-1">
                          {m.current_cost === 0 ? (
                            <span className="text-stone-400 font-normal">¥0.00</span>
                          ) : (
                            <span>¥{(m.current_cost * (m.cost_multiplier || 1)).toFixed(2)}</span>
                          )}
                          
                          <select 
                            value={m.cost_multiplier || 1} 
                            onChange={(e) => handleUpdateMultiplier(m.id, Number(e.target.value))}
                            className="text-[10px] text-stone-400 bg-transparent hover:bg-stone-200 hover:text-stone-700 rounded cursor-pointer outline-none transition-colors py-0.5 px-1 font-mono"
                          >
                            {m.base_unit === 'g' && (
                              <><option value={1}>/ 1g</option><option value={100}>/ 100g</option><option value={1000}>/ 1kg</option></>
                            )}
                            {m.base_unit === 'ml' && (
                              <><option value={1}>/ 1ml</option><option value={100}>/ 100ml</option><option value={1000}>/ 1L</option></>
                            )}
                            {m.base_unit === 'pcs' && (
                              <><option value={1}>/ 1pcs</option><option value={10}>/ 10pcs</option><option value={100}>/ 100pcs</option></>
                            )}
                            {m.base_unit === 'cm' && (
                              <><option value={1}>/ 1cm</option><option value={10}>/ 10cm</option><option value={100}>/ 1m</option></>
                            )}
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Purchases Tab */}
      {activeSubTab === 'purchases' && (
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-5 relative">
          <div className="flex justify-between items-center pb-3 border-b border-stone-100">
            <div><h2 className="text-sm font-bold text-stone-900">Purchase History</h2></div>
            <button 
              onClick={() => setIsPurchaseModalOpen(true)} 
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              ＋ Add Purchase
            </button>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-stone-400 font-bold text-sm">Loading...</div>
          ) : (
            <div className="space-y-4">
              {groupedPurchases.map((group, idx) => (
                <div key={idx} className="border border-stone-200 rounded-xl overflow-hidden shadow-xs group">
                  <div className="bg-stone-50 px-4 py-3 flex justify-between items-center border-b border-stone-200">
                    <div className="flex items-center gap-3">
                      <span className="bg-white px-2 py-1 rounded text-[10px] font-mono font-bold text-stone-600 border border-stone-200">{group.date}</span>
                      <span className="text-xs font-bold text-stone-800">{group.note}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-black text-stone-900 font-mono">Total: ¥{group.total.toLocaleString()}</span>
                      <button 
                        onClick={() => handleCancelReceipt(group.date, group.note)} 
                        className="text-[10px] font-bold text-stone-400 hover:text-rose-600 transition opacity-0 group-hover:opacity-100 cursor-pointer"
                      >
                        🗑️ Cancel
                      </button>
                    </div>
                  </div>
                  <div className="bg-white p-4">
                    <table className="w-full text-left text-xs text-stone-600">
                      <tbody>
                        {group.items.map(item => (
                          <tr key={item.id} className="border-b border-stone-100 last:border-0">
                            <td className="py-2 font-bold text-stone-800 w-1/2">{item.materialName}</td>
                            <td className="py-2 font-mono text-right">{item.amount} {item.unit}</td>
                            <td className="py-2 font-mono text-right w-24">¥{item.price.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================
          MODAL: Add Material (Master)
          ========================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-sm w-full p-6 space-y-5">
            
            <div className="flex justify-between items-start border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900">New Material</h3>
                <p className="text-[10px] font-bold uppercase text-stone-400 mt-0.5">Create a new master item</p>
              </div>
              <button 
                onClick={() => { setIsAddModalOpen(false); resetMasterForm(); }} 
                className="text-stone-400 hover:text-stone-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1.5">Item Name</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="e.g., Pork Shoulder" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)} 
                  className={`w-full px-3 py-2 bg-stone-50 border rounded-xl text-sm font-bold text-stone-900 outline-none transition ${duplicateWarning ? 'border-rose-300 focus:border-rose-500 bg-rose-50/50' : 'border-stone-300 focus:border-stone-900'}`} 
                />
                {duplicateWarning && (
                  <p className="text-[10px] font-bold text-rose-600 mt-1.5 animate-in slide-in-from-top-1">
                    ⚠️ {duplicateWarning}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1.5">Category</label>
                  <select 
                    value={newCategory} 
                    onChange={(e) => {
                      setNewCategory(e.target.value as MaterialCategory);
                      if (e.target.value === 'food') { setNewBaseUnit('g'); setNewCostMultiplier(100); }
                      else if (e.target.value === 'packaging' || e.target.value === 'others') { setNewBaseUnit('pcs'); setNewCostMultiplier(1); }
                    }}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-none cursor-pointer focus:border-stone-900"
                  >
                    <option value="food">Food</option>
                    <option value="packaging">Packaging</option>
                    <option value="others">Others</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1.5">Base Unit</label>
                  <select 
                    value={newBaseUnit} 
                    onChange={(e) => {
                      const val = e.target.value as BaseUnit;
                      setNewBaseUnit(val);
                      if (val === 'g' || val === 'ml') setNewCostMultiplier(100);
                      else setNewCostMultiplier(1);
                    }}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-800 outline-none cursor-pointer focus:border-stone-900"
                  >
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="pcs">pcs</option>
                    <option value="cm">cm</option>
                  </select>
                </div>
              </div>

              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200">
                <label className="block text-[11px] font-bold text-stone-600 mb-1.5">Cost Display Scale (List View)</label>
                <select 
                  value={newCostMultiplier} 
                  onChange={(e) => setNewCostMultiplier(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-stone-800 outline-none cursor-pointer focus:border-stone-900"
                >
                  {newBaseUnit === 'g' && (
                    <><option value="1">/ 1g</option><option value="100">/ 100g (Recommended)</option><option value="1000">/ 1kg</option></>
                  )}
                  {newBaseUnit === 'ml' && (
                    <><option value="1">/ 1ml</option><option value="100">/ 100ml (Recommended)</option><option value="1000">/ 1L</option></>
                  )}
                  {newBaseUnit === 'pcs' && (
                    <><option value="1">/ 1pcs</option><option value={10}>/ 10pcs</option><option value={100}>/ 100pcs</option></>
                  )}
                  {newBaseUnit === 'cm' && (
                    <><option value="1">/ 1cm</option><option value={10}>/ 10cm</option><option value={100}>/ 1m</option></>
                  )}
                </select>
                <p className="text-[9px] text-stone-400 mt-1.5 font-bold">Internal stock calculation is strictly managed in {newBaseUnit}.</p>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-stone-100 mt-2">
              <button 
                onClick={() => { setIsAddModalOpen(false); resetMasterForm(); }} 
                className="flex-1 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveMaterial} 
                disabled={!!duplicateWarning || !newName.trim() || isSaving}
                className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Master'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =========================================
          MODAL: Add Purchase (レシート一括入力)
          ========================================= */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] flex flex-col">
            
            <div className="flex justify-between items-start border-b border-stone-100 pb-3 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-stone-900">New Receipt</h3>
                <div className="mt-2 flex bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-[11px] w-fit">
                   <button 
                     onClick={() => setIsTaxIncluded(false)} 
                     className={`px-3 py-1 rounded-md font-bold transition cursor-pointer ${!isTaxIncluded ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}`}
                   >
                     Excl. Tax (Auto-calc)
                   </button>
                   <button 
                     onClick={() => setIsTaxIncluded(true)} 
                     className={`px-3 py-1 rounded-md font-bold transition cursor-pointer ${isTaxIncluded ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'}`}
                   >
                     Incl. Tax (As printed)
                   </button>
                </div>
              </div>
              <button onClick={() => { setIsPurchaseModalOpen(false); resetPurchaseForm(); }} className="text-stone-400 hover:text-stone-700 font-bold text-lg cursor-pointer">✕</button>
            </div>

            <div className="overflow-y-auto pr-2 space-y-5 flex-1 custom-scrollbar">
              <div className="grid grid-cols-12 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <div className="col-span-4">
                  <label className="block text-[10px] font-bold text-stone-500 mb-1">Date</label>
                  <input 
                    type="date" 
                    value={purchaseDate} 
                    onChange={(e) => setPurchaseDate(e.target.value)} 
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-bold outline-none" 
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-[10px] font-bold text-stone-500 mb-1">Receipt No. <span className="text-rose-500">*</span></label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    placeholder="Required (e.g., 0012)" 
                    value={receiptNo} 
                    onChange={(e) => {
                      const sanitized = e.target.value.replace(/[^0-9]/g, '');
                      setReceiptNo(sanitized);
                    }} 
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-bold font-mono outline-none" 
                  />
                </div>
                <div className="col-span-5">
                  <label className="block text-[10px] font-bold text-stone-500 mb-1">Vendor <span className="text-rose-500">*</span></label>
                  <input 
                    type="text" 
                    placeholder="e.g., OK Store" 
                    value={receiptVendor} 
                    onChange={(e) => setReceiptVendor(e.target.value)} 
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-xs font-bold outline-none" 
                  />
                </div>
              </div>

              <div className="space-y-3">
                {purchaseItems.map((item) => {
                  const mat = materials.find(m => m.id === item.materialId);
                  return (
                    <div key={item.uid} className="flex items-end gap-3 bg-white p-3 rounded-xl border border-stone-200 shadow-xs">
                      <div className="flex-1">
                        <label className="block text-[9px] font-bold text-stone-400 mb-1">Material</label>
                        <select 
                          value={item.materialId} 
                          onChange={(e) => handleMaterialChange(item.uid, e.target.value)} 
                          className="w-full px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-md text-xs font-bold text-stone-800 outline-none cursor-pointer"
                        >
                          <option value="">-- Select --</option>
                          {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      
                      <div className="w-24">
                        <label className="block text-[9px] font-bold text-stone-400 mb-1">Price (¥)</label>
                        <input 
                          type="text" 
                          placeholder="0" 
                          inputMode="numeric" 
                          value={item.price} 
                          onChange={(e) => handleNumberInput(item.uid, 'price', e.target.value)} 
                          className="w-full px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-md text-xs font-mono font-bold outline-none text-right" 
                        />
                      </div>
                      
                      <div className="w-32 flex gap-1 items-end">
                        <div className="flex-1">
                          <label className="block text-[9px] font-bold text-stone-400 mb-1">Amount</label>
                          <input 
                            type="text" 
                            placeholder="0" 
                            inputMode="numeric" 
                            value={item.amount} 
                            onChange={(e) => handleNumberInput(item.uid, 'amount', e.target.value)} 
                            className="w-full px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-md text-xs font-mono font-bold outline-none text-right" 
                          />
                        </div>
                        {mat && (
                          <select 
                            value={item.displayUnit} 
                            onChange={(e) => handleDisplayUnitChange(item.uid, e.target.value)} 
                            className="px-1 py-1.5 bg-stone-100 border border-stone-300 rounded-md text-[10px] font-bold text-stone-600 outline-none h-[28px] cursor-pointer"
                          >
                            {mat.base_unit === 'g' ? (
                              <><option value="g">g</option><option value="kg">kg</option></>
                            ) : mat.base_unit === 'ml' ? (
                              <><option value="ml">ml</option><option value="L">L</option></>
                            ) : (
                              <option value={mat.base_unit}>{mat.base_unit}</option>
                            )}
                          </select>
                        )}
                      </div>

                      <button 
                        onClick={() => handleRemovePurchaseRow(item.uid)} 
                        disabled={purchaseItems.length === 1} 
                        className="p-1.5 text-stone-300 hover:text-rose-500 disabled:opacity-30 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <button 
                  onClick={handleAddPurchaseRow} 
                  className="w-full py-2 border-2 border-dashed border-stone-200 hover:border-emerald-400 hover:bg-emerald-50 text-stone-400 hover:text-emerald-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  ＋ Add Item
                </button>
              </div>

              <div className="bg-stone-900 rounded-xl p-4 mt-4 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-bold text-stone-400">Shipping / Fees</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 text-xs">¥</span>
                    <input 
                      type="text" 
                      inputMode="numeric" 
                      value={shippingFee} 
                      onChange={(e) => { 
                        const s = e.target.value.replace(/[^0-9]/g, ''); 
                        setShippingFee(s === '' ? '' : Number(s)); 
                      }} 
                      className="w-24 pl-6 pr-2 py-1.5 bg-stone-800 border border-stone-700 rounded-md text-xs font-mono font-bold text-white outline-none text-right" 
                      placeholder="0" 
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-emerald-400 mb-0.5 uppercase tracking-wider">Receipt Total (Incl. Tax)</div>
                  <div className="text-2xl font-black text-white font-mono leading-none">¥{receiptTotal.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-stone-100 shrink-0">
              <button 
                onClick={() => { setIsPurchaseModalOpen(false); resetPurchaseForm(); }} 
                className="flex-1 py-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleSavePurchase} 
                disabled={isSaving} 
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                {isSaving ? 'Processing...' : 'Save Receipt'}
              </button>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}