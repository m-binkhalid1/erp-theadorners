import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Search, Loader2, ChevronDown, ChevronRight, Plus, Pencil, Trash2,
  Sparkles, Check, X, Wallet, Users
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface StaffEntry {
  id: string;
  worker_name: string;
  amount: number;
  transaction_type: string;
  description: string;
  event_id: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkerLedger {
  name: string;
  entries: StaffEntry[];
  totalGiven: number;
}

const TRANSACTION_LABELS: Record<string, string> = {
  advance: "🏧 Advance",
  salary: "💵 Salary",
  daily_wage: "📅 Dihari",
  expense: "🛒 Kharcha",
  event_expense: "🎪 Event Kharcha",
  other: "📌 Other",
};

const AdminStaffLedger = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<StaffEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

  // Add dialog
  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    worker_name: "", amount: 0, transaction_type: "advance", description: "",
  });

  // Edit dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    id: "", worker_name: "", amount: 0, transaction_type: "advance", description: "", status: "approved",
  });

  const fetchAll = async () => {
    try {
      const { data, error } = await supabase
        .from("staff_ledger")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return; }
      setEntries((data ?? []) as StaffEntry[]);
    } catch (err) {
      console.error("Staff ledger fetch error:", err);
      toast.error("Staff ledger load karte waqt error aa gaya");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("staff-ledger-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_ledger" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const pendingEntries = useMemo(() => entries.filter(e => e.status === "pending_ai"), [entries]);
  const approvedEntries = useMemo(() => entries.filter(e => e.status === "approved"), [entries]);

  // Group approved entries by worker name
  const workerLedgers = useMemo<WorkerLedger[]>(() => {
    const map = new Map<string, { displayName: string; entries: StaffEntry[] }>();
    approvedEntries.forEach(entry => {
      const key = entry.worker_name.toLowerCase().trim();
      const existing = map.get(key);
      if (existing) {
        existing.entries.push(entry);
      } else {
        map.set(key, { displayName: entry.worker_name.trim(), entries: [entry] });
      }
    });
    return Array.from(map.values())
      .map(({ displayName, entries: ents }) => ({
        name: displayName,
        entries: ents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        totalGiven: ents.reduce((s, e) => s + e.amount, 0),
      }))
      .sort((a, b) => b.totalGiven - a.totalGiven);
  }, [approvedEntries]);

  const filtered = useMemo(() =>
    workerLedgers.filter(w =>
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.entries.some(e => (e.description || "").toLowerCase().includes(searchQuery.toLowerCase()))
    ),
    [workerLedgers, searchQuery]
  );

  const totals = useMemo(() => ({
    workers: workerLedgers.length,
    totalGiven: workerLedgers.reduce((s, w) => s + w.totalGiven, 0),
    totalEntries: approvedEntries.length,
    pendingCount: pendingEntries.length,
  }), [workerLedgers, approvedEntries, pendingEntries]);

  const formatRs = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;

  // ── Approve / Reject AI entries ──
  const handleApprove = async (entry: StaffEntry) => {
    const { error } = await supabase.from("staff_ledger").update({ status: "approved" }).eq("id", entry.id);
    if (error) toast.error(error.message);
    else { toast.success(`${entry.worker_name} ki entry approve ho gayi! ✅`); fetchAll(); }
  };

  const handleReject = async (id: string) => {
    const { error } = await supabase.from("staff_ledger").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Entry reject & delete ho gayi"); fetchAll(); }
  };

  // ── Add Entry ──
  const handleAddEntry = async () => {
    if (!addForm.worker_name.trim()) { toast.error("Worker ka naam lazmi hai"); return; }
    if (addForm.amount <= 0) { toast.error("Amount 0 se zyada hona chahiye"); return; }
    try {
      const { error } = await supabase.from("staff_ledger").insert({
        worker_name: addForm.worker_name.trim(),
        amount: addForm.amount,
        transaction_type: addForm.transaction_type,
        description: addForm.description.trim(),
        status: "approved",
        created_by: user?.id,
      });
      if (error) { toast.error(`Add error: ${error.message}`); return; }
      toast.success("Staff entry add ho gayi! ✅");
      setAddDialog(false);
      setAddForm({ worker_name: "", amount: 0, transaction_type: "advance", description: "" });
      fetchAll();
    } catch (err) {
      console.error("Add entry exception:", err);
      toast.error("Entry add karte waqt error aa gaya");
    }
  };

  // ── Edit Entry ──
  const openEditDialog = (entry: StaffEntry) => {
    setEditForm({
      id: entry.id,
      worker_name: entry.worker_name,
      amount: entry.amount,
      transaction_type: entry.transaction_type,
      description: entry.description,
      status: entry.status,
    });
    setEditDialog(true);
  };

  const handleEditEntry = async () => {
    if (!editForm.worker_name.trim()) { toast.error("Worker ka naam lazmi hai"); return; }
    if (editForm.amount <= 0) { toast.error("Amount sahi daalein"); return; }
    try {
      const { error } = await supabase.from("staff_ledger").update({
        worker_name: editForm.worker_name.trim(),
        amount: editForm.amount,
        transaction_type: editForm.transaction_type,
        description: editForm.description.trim(),
      }).eq("id", editForm.id);
      if (error) { toast.error(`Update error: ${error.message}`); return; }
      toast.success("Entry update ho gayi! ✅");
      setEditDialog(false);
      fetchAll();
    } catch (err) {
      console.error("Edit entry exception:", err);
      toast.error("Entry update karte waqt error aa gaya");
    }
  };

  // ── Delete Entry ──
  const handleDeleteEntry = async (entry: StaffEntry) => {
    if (!confirm(`Kya aap "${entry.worker_name}" ki ye entry delete karna chahte hain?\nAmount: Rs ${entry.amount.toLocaleString()}`)) return;
    try {
      const { error } = await supabase.from("staff_ledger").delete().eq("id", entry.id);
      if (error) { toast.error(`Delete error: ${error.message}`); return; }
      toast.success("Entry delete ho gayi!");
      fetchAll();
    } catch (err) {
      console.error("Delete exception:", err);
      toast.error("Entry delete karte waqt error aa gaya");
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold">📓 Staff Ledger</h1>
          <p className="text-base text-muted-foreground mt-1">Employee/Worker wise hisab kitab</p>
        </div>
        <Button size="sm" className="rounded-xl font-semibold gap-1.5" onClick={() => setAddDialog(true)}>
          <Plus className="h-4 w-4" /> Nayi Entry
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-2xl"><CardContent className="pt-6 pb-5 px-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-primary/10 p-3 shrink-0"><Users className="h-6 w-6 text-primary" /></div><div className="min-w-0"><p className="text-3xl font-bold font-display truncate">{totals.workers}</p><p className="text-sm text-muted-foreground font-medium">Workers</p></div></div></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="pt-6 pb-5 px-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-amber-500/10 p-3 shrink-0"><Wallet className="h-6 w-6 text-amber-600" /></div><div className="min-w-0"><p className="text-xl font-bold font-display truncate">{formatRs(totals.totalGiven)}</p><p className="text-sm text-muted-foreground font-medium">Total Diya</p></div></div></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="pt-6 pb-5 px-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-info/10 p-3 shrink-0"><span className="text-2xl">📝</span></div><div className="min-w-0"><p className="text-3xl font-bold font-display truncate">{totals.totalEntries}</p><p className="text-sm text-muted-foreground font-medium">Entries</p></div></div></CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="pt-6 pb-5 px-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-destructive/10 p-3 shrink-0"><Sparkles className="h-6 w-6 text-destructive" /></div><div className="min-w-0"><p className="text-3xl font-bold font-display truncate">{totals.pendingCount}</p><p className="text-sm text-muted-foreground font-medium">AI Pending</p></div></div></CardContent></Card>
      </div>

      {/* AI Pending Review */}
      {pendingEntries.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <h2 className="text-lg sm:text-xl font-display font-bold">AI Entries — Review Karein</h2>
            <Badge variant="secondary" className="text-sm px-3">{pendingEntries.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingEntries.map(entry => (
              <Card key={entry.id} className="border-amber-500/20 bg-amber-500/5 rounded-2xl overflow-hidden">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display font-bold text-lg">{entry.worker_name}</p>
                      <p className="text-sm text-muted-foreground">{TRANSACTION_LABELS[entry.transaction_type] || entry.transaction_type}</p>
                    </div>
                    <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                      <Sparkles className="h-3 w-3" /> AI
                    </Badge>
                  </div>
                  <div className="text-2xl font-bold font-display text-amber-600">{formatRs(entry.amount)}</div>
                  {entry.description && <p className="text-sm text-muted-foreground">📝 {entry.description}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString("en-PK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>

                  <div className="flex gap-2 pt-2">
                    <Button size="lg" className="flex-1 h-11 rounded-xl font-semibold" onClick={() => handleApprove(entry)}>
                      <Check className="h-4 w-4 mr-1" /> Approve ✅
                    </Button>
                    <Button size="lg" variant="outline" className="h-11 rounded-xl" onClick={() => openEditDialog(entry)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="lg" variant="ghost" className="h-11 rounded-xl text-destructive" onClick={() => handleReject(entry.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input placeholder="Worker name or description search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-12 h-12 rounded-xl text-base" />
      </div>

      {/* Worker Ledgers */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-2xl">
          <span className="text-5xl mb-4">📓</span>
          <p className="text-lg text-muted-foreground font-medium">Koi staff entry nahi.</p>
          <Button variant="outline" className="mt-4 rounded-xl font-semibold gap-1.5" onClick={() => setAddDialog(true)}><Plus className="h-4 w-4" /> Nayi Entry</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(worker => {
            const isOpen = expandedWorker === worker.name;
            return (
              <Card key={worker.name} className="overflow-hidden rounded-2xl">
                <button className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors text-left gap-3"
                  onClick={() => setExpandedWorker(isOpen ? null : worker.name)}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-display text-lg font-bold truncate">👷 {worker.name}</p>
                      <p className="text-sm text-muted-foreground">{worker.entries.length} entries</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground font-medium">Total Diya</p>
                      <p className="font-mono text-sm font-bold text-amber-600">{formatRs(worker.totalGiven)}</p>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border overflow-x-auto">
                    <table className="w-full text-[15px]">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Date</th>
                          <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Type</th>
                          <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Description</th>
                          <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Amount</th>
                          <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {worker.entries.map(entry => (
                          <tr key={entry.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3 text-sm text-muted-foreground whitespace-nowrap">
                              {new Date(entry.created_at).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}
                            </td>
                            <td className="px-5 py-3">
                              <Badge variant="outline" className="text-xs">{TRANSACTION_LABELS[entry.transaction_type] || entry.transaction_type}</Badge>
                            </td>
                            <td className="px-5 py-3 text-sm max-w-[250px] truncate">{entry.description || "—"}</td>
                            <td className="px-5 py-3 text-right font-mono font-bold text-amber-600">{formatRs(entry.amount)}</td>
                            <td className="px-5 py-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditDialog(entry)}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDeleteEntry(entry)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ADD DIALOG */}
      <Dialog open={addDialog} onOpenChange={o => { setAddDialog(o); if (!o) setAddForm({ worker_name: "", amount: 0, transaction_type: "advance", description: "" }); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl">➕ Nayi Staff Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-semibold">Worker Name *</Label>
              <Input value={addForm.worker_name} onChange={e => setAddForm(p => ({ ...p, worker_name: e.target.value }))} placeholder="e.g. Ali, Usman, Bilal" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Type</Label>
              <Select value={addForm.transaction_type} onValueChange={v => setAddForm(p => ({ ...p, transaction_type: v }))}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">🏧 Advance</SelectItem>
                  <SelectItem value="salary">💵 Salary</SelectItem>
                  <SelectItem value="daily_wage">📅 Dihari</SelectItem>
                  <SelectItem value="expense">🛒 Kharcha</SelectItem>
                  <SelectItem value="event_expense">🎪 Event Kharcha</SelectItem>
                  <SelectItem value="other">📌 Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Amount (Rs) *</Label>
              <Input type="number" min={0} value={addForm.amount || ""} onChange={e => setAddForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Description / Wajah</Label>
              <Textarea value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))} placeholder="Kya kaam tha? Kis event ka? (optional)" rows={3} className="rounded-xl" />
            </div>
            <Button className="w-full h-12 rounded-xl font-semibold text-base" onClick={handleAddEntry}>Entry Add Karein ✅</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={editDialog} onOpenChange={o => { setEditDialog(o); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl">✏️ Entry Update Karein</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-semibold">Worker Name *</Label>
              <Input value={editForm.worker_name} onChange={e => setEditForm(p => ({ ...p, worker_name: e.target.value }))} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Type</Label>
              <Select value={editForm.transaction_type} onValueChange={v => setEditForm(p => ({ ...p, transaction_type: v }))}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">🏧 Advance</SelectItem>
                  <SelectItem value="salary">💵 Salary</SelectItem>
                  <SelectItem value="daily_wage">📅 Dihari</SelectItem>
                  <SelectItem value="expense">🛒 Kharcha</SelectItem>
                  <SelectItem value="event_expense">🎪 Event Kharcha</SelectItem>
                  <SelectItem value="other">📌 Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Amount (Rs) *</Label>
              <Input type="number" min={0} value={editForm.amount || ""} onChange={e => setEditForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Description / Wajah</Label>
              <Textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={3} className="rounded-xl" />
            </div>
            <Button className="w-full h-12 rounded-xl font-semibold text-base" onClick={handleEditEntry}>Update Karein ✅</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminStaffLedger;
