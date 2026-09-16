"use client";

/**
 * OS-CAR Cockpit — Diálogos operativos del dock contextual.
 * Alta de trabajos, repuesto libre y cancelación de orden con motivo.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import type { MechanicsDTO } from "@/components/admin/cockpit/shared";
import { useToast } from "@/hooks/use-toast";

/* ═════════════ Dialog: nuevo trabajo (mano de obra) ═════════════ */

export function WorkItemDialog({
  open,
  onOpenChange,
  orderId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { data: mechs } = useQuery({
    queryKey: ["mechanics"],
    queryFn: () => api.get<MechanicsDTO>("/api/admin/mechanics"),
    enabled: open,
  });
  const [description, setDescription] = useState("");
  const [mins, setMins] = useState("");
  const [rate, setRate] = useState("22000");
  const [internal, setInternal] = useState("");
  const [assigned, setAssigned] = useState<string>("ninguno");
  const [busy, setBusy] = useState(false);

  const valid = description.trim().length >= 3 && Number(mins) > 0 && Number(rate) >= 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/orders/${orderId}/work-items`, {
        description: description.trim(),
        estimatedMinutes: Math.round(Number(mins)),
        hourlyRateCharged: Number(rate),
        internalCostAmount: internal ? Number(internal) : undefined,
        assignedAdminId: assigned === "ninguno" ? undefined : assigned,
      });
      toast({ title: "Trabajo agregado ✔" });
      onOpenChange(false);
      setDescription("");
      setMins("");
      setInternal("");
      setAssigned("ninguno");
      onDone();
    } catch (e) {
      toast({ title: "No se pudo agregar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-carbon-700 bg-carbon-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="display-impact text-lg text-titanium">Nuevo trabajo</DialogTitle>
          <DialogDescription>Se suma a la mano de obra de la orden y al próximo presupuesto.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label className="label-tech">Descripción *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Cambio de bomba de agua y purga" maxLength={500} />
          </div>
          <div className="space-y-2">
            <Label className="label-tech">Minutos estimados *</Label>
            <Input value={mins} onChange={(e) => setMins(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="180" />
          </div>
          <div className="space-y-2">
            <Label className="label-tech">Tarifa/hora cobrada *</Label>
            <Input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" />
          </div>
          <div className="space-y-2">
            <Label className="label-tech">Costo interno (margen)</Label>
            <Input value={internal} onChange={(e) => setInternal(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="Opcional" />
          </div>
          <div className="space-y-2">
            <Label className="label-tech">Mecánico asignado</Label>
            <Select value={assigned} onValueChange={setAssigned}>
              <SelectTrigger className="h-11 bg-carbon-950/70"><SelectValue /></SelectTrigger>
              <SelectContent className="border-carbon-700 bg-carbon-850">
                <SelectItem value="ninguno">Sin asignar</SelectItem>
                {mechs?.mechanics.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="carbon" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!valid || busy}>{busy ? "Agregando…" : "Agregar trabajo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════ Dialog: repuesto libre (fuera de almacén) ═════════════ */

export function CustomPartDialog({
  open,
  onOpenChange,
  orderId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = description.trim().length >= 2 && Number(qty) > 0 && Number(price) >= 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/orders/${orderId}/part-items`, {
        description: description.trim(),
        partNumber: partNumber.trim() || undefined,
        quantity: Math.round(Number(qty)),
        unitCost: unitCost ? Number(unitCost) : undefined,
        unitPriceCharged: Number(price),
      });
      toast({ title: "Repuesto agregado ✔" });
      onOpenChange(false);
      setDescription("");
      setPartNumber("");
      setQty("1");
      setUnitCost("");
      setPrice("");
      onDone();
    } catch (e) {
      toast({ title: "No se pudo agregar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-carbon-700 bg-carbon-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="display-impact text-lg text-titanium">Repuesto fuera de almacén</DialogTitle>
          <DialogDescription>Ítem a facturar que no está en los SKUs del stock (pedido a proveedor).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label className="label-tech">Descripción *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Bomba de agua original" maxLength={500} />
          </div>
          <div className="space-y-2">
            <Label className="label-tech">N° de pieza</Label>
            <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value.toUpperCase())} placeholder="SKU (opcional)" maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label className="label-tech">Cantidad *</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" />
          </div>
          <div className="space-y-2">
            <Label className="label-tech">Costo interno</Label>
            <Input value={unitCost} onChange={(e) => setUnitCost(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="Opcional" />
          </div>
          <div className="space-y-2">
            <Label className="label-tech">Precio a cobrar *</Label>
            <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="0" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="carbon" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!valid || busy}>{busy ? "Agregando…" : "Agregar repuesto"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════ Dialog: cancelación con motivo ═════════════ */

export function CancelOrderDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  onConfirm: (reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => { setReason(""); onOpenChange(v); }}>
      <DialogContent className="border-carbon-700 bg-carbon-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="display-impact text-lg text-titanium">Cancelar orden {orderNumber}</DialogTitle>
          <DialogDescription>Registrá el motivo de la cancelación. El cliente lo verá en su seguimiento.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Motivo de la cancelación (mínimo 5 caracteres)…"
          className="bg-carbon-950/70"
          maxLength={300}
        />
        <DialogFooter className="gap-2">
          <Button variant="carbon" onClick={() => onOpenChange(false)}>Volver</Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 5 || busy}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
            }}
          >
            Confirmar cancelación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
