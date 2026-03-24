import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CalendarDays, Loader2, Sparkles, Check, X, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import EventTaskAssignment from "@/components/EventTaskAssignment";

interface EventLineItem {
  description: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

interface Event {
  id: string;
  index: number;
  date: string;
  phone_no: string;
  event_place: string;
  balloons: string;
  company: string;
  client_name: string;
  coordinator_company: string;
  coordinator_name: string;
  employees: string;
  details: string;
  event_items: EventLineItem[];
  total_amount: number;
  invoice_id: string | null;
  status: string;
  ai_source: boolean;
}

const getDayName = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "long" });
};

const emptyItem = (): EventLineItem => ({ description: "", qty: 0, unit_price: 0, subtotal: 0 });

const AdminEvents = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [taskAssignEvent, setTaskAssignEvent] = useState<Event | null>(null);
  const [form, setForm] = useState({
    date: "",
    phone_no: "",
    event_place: "",
    client_name: "",
    coordinator_company: "",
    coordinator_name: "",
    employees: "",
    details: "",
    event_items: [emptyItem()] as EventLineItem[],
  });

  const pendingAiEvents = events.filter(e => e.status === "pending_ai");
  const confirmedEvents = events.filter(e => e.status === "confirmed");

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("date", { ascending: false });
    if (error) toast.error(error.message);
    else setEvents((data ?? []).map(d => ({
      ...d,
      event_items: (d.event_items as unknown as EventLineItem[] | null) ?? [],
    })) as Event[]);
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("events-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => fetchEvents())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const resetForm = () => {
    setForm({
      date: "", phone_no: "", event_place: "",
      client_name: "", coordinator_company: "", coordinator_name: "",
      employees: "", details: "",
      event_items: [emptyItem()],
    });
    setEditingEvent(null);
  };

  // Item management
  const updateItem = (idx: number, field: keyof EventLineItem, value: string | number) => {
    setForm(prev => {
      const items = [...prev.event_items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === "qty" || field === "unit_price") {
        items[idx].subtotal = items[idx].qty * items[idx].unit_price;
      }
      return { ...prev, event_items: items };
    });
  };
  const addItem = () => setForm(prev => ({ ...prev, event_items: [...prev.event_items, emptyItem()] }));
  const removeItem = (idx: number) => setForm(prev => ({ ...prev, event_items: prev.event_items.filter((_, i) => i !== idx) }));

  const totalAmount = form.event_items.reduce((s, i) => s + i.subtotal, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      date: form.date,
      phone_no: form.phone_no,
      event_place: form.event_place,
      company: form.client_name, // keep company field populated for backward compat
      client_name: form.client_name,
      coordinator_company: form.coordinator_company,
      coordinator_name: form.coordinator_name,
      employees: form.employees,
      details: form.details,
      balloons: "", // deprecated
      event_items: form.event_items as any,
      total_amount: totalAmount,
      status: "confirmed" as string,
    };

    if (editingEvent) {
      const { error } = await supabase.from("events").update(payload).eq("id", editingEvent.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Event updated!");
    } else {
      const { error } = await supabase.from("events").insert({ ...payload, created_by: user?.id });
      if (error) { toast.error(error.message); return; }
      toast.success("Event added!");
    }
    setDialogOpen(false);
    resetForm();
    fetchEvents();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Event deleted"); fetchEvents(); }
  };

  const handleApprove = async (event: Event) => {
    const { error } = await supabase.from("events").update({ status: "confirmed" }).eq("id", event.id);
    if (error) toast.error(error.message);
    else { toast.success("Event approved!"); fetchEvents(); }
  };

  const handleReject = async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Event rejected & removed"); fetchEvents(); }
  };

  const openEdit = (event: Event) => {
    setEditingEvent(event);
    setForm({
      date: event.date,
      phone_no: event.phone_no,
      event_place: event.event_place,
      client_name: event.client_name || event.company,
      coordinator_company: event.coordinator_company || "",
      coordinator_name: event.coordinator_name || "",
      employees: event.employees,
      details: event.details,
      event_items: (event.event_items && event.event_items.length > 0)
        ? event.event_items
        : (event.balloons ? [{ description: event.balloons, qty: 1, unit_price: 0, subtotal: 0 }] : [emptyItem()]),
    });
    setDialogOpen(true);
  };

  // Display helper: show client + coordinator info
  const getDisplayName = (event: Event) => {
    const client = event.client_name || event.company;
    if (event.coordinator_company) {
      return (
        <div>
          <span className="font-bold">{client}</span>
          <span className="text-muted-foreground text-xs block">via {event.coordinator_company}{event.coordinator_name ? ` (${event.coordinator_name})` : ""}</span>
        </div>
      );
    }
    return <span className="font-bold">{client}</span>;
  };

  // Format items for display
  const getItemsSummary = (event: Event) => {
    if (event.event_items && event.event_items.length > 0 && event.event_items.some(i => i.description)) {
      return event.event_items.filter(i => i.description).map(i => i.description).join(", ");
    }
    if (event.balloons) return event.balloons;
    return "—";
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold">📅 Events</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            {confirmedEvents.length} confirmed, {pendingAiEvents.length} pending review
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="lg" className="rounded-xl text-sm sm:text-base font-semibold h-11 sm:h-12 px-4 sm:px-6 w-full sm:w-auto">
              <Plus className="h-5 w-5" /> Naya Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">{editingEvent ? "Event Edit Karein" : "Naya Event"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Date & Day */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[15px] font-semibold">📆 Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required className="h-11 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[15px] font-semibold">📅 Day</Label>
                  <Input value={form.date ? getDayName(form.date) : ""} readOnly className="bg-muted h-11 rounded-xl" />
                </div>
              </div>

              {/* Client Name & Place */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[15px] font-semibold">🏢 Client Name *</Label>
                  <Input
                    value={form.client_name}
                    onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                    required
                    placeholder="jis ka event hai — e.g. Food Panda, Birthday Person"
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[15px] font-semibold">📍 Jagah</Label>
                  <Input value={form.event_place} onChange={(e) => setForm({ ...form, event_place: e.target.value })} required className="h-11 rounded-xl" />
                </div>
              </div>

              {/* Coordinator Company & Person (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[15px] font-semibold">🏗️ Coordinator Company <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                  <Input
                    value={form.coordinator_company}
                    onChange={(e) => setForm({ ...form, coordinator_company: e.target.value })}
                    placeholder="jo event krwa rahi hai — e.g. Ignite Events"
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[15px] font-semibold">👤 Coordinator Person <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                  <Input
                    value={form.coordinator_name}
                    onChange={(e) => setForm({ ...form, coordinator_name: e.target.value })}
                    placeholder="jo coordinate kr raha — e.g. Anthony"
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>

              {/* Phone & Employees */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[15px] font-semibold">📞 Phone</Label>
                  <Input value={form.phone_no} onChange={(e) => setForm({ ...form, phone_no: e.target.value })} required className="h-11 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[15px] font-semibold">👥 Employees</Label>
                  <Input value={form.employees} onChange={(e) => setForm({ ...form, employees: e.target.value })} className="h-11 rounded-xl" />
                </div>
              </div>

              {/* Dynamic Items with Pricing */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[15px] font-semibold">📦 Items & Pricing</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem} className="rounded-lg">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
                        <th className="px-3 py-2 text-center font-medium text-muted-foreground w-20">Qty</th>
                        <th className="px-3 py-2 text-center font-medium text-muted-foreground w-28">Price</th>
                        <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Subtotal</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.event_items.map((item, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="px-2 py-1">
                            <Input
                              className="h-8 text-sm rounded-lg"
                              value={item.description}
                              onChange={e => updateItem(idx, "description", e.target.value)}
                              placeholder="e.g. Balloons, Danglers, Flowers..."
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              className="h-8 text-sm text-center rounded-lg"
                              type="number"
                              min={0}
                              value={item.qty || ""}
                              onChange={e => updateItem(idx, "qty", parseInt(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              className="h-8 text-sm text-center rounded-lg"
                              type="number"
                              min={0}
                              value={item.unit_price || ""}
                              onChange={e => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-sm">
                            Rs {item.subtotal.toLocaleString()}
                          </td>
                          <td className="px-2 py-1">
                            {form.event_items.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalAmount > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <span className="font-semibold text-sm">Total Amount</span>
                    <span className="text-lg font-bold font-display text-primary">Rs {totalAmount.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="space-y-2">
                <Label className="text-[15px] font-semibold">📝 Details</Label>
                <Textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} rows={3} className="rounded-xl" />
              </div>

              <Button type="submit" className="w-full h-12 text-base font-semibold rounded-xl">
                {editingEvent ? "Update Karein" : "Event Add Karein"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* AI Pending Review */}
      {pendingAiEvents.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <h2 className="text-lg sm:text-xl font-display font-bold">AI Events — Review Karein</h2>
            <Badge variant="secondary" className="text-sm px-3">{pendingAiEvents.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingAiEvents.map(event => (
              <Card key={event.id} className="border-primary/20 bg-primary/5 rounded-2xl overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-display">{getDisplayName(event)}</CardTitle>
                    <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                      <Sparkles className="h-3 w-3" /> AI
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">📆</span> <span className="font-medium">{event.date ? new Date(event.date).toLocaleDateString() : "—"}</span></div>
                    <div><span className="text-muted-foreground">📅</span> <span className="font-medium">{event.date ? getDayName(event.date) : "—"}</span></div>
                    <div><span className="text-muted-foreground">📍</span> <span className="font-medium">{event.event_place || "—"}</span></div>
                    <div><span className="text-muted-foreground">📞</span> <span className="font-medium">{event.phone_no || "—"}</span></div>
                  </div>
                  {getItemsSummary(event) !== "—" && <div className="text-sm"><span className="text-muted-foreground">📦</span> <span className="font-medium">{getItemsSummary(event)}</span></div>}
                  {event.total_amount > 0 && <div className="text-sm"><span className="text-muted-foreground">💰</span> <span className="font-bold text-primary">Rs {event.total_amount.toLocaleString()}</span></div>}
                  {event.details && <div className="text-sm"><span className="text-muted-foreground">📝</span> <span className="font-medium">{event.details}</span></div>}

                  <div className="flex gap-2 pt-2">
                    <Button size="lg" className="flex-1 h-11 rounded-xl font-semibold" onClick={() => handleApprove(event)}>
                      <Check className="h-4 w-4 mr-1" /> Approve ✅
                    </Button>
                    <Button size="lg" variant="outline" className="h-11 rounded-xl" onClick={() => openEdit(event)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="lg" variant="ghost" className="h-11 rounded-xl text-destructive" onClick={() => handleReject(event.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Events - Cards on mobile, Table on desktop */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : confirmedEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-2xl">
          <CalendarDays className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-lg text-muted-foreground font-medium">Koi event nahi hai abhi.</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Upar se naya event add karein</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {confirmedEvents.map((event) => (
              <Card key={event.id} className="rounded-2xl overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-xs text-primary font-bold">#{event.index}</p>
                      {getDisplayName(event)}
                    </div>
                    <div className="flex gap-1">
                      {event.ai_source ? (
                        <Badge variant="outline" className="gap-1 border-primary/30 text-primary text-xs"><Sparkles className="h-3 w-3" /> AI</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Manual</Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">📆</span> <span className="font-medium">{new Date(event.date).toLocaleDateString()}</span></div>
                    <div><span className="text-muted-foreground">📅</span> <span className="font-medium">{getDayName(event.date)}</span></div>
                    <div><span className="text-muted-foreground">📍</span> <span className="font-medium">{event.event_place}</span></div>
                    <div><span className="text-muted-foreground">📞</span> <span className="font-medium">{event.phone_no}</span></div>
                  </div>
                  {getItemsSummary(event) !== "—" && <p className="text-sm"><span className="text-muted-foreground">📦</span> {getItemsSummary(event)}</p>}
                  {event.total_amount > 0 && <p className="text-sm font-bold text-primary">💰 Rs {event.total_amount.toLocaleString()}</p>}
                  {event.employees && <p className="text-sm"><span className="text-muted-foreground">👥</span> {event.employees}</p>}
                  {event.details && <p className="text-sm text-muted-foreground truncate"><span>📝</span> {event.details}</p>}
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant={event.invoice_id ? "default" : "outline"} className="text-xs">
                      {event.invoice_id ? "✅ Invoice Done" : "⏳ Invoice Pending"}
                    </Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setTaskAssignEvent(event)}>
                        <ClipboardList className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEdit(event)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => handleDelete(event.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-[15px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">#</th>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">📆 Date</th>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">📅 Day</th>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">🏢 Client</th>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">📍 Jagah</th>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">📞 Phone</th>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">📦 Items</th>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">💰 Amount</th>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">👥 Employees</th>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">Source</th>
                  <th className="px-4 py-4 text-left font-semibold text-muted-foreground whitespace-nowrap">Invoice</th>
                  <th className="px-4 py-4 text-right font-semibold text-muted-foreground whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {confirmedEvents.map((event) => (
                  <tr key={event.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-4 font-mono text-primary font-bold">#{event.index}</td>
                    <td className="px-4 py-4 whitespace-nowrap font-medium">{new Date(event.date).toLocaleDateString()}</td>
                    <td className="px-4 py-4 whitespace-nowrap">{getDayName(event.date)}</td>
                    <td className="px-4 py-4">{getDisplayName(event)}</td>
                    <td className="px-4 py-4 font-medium">{event.event_place}</td>
                    <td className="px-4 py-4 whitespace-nowrap">{event.phone_no}</td>
                    <td className="px-4 py-4 max-w-[150px] truncate">{getItemsSummary(event)}</td>
                    <td className="px-4 py-4 font-bold whitespace-nowrap">{event.total_amount > 0 ? `Rs ${event.total_amount.toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-4">{event.employees || "—"}</td>
                    <td className="px-4 py-4">
                      {event.ai_source ? (
                        <Badge variant="outline" className="gap-1 border-primary/30 text-primary"><Sparkles className="h-3 w-3" /> AI</Badge>
                      ) : (
                        <Badge variant="secondary">Manual</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {event.invoice_id ? (
                        <Badge className="bg-success/10 text-success font-semibold">✅ Done</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">⏳ Pending</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-10 w-10" title="Task Assign" onClick={() => setTaskAssignEvent(event)}>
                        <ClipboardList className="h-5 w-5 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => openEdit(event)}>
                        <Pencil className="h-5 w-5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => handleDelete(event.id)}>
                        <Trash2 className="h-5 w-5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {taskAssignEvent && (
        <EventTaskAssignment
          open={!!taskAssignEvent}
          onOpenChange={(o) => { if (!o) setTaskAssignEvent(null); }}
          eventId={taskAssignEvent.id}
          eventCompany={taskAssignEvent.client_name || taskAssignEvent.company}
          eventDate={taskAssignEvent.date}
          eventPlace={taskAssignEvent.event_place}
        />
      )}
    </div>
  );
};

export default AdminEvents;
