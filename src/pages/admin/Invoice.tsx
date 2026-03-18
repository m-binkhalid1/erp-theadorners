import { useEffect, useState, useRef } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
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
import { Plus, FileText, Loader2, Printer, Eye, Trash2, Search, Download } from "lucide-react";
import InvoiceTemplate, { type InvoiceData, type InvoiceLineItem } from "@/components/InvoiceTemplate";
import { getLogoBase64 } from "@/lib/logoBase64";

interface EventRecord {
  id: string;
  company: string;
  event_place: string;
  phone_no: string;
  date: string;
  details: string;
  balloons: string;
  invoice_id: string | null;
}

interface InvoiceRow {
  id: string;
  company: string;
  event_id: string | null;
  items: InvoiceLineItem[];
  total: number;
  status: string;
  invoice_no: string;
  created_at: string;
}

const emptyLine = (): InvoiceLineItem => ({ description: "", qty: 0, unit_price: 0, subtotal: 0 });

const AdminInvoice = () => {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [logoBase64, setLogoBase64] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  // Form state
  const [form, setForm] = useState<{
    event_id: string;
    invoice_date: string;
    due_date: string;
    for_label: string;
    client_name: string;
    phone: string;
    company: string;
    ntn: string;
    event_detail: string;
    items: InvoiceLineItem[];
    discount: number;
    tax_percent: number;
    terms: string;
  }>({
    event_id: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: "",
    for_label: "Balloon Decoration",
    client_name: "",
    phone: "",
    company: "",
    ntn: "",
    event_detail: "",
    items: [emptyLine()],
    discount: 0,
    tax_percent: 0,
    terms: "",
  });

  const [previewData, setPreviewData] = useState<InvoiceData | null>(null);

  const fetchAll = async () => {
    const [invRes, evRes] = await Promise.all([
      supabase.from("invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("events").select("*").order("date", { ascending: false }),
    ]);
    if (invRes.data) setInvoices(invRes.data.map(r => ({ ...r, items: (r.items as unknown as InvoiceLineItem[] | null) ?? [] })));
    if (evRes.data) setEvents(evRes.data as EventRecord[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // Pre-load logo as base64 for PDF rendering
    getLogoBase64().then(src => setLogoBase64(src)).catch(() => {});
  }, []);

  // Auto-fill from event
  const handleEventSelect = (eventId: string) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;
    setForm(prev => ({
      ...prev,
      event_id: eventId,
      company: ev.company,
      phone: ev.phone_no,
      client_name: ev.company,
      event_detail: `Decoration services for ${ev.company} at ${ev.event_place}. ${ev.details}`,
    }));
  };

  const updateItem = (idx: number, field: keyof InvoiceLineItem, value: string | number) => {
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === "qty" || field === "unit_price") {
        items[idx].subtotal = items[idx].qty * items[idx].unit_price;
      }
      return { ...prev, items };
    });
  };

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, emptyLine()] }));
  const removeItem = (idx: number) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const buildInvoiceData = (existingInvoiceNo?: string): InvoiceData => ({
    invoice_no: existingInvoiceNo || "Draft",
    invoice_date: form.invoice_date ? new Date(form.invoice_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "",
    due_date: form.due_date ? new Date(form.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "",
    for_label: form.for_label,
    client_name: form.client_name,
    phone: form.phone,
    company: form.company,
    ntn: form.ntn,
    event_detail: form.event_detail,
    items: form.items,
    discount: form.discount,
    tax_percent: form.tax_percent,
    terms: form.terms,
  });

  const subtotal = form.items.reduce((s, i) => s + i.subtotal, 0);
  const total = subtotal - form.discount + subtotal * (form.tax_percent / 100);

  const handleSave = async () => {
    if (!form.company) { toast.error("Company required"); return; }

    const payload = {
      company: form.company,
      event_id: form.event_id || null,
      items: form.items as any,
      total,
      status: "pending" as string,
    };

    if (editingId) {
      const { error } = await supabase.from("invoices").update(payload).eq("id", editingId);
      if (error) { toast.error(error.message); return; }
      toast.success("Invoice updated!");
    } else {
      const { data, error } = await supabase.from("invoices").insert(payload).select("id").single();
      if (error) { toast.error(error.message); return; }
      // Link invoice to event
      if (form.event_id && data) {
        try {
          const { error: linkError } = await supabase.from("events").update({ invoice_id: data.id }).eq("id", form.event_id);
          if (linkError) {
            console.error("Event link error:", linkError.message);
            toast.error(`Invoice created but event link failed: ${linkError.message}`);
          }
        } catch (err) {
          console.error("Event link exception:", err);
          toast.error("Invoice created but event link failed");
        }
      }
      toast.success("Invoice created!");
    }
    setFormOpen(false);
    resetForm();
    fetchAll();
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      event_id: "", invoice_date: new Date().toISOString().split("T")[0], due_date: "",
      for_label: "Balloon Decoration", client_name: "", phone: "", company: "", ntn: "",
      event_detail: "", items: [emptyLine()], discount: 0, tax_percent: 0, terms: "",
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this invoice?")) return;
    // Unlink from event
    const inv = invoices.find(i => i.id === id);
    if (inv?.event_id) {
      try {
        const { error: unlinkError } = await supabase.from("events").update({ invoice_id: null }).eq("id", inv.event_id);
        if (unlinkError) {
          console.error("Event unlink error:", unlinkError.message);
          toast.error(`Could not unlink event: ${unlinkError.message}`);
        }
      } catch (err) {
        console.error("Event unlink exception:", err);
      }
    }
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); fetchAll(); }
  };

  const handlePreview = (inv: InvoiceRow) => {
    const ev = events.find(e => e.id === inv.event_id);
    setPreviewData({
      invoice_no: inv.invoice_no || `I/TA/${inv.id.slice(0, 8).toUpperCase()}`,
      invoice_date: new Date(inv.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
      due_date: "",
      for_label: "Balloon Decoration",
      client_name: inv.company,
      phone: ev?.phone_no ?? "",
      company: inv.company,
      ntn: "",
      event_detail: ev ? `Decoration services for ${ev.company} at ${ev.event_place}. ${ev.details}` : "",
      items: inv.items,
      discount: 0,
      tax_percent: 0,
      terms: "",
    });
    setPreviewOpen(true);
  };

  const handleDownload = async () => {
    if (!printRef.current || !previewData) return;
    const filename = `Invoice_${previewData.invoice_no.replace(/\//g, "-")}_${previewData.company.replace(/\s+/g, "_")}.pdf`;
    const pages = printRef.current.querySelectorAll(".invoice-page");
    if (pages.length === 0) return;

    toast.info("Generating PDF...");
    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const a4W = 210;
      const a4H = 297;

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.98);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, a4W, a4H);
      }

      pdf.save(filename);
      toast.success("PDF downloaded! ✅");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("PDF generate karte waqt error aa gaya");
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups"); return; }
    printWindow.document.write(`
      <!DOCTYPE html><html><head>
        <title>Invoice - The Adorners</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
          .invoice-page { page-break-after: always; }
          .invoice-page:last-child { page-break-after: auto; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            @page { margin: 0; size: A4; }
            .invoice-page { page-break-after: always; }
            .invoice-page:last-child { page-break-after: auto; }
          }
        </style>
      </head><body>${printRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  const filteredInvoices = invoices.filter(i =>
    i.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.invoice_no && i.invoice_no.toLowerCase().includes(searchQuery.toLowerCase())) ||
    i.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground">{invoices.length} invoices</p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setFormOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Create Invoice</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold font-display">{invoices.length}</p><p className="text-xs text-muted-foreground">Total Invoices</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold font-display text-primary">Rs {invoices.reduce((s, i) => s + i.total, 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Revenue</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold font-display text-emerald-600">Rs {invoices.reduce((s, i) => s + i.paid, 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Paid</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-2xl font-bold font-display text-destructive">Rs {invoices.reduce((s, i) => s + (i.total - i.paid), 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search invoices..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
      </div>

      {/* Invoice List */}
      {filteredInvoices.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-16"><FileText className="h-12 w-12 text-muted-foreground/40 mb-4" /><p className="text-muted-foreground">No invoices yet.</p></CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Invoice</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Paid</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => (
                <tr key={inv.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoice_no || `I/TA/${inv.id.slice(0, 8).toUpperCase()}`}</td>
                  <td className="px-4 py-3 font-medium">{inv.company}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(inv.created_at).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="px-4 py-3 text-right font-mono">Rs {inv.total.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-600">Rs {inv.paid.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={inv.paid >= inv.total ? "default" : "secondary"} className="text-xs">
                      {inv.paid >= inv.total ? "Paid" : inv.paid > 0 ? "Partial" : "Pending"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => handlePreview(inv)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(inv.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={formOpen} onOpenChange={o => { setFormOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Create"} Invoice</DialogTitle></DialogHeader>
          <div className="space-y-5">
            {/* Event Link */}
            <div className="space-y-2">
              <Label>Link to Event (optional)</Label>
              <Select value={form.event_id} onValueChange={handleEventSelect}>
                <SelectTrigger><SelectValue placeholder="Select event to auto-fill..." /></SelectTrigger>
                <SelectContent>
                  {events.map(ev => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.company} - {ev.event_place} ({ev.date}) {ev.invoice_id ? "✓" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Invoice Date</Label><Input type="date" value={form.invoice_date} onChange={e => setForm(p => ({ ...p, invoice_date: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} /></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>For</Label><Input value={form.for_label} onChange={e => setForm(p => ({ ...p, for_label: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Client Name *</Label><Input value={form.client_name} onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} required /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Company *</Label><Input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} required /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div className="space-y-2"><Label>NTN</Label><Input value={form.ntn} onChange={e => setForm(p => ({ ...p, ntn: e.target.value }))} /></div>
            </div>

            <div className="space-y-2"><Label>Event Detail</Label><Textarea value={form.event_detail} onChange={e => setForm(p => ({ ...p, event_detail: e.target.value }))} rows={2} /></div>

            {/* Line Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-display font-semibold">Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" /> Add Row</Button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground w-20">Qty</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground w-28">Unit Price</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Subtotal</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item, idx) => (
                      <tr key={idx} className="border-t border-border">
                        <td className="px-2 py-1"><Input className="h-8 text-sm" value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Item name" /></td>
                        <td className="px-2 py-1"><Input className="h-8 text-sm text-center" type="number" min={0} value={item.qty || ""} onChange={e => updateItem(idx, "qty", parseInt(e.target.value) || 0)} /></td>
                        <td className="px-2 py-1"><Input className="h-8 text-sm text-center" type="number" min={0} value={item.unit_price || ""} onChange={e => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)} /></td>
                        <td className="px-2 py-1 text-right font-mono text-sm">Rs {item.subtotal.toLocaleString()}</td>
                        <td className="px-2 py-1">
                          {form.items.length > 1 && <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3 text-destructive" /></Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Discount (Rs)</Label><Input type="number" min={0} value={form.discount || ""} onChange={e => setForm(p => ({ ...p, discount: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="space-y-2"><Label>Tax (%)</Label><Input type="number" min={0} value={form.tax_percent || ""} onChange={e => setForm(p => ({ ...p, tax_percent: parseFloat(e.target.value) || 0 }))} /></div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
              <span className="font-display font-semibold">Total</span>
              <span className="text-xl font-bold font-display">Rs {total.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span>
            </div>

            <div className="space-y-2"><Label>Terms & Conditions</Label><Textarea value={form.terms} onChange={e => setForm(p => ({ ...p, terms: e.target.value }))} rows={2} /></div>

            <div className="flex gap-3">
              <Button className="flex-1" onClick={handleSave}>{editingId ? "Update" : "Create"} Invoice</Button>
              <Button variant="outline" onClick={() => { setPreviewData(buildInvoiceData()); setPreviewOpen(true); }}><Eye className="h-4 w-4 mr-1" /> Preview</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PREVIEW + PRINT DIALOG */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[240mm] max-h-[95vh] overflow-y-auto p-4">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Invoice Preview</DialogTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> Print</Button>
                <Button size="sm" onClick={handleDownload}><Download className="h-4 w-4 mr-1" /> Download PDF</Button>
              </div>
            </div>
          </DialogHeader>
          {previewData && (
            <div className="flex justify-center">
              <div ref={printRef} className="shadow-xl">
                <InvoiceTemplate data={previewData} logoSrc={logoBase64} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminInvoice;
