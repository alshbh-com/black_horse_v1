import { Lock } from 'lucide-react';

export default function SystemShutdownBanner() {
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background p-4"
    >
      <div className="max-w-md w-full bg-card border-2 border-destructive rounded-2xl shadow-2xl p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="bg-destructive/10 p-6 rounded-full">
            <Lock className="h-16 w-16 text-destructive" />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-destructive">السيستم مقفول</h1>
          <p className="text-lg text-foreground font-semibold">
            تم إيقاف النظام مؤقتاً
          </p>
          <p className="text-muted-foreground leading-relaxed">
            السيستم متوقف حالياً لعدم وجود تقدير. برجاء التواصل مع الإدارة لمعرفة موعد إعادة التشغيل.
          </p>
        </div>
        <div className="pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Black Horse — نظام الشحن
          </p>
        </div>
      </div>
    </div>
  );
}
