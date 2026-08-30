'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// ==========================================
// Types & Interfaces
// ==========================================
type InventoryTab = 'materials' | 'recipes' | 'sets' | 'purchases';
type MaterialCategory = 'food' | 'packaging' | 'others';
type BaseUnit = 'g' | 'ml' | 'cm' | 'pcs';
type AdjustmentType = 'waste' | 'stocktake';

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

interface Recipe {
  id: string;
  name: string;
  created_at: string;
}

interface RecipeIngredient {
  id: string;
  recipe_id: string;
  material_id: string;
  amount: number;
}

interface RecipeIngredientInput {
  uid: string;
  materialId: string;
  amount: number | '';
}

// Sets用の型定義
interface DailySet {
  id: string;
  name: string;
  created_at: string;
}

interface DailySetItem {
  id: string;
  set_id: string;
  item_type: 'recipe' | 'material';
  recipe_id: string | null;
  material_id: string | null;
  amount: number;
}

interface SetItemInput {
  uid: string;
  itemType: 'recipe' | 'material' | '';
  itemId: string;
  amount: number | '';
}

export default function InventoryPage() {
  const [activeSubTab, setActiveSubTab] = useState<InventoryTab>('materials');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [purchases, setPurchases] = useState<MaterialPurchase[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [dailySets, setDailySets] = useState<DailySet[]>([]);
  const [dailySetItems, setDailySetItems] = useState<DailySetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<MaterialCategory | 'all'>('all');
  
  // モーダル状態
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Master Form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<MaterialCategory>('food');
  const [newBaseUnit, setNewBaseUnit] = useState<BaseUnit>('g');
  const [newCostMultiplier, setNewCostMultiplier] = useState<number>(100);

  // Purchase Form
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [receiptNo, setReceiptNo] = useState('');
  const [receiptVendor, setReceiptVendor] = useState('');
  const [isTaxIncluded, setIsTaxIncluded] = useState(false);
  const [shippingFee, setShippingFee] = useState<number | ''>('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemInput[]>([{ uid: Date.now().toString(), materialId: '', price: '', amount: '', displayUnit: 'g' }]);

  // Adjust Form
  const [adjustTarget, setAdjustTarget] = useState<Material | null>(null);
  const [adjustType, setAdjustType] = useState<AdjustmentType>('waste');
  const [adjustDate, setAdjustDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [adjustAmount, setAdjustAmount] = useState<number | ''>('');
  const [adjustReason, setAdjustReason] = useState('');

  // Recipe Form
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [recipeName, setRecipeName] = useState('');
  const [recipeInputItems, setRecipeInputItems] = useState<RecipeIngredientInput[]>([{ uid: Date.now().toString(), materialId: '', amount: '' }]);

  // Set Form
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [setName, setSetName] = useState('');
  const [setInputItems, setSetInputItems] = useState<SetItemInput[]>([{ uid: Date.now().toString(), itemType: '', itemId: '', amount: '' }]);

  // ==========================================
  // Data Fetching
  // ==========================================
  const fetchData = async () => {
    setIsLoading(true);
    const [matRes, purRes, recRes, recIngRes, setRes, setItemsRes] = await Promise.all([
      supabase.from('materials').select('*').order('created_at', { ascending: false }),
      supabase.from('material_purchases').select('*').order('created_at', { ascending: false }),
      supabase.from('recipes').select('*').order('created_at', { ascending: false }),
      supabase.from('recipe_ingredients').select('*'),
      supabase.from('daily_sets').select('*').order('created_at', { ascending: false }),
      supabase.from('daily_set_items').select('*')
    ]);
    if (matRes.data) setMaterials(matRes.data);
    if (purRes.data) setPurchases(purRes.data);
    if (recRes.data) setRecipes(recRes.data);
    if (recIngRes.data) setRecipeIngredients(recIngRes.data);
    if (setRes.data) setDailySets(setRes.data);
    if (setItemsRes.data) setDailySetItems(setItemsRes.data);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // ==========================================
  // Master & Purchase & Adjust Logic
  // ==========================================
  const resetMasterForm = () => { setNewName(''); setNewCategory('food'); setNewBaseUnit('g'); setNewCostMultiplier(100); };
  const duplicateWarning = useMemo(() => {
    if (!newName.trim()) return null;
    const existing = materials.find(m => m.name.toLowerCase() === newName.trim().toLowerCase());
    return existing ? `"${existing.name} (${existing.base_unit})" is already registered.` : null;
  }, [newName, materials]);

  const handleSaveMaterial = async () => {
    if (!newName.trim() || duplicateWarning) return;
    setIsSaving(true);
    const newMaterial = { name: newName.trim(), category: newCategory, base_unit: newBaseUnit, current_cost: 0, current_stock: 0, cost_multiplier: newCostMultiplier, is_archived: false };
    const { data, error } = await supabase.from('materials').insert([newMaterial]).select().single();
    setIsSaving(false);
    if (error) return alert('Failed to save material: ' + error.message);
    setMaterials([data, ...materials]); setIsAddModalOpen(false); resetMasterForm();
  };

  const handleUpdateMultiplier = async (id: string, newMult: number) => {
    setMaterials(materials.map(m => m.id === id ? { ...m, cost_multiplier: newMult } : m));
    const { error } = await supabase.from('materials').update({ cost_multiplier: newMult }).eq('id', id);
    if (error) { alert('Failed to update: ' + error.message); fetchData(); }
  };

  const resetPurchaseForm = () => {
    setPurchaseDate(new Date().toISOString().split('T')[0]); setReceiptNo(''); setReceiptVendor(''); setIsTaxIncluded(false); setShippingFee('');
    setPurchaseItems([{ uid: Date.now().toString(), materialId: '', price: '', amount: '', displayUnit: 'g' }]);
  };
  const handleAddPurchaseRow = () => setPurchaseItems([...purchaseItems, { uid: Date.now().toString(), materialId: '', price: '', amount: '', displayUnit: 'g' }]);
  const handleRemovePurchaseRow = (uid: string) => { if (purchaseItems.length > 1) setPurchaseItems(purchaseItems.filter(item => item.uid !== uid)); };
  const handleMaterialChange = (uid: string, matId: string) => {
    const mat = materials.find(m => m.id === matId);
    setPurchaseItems(purchaseItems.map(item => item.uid === uid ? { ...item, materialId: matId, displayUnit: mat?.base_unit || 'g' } : item));
  };
  const handleNumberInput = (uid: string, field: 'price' | 'amount', value: string) => {
    const sanitized = value.replace(/[^0-9]/g, '');
    setPurchaseItems(purchaseItems.map(item => item.uid === uid ? { ...item, [field]: sanitized === '' ? '' : Number(sanitized) } : item));
  };
  const handleDisplayUnitChange = (uid: string, unit: string) => setPurchaseItems(purchaseItems.map(item => item.uid === uid ? { ...item, displayUnit: unit } : item));

  const receiptTotal = useMemo(() => {
    const itemsTotal = purchaseItems.reduce((acc, item) => {
      if (!item.materialId || item.price === '') return acc;
      const mat = materials.find(m => m.id === item.materialId);
      let itemPrice = Number(item.price);
      if (!isTaxIncluded && mat) itemPrice = mat.category === 'food' ? Math.round(itemPrice * 1.08) : Math.round(itemPrice * 1.10);
      return acc + itemPrice;
    }, 0);
    return itemsTotal + (shippingFee === '' ? 0 : Number(shippingFee));
  }, [purchaseItems, materials, isTaxIncluded, shippingFee]);

  const handleSavePurchase = async () => {
    if (!receiptNo.trim()) return alert('Receipt No. is required.');
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
        if (!isTaxIncluded) finalPrice = mat.category === 'food' ? Math.round(finalPrice * 1.08) : Math.round(finalPrice * 1.10);

        const unitCost = finalPrice / finalAmount;
        await supabase.from('material_purchases').insert([{ material_id: item.materialId, purchase_date: purchaseDate, price: finalPrice, amount: finalAmount, unit_cost: unitCost, receipt_note: combinedNote }]);
        await supabase.from('materials').update({ current_stock: mat.current_stock + finalAmount, current_cost: unitCost }).eq('id', mat.id);
      }
      await fetchData(); setIsPurchaseModalOpen(false); resetPurchaseForm();
    } catch (err: any) { alert('An error occurred: ' + err.message); }
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
          if (mat) await supabase.from('materials').update({ current_stock: Math.max(0, mat.current_stock - p.amount) }).eq('id', mat.id);
        }
        await supabase.from('material_purchases').delete().eq('purchase_date', groupDate).eq('receipt_note', groupNote);
      }
      await fetchData();
    } catch (err: any) { alert('Failed to cancel receipt: ' + err.message); }
    setIsLoading(false);
  };

  const openAdjustModal = (material: Material) => {
    setAdjustTarget(material); setAdjustType('waste'); setAdjustDate(new Date().toISOString().split('T')[0]); setAdjustAmount(''); setAdjustReason(''); setIsAdjustModalOpen(true);
  };
  const calculateNewStock = () => {
    if (!adjustTarget || adjustAmount === '') return adjustTarget?.current_stock || 0;
    const amount = Number(adjustAmount);
    return adjustType === 'waste' ? Math.max(0, adjustTarget.current_stock - amount) : amount;
  };
  const handleSaveAdjustment = async () => {
    if (!adjustTarget || adjustAmount === '') return alert('Please enter an amount.');
    if (!adjustReason.trim()) return alert('Please enter a reason/note.');
    setIsSaving(true);
    const amount = Number(adjustAmount); const newStock = calculateNewStock(); const difference = newStock - adjustTarget.current_stock;
    try {
      await supabase.from('material_adjustments').insert([{ material_id: adjustTarget.id, adjustment_date: adjustDate, adjustment_type: adjustType, previous_stock: adjustTarget.current_stock, new_stock: newStock, difference: difference, reason: adjustReason.trim() }]);
      await supabase.from('materials').update({ current_stock: newStock }).eq('id', adjustTarget.id);
      await fetchData(); setIsAdjustModalOpen(false);
    } catch (err: any) { alert('Failed to save adjustment: ' + err.message); }
    setIsSaving(false);
  };

  // ==========================================
  // Recipe Logic
  // ==========================================
  const resetRecipeForm = () => { setEditingRecipeId(null); setRecipeName(''); setRecipeInputItems([{ uid: Date.now().toString(), materialId: '', amount: '' }]); };
  const handleAddRecipeRow = () => setRecipeInputItems([...recipeInputItems, { uid: Date.now().toString(), materialId: '', amount: '' }]);
  const handleRemoveRecipeRow = (uid: string) => { if (recipeInputItems.length > 1) setRecipeInputItems(recipeInputItems.filter(item => item.uid !== uid)); };
  const handleUpdateRecipeInput = (uid: string, field: 'materialId' | 'amount', value: string) => {
    if (field === 'amount') {
      const sanitized = value.replace(/[^0-9]/g, '');
      setRecipeInputItems(recipeInputItems.map(item => item.uid === uid ? { ...item, amount: sanitized === '' ? '' : Number(sanitized) } : item));
    } else {
      setRecipeInputItems(recipeInputItems.map(item => item.uid === uid ? { ...item, materialId: value } : item));
    }
  };

  const getRecipeTotalCost = (recipeId: string) => {
    const ings = recipeIngredients.filter(ri => ri.recipe_id === recipeId);
    return ings.reduce((acc, ing) => {
      const mat = materials.find(m => m.id === ing.material_id);
      if (!mat) return acc;
      return acc + (mat.current_cost * ing.amount);
    }, 0);
  };

  const currentRecipeTotalCost = useMemo(() => {
    return recipeInputItems.reduce((acc, item) => {
      if (!item.materialId || item.amount === '') return acc;
      const mat = materials.find(m => m.id === item.materialId);
      if (!mat) return acc;
      return acc + (mat.current_cost * Number(item.amount));
    }, 0);
  }, [recipeInputItems, materials]);

  const handleSaveRecipe = async () => {
    if (!recipeName.trim()) return alert('Recipe name is required.');
    const validItems = recipeInputItems.filter(i => i.materialId !== '' && i.amount !== '');
    if (validItems.length === 0) return alert('Add at least one valid ingredient.');

    setIsSaving(true);
    try {
      let recipeId = editingRecipeId;
      if (!recipeId) {
        const { data: newRecipe, error: recipeError } = await supabase.from('recipes').insert([{ name: recipeName.trim() }]).select().single();
        if (recipeError) throw recipeError;
        recipeId = newRecipe.id;
      } else {
        await supabase.from('recipes').update({ name: recipeName.trim() }).eq('id', recipeId);
        await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      }
      const ingredientsToInsert = validItems.map(item => ({ recipe_id: recipeId, material_id: item.materialId, amount: Number(item.amount) }));
      const { error: ingError } = await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
      if (ingError) throw ingError;

      await fetchData(); setIsRecipeModalOpen(false); resetRecipeForm();
    } catch (err: any) { alert('Failed to save recipe: ' + err.message); }
    setIsSaving(false);
  };

  const openEditRecipeModal = (recipe: Recipe) => {
    setEditingRecipeId(recipe.id); setRecipeName(recipe.name);
    const relatedIngs = recipeIngredients.filter(ri => ri.recipe_id === recipe.id);
    if (relatedIngs.length > 0) {
      setRecipeInputItems(relatedIngs.map(ri => ({ uid: ri.id, materialId: ri.material_id, amount: ri.amount })));
    } else {
      setRecipeInputItems([{ uid: Date.now().toString(), materialId: '', amount: '' }]);
    }
    setIsRecipeModalOpen(true);
  };

  // ==========================================
  // Sets Logic
  // ==========================================
  const resetSetForm = () => { setEditingSetId(null); setSetName(''); setSetInputItems([{ uid: Date.now().toString(), itemType: '', itemId: '', amount: '' }]); };
  const handleAddSetRow = () => setSetInputItems([...setInputItems, { uid: Date.now().toString(), itemType: '', itemId: '', amount: '' }]);
  const handleRemoveSetRow = (uid: string) => { if (setInputItems.length > 1) setSetInputItems(setInputItems.filter(item => item.uid !== uid)); };

  const handleUpdateSetInput = (uid: string, field: 'itemId' | 'amount', value: string) => {
    if (field === 'amount') {
      const sanitized = value.replace(/[^0-9]/g, '');
      setSetInputItems(setInputItems.map(item => item.uid === uid ? { ...item, amount: sanitized === '' ? '' : Number(sanitized) } : item));
    } else {
      // value comes in as "recipe_UUID" or "material_UUID"
      const [type, id] = value.split('_');
      setSetInputItems(setInputItems.map(item => item.uid === uid ? { ...item, itemType: type as 'recipe'|'material', itemId: id } : item));
    }
  };

  const getSetTotalCost = (setId: string) => {
    const items = dailySetItems.filter(dsi => dsi.set_id === setId);
    return items.reduce((acc, item) => {
      let unitCost = 0;
      if (item.item_type === 'recipe' && item.recipe_id) {
        unitCost = getRecipeTotalCost(item.recipe_id);
      } else if (item.item_type === 'material' && item.material_id) {
        const mat = materials.find(m => m.id === item.material_id);
        if (mat) unitCost = mat.current_cost;
      }
      return acc + (unitCost * item.amount);
    }, 0);
  };

  const currentSetTotalCost = useMemo(() => {
    return setInputItems.reduce((acc, item) => {
      if (!item.itemId || item.amount === '') return acc;
      let unitCost = 0;
      if (item.itemType === 'recipe') {
        unitCost = getRecipeTotalCost(item.itemId);
      } else if (item.itemType === 'material') {
        const mat = materials.find(m => m.id === item.itemId);
        if (mat) unitCost = mat.current_cost;
      }
      return acc + (unitCost * Number(item.amount));
    }, 0);
  }, [setInputItems, materials, recipes, recipeIngredients]);

  const handleSaveSet = async () => {
    if (!setName.trim()) return alert('Set name is required.');
    const validItems = setInputItems.filter(i => i.itemId !== '' && i.amount !== '');
    if (validItems.length === 0) return alert('Add at least one valid item.');

    setIsSaving(true);
    try {
      let setId = editingSetId;
      if (!setId) {
        const { data: newSet, error: setError } = await supabase.from('daily_sets').insert([{ name: setName.trim() }]).select().single();
        if (setError) throw setError;
        setId = newSet.id;
      } else {
        await supabase.from('daily_sets').update({ name: setName.trim() }).eq('id', setId);
        await supabase.from('daily_set_items').delete().eq('set_id', setId);
      }

      const itemsToInsert = validItems.map(item => ({
        set_id: setId,
        item_type: item.itemType,
        recipe_id: item.itemType === 'recipe' ? item.itemId : null,
        material_id: item.itemType === 'material' ? item.itemId : null,
        amount: Number(item.amount)
      }));
      const { error: itemsError } = await supabase.from('daily_set_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      await fetchData(); setIsSetModalOpen(false); resetSetForm();
    } catch (err: any) { alert('Failed to save set: ' + err.message); }
    setIsSaving(false);
  };

  const openEditSetModal = (set: DailySet) => {
    setEditingSetId(set.id); setSetName(set.name);
    const relatedItems = dailySetItems.filter(dsi => dsi.set_id === set.id);
    if (relatedItems.length > 0) {
      setSetInputItems(relatedItems.map(ri => ({ 
        uid: ri.id, 
        itemType: ri.item_type, 
        itemId: ri.item_type === 'recipe' ? ri.recipe_id! : ri.material_id!, 
        amount: ri.amount 
      })));
    } else {
      setSetInputItems([{ uid: Date.now().toString(), itemType: '', itemId: '', amount: '' }]);
    }
    setIsSetModalOpen(true);
  };


  // ==========================================
  // Render Helpers
  // ==========================================
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

  const filteredRecipes = useMemo(() => {
    return recipes.filter(r => {
      if (searchQuery.trim()) return r.name.toLowerCase().includes(searchQuery.toLowerCase());
      return true;
    });
  }, [recipes, searchQuery]);
  
  const filteredSets = useMemo(() => {
    return dailySets.filter(s => {
      if (searchQuery.trim()) return s.name.toLowerCase().includes(searchQuery.toLowerCase());
      return true;
    });
  }, [dailySets, searchQuery]);


  return (
    <div className="space-y-6">
      <style>{`
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      {/* Navigation */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs flex flex-col md:flex-row items-center gap-4">
        <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 w-full overflow-x-auto">
          {[{ key: 'materials', label: 'Materials' }, { key: 'recipes', label: 'Recipes' }, { key: 'sets', label: 'Daily Sets' }, { key: 'purchases', label: 'Purchases' }].map((tab) => (
            <button key={tab.key} onClick={() => { setActiveSubTab(tab.key as InventoryTab); setSearchQuery(''); }} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex-1 md:flex-none cursor-pointer whitespace-nowrap ${activeSubTab === tab.key ? 'bg-white text-stone-900 shadow-sm border border-stone-200' : 'text-stone-500 hover:text-stone-800'}`}>{tab.label}</button>
          ))}
        </div>
      </div>

      {/* Materials Tab */}
      {activeSubTab === 'materials' && (
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 relative">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-3 border-b border-stone-100">
            <div className="flex bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-[11px] shrink-0">
              {[{ key: 'all', label: 'All Items' }, { key: 'food', label: 'Food' }, { key: 'packaging', label: 'Packaging' }, { key: 'others', label: 'Others' }].map((cat) => (
                <button key={cat.key} onClick={() => setCategoryFilter(cat.key as any)} className={`px-3 py-1 rounded-md font-bold transition cursor-pointer ${categoryFilter === cat.key ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}>{cat.label}</button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
              <div className="relative w-full sm:w-56 shrink-0">
                <input type="text" placeholder="Search materials..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-stone-50 border border-stone-300 rounded-xl pl-3.5 pr-8 py-2 text-xs text-stone-900 outline-none focus:border-stone-900" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-stone-300 hover:bg-stone-500 text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition">✕</button>}
              </div>
              <button onClick={() => setIsAddModalOpen(true)} className="w-full sm:w-auto bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm flex items-center justify-center gap-1.5 shrink-0">＋ Add Material</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? <div className="py-12 text-center text-stone-400 font-bold text-sm">Loading materials...</div> : (
              <table className="w-full text-left text-xs text-stone-700 border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-400 uppercase text-[10px]">
                    <th className="py-2.5 px-3">Item Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Base Unit</th>
                    <th className="py-2.5 px-3 text-right">Current Stock</th>
                    <th className="py-2.5 px-3 text-right">Current Cost (Avg)</th>
                    <th className="py-2.5 px-3 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredMaterials.map((m) => (
                    <tr key={m.id} className="hover:bg-stone-50 transition group">
                      <td className="py-3 px-3 font-bold text-stone-900">{m.name}</td>
                      <td className="py-3 px-3 capitalize font-semibold text-stone-600"><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${m.category === 'food' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-stone-100 text-stone-600 border border-stone-200'}`}>{m.category}</span></td>
                      <td className="py-3 px-3 font-mono text-stone-500">{m.base_unit}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">{m.current_stock || 0}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">
                        <div className="flex items-center justify-end gap-1">
                          {m.current_cost === 0 ? <span className="text-stone-400 font-normal">¥0.00</span> : <span>¥{(m.current_cost * (m.cost_multiplier || 1)).toFixed(2)}</span>}
                          <select value={m.cost_multiplier || 1} onChange={(e) => handleUpdateMultiplier(m.id, Number(e.target.value))} className="text-[10px] text-stone-400 bg-transparent hover:bg-stone-200 hover:text-stone-700 rounded cursor-pointer outline-none transition-colors py-0.5 px-1 font-mono">
                            {m.base_unit === 'g' && <><option value={1}>/ 1g</option><option value={100}>/ 100g</option><option value={1000}>/ 1kg</option></>}
                            {m.base_unit === 'ml' && <><option value={1}>/ 1ml</option><option value={100}>/ 100ml</option><option value={1000}>/ 1L</option></>}
                            {m.base_unit === 'pcs' && <><option value={1}>/ 1pcs</option><option value={10}>/ 10pcs</option><option value={100}>/ 100pcs</option></>}
                            {m.base_unit === 'cm' && <><option value={1}>/ 1cm</option><option value={10}>/ 10cm</option><option value={100}>/ 1m</option></>}
                          </select>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button onClick={() => openAdjustModal(m)} className="text-[10px] font-bold text-stone-400 hover:text-emerald-600 transition cursor-pointer bg-white border border-stone-200 hover:border-emerald-300 px-2 py-1 rounded shadow-xs">⚖️ Adjust</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Recipes Tab */}
      {activeSubTab === 'recipes' && (
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 relative">
          <div className="flex justify-between items-center pb-3 border-b border-stone-100">
            <div>
              <h2 className="text-sm font-bold text-stone-900">Single Recipes (BOM)</h2>
              <p className="text-[10px] text-stone-400 font-bold mt-0.5">Auto-calculated pure costs based on master data.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-48 hidden sm:block">
                <input type="text" placeholder="Search recipes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-stone-50 border border-stone-300 rounded-xl pl-3.5 pr-8 py-2 text-xs text-stone-900 outline-none focus:border-stone-900" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-stone-300 hover:bg-stone-500 text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition">✕</button>}
              </div>
              <button onClick={() => { resetRecipeForm(); setIsRecipeModalOpen(true); }} className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-1.5">
                ＋ Add Recipe
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              <div className="col-span-full py-12 text-center text-stone-400 font-bold text-sm">Loading recipes...</div>
            ) : filteredRecipes.length === 0 ? (
              <div className="col-span-full py-12 text-center text-stone-400 font-bold text-sm">No recipes found.</div>
            ) : (
              filteredRecipes.map(recipe => (
                <div key={recipe.id} className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs flex flex-col justify-between group hover:border-stone-400 transition cursor-default">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 mb-2">{recipe.name}</h3>
                    <div className="space-y-1">
                      {recipeIngredients.filter(ri => ri.recipe_id === recipe.id).map(ing => {
                        const mat = materials.find(m => m.id === ing.material_id);
                        if (!mat) return null;
                        const lineCost = mat.current_cost * ing.amount;
                        return (
                          <div key={ing.id} className="flex justify-between items-center text-[10px] text-stone-600 border-b border-stone-50 pb-1 last:border-0">
                            <span>{mat.name}</span>
                            <span className="font-mono">{ing.amount}{mat.base_unit} <span className="text-stone-300 ml-1">¥{lineCost.toFixed(2)}</span></span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-stone-100 flex justify-between items-end">
                    <button onClick={() => openEditRecipeModal(recipe)} className="text-[10px] font-bold text-stone-400 hover:text-stone-900 transition cursor-pointer px-2 py-1 bg-stone-50 rounded">✎ Edit</button>
                    <div className="text-right">
                      <div className="text-[9px] font-bold text-stone-400 uppercase tracking-wide">Total Cost</div>
                      <div className="text-lg font-black text-stone-900 font-mono leading-none">¥{getRecipeTotalCost(recipe.id).toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Daily Sets Tab */}
      {activeSubTab === 'sets' && (
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4 relative">
          <div className="flex justify-between items-center pb-3 border-b border-stone-100">
            <div>
              <h2 className="text-sm font-bold text-stone-900">Daily Sets</h2>
              <p className="text-[10px] text-stone-400 font-bold mt-0.5">Combine recipes and materials for final product costs.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-48 hidden sm:block">
                <input type="text" placeholder="Search sets..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-stone-50 border border-stone-300 rounded-xl pl-3.5 pr-8 py-2 text-xs text-stone-900 outline-none focus:border-stone-900" />
                {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-stone-300 hover:bg-stone-500 text-white flex items-center justify-center text-[10px] font-bold cursor-pointer transition">✕</button>}
              </div>
              <button onClick={() => { resetSetForm(); setIsSetModalOpen(true); }} className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-1.5">
                ＋ Add Set
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              <div className="col-span-full py-12 text-center text-stone-400 font-bold text-sm">Loading sets...</div>
            ) : filteredSets.length === 0 ? (
              <div className="col-span-full py-12 text-center text-stone-400 font-bold text-sm">No sets found.</div>
            ) : (
              filteredSets.map(set => (
                <div key={set.id} className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs flex flex-col justify-between group hover:border-stone-400 transition cursor-default">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 mb-2">{set.name}</h3>
                    <div className="space-y-1">
                      {dailySetItems.filter(dsi => dsi.set_id === set.id).map(item => {
                        let itemName = '';
                        let unit = '';
                        let lineCost = 0;

                        if (item.item_type === 'recipe' && item.recipe_id) {
                          const r = recipes.find(rec => rec.id === item.recipe_id);
                          if (r) {
                            itemName = `[R] ${r.name}`;
                            unit = 'portion';
                            lineCost = getRecipeTotalCost(r.id) * item.amount;
                          }
                        } else if (item.item_type === 'material' && item.material_id) {
                          const m = materials.find(mat => mat.id === item.material_id);
                          if (m) {
                            itemName = `[M] ${m.name}`;
                            unit = m.base_unit;
                            lineCost = m.current_cost * item.amount;
                          }
                        }

                        if (!itemName) return null;

                        return (
                          <div key={item.id} className="flex justify-between items-center text-[10px] text-stone-600 border-b border-stone-50 pb-1 last:border-0">
                            <span className="truncate pr-2">{itemName}</span>
                            <span className="font-mono whitespace-nowrap">{item.amount}{unit} <span className="text-stone-300 ml-1">¥{lineCost.toFixed(2)}</span></span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-stone-100 flex justify-between items-end">
                    <button onClick={() => openEditSetModal(set)} className="text-[10px] font-bold text-stone-400 hover:text-stone-900 transition cursor-pointer px-2 py-1 bg-stone-50 rounded">✎ Edit</button>
                    <div className="text-right">
                      <div className="text-[9px] font-bold text-stone-400 uppercase tracking-wide">Total Set Cost</div>
                      <div className="text-lg font-black text-stone-900 font-mono leading-none">¥{getSetTotalCost(set.id).toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}


      {/* Purchases Tab */}
      {activeSubTab === 'purchases' && (
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-5 relative">
          <div className="flex justify-between items-center pb-3 border-b border-stone-100">
            <div><h2 className="text-sm font-bold text-stone-900">Purchase History</h2></div>
            <button onClick={() => setIsPurchaseModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm flex items-center gap-1.5">＋ Add Purchase</button>
          </div>
          {isLoading ? <div className="py-12 text-center text-stone-400 font-bold text-sm">Loading...</div> : (
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
                      <button onClick={() => handleCancelReceipt(group.date, group.note)} className="text-[10px] font-bold text-stone-400 hover:text-rose-600 transition opacity-0 group-hover:opacity-100 cursor-pointer">🗑️ Cancel</button>
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
          MODAL: Recipe (Add/Edit)
          ========================================= */}
      {isRecipeModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-lg w-full p-6 space-y-5 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start border-b border-stone-100 pb-3 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-stone-900">{editingRecipeId ? 'Edit Recipe' : 'New Recipe'}</h3>
                <p className="text-[10px] font-bold uppercase text-stone-400 mt-0.5">Build your BOM (Bill of Materials)</p>
              </div>
              <button onClick={() => { setIsRecipeModalOpen(false); resetRecipeForm(); }} className="text-stone-400 hover:text-stone-700 text-lg font-bold cursor-pointer">✕</button>
            </div>

            <div className="overflow-y-auto pr-2 space-y-5 flex-1 custom-scrollbar">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1.5">Recipe Name</label>
                <input type="text" autoFocus placeholder="e.g., Salted Salmon Onigiri" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm font-bold text-stone-900 outline-none focus:border-stone-900" />
              </div>

              <div className="space-y-3">
                <label className="block text-[11px] font-bold text-stone-600">Ingredients (構成要素)</label>
                {recipeInputItems.map((item) => {
                  const mat = materials.find(m => m.id === item.materialId);
                  const lineCost = mat && item.amount !== '' ? mat.current_cost * Number(item.amount) : 0;
                  
                  return (
                    <div key={item.uid} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-stone-200 shadow-xs relative">
                      <div className="flex-1">
                        <select value={item.materialId} onChange={(e) => handleUpdateRecipeInput(item.uid, 'materialId', e.target.value)} className="w-full px-2 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold text-stone-800 outline-none cursor-pointer">
                          <option value="">-- Select Material --</option>
                          {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div className="w-24 relative">
                        <input type="text" placeholder="Amount" inputMode="numeric" value={item.amount} onChange={(e) => handleUpdateRecipeInput(item.uid, 'amount', e.target.value)} className="w-full px-2 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs font-mono font-bold outline-none text-right pr-6" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-stone-400">{mat ? mat.base_unit : ''}</span>
                      </div>
                      <div className="w-16 text-right pr-2">
                        <span className="text-[10px] font-mono font-bold text-stone-500">¥{lineCost.toFixed(2)}</span>
                      </div>
                      <button onClick={() => handleRemoveRecipeRow(item.uid)} disabled={recipeInputItems.length === 1} className="text-stone-300 hover:text-rose-500 disabled:opacity-30 cursor-pointer p-1">✕</button>
                    </div>
                  );
                })}
                <button onClick={handleAddRecipeRow} className="w-full py-2 border-2 border-dashed border-stone-200 hover:border-stone-400 text-stone-400 hover:text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer">＋ Add Ingredient</button>
              </div>
            </div>

            <div className="bg-stone-900 rounded-xl p-4 shrink-0 flex items-center justify-between shadow-md">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Total Recipe Cost</span>
              <span className="text-2xl font-black text-white font-mono leading-none">¥{currentRecipeTotalCost.toFixed(2)}</span>
            </div>
            <div className="flex gap-2 pt-2 border-t border-stone-100 shrink-0">
              <button onClick={() => { setIsRecipeModalOpen(false); resetRecipeForm(); }} className="flex-1 py-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-bold cursor-pointer">Cancel</button>
              <button onClick={handleSaveRecipe} disabled={isSaving || !recipeName.trim()} className="flex-1 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50">Save Recipe</button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL: Daily Set (Add/Edit)
          ========================================= */}
      {isSetModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-lg w-full p-6 space-y-5 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start border-b border-stone-100 pb-3 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-stone-900">{editingSetId ? 'Edit Daily Set' : 'New Daily Set'}</h3>
                <p className="text-[10px] font-bold uppercase text-stone-400 mt-0.5">Combine recipes and materials</p>
              </div>
              <button onClick={() => { setIsSetModalOpen(false); resetSetForm(); }} className="text-stone-400 hover:text-stone-700 text-lg font-bold cursor-pointer">✕</button>
            </div>

            <div className="overflow-y-auto pr-2 space-y-5 flex-1 custom-scrollbar">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1.5">Set Name</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="e.g., Standard Set (2 Onigiri + Packaging)" 
                  value={setName} 
                  onChange={(e) => setSetName(e.target.value)} 
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm font-bold text-stone-900 outline-none focus:border-stone-900" 
                />
              </div>

              <div className="space-y-3">
                <label className="block text-[11px] font-bold text-stone-600">Contents (セット内容)</label>
                {setInputItems.map((item) => {
                  
                  let unitLabel = '';
                  let lineCost = 0;

                  if (item.itemType === 'recipe' && item.itemId) {
                    unitLabel = 'portion';
                    lineCost = item.amount !== '' ? getRecipeTotalCost(item.itemId) * Number(item.amount) : 0;
                  } else if (item.itemType === 'material' && item.itemId) {
                    const mat = materials.find(m => m.id === item.itemId);
                    unitLabel = mat ? mat.base_unit : '';
                    lineCost = mat && item.amount !== '' ? mat.current_cost * Number(item.amount) : 0;
                  }
                  
                  return (
                    <div key={item.uid} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-stone-200 shadow-xs relative">
                      <div className="flex-1">
                        <select 
                          value={item.itemId ? `${item.itemType}_${item.itemId}` : ''} 
                          onChange={(e) => handleUpdateSetInput(item.uid, 'itemId', e.target.value)} 
                          className="w-full px-2 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold text-stone-800 outline-none cursor-pointer"
                        >
                          <option value="">-- Select Item --</option>
                          <optgroup label="Recipes (単品レシピ)">
                            {recipes.map(r => <option key={`recipe_${r.id}`} value={`recipe_${r.id}`}>{r.name}</option>)}
                          </optgroup>
                          <optgroup label="Materials (包材・その他マスター)">
                            {materials.map(m => <option key={`material_${m.id}`} value={`material_${m.id}`}>{m.name}</option>)}
                          </optgroup>
                        </select>
                      </div>
                      
                      <div className="w-24 relative">
                        <input 
                          type="text" 
                          placeholder="Amount" 
                          inputMode="numeric" 
                          value={item.amount} 
                          onChange={(e) => handleUpdateSetInput(item.uid, 'amount', e.target.value)} 
                          className="w-full px-2 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs font-mono font-bold outline-none text-right pr-6" 
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-stone-400">
                          {unitLabel}
                        </span>
                      </div>

                      <div className="w-16 text-right pr-2">
                        <span className="text-[10px] font-mono font-bold text-stone-500">¥{lineCost.toFixed(2)}</span>
                      </div>

                      <button 
                        onClick={() => handleRemoveSetRow(item.uid)} 
                        disabled={setInputItems.length === 1} 
                        className="text-stone-300 hover:text-rose-500 disabled:opacity-30 cursor-pointer p-1"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <button 
                  onClick={handleAddSetRow} 
                  className="w-full py-2 border-2 border-dashed border-stone-200 hover:border-stone-400 text-stone-400 hover:text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  ＋ Add Item to Set
                </button>
              </div>
            </div>

            <div className="bg-stone-900 rounded-xl p-4 shrink-0 flex items-center justify-between shadow-md">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Total Set Cost</span>
              <span className="text-2xl font-black text-white font-mono leading-none">¥{currentSetTotalCost.toFixed(2)}</span>
            </div>

            <div className="flex gap-2 pt-2 border-t border-stone-100 shrink-0">
              <button onClick={() => { setIsSetModalOpen(false); resetSetForm(); }} className="flex-1 py-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-bold cursor-pointer">Cancel</button>
              <button onClick={handleSaveSet} disabled={isSaving || !setName.trim()} className="flex-1 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50">Save Set</button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL: Add Material
          ========================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-sm w-full p-6 space-y-5">
            <div className="flex justify-between items-start border-b border-stone-100 pb-3">
              <h3 className="text-lg font-bold text-stone-900">New Material</h3>
              <button onClick={() => { setIsAddModalOpen(false); resetMasterForm(); }} className="text-stone-400 hover:text-stone-700 text-lg font-bold cursor-pointer">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1.5">Material Name</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm font-bold outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1.5">Category</label>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as MaterialCategory)} className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm font-bold outline-none">
                    <option value="food">Food</option>
                    <option value="packaging">Packaging</option>
                    <option value="others">Others</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1.5">Base Unit</label>
                  <select value={newBaseUnit} onChange={(e) => setNewBaseUnit(e.target.value as BaseUnit)} className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm font-bold outline-none">
                    <option value="g">g (Grams)</option>
                    <option value="ml">ml (Milliliters)</option>
                    <option value="cm">cm (Centimeters)</option>
                    <option value="pcs">pcs (Pieces)</option>
                  </select>
                </div>
              </div>
              {duplicateWarning && <div className="text-[10px] text-rose-600 font-bold bg-rose-50 p-2 rounded-lg">{duplicateWarning}</div>}
            </div>
            <div className="flex gap-2 pt-2 border-t border-stone-100">
              <button onClick={() => { setIsAddModalOpen(false); resetMasterForm(); }} className="flex-1 py-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-bold cursor-pointer">Cancel</button>
              <button onClick={handleSaveMaterial} disabled={isSaving || !newName.trim() || !!duplicateWarning} className="flex-1 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL: Add Purchase (Receipt Entry)
          ========================================= */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start border-b border-stone-100 pb-3 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-stone-900">Add Purchase (Receipt Entry)</h3>
                <p className="text-[10px] font-bold text-stone-400 mt-0.5 uppercase tracking-wide">Enter items to update stock & avg cost</p>
              </div>
              <button onClick={() => { setIsPurchaseModalOpen(false); resetPurchaseForm(); }} className="text-stone-400 hover:text-stone-700 text-lg font-bold cursor-pointer">✕</button>
            </div>
            
            <div className="overflow-y-auto pr-2 space-y-4 flex-1 custom-scrollbar">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Date</label>
                  <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Receipt No.</label>
                  <input type="text" placeholder="#001" value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} className="w-full px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Vendor/Store</label>
                  <input type="text" placeholder="e.g. 西友, OKストア" value={receiptVendor} onChange={(e) => setReceiptVendor(e.target.value)} className="w-full px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold outline-none" />
                </div>
              </div>

              <div className="space-y-2">
                {purchaseItems.map(item => (
                  <div key={item.uid} className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-200">
                    <div className="w-full md:flex-1">
                      <select value={item.materialId} onChange={(e) => handleMaterialChange(item.uid, e.target.value)} className="w-full px-2 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-bold text-stone-800 outline-none cursor-pointer">
                        <option value="">-- Select Material --</option>
                        {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="w-1/3 md:w-24 relative">
                      <input type="text" placeholder="Price" value={item.price} onChange={(e) => handleNumberInput(item.uid, 'price', e.target.value)} className="w-full px-2 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold outline-none pr-4 text-right" />
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 font-bold">¥</span>
                    </div>
                    <div className="w-1/3 md:w-24">
                      <input type="text" placeholder="Amount" value={item.amount} onChange={(e) => handleNumberInput(item.uid, 'amount', e.target.value)} className="w-full px-2 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-mono font-bold outline-none text-right" />
                    </div>
                    <div className="w-1/4 md:w-20">
                      <select value={item.displayUnit} onChange={(e) => handleDisplayUnitChange(item.uid, e.target.value)} className="w-full px-1 py-1.5 bg-white border border-stone-300 rounded-lg text-xs font-bold text-stone-600 outline-none cursor-pointer">
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="L">L</option>
                        <option value="pcs">pcs</option>
                        <option value="cm">cm</option>
                        <option value="m">m</option>
                      </select>
                    </div>
                    <button onClick={() => handleRemovePurchaseRow(item.uid)} disabled={purchaseItems.length === 1} className="w-auto p-1.5 text-stone-400 hover:text-rose-500 disabled:opacity-30 cursor-pointer">✕</button>
                  </div>
                ))}
                <button onClick={handleAddPurchaseRow} className="w-full py-2 border-2 border-dashed border-stone-200 hover:border-stone-400 text-stone-400 hover:text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer">＋ Add Item to Receipt</button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Input Price Type</label>
                  <select value={isTaxIncluded ? 'included' : 'excluded'} onChange={(e) => setIsTaxIncluded(e.target.value === 'included')} className="w-full px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold outline-none">
                    <option value="excluded">Tax Excluded (税抜入力 - 自動加算)</option>
                    <option value="included">Tax Included (税込入力)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Shipping Fee (送料等 税込)</label>
                  <div className="relative">
                    <input type="text" placeholder="0" value={shippingFee} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setShippingFee(v === '' ? '' : Number(v)); }} className="w-full px-2 py-1.5 pl-6 bg-stone-50 border border-stone-300 rounded-lg text-xs font-mono font-bold outline-none text-right" />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 font-bold">¥</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-stone-900 rounded-xl p-4 shrink-0 flex items-center justify-between shadow-md">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Calculated Receipt Total (Incl. Tax)</span>
              <span className="text-2xl font-black text-white font-mono leading-none">¥{receiptTotal.toLocaleString()}</span>
            </div>
            <div className="flex gap-2 pt-2 border-t border-stone-100 shrink-0">
              <button onClick={() => { setIsPurchaseModalOpen(false); resetPurchaseForm(); }} className="flex-1 py-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-bold cursor-pointer">Cancel</button>
              <button onClick={handleSavePurchase} disabled={isSaving || !receiptNo.trim() || !receiptVendor.trim()} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50">Save Receipt & Update Stock</button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL: Adjust Stock
          ========================================= */}
      {isAdjustModalOpen && adjustTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-sm w-full p-6 space-y-5 flex flex-col">
            <div className="flex justify-between items-start border-b border-stone-100 pb-3 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-stone-900">Adjust Stock</h3>
                <p className="text-[10px] font-bold text-stone-400 mt-0.5">{adjustTarget.name}</p>
              </div>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-stone-400 hover:text-stone-700 text-lg font-bold cursor-pointer">✕</button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Adjustment Type</label>
                  <select value={adjustType} onChange={(e) => setAdjustType(e.target.value as AdjustmentType)} className="w-full px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold outline-none">
                    <option value="waste">Waste (廃棄/消費)</option>
                    <option value="stocktake">Stocktake (棚卸/実数入力)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">Date</label>
                  <input type="date" value={adjustDate} onChange={(e) => setAdjustDate(e.target.value)} className="w-full px-2 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-bold outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">
                  {adjustType === 'waste' ? 'Amount to Deduct' : 'Actual Stock Amount'}
                </label>
                <div className="relative">
                  <input type="number" placeholder="0" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value === '' ? '' : Number(e.target.value))} className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-lg font-mono font-bold outline-none text-right pr-12" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">{adjustTarget.base_unit}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">Reason / Note</label>
                <input type="text" placeholder="e.g. 期限切れ廃棄, 月末棚卸" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold outline-none" />
              </div>

              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-center">
                <div className="text-[10px] font-bold text-stone-500 uppercase">Projected Stock After Adjustment</div>
                <div className="text-xl font-black text-stone-900 font-mono mt-1">{calculateNewStock()} {adjustTarget.base_unit}</div>
                <div className="text-[10px] text-stone-400 mt-1">
                  Difference: <span className={calculateNewStock() - adjustTarget.current_stock < 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>{calculateNewStock() - adjustTarget.current_stock > 0 ? '+' : ''}{calculateNewStock() - adjustTarget.current_stock} {adjustTarget.base_unit}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-stone-100 shrink-0">
              <button onClick={() => setIsAdjustModalOpen(false)} className="flex-1 py-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-bold cursor-pointer">Cancel</button>
              <button onClick={handleSaveAdjustment} disabled={isSaving || adjustAmount === '' || !adjustReason.trim()} className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50">Confirm Adjust</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}