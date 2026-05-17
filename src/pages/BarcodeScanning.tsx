import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, ScanLine, PlayCircle, StopCircle, Printer, FileSpreadsheet, FileDown, UserCheck, Lock, RefreshCw, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { playSuccess, playError, playWarn } from '@/lib/scanSound';
import OrderBarcode from '@/components/OrderBarcode';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Order = any;

export default function BarcodeScanning() {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [scanValue, setScanValue] = useState('');
  const [statuses, setStatuses] = useState<any[]>([]);
  const [couriers, setCouriers] = useState<any[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkCourier, setBulkCourier] = useState<string>('');
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('order_statuses').select('*').order('sort_order').then(({ data }) => setStatuses(data || []));
    supabase.from('user_roles').select('user_id, role').eq('role', 'courier').then(async ({ data }) => {
      if (!data?.length) return;
      const ids = data.map((r: any) => r.user_id);
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      setCouriers(profs || []);
    });
  }, []);

  useEffect(() => {
    if (!scanning) return;
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [scanning]);

  useEffect(() => {
    if (scanning) inputRef.current?.focus();
  }, [scanning, orders.length]);

  const elapsed = useMemo(() => {
    if (!startedAt) return '00:00';
    const s = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, [tick, startedAt]);

  const startSession = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('scan_sessions')
      .insert({ user_id: user.id, status: 'open' })
      .select()
      .single();
    if (error) { toast.error('فشل بدء الجلسة'); return; }
    setSessionId(data.id);
    setScanning(true);
    setOrders([]);
    setStartedAt(new Date());
    toast.success('بدأت جلسة الاسكان');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleScan = async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setScanValue('');
    if (orders.find(o => o.barcode === code || o.tracking_id === code || o.id === code)) {
      playWarn();
      toast.warning(`الأوردر ${code} ممسوح مسبقًا`);
      return;
    }
    const { data: order } = await supabase
      .from('orders')
      .select('*, offices(name)')
      .or(`barcode.eq.${code},tracking_id.eq.${code}`)
      .maybeSingle();
    if (!order) {
      playError();
      toast.error(`لم يتم العثور على الأوردر: ${code}`);
      return;
    }
    // enrich with status + courier from local lookups
    const status = statuses.find(s => s.id === order.status_id);
    const courier = couriers.find(c => c.id === order.courier_id);
    const enriched = { ...order, order_statuses: status, courier };
    if (order.is_closed) {
      playError();
      toast.error(`الأوردر ${code} مغلق`);
      return;
    }
    setOrders(prev => [enriched, ...prev]);
    if (sessionId) {
      await supabase.from('scan_session_items').insert({ session_id: sessionId, order_id: order.id });
      await supabase.from('scan_logs').insert({
        session_id: sessionId,
        order_id: order.id,
        user_id: user!.id,
        action: 'scan',
        new_value: { barcode: order.barcode },
      });
    }
    playSuccess();
  };

  const removeOrder = async (id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    if (sessionId) {
      await supabase.from('scan_session_items').delete().eq('session_id', sessionId).eq('order_id', id);
    }
  };

  const finishSession = async () => {
    if (orders.length === 0) {
      toast.warning('لم تقم بمسح أي أوردر');
      return;
    }
    setBulkOpen(true);
  };

  const closeSession = async () => {
    if (sessionId) {
      await supabase.from('scan_sessions').update({
        ended_at: new Date().toISOString(),
        total_scanned: orders.length,
        status: 'closed',
      }).eq('id', sessionId);
    }
    setScanning(false);
    setSessionId(null);
    setOrders([]);
    setStartedAt(null);
    setBulkOpen(false);
  };

  // === Bulk actions ===
  const applyBulkStatus = async () => {
    if (!bulkStatus) { toast.error('اختر حالة'); return; }
    const ids = orders.map(o => o.id);
    const oldStatuses = orders.map(o => ({ id: o.id, old: o.status_id }));
    const { error } = await supabase.from('orders').update({ status_id: bulkStatus }).in('id', ids);
    if (error) { toast.error('فشل التحديث'); return; }
    await supabase.from('order_status_history').insert(
      oldStatuses.map(s => ({
        order_id: s.id, old_status_id: s.old, new_status_id: bulkStatus,
        changed_by: user!.id, session_id: sessionId,
      }))
    );
    await supabase.from('scan_logs').insert(
      ids.map(id => ({
        session_id: sessionId, order_id: id, user_id: user!.id,
        action: 'status_change', new_value: { status_id: bulkStatus },
      }))
    );
    toast.success(`تم تحديث ${ids.length} أوردر`);
    setBulkStatus('');
  };

  const applyBulkCourier = async (clear = false) => {
    if (!clear && !bulkCourier) { toast.error('اختر مندوب'); return; }
    const ids = orders.map(o => o.id);
    const { error } = await supabase.from('orders').update({ courier_id: clear ? null : bulkCourier }).in('id', ids);
    if (error) { toast.error('فشل التحديث'); return; }
    await supabase.from('scan_logs').insert(
      ids.map(id => ({
        session_id: sessionId, order_id: id, user_id: user!.id,
        action: clear ? 'unassign' : 'assign',
        new_value: { courier_id: clear ? null : bulkCourier },
      }))
    );
    toast.success(clear ? 'تم إزالة التعيين' : 'تم تعيين المندوب');
    setBulkCourier('');
  };

  const bulkClose = async () => {
    const ids = orders.map(o => o.id);
    const { error } = await supabase.from('orders').update({ is_closed: true }).in('id', ids);
    if (error) { toast.error('فشل الإغلاق'); return; }
    toast.success(`تم إغلاق ${ids.length} أوردر`);
  };

  const exportExcel = () => {
    const rows = orders.map(o => ({
      'الباركود': o.barcode,
      'الكود': o.customer_code,
      'العميل': o.customer_name,
      'الهاتف': o.customer_phone,
      'المحافظة': o.governorate,
      'المكتب': o.offices?.name,
      'المندوب': o.courier?.full_name || '-',
      'الحالة': o.order_statuses?.name || '-',
      'السعر': Number(o.price),
      'الشحن': Number(o.delivery_price),
      'الإجمالي': Number(o.price) + Number(o.delivery_price),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scan');
    XLSX.writeFile(wb, `scan-session-${Date.now()}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text('Scan Session Report', 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [['Barcode', 'Customer', 'Phone', 'City', 'Courier', 'Status', 'Total']],
      body: orders.map(o => [
        o.barcode, o.customer_name, o.customer_phone, o.governorate || '-',
        o.courier?.full_name || '-', o.order_statuses?.name || '-',
        Number(o.price) + Number(o.delivery_price),
      ]),
    });
    doc.save(`scan-session-${Date.now()}.pdf`);
  };

  const printInvoices = () => {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) return;
    const html = orders.map(o => {
      const total = Number(o.price) + Number(o.delivery_price);
      return `<div class="page">
        <div class="hdr">بلاك هورس</div>
        <div class="date">${new Date().toLocaleDateString('ar-EG')}</div>
        <table>
          <tr><th>الباركود</th><td style="direction:ltr;font-family:monospace">${o.barcode}</td></tr>
          <tr><th>الكود</th><td>${o.customer_code || '-'}</td></tr>
          <tr><th>العميل</th><td>${o.customer_name}</td></tr>
          <tr><th>الهاتف</th><td dir="ltr">${o.customer_phone}</td></tr>
          <tr><th>المحافظة</th><td>${o.governorate || '-'}</td></tr>
          <tr><th>العنوان</th><td>${o.address || '-'}</td></tr>
          <tr><th>المنتج</th><td>${o.product_name || '-'}</td></tr>
          <tr><th>الكمية</th><td>${o.quantity}</td></tr>
        </table>
        <div class="total">الإجمالي: ${total} ج.م</div>
      </div>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><style>
      @page{size:A4;margin:15mm}
      body{font-family:'Segoe UI',Arial;margin:0}
      .page{page-break-after:always;padding:10mm 0}
      .page:last-child{page-break-after:auto}
      .hdr{text-align:center;font-size:28px;font-weight:bold}
      .date{text-align:center;color:#666;margin-bottom:15px}
      table{width:100%;border-collapse:collapse;margin-bottom:15px}
      th,td{border:1px solid #333;padding:8px;text-align:right;font-size:13px}
      th{background:#f0f0f0;width:30%}
      .total{font-size:20px;font-weight:bold;text-align:center;border:3px solid #000;padding:10px}
    </style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const printBarcodeLabels = () => {
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return;
    const html = orders.map(o => `
      <div class="lbl">
        <div class="cn">${o.customer_name}</div>
        <svg id="bc-${o.id}"></svg>
        <div class="bn">${o.barcode}</div>
      </div>`).join('');
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js"></script>
      <style>
        @page{size:50mm 30mm;margin:0}
        body{margin:0;font-family:Arial}
        .lbl{width:50mm;height:30mm;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2mm;box-sizing:border-box}
        .lbl:last-child{page-break-after:auto}
        .cn{font-size:9px;margin-bottom:2px;text-align:center}
        .bn{font-family:monospace;font-size:10px;margin-top:1px}
      </style></head><body>${html}
      <script>
        window.onload=function(){
          ${orders.map(o => `try{JsBarcode("#bc-${o.id}","${o.barcode}",{format:"CODE128",height:35,width:1.4,fontSize:0,margin:0,displayValue:false});}catch(e){}`).join('')}
          setTimeout(()=>window.print(),300);
        };
      </script></body></html>`);
    w.document.close();
  };

  // === UI ===
  if (!scanning) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="text-center space-y-2">
          <ScanLine className="h-20 w-20 mx-auto text-primary" />
          <h1 className="text-3xl font-bold">قراءة الباركود</h1>
          <p className="text-muted-foreground max-w-md">
            استخدم جهاز الـ Barcode Scanner (المسدس) لمسح الأوردرات سريعًا وتطبيق أوامر جماعية.
          </p>
        </div>
        <Button size="lg" onClick={startSession} className="gap-2 text-lg px-8 py-6 gradient-primary shadow-glow">
          <PlayCircle className="h-6 w-6" />
          ابدأ الاسكان
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-primary/40">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
            <div>
              <div className="text-sm text-muted-foreground">جلسة اسكان نشطة</div>
              <div className="font-bold">عدد الأوردرات: {orders.length} • الوقت: {elapsed}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.focus()}>
              <RefreshCw className="h-4 w-4 ml-1" /> تركيز
            </Button>
            <Button variant="destructive" onClick={finishSession}>
              <StopCircle className="h-4 w-4 ml-1" /> انتهيت
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scan input */}
      <Card>
        <CardContent className="p-4">
          <label className="text-sm font-medium block mb-2">امسح الباركود الآن</label>
          <Input
            ref={inputRef}
            value={scanValue}
            onChange={e => setScanValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleScan(scanValue);
              }
            }}
            placeholder="انتظار المسدس..."
            className="text-2xl h-14 text-center font-mono tracking-wider"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            المسدس سيُدخل الكود ويضغط Enter تلقائيًا. اضغط "تركيز" إذا فقد الحقل التركيز.
          </p>
        </CardContent>
      </Card>

      {/* Live table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>الباركود</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>المحافظة</TableHead>
                  <TableHead>المندوب</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">لم يتم مسح أي أوردر بعد</TableCell></TableRow>
                ) : orders.map((o, i) => (
                  <TableRow key={o.id} className="animate-in fade-in slide-in-from-top-1">
                    <TableCell>{orders.length - i}</TableCell>
                    <TableCell className="font-mono text-xs">{o.barcode}</TableCell>
                    <TableCell>{o.customer_name}</TableCell>
                    <TableCell>{o.governorate || '-'}</TableCell>
                    <TableCell>{o.courier?.full_name || '-'}</TableCell>
                    <TableCell>
                      {o.order_statuses ? (
                        <Badge style={{ background: o.order_statuses.color, color: '#fff' }}>{o.order_statuses.name}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="font-bold">{Number(o.price) + Number(o.delivery_price)} ج.م</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => removeOrder(o.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>الأوامر الجماعية ({orders.length} أوردر)</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status change */}
            <div className="flex gap-2 items-center">
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="اختر الحالة" /></SelectTrigger>
                <SelectContent>
                  {statuses.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={applyBulkStatus}>تطبيق الحالة</Button>
            </div>

            {/* Courier */}
            <div className="flex gap-2 items-center">
              <Select value={bulkCourier} onValueChange={setBulkCourier}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="اختر المندوب" /></SelectTrigger>
                <SelectContent>
                  {couriers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={() => applyBulkCourier(false)}><UserCheck className="h-4 w-4 ml-1" />تعيين</Button>
              <Button variant="outline" onClick={() => applyBulkCourier(true)}>إزالة</Button>
            </div>

            {/* Actions grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Button variant="outline" onClick={printInvoices}><Printer className="h-4 w-4 ml-1" />طباعة فواتير</Button>
              <Button variant="outline" onClick={printBarcodeLabels}><StickyNote className="h-4 w-4 ml-1" />ملصقات باركود</Button>
              <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4 ml-1" />Excel</Button>
              <Button variant="outline" onClick={exportPDF}><FileDown className="h-4 w-4 ml-1" />PDF</Button>
              <Button variant="outline" onClick={bulkClose}><Lock className="h-4 w-4 ml-1" />إغلاق الأوردرات</Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>متابعة الاسكان</Button>
            <Button variant="destructive" onClick={closeSession}>إنهاء الجلسة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
