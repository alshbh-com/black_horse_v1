import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions, urlToSectionKey } from '@/hooks/usePermissions';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import SectionGuide from '@/components/SectionGuide';
import { sectionGuides } from '@/lib/sectionGuides';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

function getGuideKey(pathname: string): string | null {
  const clean = pathname.replace(/^\//, '') || 'dashboard';
  if (sectionGuides[clean]) return clean;
  return null;
}

export default function AppLayout() {
  const { isCourier, isOwnerOrAdmin, isOffice } = useAuth();
  const { canView, canEdit } = usePermissions();
  const location = useLocation();

  if (isOffice && !isOwnerOrAdmin) {
    return <Navigate to="/office-portal" replace />;
  }
  if (isCourier && !isOwnerOrAdmin) {
    return <Navigate to="/courier-orders" replace />;
  }

  const sectionKey = urlToSectionKey(location.pathname);
  if (!canView(sectionKey)) {
    return <Navigate to="/" replace />;
  }

  const guideKey = getGuideKey(location.pathname);
  const guide = guideKey ? sectionGuides[guideKey] : null;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    toast.success('جاري تحديث الصفحة...');
    setTimeout(() => window.location.reload(), 300);
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 min-w-0">
          <header className="flex h-12 items-center justify-between border-b border-border/50 px-4 glass-effect">
            <SidebarTrigger />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </Button>
          </header>
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
            {guide && (
              <SectionGuide
                title={guide.title}
                description={guide.description}
                steps={guide.steps}
                tips={guide.tips}
                formulas={guide.formulas}
              />
            )}
            <Outlet context={{ canEdit: canEdit(sectionKey) }} />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
