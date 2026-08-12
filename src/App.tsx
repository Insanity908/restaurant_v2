import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppSidebar from "@/components/AppSidebar";
import MigrationGate from "@/components/MigrationGate";
import RequireAuth from "@/components/RequireAuth";
import RequireSuperAdmin from "@/components/RequireSuperAdmin";
import SyncStatus from "@/components/SyncStatus";

import { AuthProvider, useOptionalAuth } from "@/context/AuthContext";

// Cada página é o seu próprio chunk, carregado só quando a rota é visitada —
// sem isto, bibliotecas pesadas usadas só numa página (ex: recharts em
// Relatórios/SuperAdmin) entravam no bundle inicial de toda a gente.
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const MenuPage = lazy(() => import("@/pages/MenuPage"));
const TablesPage = lazy(() => import("@/pages/TablesPage"));
const KitchenPage = lazy(() => import("@/pages/KitchenPage"));
const POSPage = lazy(() => import("@/pages/POSPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const InventoryPage = lazy(() => import("@/pages/InventoryPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const StaffPage = lazy(() => import("@/pages/StaffPage"));
const ShiftsPage = lazy(() => import("@/pages/ShiftsPage"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const BillingSuccessPage = lazy(() => import("@/pages/BillingSuccessPage"));
const BlockedPage = lazy(() => import("@/pages/BlockedPage"));
const SuperAdminPage = lazy(() => import("@/pages/SuperAdminPage"));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const NO_SIDEBAR_PATHS = ['/login', '/signup', '/landing', '/blocked', '/billing/success'];

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function ConditionalSidebar() {
  const location = useLocation();
  const auth = useOptionalAuth();
  if (NO_SIDEBAR_PATHS.includes(location.pathname)) return null;
  if (!auth?.user && location.pathname === '/') return null;
  return <AppSidebar />;
}

function HomeRoute() {
  const auth = useOptionalAuth();
  if (auth?.loading) return null;
  if (!auth?.user) return <LandingPage />;
  if (auth.user.role === 'superadmin') return <RequireSuperAdmin><SuperAdminPage /></RequireSuperAdmin>;
  return <RequireAuth><DashboardPage /></RequireAuth>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ConditionalSidebar />
          <MigrationGate />
          <SyncStatus />
          <Suspense fallback={<PageFallback />}>
            <Routes>

              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/blocked" element={<BlockedPage />} />
              <Route path="/billing/success" element={<BillingSuccessPage />} />
              <Route path="/" element={<HomeRoute />} />
              <Route path="/menu" element={<RequireAuth><MenuPage /></RequireAuth>} />
              <Route path="/tables" element={<RequireAuth><TablesPage /></RequireAuth>} />
              <Route path="/kitchen" element={<RequireAuth><KitchenPage /></RequireAuth>} />
              <Route path="/pos" element={<RequireAuth><POSPage /></RequireAuth>} />
              <Route path="/inventory" element={<RequireAuth><InventoryPage /></RequireAuth>} />
              <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
              <Route path="/staff" element={<RequireAuth><StaffPage /></RequireAuth>} />
              <Route path="/shifts" element={<RequireAuth><ShiftsPage /></RequireAuth>} />
              <Route path="/customers" element={<RequireAuth><CustomersPage /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
              {/* Facturação/planos ainda não estão prontos para produção — bloqueados
                  por agora, a reactivar quando essa área estiver concluída. */}
              <Route path="/pricing" element={<Navigate to="/" replace />} />
              <Route path="/billing" element={<Navigate to="/" replace />} />
              <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
              <Route path="/admin" element={<RequireSuperAdmin><SuperAdminPage /></RequireSuperAdmin>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
