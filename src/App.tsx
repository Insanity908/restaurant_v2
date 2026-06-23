import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppSidebar from "@/components/AppSidebar";
import RequireAuth from "@/components/RequireAuth";
import RequireSuperAdmin from "@/components/RequireSuperAdmin";
import { AuthProvider, useOptionalAuth } from "@/context/AuthContext";
import DashboardPage from "@/pages/DashboardPage";
import MenuPage from "@/pages/MenuPage";
import TablesPage from "@/pages/TablesPage";
import KitchenPage from "@/pages/KitchenPage";
import POSPage from "@/pages/POSPage";
import ReportsPage from "@/pages/ReportsPage";
import InventoryPage from "@/pages/InventoryPage";
import SettingsPage from "@/pages/SettingsPage";
import StaffPage from "@/pages/StaffPage";
import ShiftsPage from "@/pages/ShiftsPage";
import CustomersPage from "@/pages/CustomersPage";
import LoginPage from "@/pages/LoginPage";
import LandingPage from "@/pages/LandingPage";
import SignupPage from "@/pages/SignupPage";
import PricingPage from "@/pages/PricingPage";
import BillingPage from "@/pages/BillingPage";
import BillingSuccessPage from "@/pages/BillingSuccessPage";
import BlockedPage from "@/pages/BlockedPage";
import SuperAdminPage from "@/pages/SuperAdminPage";
import OnboardingPage from "@/pages/OnboardingPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const NO_SIDEBAR_PATHS = ['/login', '/signup', '/landing', '/blocked', '/billing/success'];

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
      <BrowserRouter basename="/restaurant_v2">
        <AuthProvider>
          <ConditionalSidebar />
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
            <Route path="/pricing" element={<RequireAuth><PricingPage /></RequireAuth>} />
            <Route path="/billing" element={<RequireAuth><BillingPage /></RequireAuth>} />
            <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
            <Route path="/admin" element={<RequireSuperAdmin><SuperAdminPage /></RequireSuperAdmin>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
