import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search, Loader2, ChevronDown, ChevronRight,
  AlertTriangle, Merge, CheckCircle2, Plus, Pencil, Trash2
} from "lucide-react";

// Simple similarity check (Levenshtein-based)
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function areSimilar(a: string, b: string): boolean {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return false;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return false;
  const dist = levenshtein(na, nb);
  return dist <= 2 || (dist / maxLen) <= 0.25;
}

interface SimilarGroup { names: string[] }

interface InvoiceRow {
  id: string;
  company: string;
  event_id: string | null;
  items: any[];
  total: number;
  paid: number;
  status: string;
  created_at: string;
}

interface CompanyLedger {
  company: string;
  invoices: InvoiceRow[];
  totalAmount: number;
  paidAmount: number;
  remaining: number;
}

const AdminLedger = () => {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);

  // Payment dialog
  const [payDialog, setPayDialog] = useState<{ open: boolean; invoiceId: string; company: string; remaining: number }>({ open: false, invoiceId: "", company: "", remaining: 0 });
  const [payAmount, setPayAmount] = useState(0);

  // Manual Add Entry dialog
  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ company: "", total: 0, paid: 0, description: "" });

  // Edit Entry dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({ id: "", company: "", total: 0, paid: 0, status: "" });

  const fetchAll = async () => {
    try {
      const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return; }
      setInvoices((data ?? []) as InvoiceRow[]);
    } catch (err) {
      console.error("Ledger fetch error:", err);
      toast.error("Ledger load karte waqt error aa gaya");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Real-time sync — auto-refresh when invoices table changes
  useEffect(() => {
    const channel = supabase
      .channel("ledger-invoices-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Case-insensitive grouping
  const ledger = useMemo<CompanyLedger[]>(() => {
    const map = new Map<string, { displayName: string; invoices: InvoiceRow[]; allNames: Set<string> }>();
    invoices.forEach(inv => {
      const key = inv.company.trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.invoices.push(inv);
        existing.allNames.add(inv.company);
      } else {
        map.set(key, { displayName: inv.company, invoices: [inv], allNames: new Set([inv.company]) });
      }
    });
    return Array.from(map.values())
      .map(({ displayName, invoices: invs }) => ({
        company: displayName,
        invoices: invs,
        totalAmount: invs.reduce((s, i) => s + i.total, 0),
        paidAmount: invs.reduce((s, i) => s + i.paid, 0),
        remaining: invs.reduce((s, i) => s + (i.total - i.paid), 0),
      }))
      .sort((a, b) => b.remaining - a.remaining);
  }, [invoices]);

  // Detect similar company names
  const similarWarnings = useMemo<SimilarGroup[]>(() => {
    const companyNames = ledger.map(l => l.company);
    const groups: SimilarGroup[] = [];
    const used = new Set<number>();
    for (let i = 0; i < companyNames.length; i++) {
      if (used.has(i)) continue;
      const group: string[] = [companyNames[i]];
      for (let j = i + 1; j < companyNames.length; j++) {
        if (used.has(j)) continue;
        if (areSimilar(companyNames[i], companyNames[j])) {
          group.push(companyNames[j]);
          used.add(j);
        }
      }
      if (group.length > 1) {
        used.add(i);
        groups.push({ names: group });
      }
    }
    return groups;
  }, [ledger]);

  const handleMerge = async (names: string[], keepName: string) => {
    const otherNames = names.filter(n => n !== keepName);
    for (const name of otherNames) {
      const { error } = await supabase.from("invoices").update({ company: keepName }).ilike("company", name);
      if (error) { toast.error(`Error merging "${name}": ${error.message}`); return; }
    }
    toast.success(`Sab invoices "${keepName}" mein merge ho gaye! ✅`);
    fetchAll();
  };

  const filtered = useMemo(() =>
    ledger.filter(l => l.company.toLowerCase().includes(searchQuery.toLowerCase())),
    [ledger, searchQuery]
  );

  const totals = useMemo(() => ({
    total: ledger.reduce((s, l) => s + l.totalAmount, 0),
    paid: ledger.reduce((s, l) => s + l.paidAmount, 0),
    remaining: ledger.reduce((s, l) => s + l.remaining, 0),
    companies: ledger.length,
  }), [ledger]);

  // Record payment
  const handleRecordPayment = async () => {
    if (payAmount <= 0) { toast.error("Sahi amount daalein"); return; }
    const inv = invoices.find(i => i.id === payDialog.invoiceId);
    if (!inv) { toast.error("Invoice nahi mili"); return; }
    if (payAmount > payDialog.remaining) { toast.error("Amount baaqi se zyada hai"); return; }
    try {
      const newPaid = inv.paid + payAmount;
      const newStatus = newPaid >= inv.total ? "paid" : "partial";
      const { error } = await supabase.from("invoices").update({ paid: newPaid, status: newStatus }).eq("id", inv.id);
      if (error) { toast.error(`Payment error: ${error.message}`); return; }
      toast.success(`Rs ${payAmount.toLocaleString()} jama ho gaye! ✅`);
      setPayDialog({ open: false, invoiceId: "", company: "", remaining: 0 });
      setPayAmount(0);
      fetchAll();
    } catch (err) {
      console.error("Payment exception:", err);
      toast.error("Payment record karte waqt error aa gaya");
    }
  };

  // Manual Add Entry
  const handleAddEntry = async () => {
    if (!addForm.company.trim()) { toast.error("Company name daalein"); return; }
    if (addForm.total <= 0) { toast.error("Total amount daalein"); return; }
    try {
      const status = addForm.paid >= addForm.total ? "paid" : addForm.paid > 0 ? "partial" : "pending";
      const { error } = await supabase.from("invoices").insert({
        company: addForm.company.trim(),
        total: addForm.total,
        paid: addForm.paid,
        status,
        items: addForm.description ? [{ description: addForm.description, qty: 1, unit_price: addForm.total, subtotal: addForm.total }] : [],
      });
      if (error) { toast.error(`Add error: ${error.message}`); return; }
      toast.success("Ledger entry add ho gayi! ✅");
      setAddDialog(false);
      setAddForm({ company: "", total: 0, paid: 0, description: "" });
      fetchAll();
    } catch (err) {
      console.error("Add entry exception:", err);
      toast.error("Entry add karte waqt error aa gaya");
    }
  };

  // Edit Entry
  const openEditDialog = (inv: InvoiceRow) => {
    setEditForm({
      id: inv.id,
      company: inv.company,
      total: inv.total,
      paid: inv.paid,
      status: inv.status,
    });
    setEditDialog(true);
  };

  const handleEditEntry = async () => {
    if (!editForm.company.trim()) { toast.error("Company name daalein"); return; }
    if (editForm.total < 0) { toast.error("Total amount sahi daalein"); return; }
    if (editForm.paid < 0) { toast.error("Paid amount sahi daalein"); return; }
    if (editForm.paid > editForm.total) { toast.error("Paid amount total se zyada nahi ho sakta"); return; }
    try {
      const status = editForm.paid >= editForm.total ? "paid" : editForm.paid > 0 ? "partial" : "pending";
      const { error } = await supabase.from("invoices").update({
        company: editForm.company.trim(),
        total: editForm.total,
        paid: editForm.paid,
        status,
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

  // Delete Entry
  const handleDeleteEntry = async (inv: InvoiceRow) => {
    if (!confirm(`Kya aap "${inv.company}" ki ye entry delete karna chahte hain?\nTotal: Rs ${inv.total.toLocaleString()}`)) return;
    try {
      // Unlink from event if linked
      if (inv.event_id) {
        await supabase.from("events").update({ invoice_id: null }).eq("id", inv.event_id);
      }
      const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
      if (error) { toast.error(`Delete error: ${error.message}`); return; }
      toast.success("Entry delete ho gayi!");
      fetchAll();
    } catch (err) {
      console.error("Delete exception:", err);
      toast.error("Entry delete karte waqt error aa gaya");
    }
  };

  const formatRs = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold">📒 Ledger</h1>
          <p className="text-base text-muted-foreground mt-1">Company-wise payment tracking</p>
        </div>
        <Button size="sm" className="rounded-xl font-semibold gap-1.5" onClick={() => setAddDialog(true)}>
          <Plus className="h-4 w-4" /> Manual Entry
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-2xl overflow-hidden">
          <CardContent className="pt-6 pb-5 px-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 shrink-0"><span className="text-2xl">🏢</span></div>
              <div className="min-w-0">
                <p className="text-3xl font-bold font-display truncate">{totals.companies}</p>
                <p className="text-sm text-muted-foreground font-medium">Companies</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl overflow-hidden">
          <CardContent className="pt-6 pb-5 px-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-info/10 p-3 shrink-0"><span className="text-2xl">💰</span></div>
              <div className="min-w-0">
                <p className="text-xl font-bold font-display truncate">{formatRs(totals.total)}</p>
                <p className="text-sm text-muted-foreground font-medium">Total Business</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl overflow-hidden">
          <CardContent className="pt-6 pb-5 px-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-success/10 p-3 shrink-0"><span className="text-2xl">✅</span></div>
              <div className="min-w-0">
                <p className="text-xl font-bold font-display truncate">{formatRs(totals.paid)}</p>
                <p className="text-sm text-muted-foreground font-medium">Wusool</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl overflow-hidden">
          <CardContent className="pt-6 pb-5 px-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-destructive/10 p-3 shrink-0"><span className="text-2xl">⏳</span></div>
              <div className="min-w-0">
                <p className="text-xl font-bold font-display truncate">{formatRs(totals.remaining)}</p>
                <p className="text-sm text-muted-foreground font-medium">Baaqi</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input placeholder="Company search karein..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-12 h-12 rounded-xl text-base" />
      </div>

      {/* Similar Names Warning */}
      {similarWarnings.length > 0 && (
        <div className="space-y-3">
          {similarWarnings.map((group, idx) => (
            <Card key={idx} className="rounded-2xl border-2 border-warning bg-warning/5">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-warning shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="font-display font-bold text-base">⚠️ Milte julte company names!</p>
                      <p className="text-sm text-muted-foreground">
                        Ye companies ka naam almost same hai — kya ye ek hi company hai? Merge karein taake ledger sahi rahe.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.names.map(name => (
                        <Badge key={name} variant="outline" className="text-sm px-3 py-1.5 font-mono">
                          "{name}"
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="text-sm text-muted-foreground font-medium self-center mr-1">Sahi naam choose karein:</span>
                      {group.names.map(name => (
                        <Button
                          key={name}
                          size="sm"
                          variant="outline"
                          className="rounded-xl font-semibold gap-1.5"
                          onClick={() => handleMerge(group.names, name)}
                        >
                          <Merge className="h-3.5 w-3.5" />
                          "{name}" rakhein
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Ledger */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-2xl">
          <span className="text-5xl mb-4">📒</span>
          <p className="text-lg text-muted-foreground font-medium">Koi ledger entry nahi.</p>
          <Button variant="outline" className="mt-4 rounded-xl font-semibold gap-1.5" onClick={() => setAddDialog(true)}>
            <Plus className="h-4 w-4" /> Manual Entry Add Karein
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(entry => {
            const isOpen = expandedCompany === entry.company;
            const paidPercent = entry.totalAmount > 0 ? Math.round((entry.paidAmount / entry.totalAmount) * 100) : 0;
            return (
              <Card key={entry.company} className="overflow-hidden rounded-2xl">
                <button
                  className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors text-left gap-3 overflow-hidden"
                  onClick={() => setExpandedCompany(isOpen ? null : entry.company)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-display text-lg font-bold truncate">{entry.company}</p>
                      <p className="text-sm text-muted-foreground">{entry.invoices.length} invoice{entry.invoices.length > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-6 shrink-0 flex-wrap justify-end">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground font-medium">Total</p>
                      <p className="font-mono text-sm font-bold truncate">{formatRs(entry.totalAmount)}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground font-medium">Mila</p>
                      <p className="font-mono text-sm font-bold text-success truncate">{formatRs(entry.paidAmount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground font-medium">Baaqi</p>
                      <p className={`font-mono text-sm font-bold truncate ${entry.remaining > 0 ? "text-destructive" : "text-success"}`}>{formatRs(entry.remaining)}</p>
                    </div>
                    <Badge variant={entry.remaining === 0 ? "default" : entry.paidAmount > 0 ? "secondary" : "outline"} className="text-xs sm:text-sm px-2 sm:px-3 py-1">
                      {entry.remaining === 0 ? "✅ Clear" : `${paidPercent}%`}
                    </Badge>
                  </div>
                </button>

                {/* Progress */}
                <div className="h-1.5 bg-muted">
                  <div className="h-full bg-primary transition-all rounded-r-full" style={{ width: `${paidPercent}%` }} />
                </div>

                {isOpen && (
                  <div className="border-t border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[15px]">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Invoice</th>
                            <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Date</th>
                            <th className="px-5 py-3 text-center font-semibold text-muted-foreground">Sync</th>
                            <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Total</th>
                            <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Mila</th>
                            <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Baaqi</th>
                            <th className="px-5 py-3 text-center font-semibold text-muted-foreground">Status</th>
                            <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.invoices.map(inv => {
                            const balance = inv.total - inv.paid;
                            return (
                              <tr key={inv.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                                <td className="px-5 py-3 font-mono text-sm">I/TA/{inv.id.slice(0, 8).toUpperCase()}</td>
                                <td className="px-5 py-3 text-sm text-muted-foreground">{new Date(inv.created_at).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}</td>
                                <td className="px-5 py-3 text-center">
                                  {inv.event_id ? (
                                    <Badge variant="outline" className="gap-1 text-xs text-success border-success/30">
                                      <CheckCircle2 className="h-3 w-3" /> Linked
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                                      Manual
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-right font-mono font-medium">{formatRs(inv.total)}</td>
                                <td className="px-5 py-3 text-right font-mono text-success font-medium">{formatRs(inv.paid)}</td>
                                <td className={`px-5 py-3 text-right font-mono font-bold ${balance > 0 ? "text-destructive" : "text-success"}`}>{formatRs(balance)}</td>
                                <td className="px-5 py-3 text-center">
                                  {balance <= 0 ? (
                                    <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Paid</Badge>
                                  ) : inv.paid > 0 ? (
                                    <Badge variant="secondary">Partial</Badge>
                                  ) : (
                                    <Badge variant="outline">⏳ Pending</Badge>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {balance > 0 && (
                                      <Button size="sm" variant="outline" className="h-8 rounded-lg font-semibold text-xs" onClick={() => {
                                        setPayDialog({ open: true, invoiceId: inv.id, company: inv.company, remaining: balance });
                                        setPayAmount(balance);
                                      }}>
                                        💰 Pay
                                      </Button>
                                    )}
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditDialog(inv)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDeleteEntry(inv)}>
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ===== PAYMENT DIALOG ===== */}
      <Dialog open={payDialog.open} onOpenChange={o => { if (!o) setPayDialog(prev => ({ ...prev, open: false })); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl">💰 Payment Jama Karein</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <p className="text-base text-muted-foreground">
              {payDialog.company} — Baaqi: <strong className="text-destructive text-lg">{formatRs(payDialog.remaining)}</strong>
            </p>
            <div className="space-y-2">
              <Label className="text-[15px] font-semibold">Amount (Rs)</Label>
              <Input type="number" min={1} max={payDialog.remaining} value={payAmount || ""} onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} className="h-12 text-lg rounded-xl" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-12 rounded-xl font-semibold" onClick={() => setPayAmount(payDialog.remaining)}>Poora Amount</Button>
              <Button className="flex-1 h-12 rounded-xl font-semibold" onClick={handleRecordPayment}>Jama Karein ✅</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== MANUAL ADD ENTRY DIALOG ===== */}
      <Dialog open={addDialog} onOpenChange={o => { setAddDialog(o); if (!o) setAddForm({ company: "", total: 0, paid: 0, description: "" }); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl">➕ Manual Ledger Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Agar invoice sync mein masla ho ya koi entry manually add karni ho to yahan se daalein.
            </p>
            <div className="space-y-2">
              <Label className="font-semibold">Company Name *</Label>
              <Input
                value={addForm.company}
                onChange={e => setAddForm(p => ({ ...p, company: e.target.value }))}
                placeholder="Company ka naam..."
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold">Description</Label>
              <Input
                value={addForm.description}
                onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Kya kaam tha? (optional)"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Total Amount (Rs) *</Label>
                <Input
                  type="number" min={0}
                  value={addForm.total || ""}
                  onChange={e => setAddForm(p => ({ ...p, total: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Paid Amount (Rs)</Label>
                <Input
                  type="number" min={0}
                  value={addForm.paid || ""}
                  onChange={e => setAddForm(p => ({ ...p, paid: parseFloat(e.target.value) || 0 }))}
                  placeholder="0"
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
            {addForm.total > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                <span className="font-medium text-sm">Baaqi hoga:</span>
                <span className={`font-bold font-mono ${(addForm.total - addForm.paid) > 0 ? "text-destructive" : "text-success"}`}>
                  {formatRs(Math.max(0, addForm.total - addForm.paid))}
                </span>
              </div>
            )}
            <Button className="w-full h-12 rounded-xl font-semibold text-base" onClick={handleAddEntry}>
              Entry Add Karein ✅
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== EDIT ENTRY DIALOG ===== */}
      <Dialog open={editDialog} onOpenChange={o => { setEditDialog(o); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl">✏️ Entry Update Karein</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Invoice ID: <span className="font-mono font-semibold">I/TA/{editForm.id.slice(0, 8).toUpperCase()}</span>
            </p>
            <div className="space-y-2">
              <Label className="font-semibold">Company Name</Label>
              <Input
                value={editForm.company}
                onChange={e => setEditForm(p => ({ ...p, company: e.target.value }))}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Total Amount (Rs)</Label>
                <Input
                  type="number" min={0}
                  value={editForm.total || ""}
                  onChange={e => setEditForm(p => ({ ...p, total: parseFloat(e.target.value) || 0 }))}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Paid Amount (Rs)</Label>
                <Input
                  type="number" min={0}
                  value={editForm.paid || ""}
                  onChange={e => setEditForm(p => ({ ...p, paid: parseFloat(e.target.value) || 0 }))}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
            {editForm.total > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                <span className="font-medium text-sm">Baaqi hoga:</span>
                <span className={`font-bold font-mono ${(editForm.total - editForm.paid) > 0 ? "text-destructive" : "text-success"}`}>
                  {formatRs(Math.max(0, editForm.total - editForm.paid))}
                </span>
              </div>
            )}
            <Button className="w-full h-12 rounded-xl font-semibold text-base" onClick={handleEditEntry}>
              Update Karein ✅
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLedger;
