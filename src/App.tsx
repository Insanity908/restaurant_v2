import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppSidebar from "@/components/AppSidebar";
import MigrationGate from "@/components/MigrationGate";
import RequireAuth from "@/components/RequireAuth";
import RequireSuperAdmin from "@/components/RequireSuperAdmin";
import SyncStatus from "@/components/SyncStatus";
import InstallPrompt from "@/components/InstallPrompt";

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
const ExpensesPage = lazy(() => import("@/pages/ExpensesPage"));
const DataArchivePage = lazy(() => import("@/pages/DataArchivePage"));
const ShiftsPage = lazy(() => import("@/pages/ShiftsPage"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const SignupPage = lazy(() => import("@/pages/SignupPage"));
const BlockedPage = lazy(() => import("@/pages/BlockedPage"));
const SuperAdminPage = lazy(() => import("@/pages/SuperAdminPage"));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const CustomerOrderPage = lazy(() => import("@/pages/CustomerOrderPage"));
const CustomerTrackingPage = lazy(() => import("@/pages/CustomerTrackingPage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));
const BillingPage = lazy(() => import("@/pages/BillingPage"));
const TermsPage = lazy(() => import("@/pages/TermsPage"));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const NO_SIDEBAR_PATHS = ['/login', '/signup', '/landing', '/blocked', '/terms', '/privacy', '/forgot-password', '/reset-password'];
// Páginas públicas do cliente (QR/entrega) — sem sessão, nunca mostram a
// barra lateral da equipa.
const NO_SIDEBAR_PREFIXES = ['/pedir/', '/pedido/'];

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

// Extraída como função pura (em vez de inline em ConditionalSidebar) para
// dar para testar as regras de quando esconder a sidebar sem montar a app
// inteira.
export function shouldHideSidebar(pathname: string, search: string, hasUser: boolean): boolean {
  if (NO_SIDEBAR_PATHS.includes(pathname)) return true;
  if (NO_SIDEBAR_PREFIXES.some(p => pathname.startsWith(p))) return true;
  if (!hasUser && pathname === '/') return true;
  // Modo TV da Cozinha (?tv=1) — monitor dedicado, sem navegação nenhuma.
  if (pathname === '/kitchen' && new URLSearchParams(search).get('tv') === '1') return true;
  return false;
}

function ConditionalSidebar() {
  const location = useLocation();
  const auth = useOptionalAuth();
  if (shouldHideSidebar(location.pathname, location.search, !!auth?.user)) return null;
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
          <InstallPrompt />
          <Suspense fallback={<PageFallback />}>
            <Routes>

              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/blocked" element={<BlockedPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/pedir/:tenantId/mesa/:tableId" element={<CustomerOrderPage />} />
              <Route path="/pedir/:tenantId/entrega" element={<CustomerOrderPage />} />
              <Route path="/pedido/:orderId" element={<CustomerTrackingPage />} />
              <Route path="/" element={<HomeRoute />} />
              <Route path="/menu" element={<RequireAuth><MenuPage /></RequireAuth>} />
              <Route path="/tables" element={<RequireAuth><TablesPage /></RequireAuth>} />
              <Route path="/kitchen" element={<RequireAuth><KitchenPage /></RequireAuth>} />
              <Route path="/pos" element={<RequireAuth><POSPage /></RequireAuth>} />
              <Route path="/inventory" element={<RequireAuth><InventoryPage /></RequireAuth>} />
              <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
              <Route path="/staff" element={<RequireAuth><StaffPage /></RequireAuth>} />
              <Route path="/expenses" element={<RequireAuth><ExpensesPage /></RequireAuth>} />
              <Route path="/data-archive" element={<RequireAuth><DataArchivePage /></RequireAuth>} />
              <Route path="/shifts" element={<RequireAuth><ShiftsPage /></RequireAuth>} />
              <Route path="/customers" element={<RequireAuth><CustomersPage /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
              <Route path="/pricing" element={<RequireAuth><PricingPage /></RequireAuth>} />
              <Route path="/billing" element={<RequireAuth><BillingPage /></RequireAuth>} />
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
