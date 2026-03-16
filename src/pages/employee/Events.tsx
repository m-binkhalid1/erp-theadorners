import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Event {
  id: string;
  index: number;
  date: string;
  phone_no: string;
  event_place: string;
  balloons: string;
  company: string;
  employees: string;
  details: string;
  status: string;
}

const EmployeeEvents = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("status", "confirmed")
        .order("date", { ascending: true });
      if (error) toast.error(error.message);
      else setEvents(data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const upcomingEvents = events.filter(e => e.date >= today);
  const pastEvents = events.filter(e => e.date < today);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-5 space-y-6 animate-fade-in">
      <h1 className="text-2xl font-display font-bold">📅 Events</h1>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-2xl">
          <span className="text-5xl mb-3">📅</span>
          <p className="text-lg text-muted-foreground font-medium">Koi event nahi hai</p>
        </div>
      ) : (
        <>
          {/* Upcoming */}
          {upcomingEvents.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                🔜 Aane Wale Events
                <Badge variant="secondary" className="text-sm">{upcomingEvents.length}</Badge>
              </h2>
              {upcomingEvents.map((event) => (
                <Card key={event.id} className="rounded-2xl overflow-hidden border-primary/20 bg-primary/5">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-primary border-primary/30 font-bold">
                          #{event.index}
                        </Badge>
                        <h3 className="text-lg font-bold">{event.company}</h3>
                      </div>
                      <Badge className="bg-primary/10 text-primary font-semibold">
                        {new Date(event.date).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                      </Badge>
                    </div>
                    <p className="text-[15px] text-muted-foreground">
                      📍 {event.event_place}
                    </p>
                    {event.details && <p className="text-[15px] text-muted-foreground/80">📝 {event.details}</p>}
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground pt-1">
                      {event.balloons && <span>🎈 {event.balloons}</span>}
                      {event.employees && <span>👥 {event.employees}</span>}
                      <span>📞 {event.phone_no}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Past */}
          {pastEvents.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                📋 Guzre Hue Events
                <Badge variant="outline" className="text-sm">{pastEvents.length}</Badge>
              </h2>
              {pastEvents.map((event) => (
                <Card key={event.id} className="rounded-2xl overflow-hidden opacity-75">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-bold">#{event.index}</Badge>
                        <h3 className="text-lg font-bold">{event.company}</h3>
                      </div>
                      <Badge variant="secondary">
                        {new Date(event.date).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                      </Badge>
                    </div>
                    <p className="text-[15px] text-muted-foreground">📍 {event.event_place}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground pt-1">
                      {event.balloons && <span>🎈 {event.balloons}</span>}
                      <span>📞 {event.phone_no}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EmployeeEvents;
