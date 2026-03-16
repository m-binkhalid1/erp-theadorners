import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Package, Loader2, AlertTriangle,
  ArrowUpDown, RotateCcw, Send, PackageCheck, TrendingDown,
  Boxes, History, BarChart3, Search, Filter
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  description: string;
}

interface InventoryItem {
  id: string;
  category_id: string;
  name: string;
  specification: string;
  quantity: number;
  available_quantity: number;
  item_type: string;
  min_stock_level: number;
}

interface Transaction {
  id: string;
  inventory_item_id: string;
  event_id: string | null;
  transaction_type: string;
  quantity: number;
  notes: string;
  created_by: string;
  created_at: string;
}

interface EventRecord {
  id: string;
  company: string;
  event_place: string;
  date: string;
}

const TRANSACTION_LABELS: Record<string, { label: string; color: string; icon: typeof Send }> = {
  sent_to_event: { label: "Sent to Event", color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Send },
  returned: { label: "Returned", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200", icon: RotateCcw },
  damaged: { label: "Damaged", color: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
  consumed: { label: "Consumed", color: "bg-orange-500/10 text-orange-600 border-orange-200", icon: TrendingDown },
  restocked: { label: "Restocked", color: "bg-primary/10 text-primary border-primary/20", icon: PackageCheck },
  adjustment: { label: "Adjustment", color: "bg-muted text-muted-foreground border-border", icon: ArrowUpDown },
};

const AdminInventory = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);

  // Forms
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState({ category_id: "", name: "", specification: "", quantity: 0, available_quantity: 0, item_type: "reusable", min_stock_level: 0 });
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [bulkTxn, setBulkTxn] = useState<{ event_id: string; transaction_type: string; notes: string; lines: { item_id: string; quantity: number }[] }>({ event_id: "", transaction_type: "sent_to_event", notes: "", lines: [{ item_id: "", quantity: 1 }] });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const fetchAll = async () => {
    const [itemsRes, catsRes, txnsRes, eventsRes] = await Promise.all([
      supabase.from("inventory").select("*").order("name"),
      supabase.from("inventory_categories").select("*").order("name"),
      supabase.from("inventory_transactions").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("events").select("id, company, event_place, date").order("date", { ascending: false }),
    ]);
    if (itemsRes.data) setItems(itemsRes.data as InventoryItem[]);
    if (catsRes.data) setCategories(catsRes.data);
    if (txnsRes.data) setTransactions(txnsRes.data as Transaction[]);
    if (eventsRes.data) setEvents(eventsRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("inventory-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_transactions" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Dashboard stats
  const stats = useMemo(() => {
    const totalItems = items.length;
    const totalStock = items.reduce((s, i) => s + i.quantity, 0);
    const totalAvailable = items.reduce((s, i) => s + i.available_quantity, 0);
    const inUse = totalStock - totalAvailable;
    const lowStock = items.filter(i => i.available_quantity <= i.min_stock_level && i.item_type === "reusable");
    const consumablesLow = items.filter(i => i.quantity <= i.min_stock_level && i.item_type === "consumable");
    return { totalItems, totalStock, totalAvailable, inUse, lowStock: [...lowStock, ...consumablesLow] };
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.specification.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = filterCategory === "all" || item.category_id === filterCategory;
      const matchType = filterType === "all" || item.item_type === filterType;
      return matchSearch && matchCat && matchType;
    });
  }, [items, searchQuery, filterCategory, filterType]);

  // Category name helper
  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name ?? id;
  const getItemName = (id: string) => items.find(i => i.id === id)?.name ?? id;
  const getEventLabel = (id: string | null) => {
    if (!id) return "—";
    const ev = events.find(e => e.id === id);
    return ev ? `${ev.company} - ${ev.event_place}` : id;
  };

  // --- ITEM CRUD ---
  const resetItemForm = () => { setItemForm({ category_id: "", name: "", specification: "", quantity: 0, available_quantity: 0, item_type: "reusable", min_stock_level: 0 }); setEditingItem(null); };

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...itemForm, available_quantity: editingItem ? itemForm.available_quantity : itemForm.quantity };
    if (editingItem) {
      const { error } = await supabase.from("inventory").update(payload).eq("id", editingItem.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Item updated!");
    } else {
      const { error } = await supabase.from("inventory").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Item added!");
    }
    setItemDialogOpen(false); resetItemForm(); fetchAll();
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Delete this item and all its transactions?")) return;
    const { error } = await supabase.from("inventory").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); fetchAll(); }
  };

  // --- CATEGORY CRUD ---
  const handleCatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("inventory_categories").insert(catForm);
    if (error) { toast.error(error.message); return; }
    toast.success("Category added!"); setCatDialogOpen(false); setCatForm({ name: "", description: "" }); fetchAll();
  };

  const handleDeleteCategory = async (id: string) => {
    const { error } = await supabase.from("inventory_categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Category deleted"); fetchAll(); }
  };

  // --- BULK TRANSACTION ---
  const resetBulkTxn = () => setBulkTxn({ event_id: "", transaction_type: "sent_to_event", notes: "", lines: [{ item_id: "", quantity: 1 }] });

  const addLine = () => setBulkTxn(prev => ({ ...prev, lines: [...prev.lines, { item_id: "", quantity: 1 }] }));
  const removeLine = (idx: number) => setBulkTxn(prev => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }));
  const updateLine = (idx: number, field: "item_id" | "quantity", value: string | number) =>
    setBulkTxn(prev => ({ ...prev, lines: prev.lines.map((l, i) => i === idx ? { ...l, [field]: value } : l) }));

  const handleBulkTxnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const type = bulkTxn.transaction_type;
    const validLines = bulkTxn.lines.filter(l => l.item_id && l.quantity > 0);
    if (validLines.length === 0) { toast.error("Add at least one item"); return; }

    // Validate all lines
    for (const line of validLines) {
      const item = items.find(i => i.id === line.item_id);
      if (!item) { toast.error(`Item not found`); return; }
      if ((type === "sent_to_event" || type === "consumed" || type === "damaged") && line.quantity > item.available_quantity) {
        toast.error(`${item.name}: only ${item.available_quantity} available!`); return;
      }
    }

    // Insert all transactions
    const txnRows = validLines.map(line => ({
      inventory_item_id: line.item_id,
      event_id: bulkTxn.event_id || null,
      transaction_type: type as any,
      quantity: line.quantity,
      notes: bulkTxn.notes,
      created_by: user.id,
    }));

    const { error } = await supabase.from("inventory_transactions").insert(txnRows);
    if (error) { toast.error(error.message); return; }

    // Update each item's quantities
    for (const line of validLines) {
      const item = items.find(i => i.id === line.item_id)!;
      let newQty = item.quantity;
      let newAvail = item.available_quantity;
      const qty = line.quantity;

      switch (type) {
        case "sent_to_event": newAvail -= qty; break;
        case "returned": newAvail += qty; break;
        case "damaged": newAvail -= qty; newQty -= qty; break;
        case "consumed": newAvail -= qty; newQty -= qty; break;
        case "restocked": newQty += qty; newAvail += qty; break;
        case "adjustment": newQty = qty; newAvail = qty; break;
      }
      await supabase.from("inventory").update({ quantity: newQty, available_quantity: newAvail }).eq("id", item.id);
    }

    toast.success(`${validLines.length} transaction(s) recorded!`);
    setTxnDialogOpen(false);
    resetBulkTxn();
    fetchAll();
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Inventory Management</h1>
          <p className="text-sm text-muted-foreground">Track, manage & monitor your warehouse</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> Category</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Category</DialogTitle></DialogHeader>
              <form onSubmit={handleCatSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Description</Label><Input value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} /></div>
                <Button type="submit" className="w-full">Add Category</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={txnDialogOpen} onOpenChange={o => { setTxnDialogOpen(o); if (!o) resetBulkTxn(); }}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><ArrowUpDown className="h-4 w-4 mr-1" /> Transaction</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Bulk Transaction</DialogTitle></DialogHeader>
              <form onSubmit={handleBulkTxnSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={bulkTxn.transaction_type} onValueChange={v => setBulkTxn(prev => ({ ...prev, transaction_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TRANSACTION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {(bulkTxn.transaction_type === "sent_to_event" || bulkTxn.transaction_type === "returned") && (
                    <div className="space-y-2">
                      <Label>Event</Label>
                      <Select value={bulkTxn.event_id} onValueChange={v => setBulkTxn(prev => ({ ...prev, event_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                        <SelectContent>
                          {events.map(ev => <SelectItem key={ev.id} value={ev.id}>{ev.company} - {ev.event_place} ({ev.date})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Item Lines */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Items ({bulkTxn.lines.length})</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Add Item</Button>
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {bulkTxn.lines.map((line, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <Select value={line.item_id} onValueChange={v => updateLine(idx, "item_id", v)}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Select item..." /></SelectTrigger>
                          <SelectContent>
                            {items.map(i => <SelectItem key={i.id} value={i.id}>{i.name} (Avail: {i.available_quantity})</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input type="number" min={1} className="w-20" value={line.quantity} onChange={e => updateLine(idx, "quantity", parseInt(e.target.value) || 1)} />
                        {bulkTxn.lines.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => removeLine(idx)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2"><Label>Notes</Label><Textarea value={bulkTxn.notes} onChange={e => setBulkTxn(prev => ({ ...prev, notes: e.target.value }))} placeholder="Optional notes..." rows={2} /></div>
                <Button type="submit" className="w-full">Record {bulkTxn.lines.filter(l => l.item_id).length} Transaction(s)</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={itemDialogOpen} onOpenChange={o => { setItemDialogOpen(o); if (!o) resetItemForm(); }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Item</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingItem ? "Edit" : "Add"} Item</DialogTitle></DialogHeader>
              <form onSubmit={handleItemSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={itemForm.category_id} onValueChange={v => setItemForm({ ...itemForm, category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={itemForm.item_type} onValueChange={v => setItemForm({ ...itemForm, item_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reusable">♻️ Reusable</SelectItem>
                        <SelectItem value="consumable">🔥 Consumable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label>Name</Label><Input value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Specification</Label><Input value={itemForm.specification} onChange={e => setItemForm({ ...itemForm, specification: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Total Quantity</Label><Input type="number" min={0} value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: parseInt(e.target.value) || 0 })} required /></div>
                  <div className="space-y-2"><Label>Min Stock Alert</Label><Input type="number" min={0} value={itemForm.min_stock_level} onChange={e => setItemForm({ ...itemForm, min_stock_level: parseInt(e.target.value) || 0 })} /></div>
                </div>
                {editingItem && (
                  <div className="space-y-2"><Label>Available Quantity</Label><Input type="number" min={0} value={itemForm.available_quantity} onChange={e => setItemForm({ ...itemForm, available_quantity: parseInt(e.target.value) || 0 })} /></div>
                )}
                <Button type="submit" className="w-full">{editingItem ? "Update" : "Add"} Item</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-3"><Boxes className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold font-display">{stats.totalItems}</p>
                <p className="text-xs text-muted-foreground">Total Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3"><Package className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold font-display">{stats.totalStock}</p>
                <p className="text-xs text-muted-foreground">Total Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-3"><PackageCheck className="h-5 w-5 text-emerald-600" /></div>
              <div>
                <p className="text-2xl font-bold font-display">{stats.totalAvailable}</p>
                <p className="text-xs text-muted-foreground">Available</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-orange-500/10 p-3"><Send className="h-5 w-5 text-orange-600" /></div>
              <div>
                <p className="text-2xl font-bold font-display">{stats.inUse}</p>
                <p className="text-xs text-muted-foreground">In Use / Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alerts */}
      {stats.lowStock.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Low Stock Alerts ({stats.lowStock.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.lowStock.map(item => (
                <Badge key={item.id} variant="outline" className="border-destructive/30 text-destructive">
                  {item.name} — {item.item_type === "consumable" ? item.quantity : item.available_quantity} left (min: {item.min_stock_level})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="items" className="space-y-4">
        <TabsList>
          <TabsTrigger value="items" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Items</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5"><History className="h-3.5 w-3.5" /> Transactions</TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5"><Boxes className="h-3.5 w-3.5" /> Categories</TabsTrigger>
          <TabsTrigger value="event-history" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Event History</TabsTrigger>
        </TabsList>

        {/* ITEMS TAB */}
        <TabsContent value="items" className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search items..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="reusable">♻️ Reusable</SelectItem>
                <SelectItem value="consumable">🔥 Consumable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredItems.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center py-16"><Package className="h-12 w-12 text-muted-foreground/40 mb-4" /><p className="text-muted-foreground">No items found.</p></CardContent></Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Spec</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Total</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Available</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">In Use</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const inUse = item.quantity - item.available_quantity;
                    const isLow = item.available_quantity <= item.min_stock_level;
                    return (
                      <tr key={item.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">{getCategoryName(item.category_id)}</Badge>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {item.name}
                          {isLow && <AlertTriangle className="inline ml-1.5 h-3.5 w-3.5 text-destructive" />}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="text-xs">
                            {item.item_type === "reusable" ? "♻️ Reusable" : "🔥 Consumable"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.specification}</td>
                        <td className="px-4 py-3 text-center font-mono">{item.quantity}</td>
                        <td className={`px-4 py-3 text-center font-mono font-medium ${isLow ? "text-destructive" : "text-emerald-600"}`}>{item.available_quantity}</td>
                        <td className="px-4 py-3 text-center font-mono">{inUse}</td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" onClick={() => {
                            setEditingItem(item);
                            setItemForm({ category_id: item.category_id, name: item.name, specification: item.specification, quantity: item.quantity, available_quantity: item.available_quantity, item_type: item.item_type, min_stock_level: item.min_stock_level });
                            setItemDialogOpen(true);
                          }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* TRANSACTIONS TAB */}
        <TabsContent value="transactions" className="space-y-4">
          {transactions.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center py-16"><History className="h-12 w-12 text-muted-foreground/40 mb-4" /><p className="text-muted-foreground">No transactions yet.</p></CardContent></Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Item</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">Qty</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Event</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(txn => {
                    const meta = TRANSACTION_LABELS[txn.transaction_type] ?? TRANSACTION_LABELS.adjustment;
                    return (
                      <tr key={txn.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(txn.created_at).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}
                          <br />
                          <span className="text-[10px]">{new Date(txn.created_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</span>
                        </td>
                        <td className="px-4 py-3 font-medium">{getItemName(txn.inventory_item_id)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${meta.color}`}>{meta.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-medium">{txn.quantity}</td>
                        <td className="px-4 py-3 text-xs">{getEventLabel(txn.event_id)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{txn.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* CATEGORIES TAB */}
        <TabsContent value="categories" className="space-y-4">
          {categories.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center py-16"><Boxes className="h-12 w-12 text-muted-foreground/40 mb-4" /><p className="text-muted-foreground">No categories yet. Add one above.</p></CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map(cat => {
                const catItems = items.filter(i => i.category_id === cat.id);
                const totalQty = catItems.reduce((s, i) => s + i.quantity, 0);
                const availQty = catItems.reduce((s, i) => s + i.available_quantity, 0);
                return (
                  <Card key={cat.id} className="group">
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-display font-semibold">{cat.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1">{cat.description || "No description"}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDeleteCategory(cat.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                      <div className="mt-4 flex gap-4 text-sm">
                        <div><span className="font-mono font-bold">{catItems.length}</span> <span className="text-muted-foreground">items</span></div>
                        <div><span className="font-mono font-bold">{totalQty}</span> <span className="text-muted-foreground">total</span></div>
                        <div><span className="font-mono font-bold text-emerald-600">{availQty}</span> <span className="text-muted-foreground">avail</span></div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* EVENT HISTORY TAB */}
        <TabsContent value="event-history" className="space-y-4">
          {events.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center py-16"><BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" /><p className="text-muted-foreground">No events yet.</p></CardContent></Card>
          ) : (
            <div className="space-y-4">
              {events.map(ev => {
                const evTxns = transactions.filter(t => t.event_id === ev.id);
                if (evTxns.length === 0) return null;
                const sent = evTxns.filter(t => t.transaction_type === "sent_to_event");
                const returned = evTxns.filter(t => t.transaction_type === "returned");
                const damaged = evTxns.filter(t => t.transaction_type === "damaged");
                const consumed = evTxns.filter(t => t.transaction_type === "consumed");
                return (
                  <Card key={ev.id}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-sm font-display">{ev.company} — {ev.event_place}</CardTitle>
                        <Badge variant="outline" className="text-xs">{ev.date}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="text-center p-2 rounded-lg bg-blue-500/10">
                          <p className="text-lg font-bold text-blue-600">{sent.reduce((s, t) => s + t.quantity, 0)}</p>
                          <p className="text-[10px] text-blue-600/70">Sent</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-emerald-500/10">
                          <p className="text-lg font-bold text-emerald-600">{returned.reduce((s, t) => s + t.quantity, 0)}</p>
                          <p className="text-[10px] text-emerald-600/70">Returned</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-orange-500/10">
                          <p className="text-lg font-bold text-orange-600">{consumed.reduce((s, t) => s + t.quantity, 0)}</p>
                          <p className="text-[10px] text-orange-600/70">Consumed</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-destructive/10">
                          <p className="text-lg font-bold text-destructive">{damaged.reduce((s, t) => s + t.quantity, 0)}</p>
                          <p className="text-[10px] text-destructive/70">Damaged</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {evTxns.map(t => {
                          const meta = TRANSACTION_LABELS[t.transaction_type] ?? TRANSACTION_LABELS.adjustment;
                          return (
                            <div key={t.id} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                              <span className="font-medium">{getItemName(t.inventory_item_id)}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`text-[10px] ${meta.color}`}>{meta.label}</Badge>
                                <span className="font-mono">×{t.quantity}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminInventory;
